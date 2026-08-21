import { readFileSync } from 'node:fs';
import type { MainOpts } from 'bin-shim';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The launcher's only collaborator is bin-shim's `main()`. Mock it so the two behaviors bin.ts
// still owns — forwarding the binary's exit code and reporting a launch failure — can be driven
// without spawning a real binary. `vi.hoisted` makes the mock reachable from the hoisted factory.
const { main } = vi.hoisted(() => ({ main: vi.fn<(opts: MainOpts) => Promise<number>>() }));
vi.mock('bin-shim', () => ({ main }));

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
        platformPackage: '@{scope}/{triple}',
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

  // The map is hand-maintained and only fails at install time, on the one platform that went
  // missing — so check it against the source of truth rather than a second hand-written list.
  it('maps every target declared in putitoutthere.toml', async () => {
    main.mockResolvedValue(0);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { triples } = await import('./bin.js');

    const toml = readFileSync(new URL('../../../putitoutthere.toml', import.meta.url), 'utf8');
    // Scope to the npm package's own `targets`; the pypi one is free to differ.
    const npmBlock = toml.split('[[package]]').find((block) => block.includes('kind = "npm"')) ?? '';
    const targets = /targets = \[([^\]]*)\]/.exec(npmBlock)?.[1] ?? '';
    const declared = [...targets.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(Object.values(triples))).toEqual(new Set(declared));
  });
});
