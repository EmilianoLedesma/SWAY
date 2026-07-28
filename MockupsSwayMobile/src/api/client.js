import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// hostUri = IP:puerto que Metro usa para servir el bundle a este dispositivo,
// se actualiza solo al cambiar de red (no hay backend con dominio fijo aun).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_HOST = `http://${devHost || 'localhost'}:8000`;

const TOKEN_KEY = 'sway_colab_token';

async function authHeaders() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Unica llamada POST habilitada por ahora: sin token no hay forma de leer
// avistamientos/eventos/perfil del colaborador (requieren sesion).
export async function login(email, password) {
  try {
    const res = await fetch(`${API_HOST}/api/colaboradores/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
      return { success: true };
    }
    return { success: false, message: data.detail || data.message || 'Credenciales inválidas' };
  } catch (error) {
    console.error('Error en login:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function logout() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function createEspecie(payload) {
  try {
    const res = await fetch(`${API_HOST}/api/especies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.detail || 'Error al crear especie' };
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
    if (!res.ok) return { success: false, message: data.detail || 'Error al actualizar especie' };
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
    if (!res.ok) return { success: false, message: data.detail || 'Error al eliminar especie' };
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
    if (!res.ok) return { success: false, message: data.detail || 'Error al actualizar perfil' };
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
    if (!res.ok) return { success: false, message: data.detail || 'Error al cambiar contraseña' };
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
    if (!res.ok) return { success: false, message: data.detail || 'Error al desactivar cuenta' };
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
    return { success: false, colaborador: null };
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
