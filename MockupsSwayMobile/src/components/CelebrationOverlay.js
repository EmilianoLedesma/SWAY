import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGamification } from '../context/GamificationContext';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';

function CelebrationCard({ celebration, onDismiss }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);
  const dismissRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        damping: 18,
        stiffness: 170,
        mass: 1,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();

    const dismiss = () => {
      if (dismissing.current) return;
      dismissing.current = true;
      Animated.timing(opacity, { toValue: 0, duration: 170, useNativeDriver: true }).start(onDismiss);
    };

    const timer = setTimeout(dismiss, 3000);
    dismissRef.current = dismiss;
    return () => clearTimeout(timer);
  }, []);

  return (
    <Pressable style={styles.overlay} onPress={() => dismissRef.current?.()}>
      <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
        <View style={styles.iconWrap}>
          <Ionicons name={celebration.icon} size={40} color={colors.oceanDark} />
        </View>
        <Text style={styles.title}>{celebration.title}</Text>
        <Text style={styles.message}>{celebration.message}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function CelebrationOverlay() {
  const { celebration, dismissCelebration } = useGamification();
  if (!celebration) return null;
  return (
    <CelebrationCard
      key={celebration.message}
      celebration={celebration}
      onDismiss={dismissCelebration}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radii.r24,
    padding: 28,
    alignItems: 'center',
    ...shadows.md,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.oceanLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  message: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
  },
});
