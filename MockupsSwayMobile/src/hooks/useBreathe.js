import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

export default function useBreathe() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.85, duration: 1200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => loop?.stop();
  }, []);

  return opacity;
}
