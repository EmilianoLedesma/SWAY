// =============================================
// API KEY — inyección automática en todas las llamadas a la API
// La rama de seguridad exige x-api-key en todos los endpoints de FastAPI.
// Se parchea window.fetch una sola vez acá en vez de editar cada archivo
// que llama a la API (especies.js, eventos.js, tienda.js, mis-pedidos.js).
// =============================================
(function () {
  const SWAY_API_KEY = 'f6bed84d1b5bb4af3ff44231c8c8bae5c8efc3709ee1510b';
  const originalFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/')) {
      init = { ...init, headers: { ...(init.headers || {}), 'x-api-key': SWAY_API_KEY } };
    }
    return originalFetch(input, init);
  };
})();
