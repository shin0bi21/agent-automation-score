import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { applyGuidanceSnapshot, resolveFeatureType } from '../src/run-agent-benchmark.js';

test('uses scenario feature scope unless the CLI explicitly overrides it', () => {
  assert.equal(resolveFeatureType(undefined, 'frontend'), 'frontend');
  assert.equal(resolveFeatureType('backend', 'frontend'), 'backend');
  assert.equal(resolveFeatureType(undefined, undefined), 'full-stack');
  assert.throws(() => resolveFeatureType(undefined, 'mobile'), /Unsupported scenario feature type/);
});

test('stages only files resolved from the pinned guidance ref', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'agent-benchmark-guidance-'));
  const worktree = resolve(directory, 'worktree');
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    writeFileSync(resolve(directory, 'README.md'), '# Baseline\n');
    execFileSync('git', ['add', 'README.md'], { cwd: directory });
    execFileSync('git', ['-c', 'user.name=Benchmark Test', '-c', 'user.email=benchmark-test@local.invalid', 'commit', '--quiet', '-m', 'baseline'], { cwd: directory });
    const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
    mkdirSync(resolve(directory, '.agents/skills/example'), { recursive: true });
    writeFileSync(resolve(directory, 'AGENTS.md'), '# Pinned guidance\n');
    writeFileSync(resolve(directory, '.agents/skills/example/SKILL.md'), '# Example skill\n');
    execFileSync('git', ['add', 'AGENTS.md', '.agents/skills/example/SKILL.md'], { cwd: directory });
    execFileSync('git', ['-c', 'user.name=Benchmark Test', '-c', 'user.email=benchmark-test@local.invalid', 'commit', '--quiet', '-m', 'guidance'], { cwd: directory });
    const guidanceRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
    execFileSync('git', ['worktree', 'add', '--quiet', '--detach', worktree, baseline], { cwd: directory });

    const snapshot = applyGuidanceSnapshot({ repoRoot: directory, worktree, guidance: { ref: guidanceRef, paths: ['AGENTS.md', '.agents/skills', '.missing-guidance-directory'] } });

    assert.notEqual(snapshot, baseline);
    assert.equal(readFileSync(resolve(worktree, 'AGENTS.md'), 'utf8'), '# Pinned guidance\n');
    assert.equal(readFileSync(resolve(worktree, '.agents/skills/example/SKILL.md'), 'utf8'), '# Example skill\n');
    assert.equal(existsSync(resolve(worktree, '.missing-guidance-directory')), false);
    assert.equal(execFileSync('git', ['status', '--short'], { cwd: worktree, encoding: 'utf8' }), '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
