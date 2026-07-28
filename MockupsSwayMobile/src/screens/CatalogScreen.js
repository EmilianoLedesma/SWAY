import { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import {
  speciesList,
  conservationStatus,
} from '../data/species';
import {
  getEspecies,
  getEstadosConservacion,
  getAmenazas,
  getHabitats,
  createEspecie,
  updateEspecie,
  deleteEspecie,
} from '../api/client';
import { useGamification } from '../context/GamificationContext';

const ESTADO_SLUG_TO_STATUS = {
  'extincion-critica': 'CRITICAL',
  'peligro': 'ENDANGERED',
  'vulnerable': 'VULNERABLE',
  'casi-amenazada': 'NEAR_THREATENED',
  'preocupacion-menor': 'LEAST_CONCERN',
};

// Aproxima el catalogo real (8 estados) a los 5 badges locales de estilo,
// solo para especies creadas en la app (aun sin persistir en backend).
const ESTADO_NOMBRE_TO_STATUS = {
  'en peligro crítico': 'CRITICAL',
  extinto: 'CRITICAL',
  'extinto en estado silvestre': 'CRITICAL',
  'en peligro': 'ENDANGERED',
  vulnerable: 'VULNERABLE',
  'casi amenazada': 'NEAR_THREATENED',
  'preocupación menor': 'LEAST_CONCERN',
  'datos insuficientes': 'LEAST_CONCERN',
};

function mapEspecieFromApi(e) {
  return {
    id: String(e.id),
    commonName: e.nombre_comun,
    scientificName: e.nombre_cientifico,
    status: ESTADO_SLUG_TO_STATUS[e.estado_conservacion] || 'LEAST_CONCERN',
    description: e.descripcion,
    habitat: e.habitat,
    image: e.imagen_url || null,
    idEstadoConservacion: e.id_estado_conservacion ?? '',
    esperanzaVida: e.esperanza_vida ?? '',
    poblacionEstimada: e.poblacion_estimada ?? '',
    amenazaIds: e.amenaza_ids || [],
    habitatIds: e.habitat_ids || [],
    amenazasNames: e.amenazas || [],
    habitatsNames: e.habitats || [],
    imagenUrl: e.imagen_url || '',
  };
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 14;
const CARD_WIDTH = (SCREEN_WIDTH - 24 * 2 - CARD_GAP) / 2;

const statusKeys = Object.keys(conservationStatus);

const initialForm = {
  commonName: '',
  scientificName: '',
  description: '',
  idEstadoConservacion: '',
  esperanzaVida: '',
  poblacionEstimada: '',
  amenazaIds: [],
  habitatIds: [],
  imagenUrl: '',
};

export default function CatalogScreen() {
  const { incrementSpecies } = useGamification();
  const [species, setSpecies] = useState(speciesList);
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [selectedSpecies, setSelectedSpecies] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loadingApi, setLoadingApi] = useState(true);
  const [saving, setSaving] = useState(false);
  const [estadosCatalog, setEstadosCatalog] = useState([]);
  const [amenazasCatalog, setAmenazasCatalog] = useState([]);
  const [habitatsCatalog, setHabitatsCatalog] = useState([]);

  useEffect(() => {
    let active = true;
    getEspecies().then((data) => {
      if (!active) return;
      if (data?.especies?.length) {
        setSpecies(data.especies.map(mapEspecieFromApi));
      }
      setLoadingApi(false);
    });
    getEstadosConservacion().then((data) => {
      if (active && data?.estados) setEstadosCatalog(data.estados);
    });
    getAmenazas().then((data) => {
      if (active && data?.amenazas) setAmenazasCatalog(data.amenazas);
    });
    getHabitats().then((data) => {
      if (active && data?.habitats) setHabitatsCatalog(data.habitats);
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let result = species;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.commonName.toLowerCase().includes(q) ||
          s.scientificName.toLowerCase().includes(q),
      );
    }
    if (selectedFilter) {
      result = result.filter((s) => s.status === selectedFilter);
    }
    return result;
  }, [species, search, selectedFilter]);

  const openCreate = () => {
    setEditId(null);
    setForm(initialForm);
    setFormVisible(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setForm({
      commonName: item.commonName,
      scientificName: item.scientificName,
      description: item.description,
      idEstadoConservacion: item.idEstadoConservacion ?? '',
      esperanzaVida: item.esperanzaVida ?? '',
      poblacionEstimada: item.poblacionEstimada ?? '',
      amenazaIds: item.amenazaIds || [],
      habitatIds: item.habitatIds || [],
      imagenUrl: item.imagenUrl || '',
    });
    setSelectedSpecies(null);
    setFormVisible(true);
  };

  const handleSave = async () => {
    if (!form.commonName.trim() || !form.scientificName.trim()) {
      Alert.alert(
        'Datos incompletos',
        'El nombre común y el nombre científico son obligatorios.',
      );
      return;
    }
    if (form.commonName.trim().length < 2 || form.scientificName.trim().length < 2) {
      Alert.alert('Datos incompletos', 'Los nombres deben tener al menos 2 caracteres.');
      return;
    }
    if (!form.idEstadoConservacion) {
      Alert.alert('Datos incompletos', 'Selecciona un estado de conservación.');
      return;
    }
    const payload = {
      nombre_comun: form.commonName.trim(),
      nombre_cientifico: form.scientificName.trim(),
      descripcion: form.description || '',
      esperanza_vida: form.esperanzaVida !== '' ? Number(form.esperanzaVida) : null,
      poblacion_estimada: form.poblacionEstimada !== '' ? Number(form.poblacionEstimada) : null,
      id_estado_conservacion: Number(form.idEstadoConservacion),
      imagen_url: form.imagenUrl || '',
      amenazas: form.amenazaIds,
      habitats: form.habitatIds,
    };
    setSaving(true);
    const result = editId
      ? await updateEspecie(editId, payload)
      : await createEspecie(payload);
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo guardar la especie.');
      return;
    }
    const estadoNombre = estadosCatalog.find(
      (e) => e.id === form.idEstadoConservacion,
    )?.nombre;
    const status =
      ESTADO_NOMBRE_TO_STATUS[estadoNombre?.toLowerCase()] || 'LEAST_CONCERN';
    const habitat = habitatsCatalog
      .filter((h) => form.habitatIds.includes(h.id))
      .map((h) => h.nombre)
      .join(', ');
    const merged = {
      ...form,
      status,
      habitat,
      population: form.poblacionEstimada !== '' ? String(form.poblacionEstimada) : '—',
      image: form.imagenUrl || null,
    };
    if (editId) {
      setSpecies((prev) => prev.map((s) => (s.id === editId ? { ...s, ...merged } : s)));
    } else {
      const newId = result.especie_id != null ? String(result.especie_id) : String(Date.now());
      setSpecies((prev) => [{ ...merged, id: newId }, ...prev]);
      incrementSpecies();
    }
    setFormVisible(false);
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Eliminar especie',
      `¿Eliminar "${item.commonName}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteEspecie(item.id);
            if (!result.success) {
              Alert.alert('Error', result.message || 'No se pudo eliminar la especie.');
              return;
            }
            setSelectedSpecies(null);
            setSpecies((prev) => prev.filter((s) => s.id !== item.id));
          },
        },
      ],
    );
  };

  const renderCard = ({ item }) => {
    const status = conservationStatus[item.status];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setSelectedSpecies(item)}
      >
        <View style={styles.cardPhoto}>
          <View style={styles.cardPhotoInner}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={36} color={colors.text3} />
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <View style={[styles.badgeDot, { backgroundColor: status.color }]} />
            <Text style={[styles.badgeText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardCommon} numberOfLines={1}>
            {item.commonName}
          </Text>
          <Text style={styles.cardScientific} numberOfLines={1}>
            {item.scientificName}
          </Text>
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
          title="Catálogo"
          subtitle={`${species.length} especies marinas registradas`}
          hideLogo
        />

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={colors.text3} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre común o científico"
            placeholderTextColor={colors.text3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            numberOfLines={1}
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
            style={[
              styles.filterChip,
              !selectedFilter && styles.filterChipActive,
            ]}
            onPress={() => setSelectedFilter(null)}
          >
            <Text
              style={[
                styles.filterChipText,
                !selectedFilter && styles.filterChipTextActive,
              ]}
            >
              Todas
            </Text>
          </TouchableOpacity>
          {statusKeys.map((key) => {
            const s = conservationStatus[key];
            const isActive = selectedFilter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: s.bg, borderColor: s.color },
                ]}
                onPress={() =>
                  setSelectedFilter(isActive ? null : key)
                }
              >
                <View
                  style={[styles.filterDot, { backgroundColor: s.color }]}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && { color: s.color, fontWeight: '600' },
                  ]}
                >
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.newSpeciesBtn} onPress={openCreate}>
          <Ionicons name="add-circle-outline" size={20} color={colors.blue} />
          <Text style={styles.newSpeciesBtnText}>Nueva especie</Text>
        </TouchableOpacity>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={colors.text3} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.emptyDesc}>
              No encontramos especies con esos criterios. Intenta con otros
              filtros.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderCard}
            keyExtractor={(item) => item.id}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={styles.row}
          />
        )}
      </ScrollView>

      <Modal
        visible={!!selectedSpecies}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSpecies(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDrawer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Ficha de especie</Text>
              <TouchableOpacity
                onPress={() => setSelectedSpecies(null)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>

            {selectedSpecies && (
              <ScrollView
                style={styles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalPhoto}>
                  {selectedSpecies.image ? (
                    <Image source={{ uri: selectedSpecies.image }} style={styles.modalImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="image-outline" size={72} color={colors.text3} />
                  )}
                </View>

                <View style={styles.modalContent}>
                  <View style={styles.modalTitleRow}>
                    <Text style={styles.modalCommon}>
                      {selectedSpecies.commonName}
                    </Text>
                    <View
                      style={[
                        styles.modalBadge,
                        {
                          backgroundColor:
                            conservationStatus[selectedSpecies.status].bg,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.modalBadgeDot,
                          {
                            backgroundColor:
                              conservationStatus[selectedSpecies.status]
                                .color,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.modalBadgeText,
                          {
                            color:
                              conservationStatus[selectedSpecies.status]
                                .color,
                          },
                        ]}
                      >
                        {conservationStatus[selectedSpecies.status].label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.modalScientific}>
                    {selectedSpecies.scientificName}
                  </Text>

                  <View style={styles.modalDivider} />

                  <Text style={styles.modalSection}>Descripción</Text>
                  <Text style={styles.modalDesc}>
                    {selectedSpecies.description}
                  </Text>

                  <View style={styles.modalMetaGrid}>
                    <View style={styles.modalMetaItem}>
                      <Text style={styles.modalMetaLabel}>Población estimada</Text>
                      <Text style={styles.modalMetaValue}>
                        {selectedSpecies.poblacionEstimada || '—'}
                      </Text>
                    </View>
                    <View style={styles.modalMetaItem}>
                      <Text style={styles.modalMetaLabel}>Esperanza de vida</Text>
                      <Text style={styles.modalMetaValue}>
                        {selectedSpecies.esperanzaVida || '—'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.modalSection}>Hábitats</Text>
                  <Text style={styles.modalDesc}>
                    {(selectedSpecies.habitatsNames || []).length
                      ? selectedSpecies.habitatsNames.join(', ')
                      : selectedSpecies.habitat || '—'}
                  </Text>

                  <Text style={styles.modalSection}>Amenazas</Text>
                  <Text style={styles.modalDesc}>
                    {(selectedSpecies.amenazasNames || []).length
                      ? selectedSpecies.amenazasNames.join(', ')
                      : '—'}
                  </Text>

                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openEdit(selectedSpecies)}
                    >
                      <Ionicons name="pencil-outline" size={16} color={colors.blue} />
                      <Text style={[styles.actionText, { color: colors.blue }]}>
                        Editar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(selectedSpecies)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.red} />
                      <Text style={[styles.actionText, { color: colors.red }]}>
                        Eliminar
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalDrawer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {editId ? 'Editar especie' : 'Nueva especie'}
              </Text>
              <TouchableOpacity
                onPress={() => setFormVisible(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={18} color={colors.text3} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.formBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.field}>
                <Text style={styles.label}>Nombre común</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Tortuga Carey"
                  placeholderTextColor={colors.text3}
                  value={form.commonName}
                  onChangeText={(v) => setForm({ ...form, commonName: v })}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nombre científico</Text>
                <TextInput
                  style={[styles.input, styles.italicInput]}
                  placeholder="Ej. Eretmochelys imbricata"
                  placeholderTextColor={colors.text3}
                  value={form.scientificName}
                  onChangeText={(v) => setForm({ ...form, scientificName: v })}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Estado de conservación</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.statusRow}
                >
                  {estadosCatalog.map((e) => {
                    const active = form.idEstadoConservacion === e.id;
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[styles.statusChip, active && styles.statusChipSelected]}
                        onPress={() =>
                          setForm({ ...form, idEstadoConservacion: e.id })
                        }
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            active && { color: colors.blue },
                          ]}
                        >
                          {e.nombre}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Describe la especie..."
                  placeholderTextColor={colors.text3}
                  value={form.description}
                  onChangeText={(v) => setForm({ ...form, description: v })}
                  multiline
                  numberOfLines={4}
                />
              </View>
              <View style={styles.formRow}>
                <View style={[styles.field, styles.formRowItem]}>
                  <Text style={styles.label}>Esperanza de vida (años)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="80"
                    placeholderTextColor={colors.text3}
                    value={String(form.esperanzaVida)}
                    onChangeText={(v) =>
                      setForm({ ...form, esperanzaVida: v.replace(/[^0-9]/g, '') })
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.field, styles.formRowItem]}>
                  <Text style={styles.label}>Población estimada</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10000"
                    placeholderTextColor={colors.text3}
                    value={String(form.poblacionEstimada)}
                    onChangeText={(v) =>
                      setForm({ ...form, poblacionEstimada: v.replace(/[^0-9]/g, '') })
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              {amenazasCatalog.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.label}>Amenazas</Text>
                  <View style={styles.checkGroup}>
                    {amenazasCatalog.map((a) => {
                      const checked = form.amenazaIds.includes(a.id);
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={styles.checkItem}
                          onPress={() =>
                            setForm({
                              ...form,
                              amenazaIds: checked
                                ? form.amenazaIds.filter((id) => id !== a.id)
                                : [...form.amenazaIds, a.id],
                            })
                          }
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={checked ? colors.blue : colors.text3}
                          />
                          <Text style={styles.checkItemText}>{a.nombre}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {habitatsCatalog.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.label}>Hábitats</Text>
                  <View style={styles.checkGroup}>
                    {habitatsCatalog.map((h) => {
                      const checked = form.habitatIds.includes(h.id);
                      return (
                        <TouchableOpacity
                          key={h.id}
                          style={styles.checkItem}
                          onPress={() =>
                            setForm({
                              ...form,
                              habitatIds: checked
                                ? form.habitatIds.filter((id) => id !== h.id)
                                : [...form.habitatIds, h.id],
                            })
                          }
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={checked ? colors.blue : colors.text3}
                          />
                          <Text style={styles.checkItemText}>{h.nombre}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={styles.field}>
                <Text style={styles.label}>URL de fotografía</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://ejemplo.com/imagen.jpg"
                  placeholderTextColor={colors.text3}
                  value={form.imagenUrl}
                  onChangeText={(v) => setForm({ ...form, imagenUrl: v })}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {form.imagenUrl ? (
                  <Image
                    source={{ uri: form.imagenUrl }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setFormVisible(false)}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingHorizontal: 24,
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
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    height: 44,
    paddingVertical: 0,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.text3,
    paddingLeft: 8,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 20,
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
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
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
  row: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radii.r20,
    overflow: 'hidden',
    ...shadows.xs,
  },
  cardPhoto: {
    height: 120,
    backgroundColor: '#e3eeff',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPhotoInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  cardPhotoEmoji: {
    fontSize: 40,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.r99,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontFamily: typography.display,
    fontSize: 9,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.2,
  },
  cardBody: {
    padding: 12,
    gap: 2,
  },
  cardCommon: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardScientific: {
    fontFamily: typography.body,
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.text2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyEmoji: {
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
  },
  emptyDesc: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
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
  modalHeaderTitle: {
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
  modalCloseText: {
    fontSize: 14,
    color: colors.text3,
    fontWeight: typography.weight.semibold,
  },
  modalBody: {
    paddingBottom: 40,
  },
  modalPhoto: {
    height: 180,
    backgroundColor: '#dceeff',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    borderRadius: radii.r20,
    marginTop: 16,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },

  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCommon: {
    fontFamily: typography.display,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.4,
    flex: 1,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.r99,
  },
  modalBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modalBadgeText: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.bold,
  },
  modalScientific: {
    fontFamily: typography.body,
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.text2,
    marginTop: 4,
  },
  modalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  modalSection: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  modalDesc: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalMetaItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radii.r12,
    padding: 14,
  },
  modalMetaLabel: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  modalMetaValue: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  newSpeciesBtn: {
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
  newSpeciesBtnText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  detailActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  actionText: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
  },
  formBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  field: {
    gap: 6,
    marginBottom: 16,
  },
  label: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.borderMid,
    borderRadius: radii.r12,
    paddingHorizontal: 14,
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  italicInput: {
    fontStyle: 'italic',
  },
  textarea: {
    height: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  statusChip: {
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
  statusChipSelected: {
    backgroundColor: colors.blueLight,
    borderColor: colors.blue,
  },
  statusChipText: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
    fontWeight: typography.weight.medium,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formRowItem: {
    flex: 1,
  },
  checkGroup: {
    gap: 4,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  checkItemText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
  },
  imagePreview: {
    height: 100,
    borderRadius: radii.r12,
    marginTop: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 24,
  },
  cancelBtn: {
    flex: 0.4,
    height: 44,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.medium,
    color: colors.text2,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.r12,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
});
