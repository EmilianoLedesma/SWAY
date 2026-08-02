# Version-Tap Easter Egg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping the app logo 5 times on the Home screen (top-left, `ScreenHeader.js`) plays a short brand-colored motion-graphic video in a fullscreen modal — a pure visual gag, no functionality behind it.

**Architecture:** One MP4 asset generated once via the HyperFrames `motion-graphics` skill (design-led, autonomous, renders outside the app). The mobile app gets a tiny tap-counter hook on the existing logo `Image`, and a new fullscreen modal component that plays the bundled MP4 via `expo-video` and auto-closes on end or tap.

**Tech Stack:** React Native / Expo SDK 54, `expo-video` (new dependency), HyperFrames CLI (`motion-graphics` route) for asset generation.

## Global Constraints

- 5 taps trigger the egg; resets if >2s pass between taps.
- No sound forced on open (muted playback) — visual gag only, don't interrupt a silenced phone.
- No dev/debug panel, no "seen it" persistence — can retrigger every time, every session.
- Video asset path: `MockupsSwayMobile/assets/easter-egg.mp4`.
- No backend/API involvement — purely client-side.

---

### Task 1: Generate the video asset with HyperFrames

**Files:**
- Create: `MockupsSwayMobile/assets/easter-egg.mp4` (final render, copied in from the HyperFrames project output)
- Create (scratch, outside app tree): a HyperFrames project directory for this composition (e.g. `~/hyperframes-projects/sway-easter-egg/`) — this is the render workspace, not part of the mobile app repo.

**Interfaces:**
- Produces: `MockupsSwayMobile/assets/easter-egg.mp4` — a short (2-4s) portrait-oriented MP4, brand palette (light background, blue/teal accent, rounded-card visual language matching the Home screen reference), logo-centric reveal. This is the only artifact Task 2 depends on.

- [ ] **Step 1: Scaffold the HyperFrames project**

Run outside the SWAY repo (own workspace, per HyperFrames convention — never inside the app's git tree):

```bash
mkdir -p ~/hyperframes-projects/sway-easter-egg
cd ~/hyperframes-projects/sway-easter-egg
npx hyperframes init
```

Expected: project scaffold created (`hyperframes.json`, empty composition slot). `init` refuses a non-empty directory — the `mkdir` above must produce a fresh empty one.

- [ ] **Step 2: Write BRIEF.md for the motion-graphics route**

Create `BRIEF.md` in the project root with this frontmatter and body (the confirmed brief — mirrors the design already agreed with the user; skip further interview questions since this is already a formed, single-clarifying-question-eligible request per the `motion-graphics` route contract):

```markdown
---
workflow: motion-graphics
flow: automation
storyboard: no
message: "SWAY logo playful reveal — easter egg for repeated taps"
destination: mobile-app-overlay
aspect: portrait (9:16, matches phone screen — NOT the 16:9 default)
length: 2-4s
---

## Intent

Logo sting / brand lockup easter egg. User taps the SWAY app logo (top-left
of Home screen) 5 times; this video plays fullscreen as a reward gag, then
closes. Must feel like it belongs to the app, not a bolted-on stock animation.

## Visual reference

Home screen (attached reference: light background ~#F5F6FA, white rounded
cards with soft shadow, blue/teal brand accent color matching the logo mark,
clean sans-serif type, bottom tab bar). The egg should open FROM the logo's
position (top-left) and use the same color language — same blue/teal, same
card-rounding radius language — so the transition into/out of the real app
reads as one continuous surface, not a jump cut to a generic template.

## Notes

- Muted-safe: no dependency on audio being heard, this plays without forcing
  unmute.
- One-shot, not a seamless loop — it has a clear playful beginning
  (logo detaches/glows) and end (settles back into a mark).
```

- [ ] **Step 3: Run the motion-graphics workflow**

```bash
npx hyperframes skills update motion-graphics
```

(already installed once per repo-level setup, but re-run here since this is a separate project directory — confirms the workflow is current before it drives the render.)

Then let the `/motion-graphics` workflow run autonomously per `flow: automation` in the brief — it asks at most one clarifying question (per the route contract), then builds and renders.

- [ ] **Step 4: Render to MP4**

```bash
npx hyperframes render --project . --format mp4
```

Expected: an MP4 file appears under the project's render output directory (path reported by the CLI on success).

- [ ] **Step 5: Sanity-check the render**

```bash
npx hyperframes check --project .
ffprobe <rendered-file>.mp4 2>&1 | grep -E "Duration|Video:"
```

Expected: `check` passes; `ffprobe` shows a portrait resolution (height > width) and a duration in the 2-4s range. If the aspect came out landscape, the brief's `aspect` field was not honored — go back to Step 2 and make the portrait requirement more explicit, then re-render. Do not proceed to Task 2 with a landscape file.

- [ ] **Step 6: Copy the asset into the app and commit**

```bash
cp <rendered-file>.mp4 "MockupsSwayMobile/assets/easter-egg.mp4"
cd "MockupsSwayMobile"
git add assets/easter-egg.mp4
git commit -m "feat: add easter-egg motion graphic asset"
```

---

### Task 2: expo-video dependency + fullscreen player modal

**Files:**
- Modify: `MockupsSwayMobile/package.json`, `package-lock.json` (new dependency)
- Create: `MockupsSwayMobile/src/components/EasterEggVideo.js`

**Interfaces:**
- Consumes: `assets/easter-egg.mp4` from Task 1.
- Produces: `EasterEggVideo` component — `<EasterEggVideo visible={boolean} onClose={() => void} />`. Task 3 renders this from `ScreenHeader.js` and controls `visible`/`onClose`.

- [ ] **Step 1: Install expo-video**

```bash
cd MockupsSwayMobile
npx expo install expo-video
```

Expected: `expo-video` added to `package.json`/`package-lock.json`, install exits clean.

- [ ] **Step 2: Write the component**

```javascript
// src/components/EasterEggVideo.js
import { Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

export default function EasterEggVideo({ visible, onClose }) {
  const player = useVideoPlayer(require('../../assets/easter-egg.mp4'), (p) => {
    p.muted = true;
    p.loop = false;
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <VideoView
          style={styles.video}
          player={player}
          contentFit="cover"
          nativeControls={false}
        />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
});
```

- [ ] **Step 3: Wire auto-close on playback end**

Extend the component from Step 2 — the `useVideoPlayer` callback receives the player instance; subscribe to its `playingChange`/`statusChange` events and call `onClose` when playback reaches the end. Since `expo-video`'s player is imperative, do this with a `useEffect` that adds an event listener when `visible` becomes true and removes it on unmount:

```javascript
import { useEffect } from 'react';
// ...inside the component, after the useVideoPlayer call:

useEffect(() => {
  if (!visible) return;
  player.currentTime = 0;
  player.play();
  const sub = player.addListener('playToEnd', onClose);
  return () => sub.remove();
}, [visible]);
```

- [ ] **Step 4: Manual check (no test framework for RN components in this repo)**

This repo has no component-level test harness (`collaboratorValidation.test.js` is the only precedent, plain `node assert` on pure functions — not applicable to a Modal/VideoView). Skip automated testing for this file; Task 3's manual device check covers it end-to-end.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/EasterEggVideo.js
git commit -m "feat: add EasterEggVideo fullscreen player component"
```

---

### Task 3: 5-tap trigger on the header logo

**Files:**
- Modify: `MockupsSwayMobile/src/components/ScreenHeader.js`
- Create: `MockupsSwayMobile/src/hooks/useTapTrigger.js`
- Test: `MockupsSwayMobile/src/hooks/useTapTrigger.test.js`

**Interfaces:**
- Produces: `useTapTrigger(count, windowMs)` — returns `{ registerTap }`; calling `registerTap()` `count` times within `windowMs` of each other invokes the hook's `onTrigger` callback and resets. A gap longer than `windowMs` between taps resets the counter to 1 (the tap that broke the streak still counts as the first of a new streak).
- Consumes: nothing from earlier tasks directly, but is wired into `ScreenHeader.js` alongside `EasterEggVideo` from Task 2.

- [ ] **Step 1: Write the failing test**

This repo's existing convention (`collaboratorValidation.test.js`) is plain Node `assert`, no test runner config — follow that pattern.

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node src/hooks/useTapTrigger.test.js
```

Expected: FAIL — `Cannot find module './useTapTrigger'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```javascript
// src/hooks/useTapTrigger.js
import { useRef, useCallback } from 'react';

function computeNextTapState(prevState, now, count, windowMs) {
  const withinWindow = now - prevState.lastTapAt <= windowMs;
  const nextTaps = withinWindow ? prevState.taps + 1 : 1;
  if (nextTaps >= count) {
    return { taps: 0, lastTapAt: now, triggered: true };
  }
  return { taps: nextTaps, lastTapAt: now, triggered: false };
}

export default function useTapTrigger(count, windowMs, onTrigger) {
  const stateRef = useRef({ taps: 0, lastTapAt: 0 });

  const registerTap = useCallback(() => {
    const next = computeNextTapState(stateRef.current, Date.now(), count, windowMs);
    stateRef.current = next;
    if (next.triggered) onTrigger();
  }, [count, windowMs, onTrigger]);

  return { registerTap };
}

module.exports.computeNextTapState = computeNextTapState;
module.exports.default = useTapTrigger;
```

Note: this mixes ESM `export default` (for the app's Metro/Babel bundler) with a CommonJS `module.exports.computeNextTapState` export (so the plain-Node test in Step 1 can `require` it without a bundler). This matches how `collaboratorValidation.js` already exposes named helpers for its Node-based test — check that file's export style before assuming a different pattern is needed.

- [ ] **Step 4: Run test to verify it passes**

```bash
node src/hooks/useTapTrigger.test.js
```

Expected: PASS — `useTapTrigger: all assertions passed` printed, exit code 0.

- [ ] **Step 5: Wire into ScreenHeader.js**

Modify `MockupsSwayMobile/src/components/ScreenHeader.js`. Current logo render (no `showBack`, no `hideLogo`):

```javascript
) : !hideLogo ? (
  <Image
    source={require('../../assets/SwayLogo.jpeg')}
    style={styles.logo}
    resizeMode="contain"
  />
) : null}
```

Replace with a tappable wrapper wired to the new hook and the Task 2 modal:

```javascript
import { useState, useCallback } from 'react';
import useTapTrigger from '../hooks/useTapTrigger';
import EasterEggVideo from './EasterEggVideo';

// inside the component, before the return:
const [eggVisible, setEggVisible] = useState(false);
const showEgg = useCallback(() => setEggVisible(true), []);
const { registerTap } = useTapTrigger(5, 2000, showEgg);

// in the render, replacing the plain <Image> block:
) : !hideLogo ? (
  <TouchableOpacity onPress={registerTap} activeOpacity={0.8}>
    <Image
      source={require('../../assets/SwayLogo.jpeg')}
      style={styles.logo}
      resizeMode="contain"
    />
  </TouchableOpacity>
) : null}

// after the closing </View> of styles.header, still inside the component's return:
<EasterEggVideo visible={eggVisible} onClose={() => setEggVisible(false)} />
```

`TouchableOpacity` is already imported at the top of `ScreenHeader.js` (used by `backBtn`/`bellBtn`) — no new import needed for it.

- [ ] **Step 6: Manual device check**

Run the app (`npx expo start`), open Home (or any screen with the logo visible), tap the logo 5 times within 2 seconds. Expected: fullscreen video plays, muted, closes automatically at the end or on tap. Tap it 4 times, wait 3 seconds, tap once more — expected: no trigger (streak should have reset, this 5th physical tap is only the 1st of a new streak).

- [ ] **Step 7: Commit**

```bash
git add src/components/ScreenHeader.js src/hooks/useTapTrigger.js src/hooks/useTapTrigger.test.js
git commit -m "feat: wire 5-tap easter egg trigger into ScreenHeader logo"
```
