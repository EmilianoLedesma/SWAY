const assert = require('assert');
const { diffUnlockedBadges } = require('./gamificationBadges');

const approvedBadges = [
  { label: 'Colaborador aprobado', current: 1, goal: 1, unlocked: true },
];
const notApprovedBadges = [
  { label: 'Colaborador aprobado', current: 0, goal: 1, unlocked: false },
];

// First login ever: real unlock is not "fresh" (no celebration on initial load)
{
  const r1 = diffUnlockedBadges(null, approvedBadges, true);
  assert.deepStrictEqual(r1.fresh, [], 'first computation should not celebrate');
  assert.ok(r1.nextUnlocked.has('Colaborador aprobado'));
}

// Logout resets counters to seed (badge computes unlocked:false) — must NOT
// erase the tracked "already unlocked" state, since isLoggedIn is false.
{
  let prev = new Set(['Colaborador aprobado']);
  const r2 = diffUnlockedBadges(prev, notApprovedBadges, false);
  assert.deepStrictEqual(r2.fresh, [], 'logout should not celebrate');
  assert.ok(r2.nextUnlocked.has('Colaborador aprobado'), 'logout must not drop prior unlocked state');
}

// Re-login after logout: badge is still approved — must NOT re-celebrate
// (this is the reported bug: repeated celebration on every login).
{
  let prev = new Set(['Colaborador aprobado']);
  const r3 = diffUnlockedBadges(prev, approvedBadges, true);
  assert.deepStrictEqual(r3.fresh, [], 'already-unlocked badge must not re-celebrate on re-login');
}

// A genuinely new unlock while logged in still celebrates
{
  let prev = new Set([]);
  const r4 = diffUnlockedBadges(prev, approvedBadges, true);
  assert.deepStrictEqual(r4.fresh, ['Colaborador aprobado'], 'real new unlock should celebrate');
}

console.log('gamificationBadges.test.js: all assertions passed');
