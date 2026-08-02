const { useRef, useCallback } = require('react');

function computeNextTapState(prevState, now, count, windowMs) {
  const withinWindow = now - prevState.lastTapAt <= windowMs;
  const nextTaps = withinWindow ? prevState.taps + 1 : 1;
  if (nextTaps >= count) {
    return { taps: 0, lastTapAt: now, triggered: true };
  }
  return { taps: nextTaps, lastTapAt: now, triggered: false };
}

function useTapTrigger(count, windowMs, onTrigger) {
  const stateRef = useRef({ taps: 0, lastTapAt: 0 });

  const registerTap = useCallback(() => {
    const next = computeNextTapState(stateRef.current, Date.now(), count, windowMs);
    stateRef.current = next;
    if (next.triggered) onTrigger();
  }, [count, windowMs, onTrigger]);

  return { registerTap };
}

module.exports = useTapTrigger;
module.exports.computeNextTapState = computeNextTapState;
