import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

export type BenchmarkScenario = {
  id: string;
  version: number;
  title: string;
  featureType: 'frontend' | 'backend' | 'full-stack';
  promptFile: string;
  fingerprint: string;
  baseRef: string;
  guidanceRef: string | null;
  referenceRef: string | null;
  guidancePaths: string[];
  checkCommands: string[][];
  patternGlobs: string[];
};

export type BenchmarkSuite = {
  id: string;
  version: number;
  title: string;
  scenarioIds: string[];
};

const safeId = /^[a-z0-9][a-z0-9-]*$/;

function inside(parent: string, child: string) {
  const root = resolve(parent);
  const target = resolve(child);
  return target === root || target.startsWith(`${root}${sep}`);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function loadBenchmarkCatalog(root: string) {
  const benchmarkRoot = resolve(root, 'benchmarks');
  const scenarios = existsSync(benchmarkRoot) ? readdirSync(benchmarkRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'suites' && safeId.test(entry.name))
    .flatMap(entry => {
      const manifestPath = resolve(benchmarkRoot, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) return [];
      const manifest = readJson(manifestPath);
      if (manifest.id !== entry.name || !Number.isInteger(manifest.version) || typeof manifest.title !== 'string' || typeof manifest.promptFile !== 'string') {
        throw new Error(`Invalid benchmark scenario manifest: ${entry.name}.`);
      }
      const promptPath = resolve(benchmarkRoot, entry.name, manifest.promptFile);
      if (!inside(resolve(benchmarkRoot, entry.name), promptPath) || !existsSync(promptPath)) {
        throw new Error(`Benchmark scenario ${entry.name} has an invalid prompt file.`);
      }
      const featureType = manifest.featureType;
      if (!['frontend', 'backend', 'full-stack'].includes(String(featureType))) {
        throw new Error(`Benchmark scenario ${entry.name} must declare a featureType.`);
      }
      const fingerprint = createHash('sha256').update(readFileSync(manifestPath)).update('\0').update(readFileSync(promptPath)).digest('hex');
      const guidance = manifest.guidance as { ref?: unknown; paths?: unknown } | undefined;
      const checks = Array.isArray(manifest.checks) ? manifest.checks as Array<{ command?: unknown }> : [];
      const sections = Array.isArray(manifest.reviewSections) ? manifest.reviewSections as Array<{ items?: unknown }> : [];
      const patternGlobs = sections.flatMap(section => Array.isArray(section.items) ? (section.items as Array<{ patterns?: unknown }>).flatMap(item => Array.isArray(item.patterns) ? item.patterns.map(String) : []) : []);
      if (typeof manifest.baseRef !== 'string' || checks.some(check => !Array.isArray(check.command))) throw new Error(`Benchmark scenario ${entry.name} has an invalid execution contract.`);
      return [{
        id: entry.name, version: manifest.version as number, title: manifest.title, featureType, promptFile: promptPath, fingerprint,
        baseRef: manifest.baseRef,
        guidanceRef: typeof guidance?.ref === 'string' ? guidance.ref : null,
        referenceRef: typeof manifest.referenceRef === 'string' ? manifest.referenceRef : null,
        guidancePaths: Array.isArray(guidance?.paths) ? guidance.paths.map(String) : [],
        checkCommands: checks.map(check => (check.command as unknown[]).map(String)),
        patternGlobs,
      } as BenchmarkScenario];
    }) : [];
  const suitesRoot = resolve(benchmarkRoot, 'suites');
  const suites = existsSync(suitesRoot) ? readdirSync(suitesRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      const source = readJson(resolve(suitesRoot, entry.name));
      const id = String(source.id ?? '');
      const scenarioIds = Array.isArray(source.scenarioIds) ? source.scenarioIds.map(String) : [];
      if (!safeId.test(id) || !Number.isInteger(source.version) || typeof source.title !== 'string' || !scenarioIds.length || scenarioIds.some(scenarioId => !scenarios.some(scenario => scenario.id === scenarioId))) {
        throw new Error(`Invalid benchmark suite manifest: ${entry.name}.`);
      }
      return { id, version: source.version as number, title: source.title, scenarioIds };
    }) : [];
  return {
    scenarios,
    suites,
    scenario(id: string) {
      if (!safeId.test(id)) throw new Error('Unsupported benchmark scenario.');
      const scenario = scenarios.find(item => item.id === id);
      if (!scenario) throw new Error('Unsupported benchmark scenario.');
      return scenario;
    },
    suite(id: string) {
      if (!safeId.test(id)) throw new Error('Unsupported benchmark suite.');
      const suite = suites.find(item => item.id === id);
      if (!suite) throw new Error('Unsupported benchmark suite.');
      return suite;
    },
  };
}
