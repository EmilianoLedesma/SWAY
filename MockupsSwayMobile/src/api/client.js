import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// hostUri = IP:puerto que Metro usa para servir el bundle a este dispositivo,
// se actualiza solo al cambiar de red (no hay backend con dominio fijo aun).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_HOST = `http://${devHost || 'localhost'}:8000`;

const TOKEN_KEY = 'sway_colab_token';

function buildQuery(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.desde) params.set('fecha_desde', filtros.desde);
  if (filtros.hasta) params.set('fecha_hasta', filtros.hasta);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.habitat) params.set('habitat', filtros.habitat);
  if (filtros.especieId) params.set('especie_id', String(filtros.especieId));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function authHeaders() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function buildErrorResult(res, data, fallback) {
  if (res.status === 401) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return { success: false, sessionExpired: true, message: 'Sesión expirada, inicia sesión de nuevo.' };
  }
  return { success: false, message: typeof data.detail === 'string' ? data.detail : fallback };
}

export async function login(email, password) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
      return { success: true };
    }
    return { success: false, message: data.detail || data.message || 'Credenciales inválidas' };
  } catch (error) {
    console.error('Error en login:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function registerColaborador(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al registrar colaborador');
    return data;
  } catch (error) {
    console.error('Error en registerColaborador:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function checkEmail(email) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkEmail:', error);
    return { exists: false, can_register: true };
  }
}

export async function checkOrcid(orcid) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-orcid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orcid }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkOrcid:', error);
    return { exists: false, can_register: true };
  }
}

export async function checkCedula(cedula) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/check-cedula`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cedula }),
    });
    return await res.json();
  } catch (error) {
    console.error('Error en checkCedula:', error);
    return { exists: false, can_register: true };
  }
}

export async function logout() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function hasStoredToken() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return !!token;
}

const BIOMETRIC_FLAG_KEY = 'sway_biometric_enabled';

export async function isBiometricLoginEnabled() {
  return (await AsyncStorage.getItem(BIOMETRIC_FLAG_KEY)) === 'true';
}

export async function setBiometricLoginEnabled(enabled) {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_FLAG_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(BIOMETRIC_FLAG_KEY);
  }
}

export async function createEspecie(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/especies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al crear especie');
    return data;
  } catch (error) {
    console.error('Error en createEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function updateEspecie(id, payload) {
  try {
    const res = await fetch(`${API_HOST}/api/especies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al actualizar especie');
    return data;
  } catch (error) {
    console.error('Error en updateEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function deleteEspecie(id) {
  try {
    const res = await fetch(`${API_HOST}/api/especies/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al eliminar especie');
    return data;
  } catch (error) {
    console.error('Error en deleteEspecie:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function updatePerfil(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al actualizar perfil');
    return data;
  } catch (error) {
    console.error('Error en updatePerfil:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function changePassword(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al cambiar contraseña');
    return data;
  } catch (error) {
    console.error('Error en changePassword:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function deletePerfil() {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/perfil`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al desactivar cuenta');
    return data;
  } catch (error) {
    console.error('Error en deletePerfil:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function getProfile() {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/profile`, { headers: await authHeaders() });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getProfile:', error);
    return { success: false, networkError: true, colaborador: null };
  }
}

export async function getAvistamientosMine() {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/avistamientos`, { headers: await authHeaders() });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getAvistamientosMine:', error);
    return { success: false, avistamientos: [] };
  }
}

export async function crearAvistamiento(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/reportar-avistamiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al reportar el avistamiento');
    return data;
  } catch (error) {
    console.error('Error en crearAvistamiento:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function getEventos() {
  try {
    const res = await fetch(`${API_HOST}/api/eventos`);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getEventos:', error);
    return { success: false, eventos: [] };
  }
}

export async function crearEvento(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/eventos/crear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al crear el evento');
    return data;
  } catch (error) {
    console.error('Error en crearEvento:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function getTiposEvento() {
  try {
    const res = await fetch(`${API_HOST}/api/tipos-evento`);
    return await res.json();
  } catch (error) {
    console.error('Error en getTiposEvento:', error);
    return { success: false, tipos: [] };
  }
}

export async function getModalidades() {
  try {
    const res = await fetch(`${API_HOST}/api/modalidades`);
    return await res.json();
  } catch (error) {
    console.error('Error en getModalidades:', error);
    return { success: false, modalidades: [] };
  }
}

export async function getEspecies() {
  try {
    const res = await fetch(`${API_HOST}/api/especies?limit=500`);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getEspecies:', error);
    return { success: false, especies: [], total: 0 };
  }
}

export async function getEstadosConservacion() {
  try {
    const res = await fetch(`${API_HOST}/api/estados-conservacion`);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getEstadosConservacion:', error);
    return { success: false, estados: [] };
  }
}

export async function getAmenazas() {
  try {
    const res = await fetch(`${API_HOST}/api/amenazas`);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getAmenazas:', error);
    return { success: false, amenazas: [] };
  }
}

export async function getHabitats() {
  try {
    const res = await fetch(`${API_HOST}/api/habitats`);
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error en getHabitats:', error);
    return { success: false, habitats: [] };
  }
}

export async function getEstadisticas() {
  try {
    const res = await fetch(`${API_HOST}/api/estadisticas`);
    return await res.json();
  } catch (error) {
    console.error('Error en getEstadisticas:', error);
    return { success: false };
  }
}

export async function getEstadisticasEspecies(filtros) {
  try {
    const query = buildQuery(filtros);
    const res = await fetch(`${API_HOST}/api/especies/estadisticas${query}`);
    return await res.json();
  } catch (error) {
    console.error('Error en getEstadisticasEspecies:', error);
    return { success: false, estadisticas: null };
  }
}

export async function getAvistamientosAll(filtros) {
  try {
    const query = buildQuery(filtros);
    const res = await fetch(`${API_HOST}/api/avistamientos${query}`);
    return await res.json();
  } catch (error) {
    console.error('Error en getAvistamientosAll:', error);
    return { success: false, avistamientos: [] };
  }
}

export async function getImpactoSostenible() {
  try {
    const res = await fetch(`${API_HOST}/api/impacto-sostenible`);
    return await res.json();
  } catch (error) {
    console.error('Error en getImpactoSostenible:', error);
    return { success: false, impacto: null };
  }
}

export async function downloadReportePDF(filtros) {
  try {
    const query = buildQuery(filtros);
    const res = await fetch(`${API_HOST}/api/reportes/especies${query}`);
    if (!res.ok) return { success: false, message: `Error ${res.status}` };
    const buffer = await res.arrayBuffer();
    const file = new File(Paths.cache, 'reporte-especies-sway.pdf');
    if (file.exists) file.delete();
    file.create();
    file.write(new Uint8Array(buffer));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Reporte de especies SWAY',
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error en downloadReportePDF:', error);
    return { success: false, message: 'No se pudo generar el reporte' };
  }
}
