**Fixed** — the npm package installed a binary reporting the *previous*
release's version: `agent-transcripts@0.0.2` answered `--version` with
`0.0.1`. The per-target binaries were cross-compiled by the package's own
build script, which baked `CARGO_PKG_VERSION` from an unbumped
`packages/rust/Cargo.toml`. putitoutthere now does the cross-compiling —
`[package.bundle_cli]` in `putitoutthere.toml` — so the crate version is
stamped before `cargo build`, and Linux binaries pick up a pinned glibc 2.17
floor via `cargo zigbuild`.

**Changed** — the platform packages now carry the binary at their root
(`@agent-transcripts/<triple>/agent-transcripts`) rather than under `bin/`,
matching where the engine stages and packages it. The launcher resolves the
flat path directly and no longer depends on `bin-shim`, which hardcodes the
`bin/` segment. A missing platform package now reports itself as a skipped
optional dependency instead of a bare module-resolution error.
