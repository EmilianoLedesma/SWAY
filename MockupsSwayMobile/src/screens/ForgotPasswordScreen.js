import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    if (!email) {
      Alert.alert('Datos incompletos', 'Ingresa tu correo electrónico.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      Alert.alert('Correo inválido', 'Ingresa un correo electrónico válido.');
      return;
    }
    Alert.alert(
      'Recuperación no disponible',
      'La recuperación automática de contraseña no está disponible todavía. Contacta a un administrador para restablecer tu contraseña.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
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
            <Text style={styles.title}>Recuperar contraseña</Text>
            <Text style={styles.subtitle}>
              La recuperación automática aún no está disponible. Ingresa tu correo y te indicaremos cómo continuar.
            </Text>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="tu@correo.com"
                  placeholderTextColor={colors.text3}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                <Text style={styles.submitText}>Continuar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.switchText}>Volver a iniciar sesión</Text>
            </TouchableOpacity>
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
    fontSize: 20,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.5,
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
  submitText: {
    fontFamily: typography.display,
    fontSize: 16,
    fontWeight: typography.weight.semibold,
    color: '#fff',
    letterSpacing: -0.16,
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
});
