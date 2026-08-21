import type { MainOpts } from 'bin-shim';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The launcher's only collaborator is bin-shim's `main()`. Mock it so the two behaviors bin.ts
// still owns — forwarding the binary's exit code and reporting a launch failure — can be driven
// without spawning a real binary. `vi.hoisted` makes the mock reachable from the hoisted factory;
// spreading the real module keeps every other export honest.
const { main } = vi.hoisted(() => ({ main: vi.fn<(opts: MainOpts) => Promise<number>>() }));
vi.mock('bin-shim', async () => ({
  ...(await vi.importActual<typeof import('bin-shim')>('bin-shim')),
  main,
}));

// bin.ts calls main() at import time, so each case needs a fresh module copy, then a flushed
// microtask to let the `.then`/`.catch` that calls process.exit run.
async function runBin(): Promise<void> {
  await import('./bin.js');
  await new Promise((resolve) => setImmediate(resolve));
}

describe('bin', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    main.mockReset();
  });

  it('resolves the flat platform-package layout the engine publishes', async () => {
    main.mockResolvedValue(0);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await runBin();

    expect(main).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'agent-transcripts',
        binaryName: 'agent-transcripts',
        // '@{scope}/{triple}', not bin-shim's default '@{scope}/{platform}-{arch}'.
        platformPackage: '@{scope}/{triple}',
        // '', not bin-shim's default 'bin' — the engine stages at the package root.
        binaryDir: '',
      }),
    );
  });

  it('forwards the exit code main() resolves to', async () => {
    main.mockResolvedValue(3);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await runBin();

    expect(exit).toHaveBeenCalledWith(3);
  });

  it('prints the message and exits 1 when main() rejects', async () => {
    main.mockRejectedValue(new Error('boom'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runBin();

    expect(write).toHaveBeenCalledWith('boom\n');
    expect(exit).toHaveBeenCalledWith(1);
  });

  // Must match `targets` in putitoutthere.toml. A drifted entry fails at install time, on the
  // one platform that went missing, so it is worth restating here even though nothing links the
  // two files.
  it('maps every target the release builds', async () => {
    main.mockResolvedValue(0);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const { triples } = await import('./bin.js');

    expect(triples).toEqual({
      'linux-x64': 'x86_64-unknown-linux-gnu',
      'linux-arm64': 'aarch64-unknown-linux-gnu',
      'darwin-x64': 'x86_64-apple-darwin',
      'darwin-arm64': 'aarch64-apple-darwin',
      'win32-x64': 'x86_64-pc-windows-msvc',
    });
  });
});
