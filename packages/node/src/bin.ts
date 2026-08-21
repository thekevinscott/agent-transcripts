#!/usr/bin/env node
import { main } from 'bin-shim';

// Must stay in sync with `targets` in putitoutthere.toml.
export const triples: Record<string, string> = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

main({
  scope: 'agent-transcripts',
  binaryName: 'agent-transcripts',
  from: import.meta.url,
  // Platform packages here are `@agent-transcripts/<triple>`; bin-shim's
  // default template is `@{scope}/{platform}-{arch}`.
  platformPackage: '@{scope}/{triple}',
  // putitoutthere's bundled-cli recipe stages the binary at the platform
  // package root, with no `bin/` segment.
  binaryDir: '',
  triples,
})
  .then((code) => process.exit(code))
  .catch((err: Error) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
