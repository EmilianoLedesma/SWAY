import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import { getMisEventosRegistrados, cancelarAsistencia } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useGamification } from '../context/GamificationContext';
import { hapticError, hapticWarning } from '../utils/haptics';

function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapEvento(e) {
  const fechaEvento = e.fecha_evento ? e.fecha_evento.slice(0, 10) : '';
  return {
    id: String(e.id),
    name: e.titulo,
    location: e.direccion || e.url_evento || e.modalidad || 'Por confirmar',
    time: e.hora_inicio && e.hora_fin ? `${e.hora_inicio.slice(0, 5)} - ${e.hora_fin.slice(0, 5)}` : '',
    date: fechaEvento,
    status: fechaEvento && fechaEvento < todayLocalStr() ? 'PAST' : 'UPCOMING',
  };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return { day: d.getDate(), month: months[d.getMonth()] };
}

export default function MisAsistenciasScreen() {
  const { setIsLoggedIn } = useAuth();
  const { setEventsAttended } = useGamification();
  const [eventos, setEventos] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMisEventosRegistrados().then((data) => {
        if (!active) return;
        if (data?.sessionExpired) {
          setIsLoggedIn(false);
          return;
        }
        setEventos(data?.eventos ? data.eventos.map(mapEvento) : []);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const handleCancelar = (item) => {
    Alert.alert(
      'Cancelar asistencia',
      `¿Cancelar tu asistencia a "${item.name}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancelar asistencia',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelarAsistencia(item.id);
            if (result?.sessionExpired) {
              setIsLoggedIn(false);
              return;
            }
            if (!result.success) {
              hapticError();
              Alert.alert('Error', result.message || 'No se pudo cancelar tu asistencia.');
              return;
            }
            hapticWarning();
            const refreshed = await getMisEventosRegistrados();
            if (refreshed?.eventos) {
              setEventos(refreshed.eventos.map(mapEvento));
              setEventsAttended(refreshed.eventos.length);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Voy a asistir" subtitle={`${eventos.length} eventos`} hideLogo showBack />

        {eventos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={colors.text3} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin eventos confirmados</Text>
            <Text style={styles.emptyDesc}>
              Confirma tu asistencia a un evento próximo desde la pantalla de Eventos.
            </Text>
          </View>
        ) : (
          eventos.map((item) => {
            const { day, month } = formatDate(item.date);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateMonth}>{month}</Text>
                    <Text style={styles.dateDay}>{day}</Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color={colors.text3} />
                      <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={12} color={colors.text3} />
                      <Text style={styles.metaText}>{item.time}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelar(item)}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.red} />
                  <Text style={styles.cancelBtnText}>Cancelar asistencia</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 40, paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    marginBottom: 14,
    ...shadows.xs,
    overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', padding: 14, gap: 14 },
  dateBlock: {
    width: 52,
    height: 60,
    backgroundColor: colors.oceanLight,
    borderRadius: radii.r12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    color: colors.ocean,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dateDay: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: typography.weight.extrabold,
    color: colors.oceanDark,
    lineHeight: 22,
  },
  cardContent: { flex: 1, gap: 6 },
  cardName: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: typography.body, fontSize: 12, color: colors.text2, flex: 1 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.red,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 4 },
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
