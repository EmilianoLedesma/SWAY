import { useState, useEffect, useRef } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useGamification } from '../context/GamificationContext';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import DateField from '../components/DateField';
import useBreathe from '../hooks/useBreathe';
import { sightingsList } from '../data/sightings';
import { eventsList } from '../data/events';
import { speciesList } from '../data/species';
import {
  getProfile,
  logout,
  updatePerfil,
  changePassword,
  deletePerfil,
  getEstadisticas,
  getEstadisticasEspecies,
  getAvistamientosAll,
  getImpactoSostenible,
  downloadReportePDF,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  getEspecies,
  getEstadosConservacion,
  getHabitats,
} from '../api/client';
import { DonutChart, BarChart, HBar, StatCard, ImpactCard } from '../components/DashboardCharts';

const TABS = [
  { key: 'personal', label: 'Personal' },
  { key: 'profesional', label: 'Profesional' },
  { key: 'security', label: 'Seguridad' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'cuenta', label: 'Cuenta' },
  { key: 'activity', label: 'Actividad' },
];

const ESPECIALIDADES = [
  { key: 'biologia-marina', label: 'Biología Marina' },
  { key: 'oceanografia', label: 'Oceanografía' },
  { key: 'ictiologia', label: 'Ictiología' },
  { key: 'conservacion-marina', label: 'Conservación Marina' },
  { key: 'ecologia-marina', label: 'Ecología Marina' },
  { key: 'taxonomia', label: 'Taxonomía Marina' },
  { key: 'otra', label: 'Otra' },
];

const GRADOS_ACADEMICOS = [
  { key: 'licenciatura', label: 'Licenciatura' },
  { key: 'maestria', label: 'Maestría' },
  { key: 'doctorado', label: 'Doctorado' },
  { key: 'postdoctorado', label: 'Postdoctorado' },
];

const ESTADO_SOLICITUD_CFG = {
  aprobada: { label: 'Aprobada', color: colors.green, bg: colors.greenBg },
  pendiente: { label: 'Pendiente', color: colors.amber, bg: colors.amberBg },
  rechazada: { label: 'Rechazada', color: colors.red, bg: colors.redBg },
};

const pastEvents = eventsList.filter((e) => e.status === 'PAST');

const stats = [
  { label: 'Avistamientos', value: String(sightingsList.length), icon: 'binoculars-outline', color: colors.blue },
  { label: 'Especies', value: String(speciesList.length), icon: 'leaf-outline', color: colors.ocean },
  { label: 'Eventos', value: String(pastEvents.length), icon: 'calendar-outline', color: colors.amber },
];

const daysAgo = (date) =>
  Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86400000));

const relativeDate = (date) => {
  const d = daysAgo(date);
  if (d < 1) return 'hoy';
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const w = Math.round(d / 7);
  return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
};

const recentActivity = [
  ...sightingsList
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((s) => ({ text: `Avistamiento de ${s.species} en ${s.location}`, date: s.date })),
  ...pastEvents
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 1)
    .map((e) => ({ text: `Asistió a ${e.name}`, date: e.date })),
].sort((a, b) => b.date.localeCompare(a.date));

export default function ProfileScreen() {
  const { setIsLoggedIn } = useAuth();
  const {
    points,
    level,
    levelCeil,
    levelProgress,
    badges,
    streakCount,
    bestStreak,
  } = useGamification();
  const [activeTab, setActiveTab] = useState('personal');
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingProfesional, setEditingProfesional] = useState(false);
  const [reporteLoading, setReporteLoading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [reportesData, setReportesData] = useState(null);
  const [reportesLoading, setReportesLoading] = useState(false);
  const [reportesError, setReportesError] = useState(null);
  const [reportesSubTab, setReportesSubTab] = useState('personal');
  const [filtros, setFiltros] = useState({});
  const [estadosCatalog, setEstadosCatalog] = useState([]);
  const [habitatsCatalog, setHabitatsCatalog] = useState([]);
  const [especieSearch, setEspecieSearch] = useState('');
  const [especiesCatalog, setEspeciesCatalog] = useState([]);

  const streakPulse = useBreathe();
  const [trackWidth, setTrackWidth] = useState(0);
  const fillScale = useRef(new Animated.Value(0)).current;
  const badgeScales = useRef({}).current;
  const prevUnlocked = useRef({});

  const badgeScale = (label) => {
    if (!badgeScales[label]) badgeScales[label] = new Animated.Value(1);
    return badgeScales[label];
  };

  useEffect(() => {
    Animated.timing(fillScale, {
      toValue: levelProgress / 100,
      duration: 480,
      useNativeDriver: true,
    }).start();
  }, [levelProgress]);

  useEffect(() => {
    badges.forEach((b) => {
      if (b.unlocked && prevUnlocked.current[b.label] === false) {
        const scale = badgeScale(b.label);
        scale.setValue(0.5);
        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 190,
          mass: 1,
          useNativeDriver: true,
        }).start();
      }
      prevUnlocked.current[b.label] = b.unlocked;
    });
  }, [badges]);

  useEffect(() => {
    let active = true;
    isBiometricLoginEnabled()
      .then((v) => {
        if (active) setBiometricEnabled(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleToggleBiometric = async (value) => {
    try {
      if (value) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hasHardware || !isEnrolled) {
          Alert.alert(
            'Biometría no disponible',
            'Este dispositivo no tiene huella o Face ID configurado.',
          );
          return;
        }
      }
      await setBiometricLoginEnabled(value);
      setBiometricEnabled(value);
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar la preferencia de biometría.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'reportes') return;
    let active = true;
    setReportesLoading(true);
    setReportesError(null);
    Promise.all([
      getEstadisticasEspecies(filtros),
      getEstadisticas(),
      getAvistamientosAll(filtros),
      getImpactoSostenible(),
    ])
      .then(([espRes, genRes, avRes, impRes]) => {
        if (!active) return;
        setReportesData({
          esStats: espRes?.estadisticas || null,
          genStats: genRes?.success ? genRes : null,
          avist: avRes?.avistamientos || [],
          impacto: impRes?.impacto || null,
        });
      })
      .catch((e) => active && setReportesError(e.message))
      .finally(() => active && setReportesLoading(false));
    return () => {
      active = false;
    };
  }, [activeTab, filtros]);

  useEffect(() => {
    getEstadosConservacion().then((r) => setEstadosCatalog(r?.estados || []));
    getHabitats().then((r) => setHabitatsCatalog(r?.habitats || []));
    getEspecies().then((r) => setEspeciesCatalog(r?.especies || []));
  }, []);

  useEffect(() => {
    if (reportesSubTab !== 'global') return;
    const handle = setTimeout(() => {
      const match = especieSearch.trim()
        ? especiesCatalog.find((e) =>
            e.nombre_comun?.toLowerCase().includes(especieSearch.trim().toLowerCase())
          )
        : null;
      setFiltros((f) => ({ ...f, especieId: match?.id }));
    }, 400);
    return () => clearTimeout(handle);
  }, [especieSearch, especiesCatalog, reportesSubTab]);

  const [personal, setPersonal] = useState({
    nombre: 'Joaquín',
    apellidoPaterno: 'Moreno',
    apellidoMaterno: 'Nieves',
    telefono: '4421234567',
    fechaNacimiento: '1998-05-12',
    email: 'joaquin.moreno@ejemplo.com',
  });

  const [profesional, setProfesional] = useState({
    especialidad: 'conservacion-marina',
    gradoAcademico: 'maestria',
    institucion: 'UPQ',
    aniosExperiencia: '5',
    numeroCedula: '12345678',
    orcid: '0000-0002-1234-5678',
    motivacion: 'Colaborador científico apasionado por la conservación marina y la documentación de biodiversidad costera.',
  });
  const [estadoSolicitud, setEstadoSolicitud] = useState('aprobada');

  useEffect(() => {
    let active = true;
    getProfile().then((data) => {
      if (!active || !data?.colaborador) return;
      const c = data.colaborador;
      setPersonal({
        nombre: c.nombre,
        apellidoPaterno: c.apellido_paterno,
        apellidoMaterno: c.apellido_materno,
        telefono: c.telefono,
        fechaNacimiento: c.fecha_nacimiento,
        email: c.email,
      });
      setProfesional({
        especialidad: c.especialidad,
        gradoAcademico: c.grado_academico,
        institucion: c.institucion,
        aniosExperiencia: c.años_experiencia,
        numeroCedula: c.numero_cedula,
        orcid: c.orcid || '',
        motivacion: c.motivacion,
      });
      setEstadoSolicitud(c.estado_solicitud);
      setProfileLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const [pwForm, setPwForm] = useState({ actual: '', nueva: '', confirmar: '' });

  const [notifPrefs, setNotifPrefs] = useState({
    sighting: true,
    event: true,
    badge: true,
    system: true,
  });

  const NOTIF_PREFS = [
    { key: 'sighting', label: 'Avistamientos', desc: 'Cuando un avistamiento sea verificado o requiera cambios' },
    { key: 'event', label: 'Eventos', desc: 'Recordatorios de eventos próximos y cambios de última hora' },
    { key: 'badge', label: 'Logros', desc: 'Al desbloquear nuevas insignias y metas cumplidas' },
    { key: 'system', label: 'Sistema', desc: 'Actualizaciones de la plataforma y mensajes del equipo' },
  ];

  const handleSavePersonal = async () => {
    setSaving(true);
    const result = await updatePerfil({
      nombre: personal.nombre || '',
      apellido_paterno: personal.apellidoPaterno || '',
      apellido_materno: personal.apellidoMaterno || '',
      telefono: personal.telefono || '',
      fecha_nacimiento: personal.fechaNacimiento || '',
    });
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo actualizar el perfil.');
      if (result.sessionExpired) setIsLoggedIn(false);
      return;
    }
    setEditingPersonal(false);
  };

  const handleSaveProfesional = async () => {
    setSaving(true);
    const result = await updatePerfil({
      especialidad: profesional.especialidad || '',
      grado_academico: profesional.gradoAcademico || '',
      institucion: profesional.institucion || '',
      años_experiencia: profesional.aniosExperiencia || '',
      numero_cedula: profesional.numeroCedula || '',
      orcid: profesional.orcid || '',
      motivacion: profesional.motivacion || '',
    });
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo actualizar el perfil.');
      if (result.sessionExpired) setIsLoggedIn(false);
      return;
    }
    setEditingProfesional(false);
  };

  const handleChangePassword = async () => {
    if (!pwForm.actual || !pwForm.nueva) {
      Alert.alert('Datos incompletos', 'Completa todos los campos.');
      return;
    }
    if (pwForm.nueva !== pwForm.confirmar) {
      Alert.alert('Error', 'Las contraseñas nuevas no coinciden.');
      return;
    }
    if (pwForm.nueva.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setSaving(true);
    const result = await changePassword({
      password_actual: pwForm.actual,
      password_nuevo: pwForm.nueva,
    });
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo actualizar la contraseña.');
      if (result.sessionExpired) setIsLoggedIn(false);
      return;
    }
    setPwForm({ actual: '', nueva: '', confirmar: '' });
    Alert.alert('Contraseña actualizada', 'Vuelve a iniciar sesión.');
  };

  const handleDownloadReporte = async () => {
    setReporteLoading(true);
    const result = await downloadReportePDF(filtros);
    setReporteLoading(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo generar el reporte.');
      return;
    }
    Alert.alert('Reporte generado', 'El reporte PDF se descargó correctamente.');
  };

  const handleDeactivate = async () => {
    setSaving(true);
    const result = await deletePerfil();
    setSaving(false);
    if (!result.success) {
      Alert.alert('Error', result.message || 'No se pudo desactivar la cuenta.');
      setConfirmDeactivate(false);
      if (result.sessionExpired) setIsLoggedIn(false);
      return;
    }
    setConfirmDeactivate(false);
    await logout();
    Alert.alert('Cuenta desactivada', 'Tu cuenta de colaborador fue desactivada.');
    setIsLoggedIn(false);
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que deseas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await logout();
          setIsLoggedIn(false);
        },
      },
    ]);
  };

  const fullName = `${personal.nombre} ${personal.apellidoPaterno}`;
  const estadoCfg = ESTADO_SOLICITUD_CFG[estadoSolicitud];

  const esStats = reportesData?.esStats;
  const genStats = reportesData?.genStats;
  const avistScoped = reportesSubTab === 'personal'
    ? (reportesData?.avist || []).filter((a) => a.email_usuario === personal.email)
    : (reportesData?.avist || []);
  const impacto = reportesData?.impacto;
  const totalEsp = esStats?.total_especies ?? genStats?.especies_catalogadas ?? 0;
  const critCount = esStats?.en_peligro_critico ?? 0;
  const pelCount = esStats?.en_peligro ?? 0;
  const vulCount = esStats?.vulnerables ?? 0;
  const otherCount = Math.max(totalEsp - critCount - pelCount - vulCount, 0);
  const habitats = esStats?.habitats_representados ?? 0;
  const calidad = genStats?.calidad_agua ?? 0;
  const totalAvist = avistScoped.length;

  const especieCount = {};
  avistScoped.forEach((a) => {
    const k = a.especie_nombre || 'Sin nombre';
    especieCount[k] = (especieCount[k] || 0) + 1;
  });
  const topEspecies = Object.entries(especieCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value], i) => ({
      label,
      value,
      color: ['#0071e3', '#34c759', '#ff9500', '#ff3b30', '#5ac8fa', '#af52de'][i],
    }));

  const donutSegments = [
    { label: 'Extinción crítica', value: critCount, color: colors.red },
    { label: 'En Peligro', value: pelCount, color: colors.amber },
    { label: 'Vulnerables', value: vulCount, color: '#f59e0b' },
    { label: 'Otras', value: otherCount, color: colors.green },
  ];

  const barConservacion = [
    { label: 'Total', value: totalEsp, color: colors.blue },
    { label: 'Críticas', value: critCount, color: colors.red },
    { label: 'En Peligro', value: pelCount, color: colors.amber },
    { label: 'Vulnerables', value: vulCount, color: '#f59e0b' },
    { label: 'Otras', value: otherCount, color: colors.green },
  ];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="Perfil" subtitle="Colaborador científico" hideLogo />

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color="#fff" />
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          <Text style={styles.profileEmail}>{personal.email}</Text>
          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                  <Ionicons name={s.icon} size={18} color={s.color} />
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
        >
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text
                style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {activeTab === 'personal' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Información Personal</Text>
              {!editingPersonal ? (
                <TouchableOpacity onPress={() => setEditingPersonal(true)}>
                  <Text style={styles.editLink}>Editar</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {editingPersonal ? (
              <>
                {[
                  { key: 'nombre', label: 'Nombre', maxLength: 100 },
                  { key: 'apellidoPaterno', label: 'Apellido paterno', maxLength: 100 },
                  { key: 'apellidoMaterno', label: 'Apellido materno', maxLength: 100 },
                  { key: 'telefono', label: 'Teléfono', maxLength: 15 },
                ].map((field) => (
                  <View key={field.key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={personal[field.key]}
                      onChangeText={(v) =>
                        setPersonal({ ...personal, [field.key]: v })
                      }
                      placeholderTextColor={colors.text3}
                      maxLength={field.maxLength}
                    />
                  </View>
                ))}
                <View style={styles.field}>
                  <DateField
                    label="Fecha de nacimiento"
                    mode="date"
                    value={personal.fechaNacimiento}
                    onChange={(v) => setPersonal({ ...personal, fechaNacimiento: v })}
                    placeholder="Seleccionar"
                    style={styles.fieldInput}
                    labelStyle={styles.fieldLabel}
                    textStyle={styles.dateFieldText}
                  />
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setEditingPersonal(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSavePersonal}
                    disabled={saving || !profileLoaded}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {[
                  { label: 'Nombre', value: personal.nombre },
                  { label: 'Apellido Paterno', value: personal.apellidoPaterno },
                  { label: 'Apellido Materno', value: personal.apellidoMaterno },
                  { label: 'Teléfono', value: personal.telefono },
                  { label: 'Fecha de Nacimiento', value: personal.fechaNacimiento },
                  { label: 'Correo Electrónico', value: personal.email },
                ].map((item) => (
                  <View key={item.label} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{item.label}</Text>
                    <Text style={styles.infoValue}>{item.value}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.notifSectionTitle}>Preferencias de notificaciones</Text>
            {NOTIF_PREFS.map((p) => (
              <View key={p.key} style={styles.notifPrefRow}>
                <View style={styles.notifPrefInfo}>
                  <Text style={styles.notifPrefLabel}>{p.label}</Text>
                  <Text style={styles.notifPrefDesc}>{p.desc}</Text>
                </View>
                <Switch
                  value={notifPrefs[p.key]}
                  onValueChange={(v) =>
                    setNotifPrefs((prev) => ({ ...prev, [p.key]: v }))
                  }
                  trackColor={{ false: colors.borderMid, true: colors.blueLight }}
                  thumbColor={notifPrefs[p.key] ? colors.blue : colors.text3}
                />
              </View>
            ))}
          </View>
        )}

        {activeTab === 'reportes' && (
          <View style={{ gap: 14 }}>
            <View style={styles.reportesSubTabRow}>
              {['personal', 'global'].map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.reportesSubTab, reportesSubTab === key && styles.reportesSubTabActive]}
                  onPress={() => {
                    setReportesSubTab(key);
                    setFiltros(key === 'personal' ? { desde: filtros.desde, hasta: filtros.hasta, quickPick: filtros.quickPick } : {});
                  }}
                >
                  <Text style={[styles.reportesSubTabText, reportesSubTab === key && styles.reportesSubTabTextActive]}>
                    {key === 'personal' ? 'Personal' : 'Global'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {reportesSubTab === 'personal' && (
              <View style={styles.reportesSubTabRow}>
                {[
                  { label: '7 días', days: 7 },
                  { label: '30 días', days: 30 },
                  { label: 'Todo', days: null },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.reportesSubTab, filtros.quickPick === opt.label && styles.reportesSubTabActive]}
                    onPress={() => {
                      if (opt.days == null) {
                        setFiltros({ quickPick: 'Todo' });
                      } else {
                        const hasta = new Date().toISOString().slice(0, 10);
                        const desde = new Date(Date.now() - opt.days * 86400000).toISOString().slice(0, 10);
                        setFiltros({ desde, hasta, quickPick: opt.label });
                      }
                    }}
                  >
                    <Text style={[styles.reportesSubTabText, filtros.quickPick === opt.label && styles.reportesSubTabTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {reportesSubTab === 'global' && (
              <>
                <View style={styles.filterChipRow}>
                  {estadosCatalog.map((e) => (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.filterChip, filtros.estado === e.nombre && styles.reportesSubTabActive]}
                      onPress={() =>
                        setFiltros((f) => ({ ...f, estado: f.estado === e.nombre ? undefined : e.nombre }))
                      }
                    >
                      <Text style={[styles.reportesSubTabText, filtros.estado === e.nombre && styles.reportesSubTabTextActive]}>
                        {e.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.filterChipRow}>
                  {habitatsCatalog.map((h) => (
                    <TouchableOpacity
                      key={h.id}
                      style={[styles.filterChip, filtros.habitat === h.nombre && styles.reportesSubTabActive]}
                      onPress={() =>
                        setFiltros((f) => ({ ...f, habitat: f.habitat === h.nombre ? undefined : h.nombre }))
                      }
                    >
                      <Text style={[styles.reportesSubTabText, filtros.habitat === h.nombre && styles.reportesSubTabTextActive]}>
                        {h.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Buscar especie..."
                  placeholderTextColor={colors.text3}
                  value={especieSearch}
                  onChangeText={setEspecieSearch}
                />
              </>
            )}
            {reportesLoading && !reportesData ? (
              <View style={[styles.section, { alignItems: 'center', paddingVertical: 32 }]}>
                <ActivityIndicator color={colors.blue} />
                <Text style={[styles.reportsDesc, { marginTop: 10, marginBottom: 0 }]}>
                  Cargando estadísticas…
                </Text>
              </View>
            ) : reportesError ? (
              <View style={styles.section}>
                <Text style={styles.reportsDesc}>
                  Error al cargar estadísticas: {reportesError}
                </Text>
              </View>
            ) : (
              <>
                {reportesSubTab === 'global' && (
                  <View style={styles.statsGridWrap}>
                    <StatCard label="Especies catalogadas" value={totalEsp} color={colors.blue}
                      icon={<Ionicons name="leaf-outline" size={18} color={colors.blue} />} />
                    <StatCard label="Extinción crítica" value={critCount} color={colors.red}
                      icon={<Ionicons name="warning-outline" size={18} color={colors.red} />} />
                    <StatCard label="En peligro" value={pelCount} color={colors.amber}
                      icon={<Ionicons name="alert-circle-outline" size={18} color={colors.amber} />} />
                    <StatCard label="Vulnerables" value={vulCount} color="#f59e0b"
                      icon={<Ionicons name="shield-outline" size={18} color="#f59e0b" />} />
                    <StatCard label="Avistamientos" value={totalAvist} color="#8b5cf6"
                      icon={<Ionicons name="binoculars-outline" size={18} color="#8b5cf6" />} />
                    <StatCard label="Hábitats representados" value={habitats} color={colors.green}
                      icon={<Ionicons name="water-outline" size={18} color={colors.green} />} />
                    <StatCard label="Calidad del agua" value={`${calidad}%`} color={colors.ocean}
                      icon={<Ionicons name="pulse-outline" size={18} color={colors.ocean} />} />
                  </View>
                )}
                {reportesSubTab === 'personal' && (
                  <View style={styles.statsGridWrap}>
                    <StatCard label="Avistamientos" value={totalAvist} color="#8b5cf6"
                      icon={<Ionicons name="binoculars-outline" size={18} color="#8b5cf6" />} />
                  </View>
                )}

                {reportesSubTab === 'global' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Estado de Conservación</Text>
                    <View style={styles.donutWrap}>
                      <DonutChart segments={donutSegments} size={170} thickness={30} />
                      <View style={{ gap: 6, flex: 1 }}>
                        {donutSegments.map((s) => (
                          <View key={s.label} style={styles.legendRow}>
                            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                            <Text style={styles.legendLabel} numberOfLines={1}>{s.label}</Text>
                            <Text style={styles.legendVal}>{s.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {reportesSubTab === 'global' && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Distribución por Estado</Text>
                    <BarChart bars={barConservacion} height={130} />
                  </View>
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Especies más avistadas</Text>
                  {topEspecies.length > 0 ? (
                    <HBar bars={topEspecies} />
                  ) : (
                    <Text style={styles.reportsDesc}>Sin avistamientos registrados</Text>
                  )}
                </View>

                {reportesSubTab === 'global' && impacto && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Impacto Sostenible</Text>
                    <View style={styles.statsGridWrap}>
                      <ImpactCard label="Agua limpiada" value={impacto.agua_limpiada} unit="litros" color={colors.blue}
                        icon={<Ionicons name="water-outline" size={20} color={colors.blue} />} />
                      <ImpactCard label="Corales plantados" value={impacto.corales_plantados} unit="unidades" color="#f59e0b"
                        icon={<Ionicons name="flower-outline" size={20} color="#f59e0b" />} />
                      <ImpactCard label="Familias beneficiadas" value={impacto.familias_beneficiadas} unit="familias" color={colors.green}
                        icon={<Ionicons name="people-outline" size={20} color={colors.green} />} />
                      <ImpactCard label="Plástico reciclado" value={impacto.plastico_reciclado} unit="kg" color={colors.orange}
                        icon={<Ionicons name="refresh-outline" size={20} color={colors.orange} />} />
                    </View>
                  </View>
                )}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Reporte PDF</Text>
                  <Text style={styles.reportsDesc}>
                    Genera un reporte en PDF con el catálogo de especies y estadísticas de conservación.
                  </Text>
                  <TouchableOpacity
                    style={styles.reportBtn}
                    onPress={handleDownloadReporte}
                    disabled={reporteLoading}
                  >
                    {reporteLoading ? (
                      <ActivityIndicator color={colors.blue} size="small" />
                    ) : (
                      <Ionicons name="document-text-outline" size={18} color={colors.blue} />
                    )}
                    <Text style={styles.reportBtnText}>
                      {reporteLoading ? 'Generando reporte...' : 'Descargar reporte PDF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'profesional' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Perfil Científico</Text>
              {!editingProfesional ? (
                <TouchableOpacity onPress={() => setEditingProfesional(true)}>
                  <Text style={styles.editLink}>Editar</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {editingProfesional ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Especialidad</Text>
                  <View style={styles.chipRow}>
                    {ESPECIALIDADES.map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.chip,
                          profesional.especialidad === opt.key && styles.chipActive,
                        ]}
                        onPress={() =>
                          setProfesional({ ...profesional, especialidad: opt.key })
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            profesional.especialidad === opt.key && styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Grado académico</Text>
                  <View style={styles.chipRow}>
                    {GRADOS_ACADEMICOS.map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.chip,
                          profesional.gradoAcademico === opt.key && styles.chipActive,
                        ]}
                        onPress={() =>
                          setProfesional({ ...profesional, gradoAcademico: opt.key })
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            profesional.gradoAcademico === opt.key && styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {[
                  { key: 'institucion', label: 'Institución', maxLength: 200 },
                  { key: 'aniosExperiencia', label: 'Años de experiencia', maxLength: 3 },
                  { key: 'numeroCedula', label: 'Cédula profesional', maxLength: 20 },
                  { key: 'orcid', label: 'ORCID', maxLength: 50 },
                ].map((field) => (
                  <View key={field.key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={profesional[field.key]}
                      onChangeText={(v) =>
                        setProfesional({ ...profesional, [field.key]: v })
                      }
                      placeholderTextColor={colors.text3}
                      maxLength={field.maxLength}
                    />
                  </View>
                ))}

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Motivación</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextarea]}
                    value={profesional.motivacion}
                    onChangeText={(v) =>
                      setProfesional({ ...profesional, motivacion: v })
                    }
                    multiline
                    numberOfLines={4}
                    placeholderTextColor={colors.text3}
                    maxLength={1000}
                  />
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setEditingProfesional(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveProfesional}
                    disabled={saving || !profileLoaded}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {[
                  { label: 'Especialidad', value: ESPECIALIDADES.find(e => e.key === profesional.especialidad)?.label },
                  { label: 'Grado Académico', value: GRADOS_ACADEMICOS.find(g => g.key === profesional.gradoAcademico)?.label },
                  { label: 'Institución', value: profesional.institucion },
                  { label: 'Años de Experiencia', value: profesional.aniosExperiencia },
                  { label: 'Cédula Profesional', value: profesional.numeroCedula },
                  { label: 'ORCID', value: profesional.orcid },
                ].map((item) => (
                  <View key={item.label} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{item.label}</Text>
                    <Text style={styles.infoValue}>{item.value}</Text>
                  </View>
                ))}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Motivación</Text>
                  <Text style={styles.infoValue}>{profesional.motivacion}</Text>
                </View>
              </>
            )}

            <Text style={styles.notifSectionTitle}>Estado de solicitud</Text>
            <View style={[styles.estadoBadge, { backgroundColor: estadoCfg.bg }]}>
              <Text style={[styles.estadoBadgeText, { color: estadoCfg.color }]}>
                {estadoCfg.label}
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'security' && (
          <View style={styles.section}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Contraseña actual</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="••••••••"
                placeholderTextColor={colors.text3}
                secureTextEntry
                value={pwForm.actual}
                onChangeText={(v) => setPwForm({ ...pwForm, actual: v })}
                maxLength={128}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nueva contraseña</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="••••••••"
                placeholderTextColor={colors.text3}
                secureTextEntry
                value={pwForm.nueva}
                onChangeText={(v) => setPwForm({ ...pwForm, nueva: v })}
                maxLength={128}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Confirmar contraseña</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="••••••••"
                placeholderTextColor={colors.text3}
                secureTextEntry
                value={pwForm.confirmar}
                onChangeText={(v) => setPwForm({ ...pwForm, confirmar: v })}
                maxLength={128}
              />
            </View>

            <View style={styles.notifPrefRow}>
              <View style={styles.notifPrefInfo}>
                <Text style={styles.notifPrefLabel}>Acceso biométrico</Text>
                <Text style={styles.notifPrefDesc}>
                  Usa tu huella o Face ID para reabrir tu sesión sin escribir tu contraseña.
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ false: colors.borderMid, true: colors.blueLight }}
                thumbColor={biometricEnabled ? colors.blue : colors.text3}
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Actualizar contraseña'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'cuenta' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gestión de Cuenta</Text>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={colors.red} />
              <Text style={styles.logoutBtnText}>Cerrar sesión</Text>
            </TouchableOpacity>

            <View style={styles.dangerZone}>
              <Text style={styles.dangerTitle}>Desactivar cuenta</Text>
              <Text style={styles.dangerDesc}>
                Tu cuenta y perfil de colaborador serán desactivados. No podrás
                iniciar sesión. Esta acción puede revertirse contactando al
                administrador.
              </Text>

              {!confirmDeactivate ? (
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={() => setConfirmDeactivate(true)}
                >
                  <Text style={styles.dangerBtnText}>Desactivar mi cuenta</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.dangerConfirmText}>
                    ¿Estás seguro? Esta acción desactivará tu acceso al portal.
                  </Text>
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setConfirmDeactivate(false)}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dangerBtn} onPress={handleDeactivate} disabled={saving}>
                      <Text style={styles.dangerBtnText}>{saving ? 'Guardando…' : 'Sí, desactivar'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.section}>
            <View style={styles.levelCard}>
              <View style={styles.levelHeader}>
                <Text style={styles.levelTitle}>Nivel {level}</Text>
                <Text style={styles.levelPoints}>{points} puntos</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${levelProgress}%` }]} />
              </View>
              <Text style={styles.levelHint}>
                {levelCeil
                  ? `${levelCeil - points} puntos para el nivel ${level + 1}`
                  : 'Nivel máximo alcanzado'}
              </Text>
            </View>

            <View style={styles.streakCard}>
              <Text style={styles.streakValue}>🔥 {streakCount}</Text>
              <Text style={styles.streakLabel}>
                racha actual · mejor racha: {bestStreak}
              </Text>
            </View>

            <Text style={styles.badgeSectionTitle}>Logros</Text>
            <View style={styles.badgesGrid}>
              {badges.map((b) => (
                <View
                  key={b.label}
                  style={[styles.badgeCard, !b.unlocked && styles.badgeLocked]}
                >
                  <Ionicons
                    name={b.icon}
                    size={22}
                    color={b.unlocked ? colors.blue : colors.text3}
                  />
                  <Text
                    style={[
                      styles.badgeLabel,
                      !b.unlocked && { color: colors.text3 },
                    ]}
                  >
                    {b.label}
                  </Text>
                  {!b.unlocked && (
                    <Text style={styles.badgeProgress}>
                      {b.current}/{b.goal}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            <Text style={[styles.badgeSectionTitle, { marginTop: 20 }]}>
              Actividad reciente
            </Text>
            {recentActivity.map((act) => (
              <View key={act.text} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>{act.text}</Text>
                  <Text style={styles.activityDate}>{relativeDate(act.date)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 40,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.r20,
    padding: 24,
    marginBottom: 20,
    ...shadows.xs,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.oceanDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text2,
    marginTop: 2,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.extrabold,
    color: colors.text,
  },
  statLabel: {
    fontFamily: typography.body,
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.blue,
  },
  tabText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.medium,
    color: colors.text2,
  },
  tabTextActive: {
    color: colors.blue,
    fontWeight: typography.weight.semibold,
  },
  reportesSubTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  reportesSubTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.borderMid,
    alignItems: 'center',
  },
  reportesSubTabActive: {
    backgroundColor: colors.blueLight,
    borderColor: colors.blue,
  },
  reportesSubTabText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
  },
  reportesSubTabTextActive: {
    color: colors.blue,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.borderMid,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    padding: 20,
    ...shadows.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: typography.display,
    fontSize: 15,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  editLink: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoValue: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  field: {
    marginBottom: 14,
    gap: 6,
  },
  fieldLabel: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
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
  fieldTextarea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  dateFieldText: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 0.4,
    height: 42,
    borderRadius: radii.r10,
    borderWidth: 1,
    borderColor: colors.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.medium,
    color: colors.text2,
  },
  saveBtn: {
    flex: 1,
    height: 42,
    borderRadius: radii.r10,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
  notifSectionTitle: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 12,
  },
  notifPrefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notifPrefInfo: {
    flex: 1,
    gap: 2,
  },
  notifPrefLabel: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  notifPrefDesc: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
    lineHeight: 15,
  },
  estadoBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radii.r99,
  },
  estadoBadgeText: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.bold,
    textTransform: 'capitalize',
  },
  reportsDesc: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text2,
    lineHeight: 19,
    marginBottom: 16,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.r12,
    backgroundColor: colors.blueLight,
  },
  reportBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  statsGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  donutWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
  },
  legendVal: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.r12,
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  logoutBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.red,
  },
  dangerZone: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  dangerTitle: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.red,
  },
  dangerDesc: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    lineHeight: 18,
  },
  dangerBtn: {
    flex: 1,
    height: 42,
    borderRadius: radii.r10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
  dangerConfirmText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
  },
  levelCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.r12,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelTitle: {
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  levelPoints: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.r99,
    backgroundColor: colors.blueLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: radii.r99,
    backgroundColor: colors.blue,
  },
  levelHint: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
  },
  streakCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.r12,
    padding: 14,
    marginBottom: 20,
    gap: 4,
  },
  streakValue: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: typography.weight.extrabold,
    color: colors.text,
  },
  streakLabel: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text2,
  },
  badgeProgress: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.text3,
  },
  badgeSectionTitle: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: 12,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: colors.bg,
    borderRadius: radii.r12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    flexDirection: 'row',
  },
  badgeLocked: {
    opacity: 0.5,
  },
  badgeLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    fontWeight: typography.weight.medium,
    color: colors.text,
    flex: 1,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ocean,
    marginTop: 5,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  activityDate: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
    marginTop: 2,
  },
});
