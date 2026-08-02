// src/hooks/useTapTrigger.test.js
const assert = require('assert');

// Since this is a hook (uses React state), test the underlying pure
// tap-tracking logic directly rather than through React — extract it
// as `computeNextTapState(prevState, now, count, windowMs)`.
const { computeNextTapState } = require('./useTapTrigger');

// Fresh tap, count=5: 1st through 4th tap never trigger
let state = { taps: 0, lastTapAt: 0 };
for (let i = 1; i <= 4; i++) {
  state = computeNextTapState(state, i * 100, 5, 2000);
  assert.strictEqual(state.triggered, false, `tap ${i} should not trigger`);
  assert.strictEqual(state.taps, i, `tap ${i} count mismatch`);
}

// 5th tap within window triggers and resets
state = computeNextTapState(state, 500, 5, 2000);
assert.strictEqual(state.triggered, true, '5th tap should trigger');
assert.strictEqual(state.taps, 0, 'counter should reset after trigger');

// Gap > windowMs resets the streak to 1, not 0
let gapState = { taps: 3, lastTapAt: 1000 };
gapState = computeNextTapState(gapState, 1000 + 2001, 5, 2000);
assert.strictEqual(gapState.taps, 1, 'stale streak should reset to 1 on next tap');
assert.strictEqual(gapState.triggered, false, 'reset tap should not trigger');

console.log('useTapTrigger: all assertions passed');
