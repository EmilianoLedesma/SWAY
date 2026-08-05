import { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import { getAvistamientosMine, getMisEventosRegistrados, getEspecies, getProfile, isBiometricLoginEnabled } from '../api/client';
import { useAuth } from './AuthContext';
import { diffUnlockedBadges } from './gamificationBadges';

const LEVEL_THRESHOLDS = [0, 50, 150, 300];

const GamificationContext = createContext(null);

const seed = {
  sightings: 0,
  photoSightings: 0,
  species: 0,
  eventsAttended: 0,
  approved: false,
  biometricEnabled: false,
};

export function GamificationProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const [counters, setCounters] = useState(seed);
  const [streakCount, setStreakCount] = useState(1);
  const [bestStreak, setBestStreak] = useState(1);
  const [celebration, setCelebration] = useState(null);

  // Provider sits above the login screen, so the real counts can only be
  // fetched once a session exists — refetch whenever isLoggedIn flips true,
  // and drop back to zero on logout instead of showing the previous user's data.
  useEffect(() => {
    if (!isLoggedIn) {
      setCounters(seed);
      return;
    }
    let active = true;
    Promise.all([
      getAvistamientosMine(),
      getMisEventosRegistrados(),
      getEspecies(),
      getProfile(),
      isBiometricLoginEnabled(),
    ]).then(([avistamientosData, eventosData, especiesData, profileData, biometricEnabled]) => {
      if (!active) return;
      const avistamientos = avistamientosData?.success ? avistamientosData.avistamientos || [] : [];
      setCounters({
        sightings: avistamientos.length,
        photoSightings: avistamientos.filter((a) => a.foto_url).length,
        species: especiesData?.success ? (especiesData.especies || []).length : 0,
        eventsAttended: eventosData?.success ? (eventosData.eventos || []).length : 0,
        approved: profileData?.colaborador?.estado_solicitud === 'aprobada',
        biometricEnabled: !!biometricEnabled,
      });
    });
    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  // verified/pending sighting status doesn't exist in the backend — every real
  // sighting counts toward "sightings" once. hasPhoto reflects the real
  // foto_url from the upload endpoint, not an attempt.
  const incrementSightings = (_verified, hasPhoto = false) =>
    setCounters((c) => ({
      ...c,
      sightings: c.sightings + 1,
      photoSightings: c.photoSightings + (hasPhoto ? 1 : 0),
    }));

  const setBiometricBadge = (enabled) =>
    setCounters((c) => ({ ...c, biometricEnabled: enabled }));

  const incrementSpecies = () =>
    setCounters((c) => ({ ...c, species: c.species + 1 }));

  // Real RSVP feature now exists — callers refetch getMisEventosRegistrados()
  // after a successful registrarAsistencia/cancelarAsistencia and pass the
  // real count here, so cancel decrements the counter correctly too.
  const setEventsAttended = (n) =>
    setCounters((c) => ({ ...c, eventsAttended: n }));

  const bumpStreak = () =>
    setStreakCount((s) => {
      const next = s + 1;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });

  const totalSightings = counters.sightings;

  const points =
    counters.sightings * 10 +
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
        { label: 'Colaborador aprobado', icon: 'checkmark-circle-outline', current: counters.approved ? 1 : 0, goal: 1 },
        { label: 'Seguridad activada', icon: 'finger-print-outline', current: counters.biometricEnabled ? 1 : 0, goal: 1 },
        { label: 'Explorador inicial', icon: 'compass-outline', current: totalSightings, goal: 1 },
        { label: 'Primera foto', icon: 'image-outline', current: counters.photoSightings, goal: 1 },
        { label: 'Primer evento', icon: 'megaphone-outline', current: counters.eventsAttended, goal: 1 },
        { label: 'Guardián del océano', icon: 'water-outline', current: totalSightings, goal: 5 },
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
    // isLoggedIn can flip true before the counters fetch above resolves — badges
    // computed from the still-seeded `counters` are placeholders, not real state.
    // Skip those renders entirely so they never consume the baseline/diff slot,
    // otherwise the real data arriving right after looks like a fresh unlock.
    if (counters === seed) return;
    const { fresh, nextUnlocked } = diffUnlockedBadges(prevUnlocked.current, badges, isLoggedIn);
    prevUnlocked.current = nextUnlocked;
    if (fresh.length) {
      const badge = badges.find((b) => b.label === fresh[0]);
      celebrate({
        icon: badge.icon,
        title: '¡Insignia desbloqueada!',
        message: badge.label,
      });
    }
  }, [badges, isLoggedIn, counters]);

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
        setEventsAttended,
        setBiometricBadge,
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
