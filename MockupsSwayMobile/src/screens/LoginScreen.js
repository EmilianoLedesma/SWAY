import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { login as apiLogin, getProfile, hasStoredToken, isBiometricLoginEnabled, logout, registerColaborador, checkEmail, checkOrcid, checkCedula } from '../api/client';
import { validateRegisterForm, formatOrcidInput } from '../utils/collaboratorValidation';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';

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

export default function LoginScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [apellidoPaterno, setApellidoPaterno] = useState('');
  const [apellidoMaterno, setApellidoMaterno] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [gradoAcademico, setGradoAcademico] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [aniosExperiencia, setAniosExperiencia] = useState('');
  const [numeroCedula, setNumeroCedula] = useState('');
  const [orcid, setOrcid] = useState('');
  const [motivacion, setMotivacion] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showBiometricUnlock, setShowBiometricUnlock] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tokenPresent, setTokenPresent] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [hasHardware, isEnrolled, biometricEnabled, hasToken] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          isBiometricLoginEnabled(),
          hasStoredToken(),
        ]);
        if (!active) return;
        setBiometricAvailable(hasHardware && isEnrolled);
        setTokenPresent(hasToken);
        setShowBiometricUnlock(hasHardware && isEnrolled && biometricEnabled && hasToken);
      } catch (error) {
        console.error('Error en verificación de sesión:', error);
      } finally {
        if (active) setCheckingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleBiometric = async () => {
    setError('');
    setLoading(true);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirma tu identidad para acceder a SWAY',
      cancelLabel: 'Cancelar',
    });
    if (!result.success) {
      setLoading(false);
      if (result.error && result.error !== 'user_cancel') {
        setError('No se pudo verificar tu identidad');
      }
      return;
    }
    const profile = await getProfile();
    setLoading(false);
    if (profile.success) {
      if (onLogin) onLogin();
      return;
    }
    if (profile.networkError) {
      setError('No se pudo conectar con el servidor');
      return;
    }
    await logout();
    setShowBiometricUnlock(false);
    setTokenPresent(false);
    setError('Tu sesión expiró, inicia sesión de nuevo.');
  };

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) {
      setError('Completa todos los campos');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Ingresa un correo electrónico válido');
      return;
    }
    if (!isLogin) {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        return;
      }
      const registerError = validateRegisterForm({
        nombre: name,
        apellidoPaterno,
        apellidoMaterno,
        especialidad,
        gradoAcademico,
        institucion,
        aniosExperiencia,
        numeroCedula,
        orcid,
        motivacion,
        termsAccepted,
      });
      if (registerError) {
        setError(registerError);
        return;
      }
    }

    setLoading(true);

    if (isLogin) {
      const result = await apiLogin(email, password);
      setLoading(false);
      if (result.success) {
        if (onLogin) onLogin();
      } else {
        setError(result.message);
      }
      return;
    }

    const trimmedOrcid = orcid.trim();
    const trimmedCedula = numeroCedula.trim();

    const [emailCheck, cedulaCheck, orcidCheck] = await Promise.all([
      checkEmail(email),
      checkCedula(trimmedCedula),
      trimmedOrcid ? checkOrcid(trimmedOrcid) : Promise.resolve({ exists: false, can_register: true }),
    ]);
    const duplicate = [emailCheck, cedulaCheck, orcidCheck].find(
      (check) => check.exists && !check.can_register
    );
    if (duplicate) {
      setError(duplicate.message || 'Ya existe una solicitud con estos datos');
      setLoading(false);
      return;
    }

    const registerResult = await registerColaborador({
      nombre: name,
      apellidoPaterno,
      apellidoMaterno,
      email,
      password,
      especialidad,
      grado_academico: gradoAcademico,
      institucion,
      años_experiencia: aniosExperiencia,
      numero_cedula: trimmedCedula,
      orcid: trimmedOrcid,
      motivacion,
    });

    if (!registerResult.success) {
      setError(registerResult.message || 'No se pudo completar el registro');
      setLoading(false);
      return;
    }

    const loginResult = await apiLogin(email, password);
    setLoading(false);
    if (loginResult.success) {
      if (onLogin) onLogin();
    } else {
      setError('Registro exitoso. Inicia sesión con la contraseña de tu cuenta existente.');
      setIsLogin(true);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.panel}>
          <View style={styles.centerBrand}>
            <Image
              source={require('../../assets/SwayLogo.jpeg')}
              style={styles.centerLogo}
              resizeMode="contain"
            />
            <Text style={styles.centerName}>SWAY</Text>
          </View>

          <View style={styles.formCard}>
            {checkingSession ? (
              <ActivityIndicator color={colors.blue} size="small" />
            ) : showBiometricUnlock ? (
              <>
                <Text style={styles.title}>Bienvenido de nuevo</Text>
                <Text style={styles.subtitle}>Usa tu huella o Face ID para continuar</Text>

                {error ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.biometricBtn}
                  onPress={handleBiometric}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.blue} size="small" />
                  ) : (
                    <>
                      <Ionicons name="finger-print-outline" size={18} color={colors.blue} />
                      <Text style={styles.biometricText}>Iniciar sesión con biometría</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchBtn}
                  onPress={() => {
                    setShowBiometricUnlock(false);
                    setError('');
                  }}
                >
                  <Text style={styles.switchText}>Usar contraseña</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
            <Text style={styles.title}>
              {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
            </Text>
            <Text style={styles.subtitle}>
              {isLogin
                ? 'Accede como colaborador científico'
                : 'Regístrate para colaborar'}
            </Text>

            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              {!isLogin && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Nombre</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Juan"
                      placeholderTextColor={colors.text3}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      maxLength={100}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Apellido paterno</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Pérez"
                      placeholderTextColor={colors.text3}
                      value={apellidoPaterno}
                      onChangeText={setApellidoPaterno}
                      autoCapitalize="words"
                      maxLength={100}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Apellido materno (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="García"
                      placeholderTextColor={colors.text3}
                      value={apellidoMaterno}
                      onChangeText={setApellidoMaterno}
                      autoCapitalize="words"
                      maxLength={100}
                    />
                  </View>
                </>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="colaborador@ejemplo.com"
                  placeholderTextColor={colors.text3}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={150}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Contraseña</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.text3}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  maxLength={128}
                />
              </View>

              {!isLogin && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Confirmar contraseña</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor={colors.text3}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      maxLength={128}
                    />
                  </View>

                  <Text style={styles.sectionTitle}>Acreditación académica</Text>

                  <View style={styles.field}>
                    <Text style={styles.label}>Especialidad</Text>
                    <View style={styles.chipRow}>
                      {ESPECIALIDADES.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.chip,
                            especialidad === opt.key && styles.chipActive,
                          ]}
                          onPress={() => setEspecialidad(opt.key)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              especialidad === opt.key && styles.chipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Grado académico</Text>
                    <View style={styles.chipRow}>
                      {GRADOS_ACADEMICOS.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.chip,
                            gradoAcademico === opt.key && styles.chipActive,
                          ]}
                          onPress={() => setGradoAcademico(opt.key)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              gradoAcademico === opt.key && styles.chipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Institución</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Universidad o centro de investigación"
                      placeholderTextColor={colors.text3}
                      value={institucion}
                      onChangeText={setInstitucion}
                      maxLength={200}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Años de experiencia</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0-100"
                      placeholderTextColor={colors.text3}
                      value={aniosExperiencia}
                      onChangeText={setAniosExperiencia}
                      keyboardType="number-pad"
                      maxLength={3}
                    />
                  </View>

                  <Text style={styles.sectionTitle}>Documentación</Text>

                  <View style={styles.field}>
                    <Text style={styles.label}>Número de cédula profesional</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Número de cédula"
                      placeholderTextColor={colors.text3}
                      value={numeroCedula}
                      onChangeText={setNumeroCedula}
                      maxLength={20}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>ORCID ID (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0000-0000-0000-0000"
                      placeholderTextColor={colors.text3}
                      value={orcid}
                      onChangeText={(text) => setOrcid(formatOrcidInput(text))}
                      maxLength={19}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Motivación para colaborar</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      placeholder="Describe tu motivación y experiencia relevante en especies marinas..."
                      placeholderTextColor={colors.text3}
                      value={motivacion}
                      onChangeText={(v) => setMotivacion(v.slice(0, 500))}
                      multiline
                      numberOfLines={4}
                    />
                    <Text style={styles.charCounter}>
                      {motivacion.length}/500 caracteres
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setTermsAccepted(!termsAccepted)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        termsAccepted && styles.checkboxChecked,
                      ]}
                    >
                      {termsAccepted && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      Acepto los términos y condiciones para colaboradores
                      científicos y confirmo que la información proporcionada
                      es veraz
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {isLogin && (
                <TouchableOpacity style={styles.forgotBtn}>
                  <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>
                    {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            {isLogin && biometricAvailable && tokenPresent && (
              <TouchableOpacity
                style={styles.biometricBtn}
                onPress={handleBiometric}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Ionicons name="finger-print-outline" size={18} color={colors.blue} />
                <Text style={styles.biometricText}>Iniciar sesión con biometría</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
            >
              <Text style={styles.switchText}>
                {isLogin
                  ? '¿No tienes cuenta? Regístrate'
                  : '¿Ya tienes cuenta? Inicia sesión'}
              </Text>
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollFlex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  formCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.r20,
    padding: 28,
    ...shadows.md,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 24,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text2,
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
    borderRadius: radii.r8,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.red,
    flex: 1,
  },
  form: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  label: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.borderMid,
    borderRadius: radii.r12,
    paddingHorizontal: 16,
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontFamily: typography.display,
    fontSize: 13,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
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
  textarea: {
    height: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  charCounter: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
    textAlign: 'right',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
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
  forgotBtn: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.blue,
    fontWeight: typography.weight.medium,
  },
  submitBtn: {
    height: 46,
    backgroundColor: colors.blue,
    borderRadius: radii.r12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...shadows.sm,
    shadowColor: colors.blue,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: typography.weight.semibold,
    color: '#fff',
    letterSpacing: -0.16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text3,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: radii.r12,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.blueLight,
    marginTop: 16,
  },
  biometricText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
  switchBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  switchText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.blue,
    fontWeight: typography.weight.medium,
  },
  centerBrand: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 6,
  },
  centerLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  centerName: {
    fontFamily: typography.display,
    fontSize: 26,
    fontWeight: typography.weight.extrabold,
    color: colors.oceanDark,
    letterSpacing: -1,
  },
});
