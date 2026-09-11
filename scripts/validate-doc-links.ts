import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'dist', 'data', 'results']);

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) {
      return [];
    }

    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(target);
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  });
}

const failures: string[] = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

function anchors(file: string): Set<string> {
  const found = new Set<string>();
  const duplicates = new Map<string, number>();
  let fenced = false;

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    if (!heading) {
      continue;
    }

    const base = heading
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>|[`*_~]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    const count = duplicates.get(base) ?? 0;

    found.add(count ? `${base}-${count}` : base);
    duplicates.set(base, count + 1);
  }

  return found;
}

for (const file of markdownFiles(root)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(linkPattern)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (!raw || /^[a-z]+:/i.test(raw)) {
      continue;
    }

    const [rawPath, rawFragment] = raw.split('#', 2);
    const path = decodeURIComponent(rawPath);
    const target = path ? resolve(dirname(file), path) : file;
    const failure = `${relative(root, file)} -> ${raw}`;

    if (!existsSync(target)) {
      failures.push(failure);
      continue;
    }

    const targetStat = statSync(target);
    if (!targetStat.isFile() && !targetStat.isDirectory()) {
      failures.push(failure);
      continue;
    }

    const linksToMissingAnchor =
      rawFragment
      && targetStat.isFile()
      && target.endsWith('.md')
      && !anchors(target).has(decodeURIComponent(rawFragment).toLowerCase());

    if (linksToMissingAnchor) {
      failures.push(failure);
    }
  }
}

if (failures.length) {
  process.stderr.write(`Broken local documentation links:\n${failures.map(failure => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Documentation links are valid.\n');
}
