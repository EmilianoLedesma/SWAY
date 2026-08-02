import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import ShareCard from '../components/ShareCard';
import DateField from '../components/DateField';
import { eventsList } from '../data/events';
import { getEventos, getEventosMine, getTiposEvento, getModalidades, crearEvento, deleteEvento, registrarAsistencia, cancelarAsistencia, getMisEventosRegistrados } from '../api/client';
import { useGamification } from '../context/GamificationContext';
import { useAuth } from '../context/AuthContext';
import { hapticSuccess, hapticError, hapticWarning } from '../utils/haptics';

// 'YYYY-MM-DD' string comparison instead of Date objects — new Date('YYYY-MM-DD')
// parses as UTC midnight, which in MX time (UTC-6) already reads as "yesterday"
// past ~18:00 local, misclassifying same-day events as PAST.
function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sortEventos(list) {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'UPCOMING' ? -1 : 1;
    return a.status === 'UPCOMING'
      ? a.date.localeCompare(b.date) // soonest first
      : b.date.localeCompare(a.date); // most recent past first
  });
}

// Module-level, not component state — survives screen remounts within the same
// app session (resets on app reload). null = baseline not established yet, so
// the very first fetch never celebrates (mirrors GamificationContext's badge
// unlock detection, which also skips celebrating on its first computation).
let seenEventIds = null;

function mapEventoFromApi(e) {
  const fechaEvento = e.fecha_evento ? e.fecha_evento.slice(0, 10) : '';
  return {
    id: String(e.id),
    name: e.titulo,
    location: e.direccion || e.url_evento || e.modalidad || 'Por confirmar',
    time: e.hora_inicio && e.hora_fin ? `${e.hora_inicio.slice(0, 5)} - ${e.hora_fin.slice(0, 5)}` : '',
    date: fechaEvento,
    participants: e.registrados || 0,
    maxParticipants: e.capacidad_maxima || 0,
    status: fechaEvento && fechaEvento < todayLocalStr() ? 'PAST' : 'UPCOMING',
    organizer: e.organizador || 'SWAY',
    description: e.descripcion || '',
  };
}

const STATUS_CFG = {
  UPCOMING: { label: 'Próximo', color: colors.blue, bg: colors.blueLight },
  PAST: { label: 'Pasado', color: colors.text3, bg: colors.bg },
};

const initialEventForm = {
  titulo: '',
  tipoId: null,
  fecha: '',
  capacidadMaxima: '',
  modalidadId: null,
  ubicacion: '',
  descripcion: '',
  horaInicio: '',
  horaFin: '',
  costo: '',
  contacto: '',
  terminos: false,
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return { day: d.getDate(), month: months[d.getMonth()] };
}

export default function EventsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { bumpStreak, incrementEventAttended, celebrate } = useGamification();
  const { setIsLoggedIn } = useAuth();
  const [events, setEvents] = useState(eventsList);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(null);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);
  const [newModal, setNewModal] = useState(false);
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [shareTarget, setShareTarget] = useState(null);
  const shareCardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [tiposEvento, setTiposEvento] = useState([]);
  const [modalidades, setModalidades] = useState([]);
  const [misRegistros, setMisRegistros] = useState(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchEvents = showMineOnly ? getEventosMine : getEventos;
      Promise.all([fetchEvents(), getMisEventosRegistrados()]).then(([data, misData]) => {
        if (!active) return;
        if (data?.sessionExpired) {
          setIsLoggedIn(false);
          return;
        }
        const mapped = sortEventos(data?.eventos ? data.eventos.map(mapEventoFromApi) : []);
        setEvents(mapped);
        if (misData?.eventos) {
          setMisRegistros(new Set(misData.eventos.map((e) => String(e.id))));
        }

        const currentIds = new Set(mapped.map((e) => e.id));
        if (seenEventIds === null) {
          seenEventIds = currentIds;
        } else {
          const nuevos = mapped.filter((e) => e.status === 'UPCOMING' && !seenEventIds.has(e.id));
          if (nuevos.length) {
            celebrate({
              icon: 'calendar',
              title: 'Nuevo evento próximo',
              message: nuevos[0].name,
            });
          }
          seenEventIds = currentIds;
        }
      });
      return () => {
        active = false;
      };
    }, [showMineOnly, celebrate])
  );

  useEffect(() => {
    let active = true;
    getTiposEvento().then((data) => {
      if (active && data?.tipos) setTiposEvento(data.tipos);
    });
    getModalidades().then((data) => {
      if (active && data?.modalidades) setModalidades(data.modalidades);
    });
    return () => {
      active = false;
    };
  }, []);

  const setField = (key, value) =>
    setEventForm((prev) => ({ ...prev, [key]: value }));

  const handleShare = (item) => {
    setShareTarget(item);
    setTimeout(async () => {
      try {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir evento' });
      } catch {
        Alert.alert('Error', 'No se pudo generar la tarjeta para compartir.');
      } finally {
        setShareTarget(null);
      }
    }, 150);
  };

  const handleCreateEvent = async () => {
    if (saving) return;
    if (
      !eventForm.titulo ||
      !eventForm.tipoId ||
      !eventForm.fecha ||
      !eventForm.capacidadMaxima ||
      !eventForm.modalidadId ||
      !eventForm.descripcion ||
      !eventForm.horaInicio ||
      !eventForm.horaFin
    ) {
      Alert.alert('Datos incompletos', 'Completa todos los campos obligatorios.');
      return;
    }
    if (eventForm.titulo.trim().length < 3) {
      Alert.alert('Título muy corto', 'El título debe tener al menos 3 caracteres.');
      return;
    }
    if (eventForm.descripcion.trim().length < 10) {
      Alert.alert('Descripción muy corta', 'La descripción debe tener al menos 10 caracteres.');
      return;
    }
    const capacidad = Number(eventForm.capacidadMaxima);
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 10000) {
      Alert.alert(
        'Capacidad inválida',
        'La capacidad máxima debe ser un número entero entre 1 y 10000.',
      );
      return;
    }
    const costo = Number(eventForm.costo);
    if (!Number.isFinite(costo) || costo < 0) {
      Alert.alert('Costo inválido', 'El costo debe ser un número mayor o igual a 0.');
      return;
    }
    if (eventForm.contacto && !/^\S+@\S+\.\S+$/.test(eventForm.contacto)) {
      Alert.alert('Contacto inválido', 'Ingresa un correo electrónico de contacto válido.');
      return;
    }
    if (!eventForm.terminos) {
      Alert.alert('Términos y condiciones', 'Debes aceptar los términos para proponer un evento.');
      return;
    }
    const descripcionFinal = eventForm.ubicacion.trim()
      ? `${eventForm.descripcion}\n\nUbicación: ${eventForm.ubicacion.trim()}`
      : eventForm.descripcion;
    if (descripcionFinal.length > 2000) {
      Alert.alert(
        'Descripción muy larga',
        'La descripción y la ubicación combinadas superan el límite de 2000 caracteres. Acorta alguno de los dos campos.',
      );
      return;
    }

    setSaving(true);
    const result = await crearEvento({
      titulo: eventForm.titulo,
      descripcion: descripcionFinal,
      fecha_evento: eventForm.fecha,
      hora_inicio: eventForm.horaInicio,
      hora_fin: eventForm.horaFin,
      id_tipo_evento: eventForm.tipoId,
      id_modalidad: eventForm.modalidadId,
      capacidad_maxima: Number(eventForm.capacidadMaxima),
      costo,
      contacto: eventForm.contacto,
    });
    setSaving(false);
    if (!result.success) {
      if (result.sessionExpired) {
        setIsLoggedIn(false);
        return;
      }
      hapticError();
      Alert.alert('Error', result.message || 'No se pudo enviar la propuesta de evento.');
      return;
    }
    hapticSuccess();
    const refreshed = await (showMineOnly ? getEventosMine() : getEventos());
    if (refreshed?.eventos) {
      setEvents(sortEventos(refreshed.eventos.map(mapEventoFromApi)));
    }
    bumpStreak();
    setEventForm(initialEventForm);
    setNewModal(false);
    Alert.alert('Propuesta enviada', 'Tu evento será revisado antes de su publicación.');
  };

  const filtered = useMemo(() => {
    let result = events;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q),
      );
    }
    if (filter) {
      result = result.filter((e) => e.status === filter);
    }
    return result;
  }, [events, search, filter]);

  const handleDelete = (item) => {
    Alert.alert(
      'Eliminar evento',
      `¿Eliminar "${item.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteEvento(item.id);
            if (result?.sessionExpired) {
              setIsLoggedIn(false);
              return;
            }
            if (!result.success) {
              hapticError();
              Alert.alert('Error', result.message || 'No se pudo eliminar el evento.');
              return;
            }
            hapticWarning();
            const refreshed = await (showMineOnly ? getEventosMine() : getEventos());
            if (refreshed?.eventos) {
              setEvents(sortEventos(refreshed.eventos.map(mapEventoFromApi)));
            }
          },
        },
      ],
    );
  };

  const handleToggleAsistencia = async () => {
    if (!detailEvent) return;
    const isRegistered = misRegistros.has(detailEvent.id);
    const result = isRegistered
      ? await cancelarAsistencia(detailEvent.id)
      : await registrarAsistencia(detailEvent.id);
    if (result?.sessionExpired) {
      setIsLoggedIn(false);
      return;
    }
    if (!result.success) {
      hapticError();
      Alert.alert('Error', result.message || 'No se pudo actualizar tu asistencia.');
      return;
    }
    hapticSuccess();
    if (!isRegistered) {
      incrementEventAttended();
    }
    const [refreshed, misRegistradosData] = await Promise.all([
      showMineOnly ? getEventosMine() : getEventos(),
      getMisEventosRegistrados(),
    ]);
    if (refreshed?.eventos) {
      setEvents(sortEventos(refreshed.eventos.map(mapEventoFromApi)));
    }
    if (misRegistradosData?.eventos) {
      setMisRegistros(new Set(misRegistradosData.eventos.map((e) => String(e.id))));
    }
  };

  const renderCard = (item) => {
    const { day, month } = formatDate(item.date);
    const st = STATUS_CFG[item.status];
    const isUpcoming = item.status === 'UPCOMING';
    const isFull = item.participants >= item.maxParticipants;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, !isUpcoming && styles.cardPast]}
        onPress={() => setDetailEvent(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateMonth}>{month}</Text>
            <Text style={styles.dateDay}>{day}</Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardName} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                <Text style={[styles.statusText, { color: st.color }]}>
                  {st.label}
                </Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={12} color={colors.text3} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={12} color={colors.text3} />
                <Text style={styles.metaText}>{item.time}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="people-outline" size={12} color={colors.text3} />
                <Text style={styles.metaText}>
                  {item.participants}/{item.maxParticipants}
                  {isFull ? ' (completo)' : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          {isUpcoming ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
              <Ionicons name="share-outline" size={14} color={colors.text2} />
              <Text style={[styles.actionLabel, { color: colors.text2 }]}>Compartir</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={14} color={colors.red} />
            <Text style={[styles.actionLabel, { color: colors.red }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Eventos"
          subtitle={`${events.filter(e => e.status === 'UPCOMING').length} próximos`}
          hideLogo
        />

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.text3} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar eventos..."
            placeholderTextColor={colors.text3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.text3} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          <TouchableOpacity
            style={[styles.filterChip, !filter && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterChipText, !filter && styles.filterChipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
          {Object.entries(STATUS_CFG).map(([key, val]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterChip,
                filter === key && { backgroundColor: val.bg, borderColor: val.color },
              ]}
              onPress={() => setFilter(filter === key ? null : key)}
            >
              <View style={[styles.filterDot, { backgroundColor: val.color }]} />
              <Text
                style={[
                  styles.filterChipText,
                  filter === key && { color: val.color, fontWeight: '600' },
                ]}
              >
                {val.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.filterChip, showMineOnly && styles.filterChipActive]}
            onPress={() => setShowMineOnly((prev) => !prev)}
          >
            <Text style={[styles.filterChipText, showMineOnly && styles.filterChipTextActive]}>
              Míos
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          style={styles.misAsistenciasLink}
          onPress={() => navigation.navigate('MisAsistencias')}
        >
          <Ionicons name="checkmark-done-outline" size={14} color={colors.blue} />
          <Text style={styles.misAsistenciasLinkText}>Voy a asistir</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newBtn} onPress={() => setNewModal(true)}>
          <Ionicons name="add-circle-outline" size={20} color={colors.blue} />
          <Text style={styles.newBtnText}>Crear evento</Text>
        </TouchableOpacity>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={colors.text3} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin eventos</Text>
            <Text style={styles.emptyDesc}>
              {search || filter ? 'No hay resultados.' : 'No hay eventos registrados.'}
            </Text>
          </View>
        ) : (
          filtered.map(renderCard)
        )}
      </ScrollView>

      <Modal
        visible={!!detailEvent}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDrawer}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(16 + insets.top, 44) }]}>
              <Text style={styles.modalTitle}>Detalle del evento</Text>
              <TouchableOpacity onPress={() => setDetailEvent(null)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>
            {detailEvent && (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.detailDateBlock}>
                  <Text style={styles.detailDateMonth}>
                    {formatDate(detailEvent.date).month}
                  </Text>
                  <Text style={styles.detailDateDay}>
                    {formatDate(detailEvent.date).day}
                  </Text>
                </View>
                <Text style={styles.detailName}>{detailEvent.name}</Text>
                <View style={[styles.detailBadge, { backgroundColor: STATUS_CFG[detailEvent.status].bg }]}>
                  <Text style={{ fontFamily: typography.display, fontSize: 12, fontWeight: '700', color: STATUS_CFG[detailEvent.status].color }}>
                    {STATUS_CFG[detailEvent.status].label}
                  </Text>
                </View>
                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Ionicons name="location-outline" size={14} color={colors.text3} />
                    <Text style={styles.detailLabel}>Ubicación</Text>
                    <Text style={styles.detailValue}>{detailEvent.location}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={14} color={colors.text3} />
                    <Text style={styles.detailLabel}>Horario</Text>
                    <Text style={styles.detailValue}>{detailEvent.time}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="people-outline" size={14} color={colors.text3} />
                    <Text style={styles.detailLabel}>Participantes</Text>
                    <Text style={styles.detailValue}>
                      {detailEvent.participants}/{detailEvent.maxParticipants}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="person-outline" size={14} color={colors.text3} />
                    <Text style={styles.detailLabel}>Organiza</Text>
                    <Text style={styles.detailValue}>{detailEvent.organizer}</Text>
                  </View>
                </View>
                {detailEvent.status === 'UPCOMING' && (
                  <TouchableOpacity
                    style={[
                      styles.asistenciaBtn,
                      misRegistros.has(detailEvent.id) && styles.asistenciaBtnActive,
                    ]}
                    onPress={handleToggleAsistencia}
                  >
                    <Ionicons
                      name={misRegistros.has(detailEvent.id) ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={18}
                      color={misRegistros.has(detailEvent.id) ? colors.red : '#fff'}
                    />
                    <Text
                      style={[
                        styles.asistenciaBtnText,
                        misRegistros.has(detailEvent.id) && styles.asistenciaBtnTextActive,
                      ]}
                    >
                      {misRegistros.has(detailEvent.id) ? 'Cancelar asistencia' : 'Asistiré'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.detailSection}>Descripción</Text>
                <Text style={styles.detailDesc}>{detailEvent.description}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={newModal}
        animationType="slide"
        transparent
        onRequestClose={() => setNewModal(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalDrawer}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(16 + insets.top, 44) }]}>
              <Text style={styles.modalTitle}>Organiza tu propio evento</Text>
              <TouchableOpacity
                onPress={() => setNewModal(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 20 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Título del evento *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Ej. Limpieza de Playa Rosarito"
                  placeholderTextColor={colors.text3}
                  value={eventForm.titulo}
                  onChangeText={(v) => setField('titulo', v)}
                  maxLength={200}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Tipo de evento *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {tiposEvento.map((tipo) => (
                    <TouchableOpacity
                      key={tipo.id}
                      style={[styles.chip, eventForm.tipoId === tipo.id && styles.chipActive]}
                      onPress={() => setField('tipoId', tipo.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.tipoId === tipo.id && styles.chipTextActive,
                        ]}
                      >
                        {tipo.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <DateField
                    label="Fecha"
                    required
                    mode="date"
                    value={eventForm.fecha}
                    onChange={(v) => setField('fecha', v)}
                    placeholder="Seleccionar"
                    style={styles.formInput}
                    labelStyle={styles.formLabel}
                    textStyle={styles.dateFieldText}
                  />
                </View>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Capacidad máxima *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="100"
                    placeholderTextColor={colors.text3}
                    value={eventForm.capacidadMaxima}
                    onChangeText={(v) => {
                      const digits = v.replace(/[^0-9]/g, '');
                      const clamped = digits && Number(digits) > 10000 ? '10000' : digits;
                      setField('capacidadMaxima', clamped);
                    }}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Modalidad *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {modalidades.map((mod) => (
                    <TouchableOpacity
                      key={mod.id}
                      style={[styles.chip, eventForm.modalidadId === mod.id && styles.chipActive]}
                      onPress={() => setField('modalidadId', mod.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          eventForm.modalidadId === mod.id && styles.chipTextActive,
                        ]}
                      >
                        {mod.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Ubicación / enlace virtual</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Playa Rosarito o enlace virtual (opcional)"
                  placeholderTextColor={colors.text3}
                  value={eventForm.ubicacion}
                  onChangeText={(v) => setField('ubicacion', v)}
                  maxLength={500}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Descripción del evento *</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea]}
                  placeholder="Describe tu evento, objetivos y lo que los participantes pueden esperar..."
                  placeholderTextColor={colors.text3}
                  value={eventForm.descripcion}
                  onChangeText={(v) => setField('descripcion', v)}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <DateField
                    label="Hora de inicio"
                    required
                    mode="time"
                    value={eventForm.horaInicio}
                    onChange={(v) => setField('horaInicio', v)}
                    placeholder="Seleccionar"
                    style={styles.formInput}
                    labelStyle={styles.formLabel}
                    textStyle={styles.dateFieldText}
                  />
                </View>
                <View style={[styles.formField, { flex: 1 }]}>
                  <DateField
                    label="Hora de fin"
                    required
                    mode="time"
                    value={eventForm.horaFin}
                    onChange={(v) => setField('horaFin', v)}
                    placeholder="Seleccionar"
                    style={styles.formInput}
                    labelStyle={styles.formLabel}
                    textStyle={styles.dateFieldText}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Costo de entrada *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="0.00 (Gratuito)"
                    placeholderTextColor={colors.text3}
                    value={eventForm.costo}
                    onChangeText={(v) => setField('costo', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Contacto</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="email@ejemplo.com"
                    placeholderTextColor={colors.text3}
                    value={eventForm.contacto}
                    onChangeText={(v) => setField('contacto', v)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    maxLength={150}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setField('terminos', !eventForm.terminos)}
                activeOpacity={0.8}
              >
                <View
                  style={[styles.checkbox, eventForm.terminos && styles.checkboxChecked]}
                >
                  {eventForm.terminos && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  Acepto los términos y condiciones y que mi evento sea revisado
                  antes de su publicación.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateEvent}
                disabled={saving}
              >
                <Ionicons name="calendar" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {saving ? 'Enviando…' : 'Enviar propuesta de evento'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {shareTarget && (
        <View style={styles.shareCardHidden} collapsable={false} ref={shareCardRef}>
          <ShareCard
            icon="calendar"
            title={shareTarget.name}
            badge={STATUS_CFG[shareTarget.status].label}
            badgeColor={STATUS_CFG[shareTarget.status].color}
            badgeBg={STATUS_CFG[shareTarget.status].bg}
            lines={[
              { icon: 'calendar-outline', text: `${shareTarget.date} · ${shareTarget.time}` },
              { icon: 'location-outline', text: shareTarget.location },
              { icon: 'person-outline', text: `Organiza ${shareTarget.organizer}` },
            ]}
          />
        </View>
      )}
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
    paddingBottom: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
    height: 44,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.r99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.blueLight,
    borderColor: colors.blue,
  },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterChipText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    fontWeight: typography.weight.medium,
  },
  filterChipTextActive: {
    color: colors.blue,
    fontWeight: typography.weight.semibold,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.blue,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  newBtnText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  misAsistenciasLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    marginBottom: 10,
  },
  misAsistenciasLinkText: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    marginBottom: 14,
    ...shadows.xs,
    overflow: 'hidden',
  },
  cardPast: {
    opacity: 0.7,
  },
  cardRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },
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
  cardContent: {
    flex: 1,
    gap: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.2,
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.r99,
  },
  statusText: {
    fontFamily: typography.display,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  cardMeta: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
  },
  actionLabel: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.24)',
    justifyContent: 'flex-end',
  },
  modalDrawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.r24,
    borderTopRightRadius: radii.r24,
    maxHeight: '85%',
    ...shadows.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  detailDateBlock: {
    width: 64,
    height: 72,
    backgroundColor: colors.oceanLight,
    borderRadius: radii.r14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailDateMonth: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.bold,
    color: colors.ocean,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailDateDay: {
    fontFamily: typography.display,
    fontSize: 26,
    fontWeight: typography.weight.extrabold,
    color: colors.oceanDark,
    lineHeight: 28,
  },
  detailName: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.r99,
    marginBottom: 16,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  detailItem: {
    width: '47%',
    backgroundColor: colors.bg,
    borderRadius: radii.r12,
    padding: 12,
    gap: 3,
  },
  detailLabel: {
    fontFamily: typography.display,
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  asistenciaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    backgroundColor: colors.blue,
    borderRadius: radii.r12,
    marginBottom: 16,
  },
  asistenciaBtnActive: {
    backgroundColor: colors.redBg,
  },
  asistenciaBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
  asistenciaBtnTextActive: {
    color: colors.red,
  },
  detailSection: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailDesc: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
  },
  shareCardHidden: {
    position: 'absolute',
    top: -9999,
    left: 0,
  },
  formField: {
    marginBottom: 14,
    gap: 6,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formLabel: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderMid,
    borderRadius: radii.r10,
    paddingHorizontal: 14,
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  formTextarea: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  dateFieldText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.r99,
    borderWidth: 1,
    borderColor: colors.borderMid,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.blueLight,
    borderColor: colors.blue,
  },
  chipText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text2,
  },
  chipTextActive: {
    color: colors.blue,
    fontWeight: typography.weight.semibold,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    lineHeight: 17,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    backgroundColor: colors.blue,
    borderRadius: radii.r12,
    marginBottom: 4,
  },
  submitBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
});
