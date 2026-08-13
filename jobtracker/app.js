const API_BASE = '/portfolio-api';
let apps = [];
let currentId = null;
let token = localStorage.getItem('portfolio_token') || null;
let authMode = 'login';

const statusLabels = {postulado:'Postulado', entrevista:'Entrevista', oferta:'Oferta', rechazado:'Rechazado'};
const statusOrder = ['postulado','entrevista','oferta','rechazado'];

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Acceso bitácora' : 'Crear cuenta';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Entrar' : 'Registrarme';
  document.getElementById('authToggle').textContent = authMode === 'login' ? 'Crear cuenta nueva' : 'Ya tengo cuenta';
  document.getElementById('authSubmitBtn').onclick = submitAuth;
  ['loginError','registerError','registerSuccess'].forEach(id => document.getElementById(id).classList.remove('show'));
}

function submitAuth(){
  if(authMode === 'login') return doLogin();
  return doRegister();
}

async function doRegister(){
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  document.getElementById('registerError').classList.remove('show');
  document.getElementById('registerSuccess').classList.remove('show');
  if(!res.ok){
    document.getElementById('registerError').classList.add('show');
    return;
  }
  document.getElementById('registerSuccess').classList.add('show');
  toggleAuthMode();
}

async function doLogin(){
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });
  if(!res.ok){
    document.getElementById('loginError').classList.add('show');
    return;
  }
  document.getElementById('loginError').classList.remove('show');
  const data = await res.json();
  token = data.access_token;
  localStorage.setItem('portfolio_token', token);
  showApp();
}

function authHeaders(){
  return {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`};
}

async function showApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  await loadApps();
}

async function loadApps(){
  const res = await fetch(`${API_BASE}/postulations`, {headers: authHeaders()});
  if(res.status === 401){
    token = null;
    localStorage.removeItem('portfolio_token');
    document.getElementById('appRoot').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  apps = await res.json();
  render();
}

function render(){
  const stats = document.getElementById('stats');
  stats.innerHTML = statusOrder.map(s => {
    const n = apps.filter(a => a.status === s).length;
    return `<div class="stat"><span class="num">${n}</span><span class="lbl">${statusLabels[s]}</span></div>`;
  }).join('');

  const board = document.getElementById('board');
  board.innerHTML = statusOrder.map(s => {
    const items = apps.filter(a => a.status === s);
    const cards = items.length ? items.map(a => cardHtml(a)).join('') : '<div class="empty-col">Sin postulaciones</div>';
    return `<div class="col">
      <div class="col-head"><h3>${statusLabels[s]}</h3><span class="col-count">${items.length}</span></div>
      ${cards}
    </div>`;
  }).join('');
}

function cardHtml(a){
  return `<div class="card" onclick="openDetail('${a.id}')">
    <span class="stamp ${a.status}">${statusLabels[a.status]}</span>
    <p class="company">${escapeHtml(a.company)}</p>
    <p class="role">${escapeHtml(a.role)}</p>
    <div class="meta"><span>${escapeHtml(a.salary)}</span><span>${escapeHtml(fmtDate(a.date_applied))}</span></div>
  </div>`;
}

function fmtDate(d){
  if(!d) return '';
  const [y,m,day] = d.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${day} ${meses[parseInt(m,10)-1]}`;
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function openDetail(id){
  const a = apps.find(x => x.id === id);
  if(!a) return;
  currentId = id;
  document.getElementById('editMode').style.display = 'none';
  document.getElementById('viewMode').style.display = 'block';
  document.getElementById('modalTitle').textContent = a.company;
  document.getElementById('modalSub').textContent = a.role;
  document.getElementById('v-company').textContent = a.company;
  document.getElementById('v-role').textContent = a.role;
  document.getElementById('v-location').textContent = a.location;
  document.getElementById('v-salary').textContent = a.salary;
  document.getElementById('v-schedule').textContent = a.schedule;
  document.getElementById('v-date').textContent = fmtDate(a.date_applied);
  document.getElementById('v-source').textContent = a.source;
  document.getElementById('v-requirements').innerHTML = (a.requirements||'').split('\n').filter(Boolean).map(r => `<li>${escapeHtml(r)}</li>`).join('');
  document.getElementById('v-status').value = a.status;
  document.getElementById('v-notes').value = a.notes || '';
  document.getElementById('saveNote').textContent = '';
  document.getElementById('overlay').classList.add('open');
}

async function updateStatus(){
  const status = document.getElementById('v-status').value;
  const res = await fetch(`${API_BASE}/postulations/${currentId}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({status})
  });
  if(!res.ok){
    document.getElementById('saveNote').textContent = 'Error al guardar';
    return;
  }
  await loadApps();
  document.getElementById('saveNote').textContent = 'Estatus actualizado';
}

async function updateNotes(){
  const notes = document.getElementById('v-notes').value;
  const res = await fetch(`${API_BASE}/postulations/${currentId}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({notes})
  });
  if(!res.ok){
    document.getElementById('saveNote').textContent = 'Error al guardar';
    return;
  }
  await loadApps();
  document.getElementById('saveNote').textContent = 'Notas guardadas';
}

async function deleteApp(){
  await fetch(`${API_BASE}/postulations/${currentId}`, {method: 'DELETE', headers: authHeaders()});
  await loadApps();
  closeModal();
}

function openModal(){
  currentId = null;
  document.getElementById('modalTitle').textContent = 'Nueva postulación';
  document.getElementById('modalSub').textContent = 'Agrega los datos de la vacante';
  document.getElementById('viewMode').style.display = 'none';
  document.getElementById('editMode').style.display = 'block';
  ['f-company','f-role','f-location','f-salary','f-schedule','f-source','f-requirements','f-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('overlay').classList.add('open');
}

async function saveNew(){
  const company = document.getElementById('f-company').value.trim();
  const role = document.getElementById('f-role').value.trim();
  if(!company || !role){
    alert('Completa al menos empresa y puesto.');
    return;
  }
  const id = 'app-' + Date.now();
  const requirements = document.getElementById('f-requirements').value.trim();
  const res = await fetch(`${API_BASE}/postulations`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      id, company, role,
      location: document.getElementById('f-location').value.trim(),
      salary: document.getElementById('f-salary').value.trim(),
      schedule: document.getElementById('f-schedule').value.trim(),
      date_applied: new Date().toISOString().slice(0,10),
      source: document.getElementById('f-source').value.trim(),
      requirements,
      notes: document.getElementById('f-notes').value.trim(),
      status: 'postulado'
    })
  });
  if(!res.ok){
    alert('Error al guardar la postulación.');
    return;
  }
  await loadApps();
  closeModal();
}

function closeModal(){
  document.getElementById('overlay').classList.remove('open');
  currentId = null;
}

document.getElementById('overlay').addEventListener('click', (e) => {
  if(e.target.id === 'overlay') closeModal();
});

if(token){
  showApp();
}
