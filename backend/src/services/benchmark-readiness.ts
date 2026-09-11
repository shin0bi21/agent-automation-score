import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import type { BenchmarkScenario } from './benchmark-catalog.js';

export type BenchmarkReadiness = {
  status: 'ready' | 'ready-with-limitations' | 'not-evaluable';
  contractVersion: 1;
  fingerprint: string;
  scenarioId: string;
  baseRevision: string | null;
  evidence: { guidance: string[]; patternDocuments: string[]; analogues: string[]; inferredAnalogues: string[]; verification: string[] };
  findings: string[];
};

function git(repo: string, args: string[]) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15_000 }).trim();
}

function globPattern(glob: string) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('**', '\0').replaceAll('*', '[^/]*').replaceAll('\0', '.*');
  return new RegExp(`^${escaped}$`);
}

function commandPath(command: string[]) {
  if (['bash', 'node'].includes(command[0]) && command[1] && !command[1].startsWith('-')) return command[1];
  return null;
}

export function assessBenchmarkReadiness(repo: string, scenario: BenchmarkScenario): BenchmarkReadiness {
  const findings: string[] = [];
  let baseRevision: string | null = null;
  let files: string[] = [];
  let guidanceFiles: string[] = [];
  let referenceFiles: string[] = [];
  try {
    baseRevision = git(repo, ['rev-parse', `${scenario.baseRef}^{commit}`]);
    files = git(repo, ['ls-tree', '-r', '--name-only', baseRevision]).split('\n').filter(Boolean);
    guidanceFiles = scenario.guidanceRef ? git(repo, ['ls-tree', '-r', '--name-only', scenario.guidanceRef]).split('\n').filter(Boolean) : files;
    referenceFiles = scenario.referenceRef ? git(repo, ['ls-tree', '-r', '--name-only', scenario.referenceRef]).split('\n').filter(Boolean) : files;
  } catch {
    findings.push('Pinned baseline revision is unavailable.');
  }
  if (files.length > 75_000) {
    files = [];
    findings.push('Pinned baseline exceeds the bounded pattern inventory limit; explicit contracts are required.');
  }
  const applicableGuidanceFiles = guidanceFiles.filter(file => scenario.guidancePaths.some(path => file === path || file.startsWith(`${path}/`)));
  const guidance = scenario.guidancePaths.filter(path => applicableGuidanceFiles.some(file => file === path || file.startsWith(`${path}/`))).slice(0, 30);
  if (!guidance.length) findings.push('No applicable guidance or pattern documents were found at the pinned baseline.');
  const stopwords = new Set(['active', 'build', 'centralize', 'change', 'feature', 'full', 'implementation', 'local', 'navigation', 'page', 'request', 'stack', 'table', 'views', 'with']);
  const keywords = [...new Set(`${scenario.id} ${scenario.title}`.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !stopwords.has(word)))];
  const patternDocuments = applicableGuidanceFiles.filter(file => file.endsWith('.md') && keywords.some(keyword => file.toLowerCase().includes(keyword)) && !/(^|\/)AGENTS\.md$|SKILL\.md$/.test(file)).slice(0, 30);
  const verification: string[] = [];
  const effectiveFiles = new Set([...files, ...applicableGuidanceFiles]);
  for (const command of scenario.checkCommands) {
    const path = commandPath(command);
    if (!path || effectiveFiles.has(path)) verification.push(command.join(' '));
    else findings.push(`Required verification entry point is missing: ${path}.`);
  }
  if (!verification.length) findings.push('No executable verification route was defined.');
  const patterns = scenario.patternGlobs.map(globPattern);
  const analogues = referenceFiles.filter(file => patterns.some(pattern => pattern.test(file))).slice(0, 40);
  const inferredCandidates = files.filter(file => /\.(?:ts|tsx|js|jsx|py|rb|go|rs|java|kt)$/.test(file) && keywords.some(keyword => file.toLowerCase().includes(keyword)));
  const inferredDirectories = new Set(inferredCandidates.map(file => dirname(file)));
  const inferredAnalogues = inferredDirectories.size >= 2 ? inferredCandidates.slice(0, 40) : [];
  if (!patternDocuments.length) findings.push('No task-relevant pattern document was resolved; generic agent guidance is insufficient by itself.');
  if (!analogues.length && !inferredAnalogues.length) findings.push('No reference-derived or repeated repository implementation pattern could be resolved.');
  const missingVerification = findings.some(finding => finding.startsWith('Required verification'));
  const implementationEvidence = analogues.length + inferredAnalogues.length;
  const status = !baseRevision || missingVerification || !verification.length || (!patternDocuments.length && !implementationEvidence)
    ? 'not-evaluable'
    : patternDocuments.length && implementationEvidence ? 'ready' : 'ready-with-limitations';
  const fingerprint = createHash('sha256').update(JSON.stringify({ contractVersion: 1, scenario: scenario.fingerprint, baseRevision, guidance, patternDocuments, analogues, inferredAnalogues, verification, findings })).digest('hex');
  return { status, contractVersion: 1, fingerprint, scenarioId: scenario.id, baseRevision, evidence: { guidance, patternDocuments, analogues, inferredAnalogues, verification }, findings };
}
