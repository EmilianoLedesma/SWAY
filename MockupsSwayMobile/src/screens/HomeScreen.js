import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import { useGamification } from '../context/GamificationContext';
import useBreathe from '../hooks/useBreathe';
import useRecentActivity from '../hooks/useRecentActivity';
import { eventsList } from '../data/events';
import { getProfile } from '../api/client';

const nextEvent = eventsList
  .filter((e) => e.status === 'UPCOMING')
  .sort((a, b) => a.date.localeCompare(b.date))[0];

const relativeDate = (date) => {
  const d = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86400000));
  if (d < 1) return 'hoy';
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const w = Math.round(d / 7);
  return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
};

export default function HomeScreen({ navigation }) {
  const { points, level, levelCeil, levelProgress, streakCount } = useGamification();
  const streakPulse = useBreathe();
  const pressScales = useRef({}).current;
  const entryAnims = useRef({}).current;
  const [firstName, setFirstName] = useState('colaborador');
  const recentActivity = useRecentActivity(5);

  useEffect(() => {
    let active = true;
    getProfile().then((data) => {
      if (active && data?.colaborador?.nombre) setFirstName(data.colaborador.nombre);
    });
    return () => {
      active = false;
    };
  }, []);

  const quickActions = [
    { key: 'sighting', label: 'Reportar avistamiento', icon: 'binoculars-outline', color: colors.blue, route: 'Sightings' },
    { key: 'catalog', label: 'Ver catálogo', icon: 'apps-outline', color: colors.ocean, route: 'Catalog' },
    ...(nextEvent
      ? [{ key: 'event', label: 'Próximo evento', icon: 'calendar-outline', color: colors.amber, route: 'Events', hint: nextEvent.name }]
      : []),
    { key: 'profile', label: 'Mi perfil', icon: 'person-outline', color: colors.oceanDark, route: 'Profile' },
  ];

  const getPressScale = (key) => {
    if (!pressScales[key]) pressScales[key] = new Animated.Value(1);
    return pressScales[key];
  };

  const getEntryAnim = (key) => {
    if (!entryAnims[key]) {
      entryAnims[key] = { opacity: new Animated.Value(0), translateY: new Animated.Value(12) };
    }
    return entryAnims[key];
  };

  useEffect(() => {
    Animated.stagger(
      40,
      quickActions.map((a) => {
        const { opacity, translateY } = getEntryAnim(a.key);
        return Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]);
      }),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePressIn = (key) => {
    Animated.spring(getPressScale(key), { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  };

  const handlePressOut = (key) => {
    Animated.spring(getPressScale(key), { toValue: 1, useNativeDriver: true, speed: 40 }).start();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title={`Hola, ${firstName}`} subtitle="Tu actividad en SWAY" />

        <TouchableOpacity
          style={styles.levelCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Profile', { initialTab: 'activity' })}
        >
          <View style={styles.levelHeader}>
            <Text style={styles.levelTitle}>Nivel {level}</Text>
            <View style={styles.streakChip}>
              <Animated.Text style={[styles.streakIcon, { opacity: streakPulse }]}>🔥</Animated.Text>
              <Text style={styles.streakText}>{streakCount}</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${levelProgress}%` }]} />
          </View>
          <Text style={styles.levelHint}>
            {levelCeil
              ? `${points} pts · faltan ${levelCeil - points} para el nivel ${level + 1}`
              : `${points} pts · nivel máximo alcanzado`}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((a) => {
            const { opacity, translateY } = getEntryAnim(a.key);
            return (
              <Animated.View
                key={a.key}
                style={[styles.actionCardWrap, { opacity, transform: [{ translateY }, { scale: getPressScale(a.key) }] }]}
              >
                <TouchableOpacity
                  style={styles.actionCard}
                  activeOpacity={0.85}
                  onPressIn={() => handlePressIn(a.key)}
                  onPressOut={() => handlePressOut(a.key)}
                  onPress={() => navigation.navigate(a.route)}
                >
                  <View style={[styles.actionIcon, { backgroundColor: a.color + '18' }]}>
                    <Ionicons name={a.icon} size={20} color={a.color} />
                  </View>
                  <Text style={styles.actionLabel}>{a.label}</Text>
                  <Text
                    style={[styles.actionHint, !a.hint && styles.actionHintHidden]}
                    numberOfLines={1}
                  >
                    {a.hint || ' '}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Actividad reciente</Text>
        <View style={styles.activityCard}>
          {recentActivity.map((act) => (
            <TouchableOpacity
              key={act.key}
              style={styles.activityRow}
              activeOpacity={0.7}
              onPress={() => {
                const isSighting = act.key.startsWith('avistamiento-');
                const id = act.key.slice(isSighting ? 'avistamiento-'.length : 'evento-'.length);
                navigation.navigate(isSighting ? 'Sightings' : 'Events', { openId: id });
              }}
            >
              <View style={styles.activityDot} />
              <View style={styles.activityContent}>
                <Text style={styles.activityText}>{act.text}</Text>
                <Text style={styles.activityDate}>{relativeDate(act.date)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  levelCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    padding: 18,
    marginBottom: 20,
    gap: 8,
    ...shadows.xs,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTitle: {
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.r99,
    backgroundColor: colors.amberBg,
  },
  streakIcon: {
    fontSize: 12,
  },
  streakText: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.bold,
    color: colors.amber,
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.r99,
    backgroundColor: colors.blueLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: radii.r99,
    backgroundColor: colors.blue,
  },
  levelHint: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
  },
  sectionTitle: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCardWrap: {
    width: '47.5%',
    flexGrow: 1,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.r12,
    padding: 14,
    gap: 8,
    ...shadows.xs,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  actionHint: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
  },
  actionHintHidden: {
    opacity: 0,
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...shadows.xs,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ocean,
    marginTop: 5,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  activityDate: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
    marginTop: 2,
  },
});
