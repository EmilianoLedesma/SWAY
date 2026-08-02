import * as Haptics from 'expo-haptics';

export const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const hapticError = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
export const hapticWarning = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
