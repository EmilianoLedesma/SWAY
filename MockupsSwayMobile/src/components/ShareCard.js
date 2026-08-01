import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii } from '../theme/spacing';

export default function ShareCard({ icon, title, subtitle, badge, badgeColor, badgeBg, lines, photoUrl }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.brand}>SWAY</Text>
        <Text style={styles.brandSub}>Portal Científico</Text>
      </View>

      <View style={styles.iconWrap}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photoImage} onError={() => {}} />
        ) : (
          <Ionicons name={icon} size={44} color={colors.oceanDark} />
        )}
      </View>

      {badge ? (
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.linesWrap}>
        {lines.map((l, i) => (
          <View key={i} style={styles.lineRow}>
            <Ionicons name={l.icon} size={13} color={colors.text3} />
            <Text style={styles.lineText} numberOfLines={2}>{l.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footerLine} />
      <Text style={styles.footer}>Conservación marina · sway</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: radii.r20,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
  },
  brand: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: '800',
    color: colors.oceanDark,
    letterSpacing: -0.5,
  },
  brandSub: {
    fontFamily: typography.body,
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.oceanLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radii.r99,
    marginBottom: 10,
  },
  badgeText: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontFamily: typography.display,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.text2,
    textAlign: 'center',
    marginBottom: 16,
  },
  linesWrap: {
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lineText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    flex: 1,
  },
  footerLine: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  footer: {
    fontFamily: typography.body,
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
