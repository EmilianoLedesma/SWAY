import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import useTapTrigger from '../hooks/useTapTrigger';
import EasterEggVideo from './EasterEggVideo';

export default function ScreenHeader({ title, subtitle, hideLogo, hideBell, showBack }) {
  const navigation = useNavigation();
  const [eggVisible, setEggVisible] = useState(false);
  const showEgg = useCallback(() => setEggVisible(true), []);
  const { registerTap } = useTapTrigger(5, 2000, showEgg);

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : !hideLogo ? (
        <TouchableOpacity onPress={registerTap} activeOpacity={0.8}>
          <Image
            source={require('../../assets/SwayLogo.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </TouchableOpacity>
      ) : null}
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {!hideBell && (
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={22} color={colors.text2} />
        </TouchableOpacity>
      )}
      {eggVisible && <EasterEggVideo visible onClose={() => setEggVisible(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 22,
    fontWeight: typography.weight.extrabold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text2,
    marginTop: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
