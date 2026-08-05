// Tracks which badge labels are "already unlocked" across login/logout
// cycles, so a celebration only fires on a genuinely new unlock — not every
// time the app refetches counters after a login.
function diffUnlockedBadges(prevUnlockedSet, badges, isLoggedIn) {
  if (!isLoggedIn) {
    // Logged-out counters collapse to seed values (all locked). That's not
    // a real change in the user's achievements, so leave the tracked set
    // untouched instead of treating it as unlocks disappearing.
    return { fresh: [], nextUnlocked: prevUnlockedSet };
  }

  const unlocked = new Set(badges.filter((b) => b.unlocked).map((b) => b.label));

  if (prevUnlockedSet === null) {
    return { fresh: [], nextUnlocked: unlocked };
  }

  const fresh = [...unlocked].filter((label) => !prevUnlockedSet.has(label));
  return { fresh, nextUnlocked: unlocked };
}

module.exports = { diffUnlockedBadges };
