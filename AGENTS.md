# Agent contract

This file is the operating contract for AI agents working in this repo.
Conventions, supervision rules, and per-language style live under
`docs/internals/` — start there before making changes.

## Where to read first

- `docs/internals/repo.md` — cross-cutting rules (changelog/migration fragment philosophy, public-API surface, CI-logic-in-scripts).
- `docs/AGENTS.md` — how the docs site is organized ([Diataxis](https://diataxis.fr)) and the per-page quadrant rule.
- `docs/internals/rust/` — Rust style, testing, shipping, review, code-smells.
- `docs/internals/python/` — Python style, testing, shipping, review, setup.
- `docs/internals/typescript/` — TypeScript style, testing, shipping, review, setup.

## Workflow

- Use `just` for local tasks (`just lint`, `just test`, `just ci`).
- Unit tests are **colocated** with their source (`foo.py` ↔ `foo_test.py`,
  `foo.ts` ↔ `foo.test.ts`; Rust uses inline `#[cfg(test)]`). This is the
  [testing-conventions](https://github.com/thekevinscott/testing-conventions)
  standard, enforced in CI by `.github/workflows/conventions.yml`.
- **CI logic lives in scripts, not workflow YAML.** `run:` / `github-script`
  steps stay trivial glue; anything with iteration, `case` dispatch, or
  text-munging moves to a subcommand of the tested internal CLI at `ci/`
  (never published), invoked as a one-liner. Enforced by
  `.github/workflows/gha-scripts.yml`; the bright line and rationale are in
  `docs/internals/repo.md`.
- Every PR that changes a public API adds a **changelog fragment**: one
  timestamped file under `docs/changelog.d/` (plus one under
  `docs/migrations.d/` for breaking changes), named `YYYY-MM-DD-<pkg>-<slug>.md`
  by UTC merge date. The folders are the permanent, append-only record;
  `packages/<pkg>/CHANGELOG.md` / `MIGRATIONS.md` are pointer stubs — never
  append entries to them. For version attribution ("which release shipped X"),
  map fragment dates against tags via `git log --tags`. Enforced by
  `.github/workflows/changelog.yml`. Bypass with a `skip-changelog:` git
  trailer for genuinely internal refactors.
- Pre-commit hooks (`just hooks` to install) gate formatting, gitleaks, and per-language linters.

## First-publish prerequisites

Before the first `Release` run on a fresh scaffold:

1. **Repo must be public.** Trusted Publishing on npm / PyPI / crates.io
   requires the provider to inspect the workflow file at the configured
   ref; private repos cannot satisfy this. The `preflight` job in
   `.github/workflows/release.yml` fails fast if the repo is private.
2. **Run `bootstrap-npm.yml` manually once.** npm Trusted Publishing
   binds to an already-published package, so the very first publish
   needs a long-lived `NPM_TOKEN` to push `0.0.0-bootstrap` stubs:
   `gh workflow run bootstrap-npm.yml -f packages="name1,name2,..."`.
   See the comment block at the top of that file for the full sequence
   (token requirements, Trusted Publisher registration, secret cleanup).
   Easy to forget — without it, `Release` succeeds locally but the npm
   publish step 404s on the first run.
3. **`NPM_TOKEN` and `CARGO_REGISTRY_TOKEN` set as repo secrets.** Both
   are forwarded to the putitoutthere reusable workflow for first
   publishes and can be dropped once Trusted Publishers are registered.

## Out of scope

- Don't add unsolicited refactors or hypothetical-future abstractions.
- Don't bypass hooks or CI gates without an explicit reason in the PR body.
