#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from 'bin-shim';

// Launcher configuration for the platform binary. Exported so the unit test
// can assert the wiring without spawning anything.
export const options = {
  scope: 'agent-transcripts',
  binaryName: 'agent-transcripts',
  from: import.meta.url,
  platformPackage: '@{scope}/{triple}',
  triples: {
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'win32-x64': 'x86_64-pc-windows-msvc',
  },
};

// Resolve and run the platform binary, returning its exit code. `launch` is
// injected (factory injection) so the test passes a fake; production uses the
// real `bin-shim` `main`. Returning the code — rather than calling
// `process.exit` here — keeps `run` pure enough to unit-test.
export async function run(launch: typeof main = main): Promise<number> {
  try {
    return await launch(options);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }
}

// Execute only when invoked as the CLI entry point, never when imported (e.g.
// by the colocated test): comparing argv[1] to this module keeps `import`
// side-effect-free.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void run().then((code) => process.exit(code));
}
