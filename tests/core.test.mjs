import test from 'node:test';
import assert from 'node:assert/strict';
import { freshProfile, sanitizeProfile, loadProfile, buySkin, settleStage, createRun, applyUpgrade, upgradeOptions, captureCheckpoint, restoreCheckpoint, pointSegmentDistance, sliceReward } from '../src/core.js';
import { buildLevel, MODULES } from '../src/levels.js';

test('damaged and unsupported saves recover to a playable profile', () => {
  assert.equal(loadProfile({ getItem() { return '{broken'; } }).selected, 'dawn');
  const profile = sanitizeProfile({ version: 1, coins: -50, bestScore: Infinity, owned: ['missing', 'jade', 'jade'], selected: 'missing', difficulty: 'unknown' });
  assert.equal(profile.coins, 0);
  assert.equal(profile.bestScore, 0);
  assert.deepEqual(profile.owned, ['dawn', 'jade']);
  assert.equal(profile.selected, 'dawn');
  assert.equal(profile.difficulty, 'standard');
});

test('repeated settlement does not duplicate currency or lifetime statistics', () => {
  const profile = freshProfile();
  assert.equal(settleStage(profile, 'run:0', { score: 459, cuts: 10, kills: 2, routeBonus: 15 }), 60);
  assert.equal(settleStage(profile, 'run:0', { score: 459, cuts: 10, kills: 2, routeBonus: 15 }), 0);
  assert.equal(profile.coins, 60);
  assert.equal(profile.totalCuts, 10);
  assert.equal(profile.totalKills, 2);
});

test('purchases cannot overdraw and owned selections do not charge again', () => {
  const profile = freshProfile();
  assert.equal(buySkin(profile, 'jade').ok, false);
  profile.coins = 110;
  assert.equal(buySkin(profile, 'jade').ok, true);
  assert.equal(profile.coins, 10);
  buySkin(profile, 'dawn');
  buySkin(profile, 'jade');
  assert.equal(profile.coins, 10);
  assert.equal(profile.selected, 'jade');
});

test('checkpoint rollback restores rewards and route claims while retaining damage', () => {
  const run = createRun('standard', 'test');
  run.score = 20;run.cuts = 2;run.energy = 32;
  const checkpoint = captureCheckpoint(run, 4900, new Set(['a']), new Set(['e']), new Set());
  run.score = 500;run.cuts = 9;run.energy = 100;run.shields = 1;run.routes.push('extra-route');
  const restored = restoreCheckpoint(run, checkpoint);
  assert.equal(run.score, 20);
  assert.equal(run.energy, 32);
  assert.equal(run.shields, 1);
  assert.deepEqual(run.routes, []);
  assert.deepEqual([...restored.consumed], ['a']);
});

test('upgrade caps and shield restoration stay inside the specified maximum', () => {
  const run = createRun();
  run.shields = 1;
  assert.equal(applyUpgrade(run, 'shield'), true);
  assert.equal(run.maxShields, 3);
  assert.equal(run.shields, 2);
  assert.equal(applyUpgrade(run, 'shield'), true);
  assert.equal(applyUpgrade(run, 'shield'), false);
  assert.ok(!upgradeOptions(run).some(item => item.id === 'shield'));
});

test('all three authored stages have unique object ids and legal geometry', () => {
  assert.equal(Object.keys(MODULES).length, 12);
  const ids = new Set();
  for (let i = 0; i < 3; i++) {
    const level = buildLevel(i);
    assert.equal(level.modules.length, 4);
    for (const item of [...level.targets, ...level.enemies, ...level.spikes, ...level.forks]) {
      assert.ok(!ids.has(item.id), `Duplicate id ${item.id}`);
      ids.add(item.id);
    }
    for (const pit of level.pits) assert.ok(pit[1] - pit[0] <= 110);
    for (const floor of level.floorSegments) assert.ok(floor.right > floor.left);
    assert.equal(level.checkpoints.length, 1);
    if (i === 2) assert.equal(level.enemies.filter(enemy => enemy.type === 'boss').length, 1);
  }
});

test('blade distance handles zero length and combo score has a finite cap', () => {
  assert.equal(pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
  assert.equal(pointSegmentDistance({ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.equal(sliceReward(1), 10);
  assert.equal(sliceReward(5), 20);
  assert.equal(sliceReward(100), 20);
});
