#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Must stay in sync with `targets` in putitoutthere.toml.
export const triples: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

// putitoutthere's bundled-cli recipe stages the binary at the platform package
// root — `@agent-transcripts/<triple>/agent-transcripts`, no `bin/` segment.
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
  try {
    return resolve(`@agent-transcripts/${triple}/agent-transcripts${ext}`);
  } catch {
    throw new Error(
      `agent-transcripts: missing platform package @agent-transcripts/${triple}. ` +
        'Reinstall with optional dependencies enabled.',
    );
  }
}

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

// Run as the CLI entry point, stay side-effect-free when imported by the test.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run());
}
