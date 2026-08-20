# Handoff: npm bundled-cli packaging across the fleet

_Written 2026-08-20. Started from agent-transcripts#3, spread to three other
repos. The original bug is fixed and released; the cleanup is not._

## One-line status

`agent-transcripts` npm binaries now report the right version. The launcher
that got them there is hand-rolled and should now be replaced with `bin-shim`
— **bin-shim 0.2.1 shipped `binaryDir` on 2026-08-20, so this is unblocked.**

## The original bug

`@agent-transcripts/<triple>@0.0.2` shipped a binary that printed `0.0.1`.

`CARGO_PKG_VERSION` bakes in at compile time from the on-disk `Cargo.toml`.
`packages/node/scripts/build.mjs` cross-compiled the per-target binaries
itself, and nothing in the release run bumped the crate first — the 0.0.2
build log says `Compiling agent-transcripts v0.0.1`. PyPI was always correct
because maturin's `write-version` stamps for it.

Stamping locally is not possible: the reusable build job passes only
`TARGET` and `BUILD` to the consumer's build script (putitoutthere#627).

**Fix:** declare `[package.bundle_cli]` and delete the cargo branch from
`build.mjs`. That hands cross-compilation to putitoutthere, whose
`write-crate-version` step stamps the crate before `cargo build`.

```toml
[package.bundle_cli]
bin = "agent-transcripts"
crate_path = "packages/rust"
```

Linux rows come with `cargo zigbuild` against a pinned glibc 2.17 floor as a
side benefit.

### Verified fixed

```
$ curl -sL .../x86_64-unknown-linux-gnu-0.0.3.tgz | tar -tvz
-rwxr-xr-x  906328  package/agent-transcripts
-rw-r--r--     327  package/package.json
$ ./package/agent-transcripts --version
agent-transcripts 0.0.3
```

Note the exec bit and `"main": "agent-transcripts"`. Declaring `bundle_cli`
also sidestepped putitoutthere#626 — see "the chmod trap" below.

## The layout collision (why the launcher is hand-rolled)

putitoutthere's engine stages the binary **flat**, at the platform-package
root:

```
@agent-transcripts/x86_64-unknown-linux-gnu/
├── package.json
└── agent-transcripts        <- no bin/ segment
```

`bin-shim` hardcoded `${platformPkg}/bin/${binaryName}${ext}`. So the moment
this repo moved to `bundle_cli`, bin-shim could no longer find the binary,
and `packages/node/src/bin.ts` was rewritten to resolve flat by hand.

**That hand-rolled launcher is the thing to remove.** bin-shim already does
triple mapping, spawn, exit codes, a better not-installed error, and
`ensureExecutable`. The entire incompatibility was one hardcoded path
segment.

### The chmod trap this interacts with

putitoutthere's `pickMainFile` picks the first non-`package.json` entry. With
a **nested** layout that is the `bin` *directory*, so the manifest gets
`"main": "bin"` and the release-time chmod is applied to a directory —
putitoutthere#626. The binary then ships non-executable and only works
because bin-shim chmods at spawn time.

A flat layout has no directory to pick, so `main` lands on the binary and the
chmod hits the right inode. Confirmed above: `-rwxr-xr-x`.

## Next action, concretely

Nothing blocks this any more. `bin-shim@0.2.1` is published and carries
`binaryDir` (verified in the tarball: `dist/resolve/binary.js` destructures
`binaryDir = 'bin'`).

**`testing-conventions` PR #487 is the reference implementation** — it makes
exactly this change against the same engine recipe. Read it before starting.

1. Restore `bin-shim` to `packages/node/package.json` dependencies.
2. Replace `packages/node/src/bin.ts` with the bin-shim call:
   ```ts
   main({ scope: 'agent-transcripts', binaryName: 'agent-transcripts',
          from: import.meta.url, binaryDir: '', triples })
   ```
   Note this repo's platform packages are `@agent-transcripts/{triple}`, so
   pass `platformPackage: '@{scope}/{triple}'` plus a `triples` map — the
   default template is `@{scope}/{platform}-{arch}`.
3. Delete the hand-rolled resolution and its 8 colocated tests; keep a
   smoke test.
4. `.github/workflows/node.yml` stages the fake platform package flat
   already — no change needed.

## Cross-repo state

| repo | item | state |
|---|---|---|
| agent-transcripts | #3 bug, PR #4 | **merged, released 0.0.3, verified** |
| bin-shim | #25 / PR #28 `binaryDir` | merged, **released as 0.2.1** |
| bin-shim | #27 testing-conventions gate | open; PR #29 open (another session) |
| steervec | #12 same version bug | **open, unfixed** |
| testing-conventions | #485 double-staged binary | PR #487 open, green |

### steervec #12

`packages/node/scripts/build.mjs:37` cargo-builds; `putitoutthere.toml:46`
declares `build = [{ mode = "bundled-cli", ... }]` with **no**
`[package.bundle_cli]` block, so every bundled-cli step including
`write-crate-version` is gated off. Verified live: `@steervec/…@0.0.3` ships
a binary printing `steervec 0.0.1`. Same fix as here.

### testing-conventions #485 (PR #487 open)

Worse shape: it declares `bundle_cli` **and** keeps its own cargo build, so
platform packages ship the binary **twice** — `package/bin/testing-conventions`
(11,341,152, unstamped) and `package/testing-conventions` (11,068,256,
stamped). bin-shim resolves the nested one, so the stamp is defeated. The
engine stages after `npm run build` and removes nothing, which is why both
survive (putitoutthere#384).

## Upstream putitoutthere issues

- **#626** — `pickMainFile` picks a directory under a nested layout; chmod
  then applies to it. Referenced above, not filed by this thread.
- **#627** — the npm build step passes only `TARGET`/`BUILD`, so a consumer
  script cannot stamp a version itself.
- **Not filed:** the engine's generated launcher uses `require()`, which
  breaks any `"type": "module"` consumer. Worth its own issue.

## The template is the root cause

`steervec` and `testing-conventions` both came from `template-lib` and both
carry the same two defects: a roll-your-own bundled-cli build with no version
stamp, and pre-committed `optionalDependencies` pinned to a stale version.
Fixing the template stops this recurring; fixing the three repos does not.

## Landmine for the next session

`bin-shim`'s local checkout was 22 commits behind `origin/main` and the repo
had been restructured into a multi-language monorepo (`packages/javascript`,
`packages/python`, `fixtures/`, `spec/`). A PR built against the stale tree
(#26) re-landed an already-merged refactor and targeted paths that no longer
existed. **Fetch and check `origin/main` before branching there.**

Also relevant to that repo: `spec/conformance.md` governs process semantics
only — exit codes, signals, stdio. Resolution and layout changes do not get a
row. Python is in-process only (imports a module), so binary-layout options
are JavaScript-only by construction.
