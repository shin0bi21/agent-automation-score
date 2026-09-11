#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { matchFiles, readJson, runCommand, writeJson } from './agent-benchmark-lib.js';

function argumentsFor(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]] = argv[index + 1];
  if (!values['--worktree'] || !values['--scenario'] || !values['--base-sha'] || !values['--output']) {
    throw new Error('Usage: npx tsx backend/src/grade-agent-benchmark.ts --worktree PATH --scenario PATH --base-sha SHA --output PATH');
  }
  return values;
}

function changedFiles(worktree, baseSha) {
  const tracked = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', baseSha], { cwd: worktree, encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktree, encoding: 'utf8' });
  return [...new Set(`${tracked}\n${untracked}`.split('\n').map(value => value.trim()).filter(Boolean))].sort();
}

function sourceFor(worktree, files) {
  return files.map(file => {
    try { return readFileSync(resolve(worktree, file), 'utf8'); } catch { return ''; }
  }).join('\n');
}

function filesAtRef(worktree, ref) {
  if (!ref) return [];
  return execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { cwd: worktree, encoding: 'utf8' }).split('\n').filter(Boolean);
}

export function buildImplementationReview(manifest, candidateFiles, referenceFiles, featureType = 'full-stack') {
  return (manifest.reviewSections ?? []).filter(section => !section.appliesTo || section.appliesTo.includes(featureType)).map(section => ({
    id: section.id,
    label: section.label,
    classification: 'reference-derived',
    items: section.items.map(item => {
      const candidateMatches = [...new Set(item.patterns.flatMap(pattern => matchFiles(candidateFiles, pattern)))].sort();
      const referenceMatches = [...new Set(item.patterns.flatMap(pattern => matchFiles(referenceFiles, pattern)))].sort();
      return {
        id: item.id,
        label: item.label,
        implemented: candidateMatches.length > 0,
        candidateFiles: candidateMatches,
        referenceFiles: referenceMatches,
      };
    }),
  }));
}

export function gradeStructure(manifest, files, source, featureType = 'full-stack') {
  return manifest.requirements
    .filter(requirement => !requirement.appliesTo || requirement.appliesTo.includes(featureType))
    .map(requirement => {
      const fileMatches = (requirement.files ?? []).map(pattern => ({
        pattern,
        matches: matchFiles(files, pattern),
      }));
      const missingFiles = fileMatches
        .filter(result => result.matches.length === 0)
        .map(result => result.pattern);
      const missingText = (requirement.contains ?? [])
        .filter(value => !source.toLowerCase().includes(value.toLowerCase()));
      const passed = missingFiles.length === 0 && missingText.length === 0;
      return {
        ...requirement,
        passed,
        earned: passed ? requirement.points : 0,
        missingFiles,
        missingText,
      };
    });
}

export function grade({ worktree, scenarioPath, baseSha, featureType = 'full-stack', env = process.env }) {
  const manifest = readJson(resolve(scenarioPath, 'manifest.json'));
  const files = changedFiles(worktree, baseSha);
  const source = sourceFor(worktree, files);
  const checks = manifest.checks.filter(check => !check.appliesTo || check.appliesTo.includes(featureType)).map(check => {
    const [command, ...rawArgs] = check.command;
    const args = rawArgs.map(value => value.replaceAll('{baseSha}', baseSha));
    const result = runCommand(command, args, {
      cwd: worktree,
      env,
      timeoutMs: manifest.evaluationTimeoutMinutes * 60_000,
    });
    return { ...check, ...result, passed: result.exitCode === 0, earned: result.exitCode === 0 ? check.points : 0 };
  });
  const requirements = gradeStructure(manifest, files, source, featureType);
  const implementationReview = buildImplementationReview(manifest, files, filesAtRef(worktree, manifest.referenceRef), featureType);
  const earned = [...checks, ...requirements].reduce((total, item) => total + item.earned, 0);
  const possible = [...checks, ...requirements].reduce((total, item) => total + item.points, 0);
  return {
    scenario: manifest.id,
    scenarioVersion: manifest.version,
    featureType,
    baseSha,
    referenceRef: manifest.referenceRef ?? null,
    files,
    checks,
    requirements,
    implementationReview,
    earned,
    possible,
    percentage: possible ? Math.round(earned * 1000 / possible) / 10 : 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = argumentsFor(process.argv.slice(2));
    const result = grade({
      worktree: resolve(args['--worktree']),
      scenarioPath: resolve(args['--scenario']),
      baseSha: args['--base-sha'],
    });
    writeJson(resolve(args['--output']), result);
    console.log(`Benchmark score: ${result.earned}/${result.possible} (${result.percentage}%)`);
    process.exit(result.checks.every(check => check.passed) ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
