import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { sightingsList } from '../data/sightings';
import { speciesList } from '../data/species';
import { eventsList } from '../data/events';

const LEVEL_THRESHOLDS = [0, 50, 150, 300];

const GamificationContext = createContext(null);

const seed = {
  verifiedSightings: sightingsList.filter((s) => s.status === 'VERIFIED').length,
  pendingSightings: sightingsList.filter((s) => s.status === 'PENDING').length,
  photoSightings: sightingsList.filter((s) => s.hasPhoto).length,
  species: speciesList.length,
  eventsAttended: eventsList.filter((e) => e.status === 'PAST').length,
};

export function GamificationProvider({ children }) {
  const [counters, setCounters] = useState(seed);
  const [streakCount, setStreakCount] = useState(1);
  const [bestStreak, setBestStreak] = useState(1);
  const [celebration, setCelebration] = useState(null);

  const incrementSightings = (verified, hasPhoto = false) =>
    setCounters((c) => ({
      ...c,
      verifiedSightings: c.verifiedSightings + (verified ? 1 : 0),
      pendingSightings: c.pendingSightings + (verified ? 0 : 1),
      photoSightings: c.photoSightings + (hasPhoto ? 1 : 0),
    }));

  const incrementSpecies = () =>
    setCounters((c) => ({ ...c, species: c.species + 1 }));

  const incrementEventAttended = () =>
    setCounters((c) => ({ ...c, eventsAttended: c.eventsAttended + 1 }));

  const bumpStreak = () =>
    setStreakCount((s) => {
      const next = s + 1;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });

  const totalSightings = counters.verifiedSightings + counters.pendingSightings;

  const points =
    counters.verifiedSightings * 15 +
    counters.pendingSightings * 5 +
    counters.species * 5 +
    counters.eventsAttended * 15;

  const level = LEVEL_THRESHOLDS.filter((t) => points >= t).length;
  const levelFloor = LEVEL_THRESHOLDS[level - 1];
  const levelCeil = LEVEL_THRESHOLDS[level];
  const levelProgress = levelCeil
    ? Math.round(((points - levelFloor) / (levelCeil - levelFloor)) * 100)
    : 100;

  const badges = useMemo(
    () =>
      [
        { label: 'Explorador inicial', icon: 'compass-outline', current: totalSightings, goal: 1 },
        { label: 'Guardián del océano', icon: 'water-outline', current: counters.verifiedSightings, goal: 5 },
        { label: 'Coleccionista de especies', icon: 'flower-outline', current: counters.species, goal: 20 },
        { label: 'Fotógrafo marino', icon: 'camera-outline', current: counters.photoSightings, goal: 8 },
        { label: 'Voluntario activo', icon: 'people-outline', current: counters.eventsAttended, goal: 3 },
      ].map((b) => ({ ...b, unlocked: b.current >= b.goal })),
    [totalSightings, counters]
  );

  const celebrate = (payload) => setCelebration(payload);
  const dismissCelebration = () => setCelebration(null);

  const prevUnlocked = useRef(null);
  useEffect(() => {
    const unlocked = new Set(badges.filter((b) => b.unlocked).map((b) => b.label));
    if (prevUnlocked.current === null) {
      prevUnlocked.current = unlocked;
      return;
    }
    const fresh = [...unlocked].filter((label) => !prevUnlocked.current.has(label));
    prevUnlocked.current = unlocked;
    if (fresh.length) {
      const badge = badges.find((b) => b.label === fresh[0]);
      celebrate({
        icon: badge.icon,
        title: '¡Insignia desbloqueada!',
        message: badge.label,
      });
    }
  }, [badges]);

  return (
    <GamificationContext.Provider
      value={{
        points,
        level,
        levelFloor,
        levelCeil,
        levelProgress,
        badges,
        streakCount,
        bestStreak,
        celebration,
        celebrate,
        dismissCelebration,
        incrementSightings,
        incrementSpecies,
        incrementEventAttended,
        bumpStreak,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error('useGamification debe usarse dentro de <GamificationProvider>');
  return ctx;
}
