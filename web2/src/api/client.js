const BASE = '/api'
const API_KEY = 'f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b'

function getToken() {
  return localStorage.getItem('colab_token')
}

async function request(method, path, body) {
  const token = getToken()
  const headers = { 'x-api-key': API_KEY }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(BASE + path, opts)

  // Handle empty responses (e.g. 204 No Content)
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}

  if (!res.ok) {
    let detail = data.detail || data.error || data.message || `Error ${res.status}`
    if (Array.isArray(detail)) {
      detail = detail.map(d => `${d.loc?.slice(-1)[0] ?? ''}: ${d.msg}`).join('; ')
    }
    throw new Error(String(detail))
  }
  return data
}

export const api = {
  // Auth
  login: async (email, password) => {
    const data = await request('POST', '/colaboradores/login', { email, password })
    if (data.access_token) {
      localStorage.setItem('colab_token', data.access_token)
    }
    return data
  },
  logout: () => {
    localStorage.removeItem('colab_token')
    return request('POST', '/colaboradores/logout')
  },
  profile: () => request('GET', '/colaboradores/profile'),

  // Especies
  getEspecies:    ()         => request('GET',    '/especies?limit=500'),
  createEspecie:  (data)     => request('POST',   '/especies', data),
  updateEspecie:  (id, data) => request('PUT',    `/especies/${id}`, data),
  deleteEspecie:  (id)       => request('DELETE', `/especies/${id}`),

  // Perfil CRUD
  getPerfil:       ()       => request('GET',    '/colaboradores/profile'),
  updatePerfil:    (data)   => request('PUT',    '/colaboradores/perfil', data),
  changePassword:  (data)   => request('PUT',    '/colaboradores/perfil/password', data),
  deletePerfil:    ()       => request('DELETE', '/colaboradores/perfil'),

  // Avistamientos
  getAvistamientos: () => request('GET', '/colaboradores/avistamientos'),

  // Lookup
  getEstadosConservacion: () => request('GET', '/estados-conservacion'),
  getAmenazas:  () => request('GET', '/amenazas'),
  getHabitats:  () => request('GET', '/habitats'),

  // Reportes PDF
  downloadReportePDF: async () => {
    const token = getToken()
    const headers = { 'x-api-key': API_KEY }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(BASE + '/reportes/especies', { headers })
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reporte-especies-sway.pdf'
    a.click()
    URL.revokeObjectURL(url)
  },

  getEstadisticas:        () => request('GET', '/estadisticas'),
  getEstadisticasEspecies:() => request('GET', '/especies/estadisticas'),
  getAvistamientosAll:    () => request('GET', '/avistamientos'),
  getImpactoSostenible:   () => request('GET', '/impacto-sostenible'),
}
