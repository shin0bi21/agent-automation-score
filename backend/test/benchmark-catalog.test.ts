import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadBenchmarkCatalog } from '../src/services/benchmark-catalog.js';

test('loads the versioned representative benchmark suite', () => {
  const catalog = loadBenchmarkCatalog(process.cwd());
  const suite = catalog.suite('sharpness-core');
  assert.deepEqual(suite.scenarioIds, [
    'homepage-active-navigation',
    'centralize-account-list-policy',
    'row-local-table-mutations',
  ]);
  assert.deepEqual(suite.scenarioIds.map(id => catalog.scenario(id).featureType), ['frontend', 'backend', 'frontend']);
  assert.equal(catalog.scenario('tasks-page').version, 7);
  for (const id of suite.scenarioIds) {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'benchmarks', id, 'manifest.json'), 'utf8'));
    assert.equal([...manifest.checks, ...manifest.requirements].reduce((sum, item) => sum + item.points, 0), 100);
    assert.match(catalog.scenario(id).fingerprint, /^[a-f0-9]{64}$/);
  }
  assert.throws(() => catalog.scenario('../tasks-page'), /Unsupported/);
});
