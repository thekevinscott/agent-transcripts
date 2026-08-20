#!/usr/bin/env node
// Builds the publishable JS launcher and stages the repo-level fragment folders.
//
// The per-target Rust binaries are NOT built here. putitoutthere's bundled-cli
// recipe cross-compiles them, which is what stamps the crate version before
// `cargo build` — building them from this script baked a stale
// `CARGO_PKG_VERSION` into every published binary (#3).

import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nodePkg = resolve(here, '..');

// The reusable workflow runs this on every npm row, per-triple ones included.
// Those rows exist only to produce a binary the engine builds itself.
const target = process.env.TARGET ?? '';
if (target !== '' && target !== 'main' && target !== 'noarch') {
  console.log(`nothing to build for TARGET=${target}; the engine stages the binary`);
  process.exit(0);
}

// `--no-install` pins to the local tsc regardless of which package manager
// (`npm` at release-time, `pnpm` at PR-time) populated node_modules.
run('npx', ['--no-install', 'tsc', '-b', '--clean', 'tsconfig.json'], { cwd: nodePkg });
run('npx', ['--no-install', 'tsc', '-p', 'tsconfig.json'], { cwd: nodePkg });

// npm's `files:` allowlist cannot reach outside the package root, so stage the
// repo-level fragment folders here (gitignored).
for (const dir of ['changelog.d', 'migrations.d']) {
  const staged = join(nodePkg, dir);
  rmSync(staged, { recursive: true, force: true });
  cpSync(join(nodePkg, '..', '..', 'docs', dir), staged, { recursive: true });
}

function run(cmd, args, opts) {
  // shell: true so Windows resolves the `.cmd` shims. Args are static.
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.status !== 0) {
    console.error(`failed: ${cmd} ${args.join(' ')} (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}
