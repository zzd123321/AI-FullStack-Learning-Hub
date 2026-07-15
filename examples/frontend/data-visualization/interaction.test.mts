import assert from 'node:assert/strict';
import { findNearestByX } from './hit-test.ts';
import { reduceInteraction } from './interaction-state.ts';

const points = [
  { x: 10, y: 20, timestamp: 1, value: 2, sourceIndex: 0 },
  { x: 40, y: 30, timestamp: 2, value: 3, sourceIndex: 1 },
  { x: 90, y: 10, timestamp: 3, value: 4, sourceIndex: 2 },
] as const;
assert.equal(findNearestByX(points, 37)?.sourceIndex, 1);
assert.equal(findNearestByX(points, 200), undefined);

const initial = {
  focusedIndex: null,
  selectedIndex: null,
  visibleXDomain: { min: 0, max: 100 },
} as const;
const focused = reduceInteraction(initial, { type: 'move-focus', delta: 1, pointCount: 3 });
assert.equal(focused.focusedIndex, 0);
const selected = reduceInteraction(focused, { type: 'select-focused' });
assert.equal(selected.selectedIndex, 0);
const zoomed = reduceInteraction(selected, { type: 'zoom', anchor: 50, factor: 2 });
assert.deepEqual(zoomed.visibleXDomain, { min: 25, max: 75 });
assert.equal(reduceInteraction(zoomed, { type: 'zoom', anchor: 50, factor: 0 }), zoomed);

console.log('interaction examples passed');
