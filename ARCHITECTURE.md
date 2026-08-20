# Architecture

A single Rust binary is the source of truth. Python and Node wrappers
exist only to put that binary on `PATH` under their respective package
manager.

## Packages

```
packages/
  rust/      crate — the CLI + library. clap for parsing.
  python/    maturin-built wheel that bundles the rust binary.
  node/      thin wrapper, resolves a per-platform optional dep
             whose payload is the rust binary.
docs/        VitePress site (published to GitHub Pages).
  internals/ contributor + agent conventions (not published).
```

## Release flow

`putitoutthere.toml` declares the three artifacts and their dependency
cascade. The `Release` workflow (`.github/workflows/release.yml`) calls
the reusable workflow at `thekevinscott/putitoutthere`. Edits under
`packages/rust/**` retrigger PyPI and npm builds via the cascade.

## CI gates

- Per-language workflow (`rust.yml`, `python.yml`, `node.yml`) runs lint + test + build with path filters.
- `changelog.yml` enforces a changelog fragment under `docs/changelog.d/` on PRs that touch package code.
- `docs.yml` builds + deploys the VitePress site.
- `pr-monitor.yml` gates merge on the aggregate CI status.

## Public-API surface

Defined in `docs/internals/repo.md`: every exported value/type, every CLI
flag, every config key, every observable artifact. Changes to that
surface require a fragment under `docs/changelog.d/` (plus
`docs/migrations.d/` when breaking).
