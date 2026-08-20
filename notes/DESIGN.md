# Design

Why the tree looks the way it does, and what was measured to decide it.

## Goals, in order

1. **Files are the truth.** The on-disk tree is canonical. Any database is
   derived, and can be deleted and rebuilt from the tree at any time.
2. **The SQL surface is `dirsql`.** One directory tree, one declared schema,
   SQLite underneath.

## The rule

> **Capture what exists. Do not clean it.**

Harnesses disagree about what a block type is called, what an entry id looks
like, and which fields exist. None of that is this project's to resolve.

This is not a style preference. It has six consequences, each of which forbids
something a transcript archiver would otherwise be tempted to do:

1. **Block type strings stay verbatim.** One harness's `tool_use` and
   another's `toolCall` are stored as spelled, in both the filename and the
   column. No mapping table, no canonical vocabulary.
2. **Entry `type` is the harness's own string, not an enum.** Claude Code
   emits 17 distinct entry types. All 17 are stored. "Messages" is a
   caller-side filter — `WHERE type IN ('user','assistant')` — not a storage
   decision.
3. **No derived fields.** No guessing a project name from a path, no
   inferring intent. The path is stored; a consumer that wants a project name
   derives one.
4. **Usage is stored as the object the harness emitted.** Summing
   `input_tokens`, `cache_creation_input_tokens` and
   `cache_read_input_tokens` into one number destroys the distinction between
   cache hits and real input, and it cannot be undone.
5. **Nothing is dropped for being uninteresting.** Filtering to text-bearing
   entries discards roughly 38,000 entries and 32 MB per pass on a
   40k-message corpus, and silently renumbers everything downstream of the
   filter.
6. **No dedupe.** Measured across 41,667 entries in 243 sessions: **zero
   duplicate entry ids.** Dedupe logic here guards a problem that does not
   exist, and quietly discards data when its heuristic is wrong.

## Layout

```
data/{harness}/{session_id}/
  raw.jsonl                     verbatim bytes, never parsed away
  session.json
  entries/
    00042-da4f23fe/
      entry.json                the entry minus its string payloads
      0.text.txt                string payload, real newlines
      1.tool_use.json           payload that isn't a string
  agents/
    {agent_id}/entries/...      subagents, nested under their parent
```

- **`{harness}` is a path segment**, so supporting a new harness is a new
  directory rather than a schema change.
- **Directory name is `{ordinal}-{external_id}`.** `ordinal` is the entry's
  zero-padded line index in `raw.jsonl` — a property of the file, so there is
  nothing to assign and nothing to renumber. `external_id` is the harness's
  own id, which is **not** always a UUID: Claude Code uses one, another
  harness uses 8 hex characters. Do not type the column as UUID.
- **String payload → `.txt`. Anything else → `.json`.** JSON is a poor
  container for prose; escaped newlines are a tax every consumer pays, and
  `grep` stops working. A `.txt` file holds the bytes.
- **`entry.json` keeps every non-string field**, so entry plus payload files
  reassemble to the original entry exactly.
- **`raw.jsonl` is the backstop.** If the exploder has a bug, the bytes are
  still there, and the tree can be rebuilt.

### Blocks are real, not one harness's quirk

Worth stating because the measurement is lopsided enough to mislead:

| Harness | Multi-block messages |
| --- | --- |
| Claude Code | 0.17% (71 of 41,239) |
| pi | **33.0%** (459 of 1,389) |

Claude Code is the outlier. The harness-neutral model is one message → N
blocks, so both the layout and the schema carry N.

Tool blocks are **7.1x** the bytes of text blocks (84.1 MB against 13.8 MB).
Keeping them is the expensive decision, and it is the right one — excluding
them from a search is one `WHERE` clause, and recovering them after they were
never stored is impossible.

## Schema

The table is `entries`, not `messages`, because it holds every entry type.

```
entries
  external_id   TEXT       the harness's own id — not necessarily a UUID
  ordinal       INTEGER    line index in raw.jsonl
  parent_id     TEXT
  prompt_id     TEXT
  agent_id      TEXT       NULL = main thread
  type          TEXT       the harness's own string
  path_id       -> paths
  machine_id    -> machines    write-once
  model_id      -> models
  version       TEXT
  git_branch    TEXT
  timestamp     TEXT
  usage         JSON       as emitted
```

### Why these live on entries and not on sessions

Each of these reads naturally as a session-level property. Each one varies
*within* a session often enough that a session-level column silently drops
rows:

| Column | Sessions where it varies |
| --- | --- |
| model | 11.2% |
| path (cwd) | 9.5% |
| git branch | 5.8% |
| harness version | 4.1% |

If the primary query is "everything that happened in this directory", a
session-level path drops entries from 9.5% of sessions, with no error and no
way to notice.

**Machine is write-once at entry level.** A transcript can be uploaded from a
machine other than the one that created it — the upload stamps a hostname at
send time, not at creation time, and resuming a session elsewhere makes this
routine. Set it when the entry's directory is first created; never update it
on re-upload.

### Ordering

`ORDER BY timestamp, ordinal`. Timestamps alone cannot order deterministically:

- Duplicate timestamps: 303 (0.73%) across 88 sessions
- Entries out of file order: 200 (0.48%) across 136 sessions
- Resolution: milliseconds

`ordinal` breaks every tie, and since it is just the line number, there is no
assignment logic to get wrong. This also gives a stable session-scoped key, so
"the n entries before entry X" is a trivial follow-up query rather than a
second pass over the session.

### Lookup tables are views

`paths`, `machines`, `models` and `harnesses` are **views over `entries`**,
not stored tables. A files-as-truth store cannot have rows that exist nowhere
on disk. `SELECT DISTINCT path FROM entries` is the paths table.

### Subagents: nest and tag

Both. `agents/{agent_id}/` gives locality in the tree; `agent_id` and
`prompt_id` columns give queryability. `WHERE agent_id IS NULL` keeps subagent
traffic out of queries that only want the main thread — a subagent's prompts
are written by the orchestrating agent, not by a person.

Verified against a real corpus: **1077 of 1077** subagent transcripts resolve
to an existing parent, and 1077 of 1077 have their prompt id present in that
parent's transcript.

One trap: prompt id → agent is **1:N, not 1:1**. Measured, 88 of 146 prompt
ids map to more than one agent, up to 4. Do not model it as a unique key.

## The commands

### `install`

Detects the harnesses present and registers the appropriate hook for each.
Registration differs per harness and per environment; notably, a hook
registered in a user-level config does not necessarily carry into a hosted or
cloud environment, where repo-level config or a setup script is the only thing
that runs.

### `ingest`

Receives transcript bytes and explodes them into the tree.

**Delta upload by byte offset.** The last uploaded offset per transcript is
kept in a local cache; each turn sends `[offset, EOF)`. If the offset exceeds
the current file size the file was truncated or rotated, so everything is
resent. The naive alternative — POSTing the whole transcript every turn —
re-uploads a session's entire history on every single message.

Ingest is idempotent by construction: one directory per entry means the write
path is "does this directory exist? no → write it". There is no queue, no
status column, and no stuck-job recovery, because there is nothing to
reconcile.

### `serve`

`dirsql` in server mode over the tree with a declared schema. Declared tables
are required rather than optional: indices exist only for declared tables, and
ad-hoc glob queries pay a filesystem walk per run and cannot be indexed.

- **Keyword:** FTS5, `bm25()` for ranking, `snippet()` for excerpts.
- **Semantic:** `dirsql-plugin-embeddings` — sqlite-vec, an `embed()` SQL
  scalar, `vec_distance_cosine()`, with vectors cached by content hash.

## Open questions

1. **Hosted and cloud agent environments.** Whether they write transcripts to
   a readable path at all, whether the hook payload's transcript path is real
   there, and what egress is permitted. Answerable with one throwaway session
   against a probe endpoint.
2. **Subagent stop hooks** — whether the payload carries the subagent's own
   transcript path or the parent's.
3. **Auth.** A publicly reachable ingest endpoint needs it. Hosted
   environments expose environment variables but generally have no secrets
   store, which constrains the options to a bearer token.
4. **Nothing is benchmarked.** Every performance claim here is reasoned from
   reading code and measuring corpus shape, not from timing the query paths.

## Migrating from an existing store

If transcripts already live in a database, migrate from the **raw JSONL**, not
from the database — a derived store has usually already discarded tool blocks,
non-text entries, parent pointers, and per-entry metadata, and migrating from
it bakes that loss into the new source of truth permanently.

Run both stores in parallel first. The new ingest service and the old one can
receive from the same hooks with no coupling between them, so the old path
keeps working untouched while the tree accumulates. Once both hold the same
window, project the tree back into the old store's shape and diff. A match
proves the tree is a superset; a mismatch means the exploder is wrong and the
old store is still there.
