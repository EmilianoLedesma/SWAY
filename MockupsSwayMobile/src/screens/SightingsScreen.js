import { useState, useMemo, useRef, useEffect } from 'react';
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
  Image,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess, hapticError, hapticWarning } from '../utils/haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import ShareCard from '../components/ShareCard';
import DateField from '../components/DateField';
import { sightingsList } from '../data/sightings';
import { speciesList } from '../data/species';
import { getAvistamientosAll, getAvistamientosMine, getProfile, crearAvistamiento, deleteAvistamiento, getEspecies } from '../api/client';
import { useGamification } from '../context/GamificationContext';

function mapEspecieFromApi(e) {
  return {
    id: e.id,
    commonName: e.nombre_comun,
  };
}

function mapAvistamientoFromApi(a) {
  return {
    id: String(a.id),
    species: a.especie_nombre,
    reporter: a.reportado_por || a.email_usuario,
    date: a.fecha ? a.fecha.slice(0, 10) : '',
    location: a.latitud != null && a.longitud != null ? `${a.latitud}, ${a.longitud}` : 'Sin coordenadas',
    status: 'PENDING',
    notes: a.notas || '',
    hasPhoto: false,
  };
}

const initialSightingForm = {
  especieId: null,
  especieNombre: '',
  fecha: '',
  latitud: '',
  longitud: '',
  notas: '',
  fotoUri: null,
};

export default function SightingsScreen() {
  const insets = useSafeAreaInsets();
  const { incrementSightings, bumpStreak } = useGamification();
  const [sightings, setSightings] = useState(sightingsList);
  const [search, setSearch] = useState('');
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [detailSighting, setDetailSighting] = useState(null);
  const [newModal, setNewModal] = useState(false);
  const [sightingForm, setSightingForm] = useState(initialSightingForm);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const shareCardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const [colaboradorProfile, setColaboradorProfile] = useState(null);
  const [species, setSpecies] = useState(speciesList);

  useEffect(() => {
    let active = true;
    getEspecies().then((data) => {
      if (!active) return;
      if (data?.success && Array.isArray(data.especies) && data.especies.length) {
        setSpecies(data.especies.map(mapEspecieFromApi));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchSightings = showMineOnly ? getAvistamientosMine : getAvistamientosAll;
    fetchSightings().then((data) => {
      if (!active) return;
      setSightings(data?.avistamientos ? data.avistamientos.map(mapAvistamientoFromApi) : []);
    });
    return () => {
      active = false;
    };
  }, [showMineOnly]);

  useEffect(() => {
    let active = true;
    getProfile().then((data) => {
      if (!active || !data?.colaborador) return;
      setColaboradorProfile(data.colaborador);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleShare = (item) => {
    setShareTarget(item);
    setTimeout(async () => {
      try {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir avistamiento' });
      } catch {
        Alert.alert('Error', 'No se pudo generar la tarjeta para compartir.');
      } finally {
        setShareTarget(null);
      }
    }, 150);
  };

  const setField = (key, value) =>
    setSightingForm((prev) => ({ ...prev, [key]: value }));

  const handleUseGps = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Activa el permiso de ubicación para usar esta función.');
      return;
    }
    setGpsLoading(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({});
      setSightingForm((prev) => ({
        ...prev,
        latitud: coords.latitude.toFixed(6),
        longitud: coords.longitude.toFixed(6),
      }));
    } catch {
      Alert.alert('Error', 'No se pudo obtener tu ubicación.');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleCapturePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Activa el permiso de cámara para usar esta función.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      setField('fotoUri', result.assets[0].uri);
    }
  };

  const handleReportSighting = async () => {
    if (saving) return;
    if (
      !sightingForm.especieId ||
      !sightingForm.especieNombre ||
      !sightingForm.fecha ||
      !sightingForm.latitud ||
      !sightingForm.longitud
    ) {
      Alert.alert('Datos incompletos', 'Completa todos los campos obligatorios.');
      return;
    }
    const lat = Number(sightingForm.latitud);
    const lon = Number(sightingForm.longitud);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      Alert.alert('Latitud inválida', 'La latitud debe ser un número entre -90 y 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      Alert.alert('Longitud inválida', 'La longitud debe ser un número entre -180 y 180.');
      return;
    }
    if (!colaboradorProfile?.email) {
      Alert.alert('Error', 'No se pudo obtener tu perfil. Intenta de nuevo.');
      return;
    }
    const nombreCompleto = [
      colaboradorProfile.nombre,
      colaboradorProfile.apellido_paterno,
      colaboradorProfile.apellido_materno,
    ].filter(Boolean).join(' ');
    setSaving(true);
    const result = await crearAvistamiento({
      id_especie: sightingForm.especieId,
      fecha_avistamiento: sightingForm.fecha,
      latitud: lat,
      longitud: lon,
      notas: sightingForm.notas,
      nombre_usuario: nombreCompleto,
      email_usuario: colaboradorProfile.email,
      nombre: colaboradorProfile.nombre,
      apellido_paterno: colaboradorProfile.apellido_paterno,
      apellido_materno: colaboradorProfile.apellido_materno,
    });
    setSaving(false);
    if (!result.success) {
      hapticError();
      Alert.alert('Error', result.message || 'No se pudo reportar el avistamiento.');
      return;
    }
    hapticSuccess();
    const refreshed = await (showMineOnly ? getAvistamientosMine() : getAvistamientosAll());
    if (refreshed?.avistamientos) {
      setSightings(refreshed.avistamientos.map(mapAvistamientoFromApi));
    }
    incrementSightings(false, !!sightingForm.fotoUri);
    bumpStreak();
    setSightingForm(initialSightingForm);
    setNewModal(false);
  };

  const filtered = useMemo(() => {
    let result = sightings;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.species.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q) ||
          s.reporter.toLowerCase().includes(q),
      );
    }
    return result;
  }, [sightings, search]);

  const handleDelete = (item) => {
    Alert.alert(
      'Eliminar avistamiento',
      `¿Eliminar el avistamiento de "${item.species}" del ${item.date}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            hapticWarning();
            const result = await deleteAvistamiento(item.id);
            if (!result.success) {
              hapticError();
              Alert.alert('Error', result.message || 'No se pudo eliminar el avistamiento.');
              return;
            }
            const refreshed = await (showMineOnly ? getAvistamientosMine() : getAvistamientosAll());
            if (refreshed?.avistamientos) {
              setSightings(refreshed.avistamientos.map(mapAvistamientoFromApi));
            }
          },
        },
      ],
    );
  };

  const renderTimelineItem = (item) => {
    const isPending = item.status === 'PENDING';

    return (
      <View key={item.id} style={styles.timelineItem}>
        <View style={[styles.timelineDot, { backgroundColor: colors.ocean }]} />
        <View
          style={[
            styles.timelineCard,
            isPending && { borderColor: colors.amber, borderWidth: 1.5 },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.cardIcon}>
                <Ionicons name="camera" size={16} color={colors.ocean} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardSpecies}>{item.species}</Text>
                {item.reporter ? (
                  <Text style={styles.cardReporter}>por {item.reporter}</Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.cardMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText}>{item.date}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.text3} />
              <Text style={styles.metaText} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
            {item.hasPhoto && (
              <View style={styles.metaRow}>
                <Ionicons name="image-outline" size={13} color={colors.blue} />
                <Text style={[styles.metaText, { color: colors.blue }]}>
                  Con foto
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setDetailSighting(item)}
            >
              <Ionicons name="eye-outline" size={15} color={colors.blue} />
              <Text style={[styles.actionLabel, { color: colors.blue }]}>
                Ver
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
              <Ionicons
                name="share-outline"
                size={15}
                color={colors.text2}
              />
              <Text style={[styles.actionLabel, { color: colors.text2 }]}>
                Compartir
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={15} color={colors.red} />
              <Text style={[styles.actionLabel, { color: colors.red }]}>
                Eliminar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
          title="Avistamientos"
          subtitle={`${sightings.length} registros • ${sightings.filter(s => s.status === 'VERIFIED').length} verificados`}
          hideLogo
        />

        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={16}
            color={colors.text3}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por especie, ubicación o reportero..."
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

        <TouchableOpacity
          style={[styles.chip, showMineOnly && styles.chipActive, styles.mineChip]}
          onPress={() => setShowMineOnly((prev) => !prev)}
        >
          <Text style={[styles.chipText, showMineOnly && styles.chipTextActive]}>
            Míos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setNewModal(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.blue} />
          <Text style={styles.newBtnText}>Nuevo avistamiento</Text>
        </TouchableOpacity>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="binoculars-outline"
              size={44}
              color={colors.text3}
              style={{ marginBottom: 8 }}
            />
            <Text style={styles.emptyTitle}>Sin avistamientos</Text>
            <Text style={styles.emptyDesc}>
              {search
                ? 'No hay resultados con esos criterios.'
                : 'Sé el primero en reportar un avistamiento.'}
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            <View style={styles.timelineLine} />
            {filtered.map(renderTimelineItem)}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!detailSighting}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailSighting(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDrawer}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(16 + insets.top, 44) }]}>
              <Text style={styles.modalTitle}>Detalle de avistamiento</Text>
              <TouchableOpacity
                onPress={() => setDetailSighting(null)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>
            {detailSighting && (
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.detailPhoto}>
                  <Ionicons name="camera" size={48} color={colors.oceanDark} />
                </View>
                <Text style={styles.detailSpecies}>
                  {detailSighting.species}
                </Text>
                <View style={styles.detailGrid}>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={colors.text3}
                    />
                    <Text style={styles.detailLabel}>Fecha</Text>
                    <Text style={styles.detailValue}>
                      {detailSighting.date}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={colors.text3}
                    />
                    <Text style={styles.detailLabel}>Ubicación</Text>
                    <Text style={styles.detailValue}>
                      {detailSighting.location}
                    </Text>
                  </View>
                  {detailSighting.reporter ? (
                    <View style={styles.detailItem}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={colors.text3}
                      />
                      <Text style={styles.detailLabel}>Reportó</Text>
                      <Text style={styles.detailValue}>
                        {detailSighting.reporter}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {detailSighting.notes ? (
                  <>
                    <Text style={styles.detailSection}>Notas</Text>
                    <Text style={styles.detailNotes}>
                      {detailSighting.notes}
                    </Text>
                  </>
                ) : null}
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
              <Text style={styles.modalTitle}>Reportar avistamiento</Text>
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
              <TouchableOpacity style={styles.newForm} onPress={handleCapturePhoto}>
                {sightingForm.fotoUri ? (
                  <Image
                    source={{ uri: sightingForm.fotoUri }}
                    style={styles.photoThumb}
                  />
                ) : (
                  <Ionicons name="camera-outline" size={22} color={colors.blue} />
                )}
                <Text style={styles.newFormText}>
                  {sightingForm.fotoUri ? 'Foto capturada' : 'Capturar foto de la especie'}
                </Text>
              </TouchableOpacity>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Especie observada *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {species.map((sp) => (
                    <TouchableOpacity
                      key={sp.id}
                      style={[
                        styles.chip,
                        sightingForm.especieId === sp.id && styles.chipActive,
                      ]}
                      onPress={() =>
                        setSightingForm((prev) => ({
                          ...prev,
                          especieId: sp.id,
                          especieNombre: sp.commonName,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          sightingForm.especieId === sp.id && styles.chipTextActive,
                        ]}
                      >
                        {sp.commonName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formField}>
                <DateField
                  label="Fecha del avistamiento"
                  required
                  mode="datetime"
                  value={sightingForm.fecha}
                  onChange={(v) => setField('fecha', v)}
                  placeholder="Seleccionar fecha y hora"
                  style={styles.formInput}
                  labelStyle={styles.formLabel}
                  textStyle={styles.dateFieldText}
                  maximumDate={new Date()}
                />
              </View>

              <TouchableOpacity
                style={styles.newForm}
                onPress={handleUseGps}
                disabled={gpsLoading}
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color={colors.blue} />
                ) : (
                  <Ionicons name="location-outline" size={22} color={colors.blue} />
                )}
                <Text style={styles.newFormText}>
                  {gpsLoading ? 'Obteniendo ubicación...' : 'Usar ubicación actual (GPS)'}
                </Text>
              </TouchableOpacity>

              <View style={styles.formRow}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Latitud *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="20.6296"
                    placeholderTextColor={colors.text3}
                    value={sightingForm.latitud}
                    onChangeText={(v) => setField('latitud', v)}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Longitud *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="-87.0739"
                    placeholderTextColor={colors.text3}
                    value={sightingForm.longitud}
                    onChangeText={(v) => setField('longitud', v)}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Notas del avistamiento</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea]}
                  placeholder="Comportamiento observado, condiciones del agua, número de individuos..."
                  placeholderTextColor={colors.text3}
                  value={sightingForm.notas}
                  onChangeText={(v) => setField('notas', v)}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleReportSighting}
                disabled={saving}
              >
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {saving ? 'Enviando…' : 'Reportar avistamiento'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {shareTarget && (
        <View style={styles.shareCardHidden} collapsable={false} ref={shareCardRef}>
          <ShareCard
            icon="camera"
            title={shareTarget.species}
            lines={[
              { icon: 'calendar-outline', text: shareTarget.date },
              { icon: 'location-outline', text: shareTarget.location },
              ...(shareTarget.reporter
                ? [{ icon: 'person-outline', text: `Reportado por ${shareTarget.reporter}` }]
                : []),
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
  scroll: {
    flex: 1,
  },
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
  timeline: {
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 10,
    top: 14,
    bottom: 14,
    width: 2,
    backgroundColor: colors.ocean,
    opacity: 0.25,
    borderRadius: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    minWidth: 10,
    borderRadius: 5,
    marginTop: 18,
    zIndex: 1,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    padding: 14,
    paddingBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.oceanLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardSpecies: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  cardReporter: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
    marginTop: 1,
  },
  cardMeta: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flex: 1,
    minWidth: 60,
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
  detailPhoto: {
    height: 140,
    backgroundColor: '#dceeff',
    borderRadius: radii.r16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailSpecies: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 8,
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
  detailSection: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailNotes: {
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
  newForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: radii.r10,
  },
  newFormText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
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
  mineChip: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    backgroundColor: colors.blue,
    borderRadius: radii.r12,
    marginTop: 4,
    marginBottom: 4,
  },
  submitBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
});
