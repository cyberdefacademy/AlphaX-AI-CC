import { spawn, execFile } from 'child_process';

export interface RunOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  maxBuffer?: number;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface StreamHandle {
  child: ReturnType<typeof spawn>;
  done: Promise<RunResult>;
}

function baseEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...(env || {}) };
}

export function run(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 60000,
        maxBuffer: opts.maxBuffer ?? 128 * 1024 * 1024,
        env: baseEnv(opts.env),
      },
      (err, stdout, stderr) => {
        resolve({
          code: err ? Number((err as NodeJS.ErrnoException).code ?? 1) : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        });
      }
    );
  });
}

export function runShell(cmd: string, opts: RunOptions = {}): Promise<RunResult> {
  return run('sh', ['-c', cmd], opts);
}

export function stream(
  command: string,
  args: string[],
  opts: RunOptions = {},
  onLine?: (line: string, isErr: boolean) => void
): StreamHandle {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: baseEnv(opts.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let errOut = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts.timeout) {
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, opts.timeout);
  }
  let tail = '';
  const pump = (chunk: Buffer, isErr: boolean) => {
    const text = chunk.toString();
    if (isErr) errOut += text;
    else out += text;
    if (onLine) {
      const merged = tail + text;
      const lines = merged.split('\n');
      tail = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) onLine(l, isErr);
    }
  };
  child.stdout?.on('data', (d: Buffer) => pump(d, false));
  child.stderr?.on('data', (d: Buffer) => pump(d, true));
  const done = new Promise<RunResult>((resolve) => {
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (tail && onLine) onLine(tail, false);
      resolve({ code, stdout: out, stderr: errOut });
    });
    child.on('error', () => {
      if (timer) clearTimeout(timer);
      resolve({ code: 1, stdout: out, stderr: errOut + 'Failed to spawn ' + command });
    });
  });
  return { child, done };
}

export function streamShell(
  cmd: string,
  opts: RunOptions = {},
  onLine?: (line: string, isErr: boolean) => void
): StreamHandle {
  return stream('sh', ['-c', cmd], opts, onLine);
}

export function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const p = (stdout || '').trim();
      resolve(p ? p : null);
    });
  });
}