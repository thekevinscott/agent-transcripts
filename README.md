# agent-transcripts

Capture coding-agent transcripts to disk, and expose them as a SQL database.

Files are the source of truth. Any index is derived, and can be deleted and
rebuilt from the tree at any time.

> **Status: early.** The design is settled and written down; the commands are
> scaffolded but not implemented. See [`notes/DESIGN.md`](notes/DESIGN.md).

## What it does

A coding agent — Claude Code, or another harness — writes a JSONL transcript
as it works. `agent-transcripts` captures those transcripts, stores them as a
directory tree, and puts SQL in front of the result, so a later session can
ask what happened in an earlier one.

```sql
-- what did I touch in this repo since Tuesday?
SELECT timestamp, type, text
FROM entries
WHERE path = '/path/to/repo' AND timestamp > '2026-08-18'
ORDER BY timestamp, ordinal;
```

## One CLI, three commands

```sh
agent-transcripts install    # detect harnesses, register their hooks
agent-transcripts ingest     # receive transcript bytes, write the tree
agent-transcripts serve      # serve SQL over the tree
```

**`install`** detects which harnesses are present and registers the right hook
for each. Claude Code local, Claude Code cloud environments, and other
harnesses each need a different registration; the installer works out which
apply. `--dry-run` reports what it would write without touching anything.

**`ingest`** receives transcript bytes and explodes them into the tree.
Uploads are delta-only, by byte offset — a session's transcript is never
re-sent whole.

**`serve`** runs [`dirsql`](https://github.com/thekevinscott/dirsql) over the
tree with a declared schema, serving SQL over HTTP: full-text search via FTS5,
and semantic search via `dirsql-plugin-embeddings`.

The commands are independent. `ingest` is useful with no SQL in front of it,
and `serve` will happily index a tree that something else wrote.

## Install

One binary, published to three registries.

```sh
cargo install agent-transcripts     # crates.io
uvx agent-transcripts install       # PyPI
npx agent-transcripts install       # npm
```

## The rule

> **Capture what exists. Do not clean it.**

Harnesses disagree about nearly everything — what a block type is called, what
an entry id looks like, which fields exist at all. None of that is this
project's to resolve. Transcripts are stored as emitted, verbatim; normalizing
them is the job of whoever queries them.

In practice: no canonical vocabulary, no dropped entry types, no lossy token
arithmetic, no invented fields. The raw JSONL is kept intact alongside the
exploded tree as a backstop.

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

String payloads are `.txt`, not JSON, because escaped newlines are a tax every
consumer pays. Block type goes in the filename exactly as the harness spelled
it. The directory name is `{ordinal}-{external_id}`, where `ordinal` is the
entry's line index in `raw.jsonl` — a property of the file, so there is no
numbering to assign and none to get wrong.

## Development

```sh
just test        # all languages
just lint
just ci          # lint + typecheck + test
```

Every source file has a colocated unit test; see
[testing conventions](docs/guide/testing-conventions.md). Releases go through
[putitoutthere](https://github.com/thekevinscott/putitoutthere).

## License

MIT
