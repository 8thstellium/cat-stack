'use strict';

const assert = require('node:assert/strict');
const C = require('../cats.js');

function test(name, fn) {
  fn();
  console.log('✓ ' + name);
}

test('the ten cat kinds grow, look distinct, and fit at the top', () => {
  assert.equal(C.KINDS.length, 10);
  assert.equal(C.MAX_KIND, 10);
  assert.equal(C.DROP_KINDS, 5);
  assert.deepEqual(C.KINDS.map(cat => cat.radius), [14, 19, 25, 32, 40, 48, 57, 66, 75, 84]);
  assert.equal(new Set(C.KINDS.map(cat => cat.color.toLowerCase())).size, 10);
  C.KINDS.forEach((cat, i) => {
    assert.equal(cat.kind, i + 1);
    assert.equal(C.kindInfo(cat.kind), cat);
    assert.ok(cat.name);
    if (i) assert.ok(cat.radius > C.KINDS[i - 1].radius);
  });
  assert.ok(2 * C.KINDS.at(-1).radius * 2 <= C.WORLD.right - C.WORLD.left);
  assert.throws(() => C.kindInfo(0));
  assert.throws(() => C.kindInfo(11));
});

test('merges advance a kind, score triangular points, and end with the Mega bonus', () => {
  for (let kind = 1; kind < C.MAX_KIND; kind++) {
    assert.equal(C.mergeResult(kind), kind + 1);
    assert.equal(C.mergeScore(kind), (kind + 1) * (kind + 2) / 2);
  }
  assert.equal(C.mergeResult(C.MAX_KIND), null);
  assert.equal(C.mergeScore(C.MAX_KIND), 100);
  assert.equal(C.MEGA_BONUS, 100);
});

test('the seeded drop picker repeats and only chooses droppable kinds', () => {
  const a = C.makeRng(9321);
  const b = C.makeRng(9321);
  const picked = Array.from({length: 200}, () => C.nextKind(a));
  assert.deepEqual(picked, Array.from({length: 200}, () => C.nextKind(b)));
  assert.ok(picked.every(kind => Number.isInteger(kind) && kind >= 1 && kind <= C.DROP_KINDS));
  assert.equal(new Set(picked).size, C.DROP_KINDS);
});

test('danger requires a settled cat above the line for a full second', () => {
  const base = {
    id: 7, y: C.WORLD.dangerY + 15, radius: 20,
    speed: 0, spin: 0, touched: true,
    ageMs: C.DANGER.GRACE_MS, active: false
  };
  const first = C.dangerStep({}, 400, [base]);
  assert.equal(first.lost, false);
  assert.equal(first.timers[7], 400);
  assert.equal(first.level, 0.4);
  const snapshot = structuredClone(first.timers);
  const second = C.dangerStep(first.timers, 600, [base]);
  assert.deepEqual(first.timers, snapshot, 'dangerStep must not mutate its timers input');
  assert.equal(second.timers[7], 1000);
  assert.equal(second.level, 1);
  assert.equal(second.lost, true);
});

test('falling, moving, spinning, young, and untouching cats do not count', () => {
  const base = {
    id: 1, y: C.WORLD.dangerY, radius: 20,
    speed: 0, spin: 0, touched: true,
    ageMs: C.DANGER.GRACE_MS, active: false
  };
  const blocked = [
    { active: true },
    { speed: C.DANGER.REST_SPEED },
    { spin: C.DANGER.REST_SPIN },
    { ageMs: C.DANGER.GRACE_MS - 1 },
    { touched: false },
    { y: C.WORLD.dangerY + base.radius }
  ];
  for (const fields of blocked) {
    const result = C.dangerStep({}, 1200, [{...base, ...fields}]);
    assert.equal(result.lost, false, JSON.stringify(fields));
    assert.equal(result.timers[1], undefined, JSON.stringify(fields));
  }
});

test('danger timer resets when a cat moves or drops below the line', () => {
  const base = {
    id: 3, y: C.WORLD.dangerY, radius: 20,
    speed: 0, spin: 0, touched: true,
    ageMs: C.DANGER.GRACE_MS, active: false
  };
  const initial = C.dangerStep({}, 800, [base]);
  const moved = C.dangerStep(initial.timers, 100, [{...base, speed: C.DANGER.REST_SPEED}]);
  assert.equal(moved.timers[3], undefined);
  assert.equal(moved.level, 0);
  const below = C.dangerStep(initial.timers, 100, [{...base, y: C.WORLD.dangerY + base.radius}]);
  assert.equal(below.timers[3], undefined);
  assert.equal(below.lost, false);
  const restarted = C.dangerStep(below.timers, 300, [base]);
  assert.equal(restarted.timers[3], 300);
});

console.log('All rule tests passed.');
