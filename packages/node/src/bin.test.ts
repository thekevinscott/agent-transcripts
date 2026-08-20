import { describe, it, expect, vi } from 'vitest';
import { binaryPath, run, triples } from './bin';

describe('binaryPath', () => {
  it('resolves the binary at the platform package root, not under bin/', () => {
    const resolve = vi.fn().mockReturnValue('/somewhere/agent-transcripts');
    const path = binaryPath('linux', 'x64', resolve);
    expect(resolve).toHaveBeenCalledWith('@agent-transcripts/x86_64-unknown-linux-gnu/agent-transcripts');
    expect(path).toBe('/somewhere/agent-transcripts');
  });

  it('appends .exe on windows', () => {
    const resolve = vi.fn().mockReturnValue('C:\\somewhere\\agent-transcripts.exe');
    binaryPath('win32', 'x64', resolve);
    expect(resolve).toHaveBeenCalledWith('@agent-transcripts/x86_64-pc-windows-msvc/agent-transcripts.exe');
  });

  it('covers every triple declared in putitoutthere.toml', () => {
    expect(Object.values(triples)).toEqual([
      'x86_64-unknown-linux-gnu',
      'aarch64-unknown-linux-gnu',
      'x86_64-apple-darwin',
      'aarch64-apple-darwin',
      'x86_64-pc-windows-msvc',
    ]);
  });

  it('rejects a platform with no mapped triple', () => {
    expect(() => binaryPath('freebsd', 'x64', vi.fn())).toThrow(/unsupported platform freebsd-x64/);
  });

  it('reports a skipped optional dependency when resolution fails', () => {
    const resolve = vi.fn(() => {
      throw new Error('Cannot find module');
    });
    expect(() => binaryPath('linux', 'arm64', resolve)).toThrow(
      /missing platform package @agent-transcripts\/aarch64-unknown-linux-gnu/,
    );
  });
});

describe('run', () => {
  it('forwards argv to the binary and returns its exit code', () => {
    const spawn = vi.fn().mockReturnValue({ status: 3 });
    const code = run(['serve', '--port', '8150'], spawn as never, () => '/bin/at');
    expect(code).toBe(3);
    expect(spawn).toHaveBeenCalledWith('/bin/at', ['serve', '--port', '8150'], { stdio: 'inherit' });
  });

  it('returns 1 when the binary is killed by a signal (null status)', () => {
    const spawn = vi.fn().mockReturnValue({ status: null });
    expect(run([], spawn as never, () => '/bin/at')).toBe(1);
  });

  it('returns 1 and reports the message when resolution fails', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const spawn = vi.fn();
    const code = run([], spawn as never, () => {
      throw new Error('boom');
    });
    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('boom\n');
    stderr.mockRestore();
  });
});
