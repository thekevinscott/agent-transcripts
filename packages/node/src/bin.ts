#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Node's `${platform}-${arch}` -> the Rust triple naming the platform package.
// Must stay in sync with `targets` in putitoutthere.toml; a triple missing here
// is an unsupported platform, not a missing install.
export const triples: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

// putitoutthere's bundled-cli recipe stages the binary at the platform package
// root — `@agent-transcripts/<triple>/agent-transcripts`, no `bin/` segment.
// `resolve` is injected so the test can drive both branches without installing
// a platform package.
export function binaryPath(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  resolve: (id: string) => string = createRequire(import.meta.url).resolve,
): string {
  const triple = triples[`${platform}-${arch}`];
  if (triple === undefined) {
    throw new Error(`agent-transcripts: unsupported platform ${platform}-${arch}`);
  }
  const ext = platform === 'win32' ? '.exe' : '';
  const id = `@agent-transcripts/${triple}/agent-transcripts${ext}`;
  try {
    return resolve(id);
  } catch {
    // The platform packages are optional dependencies, so a resolution failure
    // is almost always an install that skipped them (`--no-optional`, a lockfile
    // pinning an older set, an offline mirror) rather than a broken publish.
    throw new Error(
      `agent-transcripts: missing platform package @agent-transcripts/${triple}. ` +
        'Reinstall with optional dependencies enabled.',
    );
  }
}

// Resolve and run the platform binary, returning its exit code. Both effects are
// injected (factory injection) so the test never spawns anything. Returning the
// code — rather than calling `process.exit` here — keeps `run` unit-testable.
export function run(
  argv: readonly string[] = process.argv.slice(2),
  spawn: typeof spawnSync = spawnSync,
  resolveBinary: () => string = () => binaryPath(),
): number {
  let binary: string;
  try {
    binary = resolveBinary();
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
  return spawn(binary, [...argv], { stdio: 'inherit' }).status ?? 1;
}

// Execute only when invoked as the CLI entry point, never when imported (e.g.
// by the colocated test): comparing argv[1] to this module keeps `import`
// side-effect-free.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
