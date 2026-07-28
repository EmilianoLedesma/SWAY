import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';

const notifications = [
  {
    id: '1',
    type: 'sighting',
    icon: 'binoculars',
    title: 'Avistamiento verificado',
    body: 'Tu avistamiento de Ballena Azul en Loreto ha sido verificado por el equipo científico.',
    time: 'hace 2 horas',
    read: false,
  },
  {
    id: '2',
    type: 'event',
    icon: 'calendar',
    title: 'Evento próximo: Limpieza de playa',
    body: 'La limpieza de playa en Playa del Carmen es mañana a las 08:00. ¡Te esperamos!',
    time: 'hace 5 horas',
    read: false,
  },
  {
    id: '3',
    type: 'badge',
    icon: 'trophy',
    title: 'Nuevo logro desbloqueado',
    body: 'Has obtenido la insignia "Explorador inicial" por registrar tu primer avistamiento.',
    time: 'ayer',
    read: false,
  },
  {
    id: '4',
    type: 'sighting',
    icon: 'binoculars',
    title: 'Avistamiento pendiente',
    body: 'Tu reporte de Mantarraya en Isla Mujeres está en revisión. Te notificaremos cuando sea verificado.',
    time: 'ayer',
    read: true,
  },
  {
    id: '5',
    type: 'event',
    icon: 'calendar',
    title: 'Recordatorio: Taller de identificación',
    body: 'El taller "Identificación de especies marinas" comienza en 3 días. Confirma tu asistencia.',
    time: 'hace 2 días',
    read: true,
  },
  {
    id: '6',
    type: 'system',
    icon: 'megaphone',
    title: '¡Bienvenido a SWAY!',
    body: 'Gracias por unirte a la comunidad de colaboradores científicos. Explora el catálogo y comienza a registrar avistamientos.',
    time: 'hace 1 semana',
    read: true,
  },
  {
    id: '7',
    type: 'badge',
    icon: 'trophy',
    title: 'Logro: Guardián del océano',
    body: 'Has completado 5 avistamientos verificados. Sigue así para desbloquear más logros.',
    time: 'hace 2 semanas',
    read: true,
  },
];

const TYPE_ICONS = {
  sighting: { icon: 'binoculars', color: colors.ocean, bg: colors.oceanLight },
  event: { icon: 'calendar', color: colors.blue, bg: colors.blueLight },
  badge: { icon: 'trophy', color: colors.amber, bg: colors.amberBg },
  system: { icon: 'megaphone', color: colors.text2, bg: colors.bg },
};

export default function NotificationsScreen() {
  const [list, setList] = useState(notifications);
  const unread = list.filter((n) => !n.read).length;

  const markAllRead = () => {
    setList((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id) => {
    setList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  };

  const deleteNotif = (id) => {
    setList((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="Notificaciones" subtitle={`${unread} sin leer`} hideLogo hideBell showBack />

        {unread > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.blue} />
            <Text style={styles.markAllText}>Marcar todas como leídas</Text>
          </TouchableOpacity>
        )}

        {list.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={44} color={colors.text3} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin notificaciones</Text>
            <Text style={styles.emptyDesc}>
              No tienes notificaciones nuevas. Participa en la comunidad para recibir actualizaciones.
            </Text>
          </View>
        ) : (
          list.map((n) => {
                const cfg = TYPE_ICONS[n.type];
                return (
                  <TouchableOpacity
                    key={n.id}
                    style={[styles.notifCard, !n.read && styles.notifUnread]}
                    onPress={() => markRead(n.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={20} color={cfg.color} />
                    </View>
                    <View style={styles.notifContent}>
                      <View style={styles.notifHeader}>
                        <Text style={[styles.notifTitle, !n.read && styles.notifTitleUnread]}>
                          {n.title}
                        </Text>
                        {!n.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.notifBody} numberOfLines={2}>
                        {n.body}
                      </Text>
                      <View style={styles.notifFooter}>
                        <Text style={styles.notifTime}>{n.time}</Text>
                        <TouchableOpacity
                          onPress={() => deleteNotif(n.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={14} color={colors.text3} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 80,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markAllText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  notifCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    padding: 14,
    marginBottom: 10,
    ...shadows.xs,
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.blue,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  notifContent: {
    flex: 1,
    gap: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notifTitle: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.medium,
    color: colors.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  notifTitleUnread: {
    fontWeight: typography.weight.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.blue,
  },
  notifBody: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text2,
    lineHeight: 18,
  },
  notifFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  notifTime: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
  },
  emptyDesc: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
    marginTop: 4,
  },
});
