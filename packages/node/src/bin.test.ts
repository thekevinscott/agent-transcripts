import { describe, it, expect, vi } from 'vitest';
import { options, run } from './bin';

describe('bin', () => {
  it('wires the launcher options for the platform binary', () => {
    expect(options.scope).toBe('agent-transcripts');
    expect(options.binaryName).toBe('agent-transcripts');
    expect(options.platformPackage).toBe('@{scope}/{triple}');
    expect(options.triples['linux-x64']).toBe('x86_64-unknown-linux-gnu');
  });

  it('forwards the options to the launcher and returns its exit code', async () => {
    const launch = vi.fn().mockResolvedValue(3);
    const code = await run(launch);
    expect(code).toBe(3);
    expect(launch).toHaveBeenCalledWith(options);
  });

  it('returns 1 and reports the message when the launcher rejects', async () => {
    const launch = vi.fn().mockRejectedValue(new Error('boom'));
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const code = await run(launch);
    expect(code).toBe(1);
    expect(stderr).toHaveBeenCalledWith('boom\n');
    stderr.mockRestore();
  });
});
