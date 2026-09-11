import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

export type ObservedRepositoryPathTouch = {
  sourceKey: string;
  promptKey: string | null;
  path: string;
  kind: 'read' | 'search' | 'change' | 'check';
  occurredAt: string;
};

const pathPattern = /(?:^|[\s"'`=(:,])((?:\/|\.{0,2}\/)?[A-Za-z0-9_.@+-]+(?:\/[A-Za-z0-9_.@+*?\[\]-]+)+(?:\.[A-Za-z0-9_-]+)?|(?:AGENTS|README|SKILL)\.md|[A-Za-z0-9_.@+-]+\.(?:tsx?|jsx?|mjs|cjs|json|md|sql|sh|py|rb|go|rs|java|kt|ya?ml|toml|css|scss|html))(?=$|[\s"'`,;:)])/g;

function touchKind(toolName: string, command: string): ObservedRepositoryPathTouch['kind'] {
  if (/(?:^|[._/])apply_patch$/.test(toolName)) return 'change';
  if (/^\s*(?:rg|grep)\s/.test(command)) return 'search';
  if (/^\s*(?:npm|pnpm|yarn|bun|pytest|vitest|tsc)\b/.test(command)) return 'check';
  return 'read';
}

function repositoryRelativePath(repositoryRoot: string, candidate: string) {
  const cleaned = candidate.replace(/^['"]|['"]$/g, '').replaceAll('\\', '/');
  if (!cleaned || /^[a-z]+:\/\//i.test(cleaned)) return null;
  const root = resolve(repositoryRoot);
  const target = isAbsolute(cleaned) ? normalize(cleaned) : resolve(root, cleaned);
  const result = relative(root, target);
  if (!result || result === '..' || result.startsWith(`..${sep}`) || isAbsolute(result)) return null;
  const portable = result.split(sep).join('/');
  if (portable.split('/').some(part => part === '..' || part === '')) return null;
  return portable.length <= 500 ? portable : null;
}

export function extractRepositoryPathTouches({
  toolName,
  command,
  repositoryRoot,
  occurredAt,
  promptKey,
  sourceKey,
}: {
  toolName: string;
  command: string;
  repositoryRoot: string;
  occurredAt: string;
  promptKey?: string | null;
  sourceKey: string;
}): ObservedRepositoryPathTouch[] {
  if (!repositoryRoot || Number.isNaN(Date.parse(occurredAt))) return [];
  // Only inspect patch headers or operands of supported simple shell commands.
  // Source bodies, search patterns, and arbitrary tool arguments are not path evidence.
  let candidates: string[] = [];
  if (/(?:^|[._/])apply_patch$/.test(toolName)) {
    candidates = [...command.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(match => match[1]);
  } else if (/(?:^|[._/])(?:exec_command|shell|terminal)$/.test(toolName)) {
    if (/[\n;&|<>`$]/.test(command)) return [];
    const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g)?.map(token => token.replace(/^['"]|['"]$/g, '')) ?? [];
    const executable = tokens.shift();
    if (!executable || !['cat', 'head', 'tail', 'sed', 'rg', 'grep', 'npm', 'pnpm', 'yarn', 'bun', 'pytest', 'vitest', 'tsc'].includes(executable)) return [];
    if (executable === 'sed' && tokens.some(token => /^-.*i|^--in-place/.test(token))) return [];
    let patternPending = ['rg', 'grep', 'sed'].includes(executable);
    let skipNext = false;
    for (const token of tokens) {
      if (skipNext) { skipNext = false; continue; }
      if (token.startsWith('-')) {
        if (['-e', '--regexp'].includes(token)) { patternPending = false; skipNext = true; }
        else if (['-g', '--glob', '-t', '--type', '-f', '--file', '-n', '-c', '--max-count'].includes(token) && executable !== 'sed' && !(token === '-n' && ['rg', 'grep'].includes(executable))) skipNext = true;
        if (token === '--files') patternPending = false;
        continue;
      }
      if (patternPending) { patternPending = false; continue; }
      candidates.push(token);
    }
  } else return [];
  const kind = touchKind(toolName, command);
  const paths = new Set<string>();
  for (const candidate of candidates) {
    // Reject partial regex matches (URLs, globs, option fragments and prose).
    const matches = [...candidate.matchAll(pathPattern)];
    if (matches.length !== 1 || matches[0][1] !== candidate || /[*?\[\]]/.test(candidate)) continue;
    // Directory-only search operands do not establish individual file access.
    if (!/\.[A-Za-z0-9_-]+$/.test(candidate)) continue;
    const path = repositoryRelativePath(repositoryRoot, candidate);
    if (path) paths.add(path);
    if (paths.size >= 50) break;
  }
  return [...paths].map((path, index) => ({
    sourceKey: `${sourceKey}:${index + 1}`,
    promptKey: promptKey ?? null,
    path,
    kind,
    occurredAt,
  }));
}
