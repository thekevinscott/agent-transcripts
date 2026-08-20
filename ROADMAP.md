# Roadmap

Design is settled — see [`notes/DESIGN.md`](notes/DESIGN.md). The CLI is
scaffolded: all three subcommands parse, none execute.

## Now

- **`ingest`** — receive transcript bytes, explode them into the tree. The
  exploder is the core of the project; everything else is plumbing around it.
- **Round-trip test.** Explode a transcript, reassemble it from the tree, and
  assert byte equality against `raw.jsonl`. This is the gate that makes
  "files are the truth" a claim rather than an aspiration.

## Next

- **`install`** — harness detection and hook registration. Claude Code local
  first, since it is the one that can be tested end to end today.
- **`serve`** — the declared `dirsql` schema, then the server wrapper. Mostly
  configuration; the query engine is upstream.
- **Hosted-environment support.** Blocked on the open questions in the design
  doc: whether transcripts are readable there, whether hook payloads carry a
  real path, and what egress is allowed.

## Later

- **Auth** on the ingest endpoint. Required before any deployment reachable
  from outside a trusted network.
- **Backfill** from an existing archive of raw JSONL.
- **Benchmarks.** Nothing has been timed. The design notes several
  performance claims that are currently reasoned rather than measured.
- **More harnesses.** Each is a new value for the `{harness}` path segment,
  which is the point of it being a path segment.
