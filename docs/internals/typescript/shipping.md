# TypeScript — shipping

## Github

Github is the source of truth.

### Github Actions

`concurrency` in GitHub Actions:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

This cancels the previous CI run on the same ref. Cheap, always wanted.

---

## Lint + format

**ESLint + Prettier.** `@typescript-eslint/no-floating-promises` is the highest-value rule — keep it enabled.

Minimal `.eslintrc.cjs`:

```js
module.exports = {
  env: { node: true, es2022: true },
  ignorePatterns: ['dist/', '**/*.generated.ts'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.eslint.json', sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    'curly': ['error', 'all'],
    'comma-dangle': ['error', 'always-multiline']
  }
};
```

`.prettierrc`:

```json
{ "printWidth": 80, "trailingComma": "all", "singleQuote": true }
```

`eslint-config-prettier` disables conflicting rules. Prettier owns layout, ESLint owns correctness. Configure `printWidth` once at root and move on.

**Pre-commit hooks**: per-commit hooks that block trivial WIP commits are net-negative. Pre-push or none at all is fine. **What matters is that CI fails on lint errors.**

Lint should include test files. The `*.generated.ts` glob is the standard escape hatch for codegen output.

---

## Public API design

**Barrels with explicit named re-exports.** Not `export * from './foo'` at every level — that's how things accidentally become public.

```ts
// src/index.ts
export { Widget } from './widget';
export { AbortError } from './errors';
export type { ModelDefinition, WidgetOptions } from './types';
```

Type exports are explicit `export type` — supports `isolatedModules` and `verbatimModuleSyntax`.

**Class vs function**: if the public API is "construct a thing and call methods on it", use a class. If it's "call a function", use a function. Mixing — a default-exported class that wraps an internal named factory function — is fine.

**Default export vs named export**: default for the "primary thing", named for everything else. Pure-named is also fine, and friendlier to refactor tools. What matters is consistency within one package.

**JSDoc for hidden API**: `@hidden` (typedoc) or `@internal` (TS — gated by `--stripInternal`). Pick one and stick with it:

```ts
class Widget {
  /** @hidden */
  _opts: WidgetOptions;

  /** Public method documented for consumers. */
  run(input: Input): Promise<Output> { /* ... */ }
}
```

Underscored field names + `@hidden` is the strongest convention. `private` keyword still emits to `.d.ts`; `#private` (real private) is fine but breaks reflection in ways some consumers care about.

For test-friendly classes, expose dependencies via the constructor (factory injection / DI) so tests can pass fakes without runtime mocking.

---

## Versioning + release

**Use `putitoutthere`.** Single reusable workflow, single config file, OIDC trusted publishers across crates.io / PyPI / npm. Versions derive from git tags. Provenance, retry-with-backoff, tag rollback, registry idempotency are all handled inside the workflow. Cross-cutting CHANGELOG / MIGRATIONS rules live in [../repo.md](../repo.md).

### `putitoutthere.toml`

Repo-root config. The schema is prescriptive — every field below appears in every config; defaults stay implicit.

```toml
[putitoutthere]
version = 1

[[package]]
name       = "agent-transcripts"
kind       = "npm"
path       = "."
globs      = ["src/**/*.ts", "package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.build.json", "README.md"]
access     = "public"
tag_format = "v{version}"
```

`globs` cascade-trigger a release on any commit touching a matching file. Single-package repos use `tag_format = "v{version}"`; multi-package repos let the default `"{name}-v{version}"` stand.

### Reusable workflow

`.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    uses: thekevinscott/putitoutthere/.github/workflows/release.yml@v0
    permissions:
      contents: write
      id-token: write
```

The workflow drives `plan → build → publish → GitHub Release` end-to-end. Consumer-side YAML stays at the seven-line stub above.

### Release trailer

Default cascade bump is `patch`. Override in the merge-commit body:

```
fix: handle empty token lists

release: minor
```

Grammar: `release: {patch|minor|major|skip} [pkg1, pkg2, ...]`. Last trailer wins. Optional package list scopes the bump.

### Trusted publishers

One-time registry setup per package. The reusable workflow only authenticates via OIDC — long-lived registry tokens stay out of the workflow.

- **npm**: bootstrap one version with `NODE_AUTH_TOKEN`, then enable **Require trusted publisher** under `https://www.npmjs.com/package/<name>/access`. Delete the bootstrap token after.
- **PyPI**: under `https://pypi.org/manage/project/<name>/settings/publishing/`, add the GitHub publisher (owner, repo, workflow filename, and — if you pin one — the `release` environment). Brand-new projects use a pending publisher.
- **crates.io**: publish once via classic `cargo`, then enable trusted publishing under `https://crates.io/crates/<crate>/settings`.

Each per-platform sub-package (`@agent-transcripts/x86_64-unknown-linux-gnu`, etc.) gets its own registration — a policy on the umbrella package does not cover its platform packages.


### Polyglot Rust core

When the package ships a Rust CLI consumed via Node, declare the npm wrapper as `build = "bundled-cli"` and point `depends_on` at the crate. See [CLI architecture](#cli-architecture) for the full three-artifact shape (Rust crate + npm wrapper + PyPI wheel) and the launcher script.

The workflow publishes the umbrella npm package plus a per-platform sub-package per target; `optionalDependencies` pin the sub-packages so `npm install -g` resolves exactly one.

---

## Docs

**Docusaurus 2** for richer doc sites (multi-version, search, plugin ecosystem). **VitePress** for simpler ones (Vite-native, faster, less to configure). For a new project, VitePress unless you actually need Docusaurus features.

**Generate the API reference from JSDoc.** typedoc + `typedoc-plugin-markdown` + `docusaurus-plugin-typedoc` reads JSDoc and emits Markdown. typedoc respects `@hidden`/`@internal`. Generated docs stay in sync with the source.

**Per-package metadata under a namespaced key in `package.json`** is the load-bearing pattern:

```json
"@agent-transcripts": {
  "title": "Pretty Display Name",
  "guide": { "frontmatter": { "category": "core" } }
}
```

The doc generator reads this. Single source of truth (the package's own `package.json`), no sidecar YAML.

**Code groups for multi-language libraries** (VitePress `::: code-group`, Docusaurus `<Tabs>`). When you do this, **set up a test that the code samples actually run**, or they will drift. Docs that systematically lie about an async API the code doesn't implement is what happens without sample tests.

---

## CI/CD

`.github/workflows/` shape:

| Workflow | Purpose | Trigger |
|---|---|---|
| `test.yml` | Unit + integration | every push/PR |
| `lint.yml` | ESLint + Prettier | every push/PR |
| `typecheck.yml` | `tsc --noEmit` | every push/PR |
| `docs.yml` | Build + deploy docs | push to main, `docs/**` |
| `release.yml` | `uses: thekevinscott/putitoutthere/.github/workflows/release.yml@v0` | push to main |
| `changelog-check.yml` | changelog fragment added under `docs/changelog.d/` (or `skip-changelog:` trailer) | every PR |

Composite action for repeated setup (`.github/actions/setup-pnpm/action.yml`):

```yaml
- uses: pnpm/action-setup@v5
  with: { version: 8, run_install: false }
- uses: actions/setup-node@v6
  with: { node-version: 24, cache: 'pnpm' }
- run: pnpm install --frozen-lockfile
```

**Path filters** to skip irrelevant workflows:

```yaml
on:
  push:
    paths: ['packages/foo/**', 'pnpm-lock.yaml', '.github/workflows/foo.yml']
```

**Concurrency** to cancel previous runs on the same ref (already shown above).

**Matrix**: Node 22 is the LTS floor as of 2026. Matrix on Node 22 + 24 if your dep tree spans them. Pure-JS code matrices on Node version, Ubuntu only. Native bindings matrix on OS (Ubuntu, macOS, Windows) for wheel builds; Ubuntu-only for tests.

**Coverage uploads via Codecov / Coveralls**: nice-to-have, not gating. A per-package floor (85-90%) enforced in CI is only worth doing if you have a real bug-resistance argument.

---

## Native bindings (napi-rs)

If the package wraps a Rust crate via napi-rs:

- **Use napi-rs's high-level API.** `napi::bindgen_prelude::Function` and `napi::Env::execute_tokio_future` cover callback handling and async work without writing unsafe FFI.
- **Configure `napi.triples`** in `package.json` for the cross-platform prebuilt distribution.
- **Use `optionalDependencies` for per-platform `@org/<triple>` packages**, with a runtime resolver. napi-rs's toolchain does this out of the box.
- **chmod 0o755 on the binary after staging.** `actions/upload-artifact@v4` strips per-file exec bits; `fs.copyFileSync` defaults to 0644. Either chmod in your build script *after* artifact-download (not before upload), or chmod defensively at spawn-time in the shim.

---

## CLI architecture

**Every CLI is a Rust binary.** The TS package wraps it; so does the Python package. Argument parsing, validation, exit codes, the whole runtime lives in the crate. The wrappers exist to put the binary on `PATH` through the language's native install path.

Why: cross-platform distribution is a solved problem in Rust (single static binary per target), `clap` is the strongest CLI framework in any ecosystem, and one source of truth keeps argument grammar, help text, and error messages identical across `pip install` and `npm install -g`.

Layout:

```
agent-transcripts/
  packages/
    rust/              # binary crate — Cargo.toml, src/main.rs (clap App)
      Cargo.toml
      src/
    node/              # npm wrapper, kind = "npm", build = "bundled-cli"
      package.json
      bin/agent_transcripts.js   # launcher; resolves the per-platform sub-package binary
      src/
    python/            # PyPI wrapper, kind = "pypi", build = "maturin", bundle_cli
      pyproject.toml
      src/agent_transcripts/
        __init__.py
        _binary/
          __init__.py  # entrypoint — execs the staged binary
  putitoutthere.toml
  CHANGELOG.md       # pointer stub — the record is docs/changelog.d/
  MIGRATIONS.md      # pointer stub — the record is docs/migrations.d/
  LICENSE
```

The TS launcher:

```js
#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { platform, arch } = process;

const triples = {
  'linux-x64':    'x86_64-unknown-linux-gnu',
  'linux-arm64':  'aarch64-unknown-linux-gnu',
  'darwin-x64':   'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64':    'x86_64-pc-windows-msvc',
};

const triple = triples[`${platform}-${arch}`];
if (!triple) {
  console.error(`agent-transcripts: unsupported platform ${platform}-${arch}`);
  process.exit(1);
}
const pkg = `@agent-transcripts/${triple}`;
const binary = require.resolve(
  `${pkg}/bin/agent-transcripts${platform === 'win32' ? '.exe' : ''}`,
);
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
```

`putitoutthere.toml` for the polyglot release:

```toml
[putitoutthere]
version = 1

[[package]]
name          = "agent-transcripts-rust"
kind          = "crates"
crate         = "agent-transcripts"
path          = "packages/rust"
first_version = "0.0.1"
globs         = ["packages/rust/**", "LICENSE"]

[[package]]
name          = "agent-transcripts-py"
kind          = "pypi"
pypi          = "agent-transcripts"
path          = "packages/python"
first_version = "0.0.1"
build         = "maturin"
depends_on    = ["agent-transcripts-rust"]
globs         = ["packages/python/**", "packages/rust/**", "LICENSE"]
targets = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]

[[package]]
name          = "agent-transcripts-npm"
kind          = "npm"
npm           = "agent-transcripts"
path          = "packages/node"
first_version = "0.0.1"
build         = [{ mode = "bundled-cli", name = "@agent-transcripts/{triple}" }]
depends_on    = ["agent-transcripts-rust"]
globs         = ["packages/node/**", "packages/rust/**", "LICENSE"]
targets = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]
```

A change to `packages/rust/` cascades through the dependency graph: the crate publishes first, then the npm family and PyPI wheels with the same version. Each handler's first move is `isPublished` — already-shipped targets skip cleanly, so re-runs are safe.

Tests live where their subject lives. The crate's logic is tested in Rust (`cargo test`). The wrappers ship a single happy-path e2e per command — drive the actual binary in a subprocess, assert on output. CLI grammar is defined once, in `clap`.
