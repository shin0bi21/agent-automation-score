import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export function parseJsonLines(source) {
  const events = [];
  const invalid = [];
  for (const [index, line] of source.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      invalid.push({ line: index + 1, text: line });
    }
  }
  return { events, invalid };
}

export function summarizeEvents(events) {
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
  let finalMessage = '';
  let failed = false;
  for (const event of events) {
    if (event.type === 'turn.failed' || event.type === 'error') failed = true;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      finalMessage = event.item.text ?? finalMessage;
    }
    if (event.type !== 'turn.completed' || !event.usage) continue;
    usage.inputTokens += event.usage.input_tokens ?? 0;
    usage.cachedInputTokens += event.usage.cached_input_tokens ?? 0;
    usage.outputTokens += event.usage.output_tokens ?? 0;
    usage.reasoningOutputTokens += event.usage.reasoning_output_tokens ?? 0;
  }
  return { usage, finalMessage, failed };
}

interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  timeoutMs?: number;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}) {
  const startedAt = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      env: options.env ?? process.env,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      timeout: options.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { command: [command, ...args], exitCode: 0, durationMs: Date.now() - startedAt, stdout, stderr: '' };
  } catch (error: any) {
    return {
      command: [command, ...args],
      exitCode: typeof error.status === 'number' ? error.status : 1,
      durationMs: Date.now() - startedAt,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? error.message ?? ''),
    };
  }
}

export function spawnWithCapture(
  command: string,
  args: string[],
  { cwd, env, timeoutMs, stdoutPath, stderrPath, input }: any,
): Promise<any> {
  return new Promise(resolveRun => {
    const startedAt = Date.now();
    writeFileSync(stdoutPath, '');
    writeFileSync(stderrPath, '');
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', chunk => {
      stdout += chunk;
      appendFileSync(stdoutPath, chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      appendFileSync(stderrPath, chunk);
    });
    child.on('error', error => {
      const message = `${error.message}\n`;
      stderr += message;
      appendFileSync(stderrPath, message);
    });
    const terminate = signal => {
      if (!child.pid) return;
      try {
        process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
      } catch (error: any) {
        if (error?.code !== 'ESRCH') throw error;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate('SIGTERM');
      setTimeout(() => terminate('SIGKILL'), 5_000).unref();
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolveRun({ exitCode: code ?? 1, durationMs: Date.now() - startedAt, timedOut, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

export function walkFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function globPattern(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*' && pattern[index + 2] === '/') {
      source += '(?:.*/)?';
      index += 2;
      continue;
    }
    if (character === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 1;
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      continue;
    }
    source += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
  }
  return new RegExp(`${source}$`, 'i');
}

export function matchFiles(files, pattern) {
  const matcher = globPattern(pattern);
  return files.filter(file => matcher.test(file));
}

export function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  ensureDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function repoPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

export function fileSize(path) {
  return existsSync(path) ? statSync(path).size : 0;
}
