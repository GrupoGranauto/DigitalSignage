/**
 * Digital Signage - Citas de Servicio Nissan
 * Controlador principal
 */

const AppState = {
  appointments: [],
  activeIndex: -1,
  clockId: null
};

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  startClock();
  loadData();

  const retryBtn = document.getElementById('retry-button');
  if (retryBtn) retryBtn.addEventListener('click', loadData);
}

/* ── RELOJ ────────────────────────────────────────────────────────────── */

function startClock() {
  tick();
  AppState.clockId = setInterval(tick, 1000);
}

function tick() {
  const now = new Date();

  const timeEl = document.getElementById('live-time');
  if (timeEl) {
    // Format: "12:37:45 p.m."
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    timeEl.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
  }

  // Check every minute if the active index changed
  if (now.getSeconds() === 0 && AppState.appointments.length > 0) {
    const prev = AppState.activeIndex;
    updateActiveIndex();
    if (AppState.activeIndex !== prev) {
      renderLayout();
    }
  }
}

function hhmm() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

/* ── DATOS ────────────────────────────────────────────────────────────── */

function loadData() {
  showState('loading');

  fetch(window.CONFIG.API_ENDPOINT, { headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      if (!Array.isArray(data) || !data.length) {
        showState('empty');
        return;
      }
      // Filtrar solo modelos Nissan
      const nissanModels = ['nissan', 'versa', 'sentra', 'altima', 'maxima', 'march', 'kicks', 'xtrail', 'x-trail', 'pathfinder', 'armada', 'np300', 'frontier', 'titan', 'leaf', 'v-drive', 'urvan', 'cabstar', 'tiida', 'tsuru', 'platina', 'note', 'micra', 'datsun', 'z', 'gt-r', 'murano', 'rogue'];
      const filteredData = data.filter(a => {
        const m = (a.MODELO || '').toLowerCase();
        return nissanModels.some(n => m.includes(n)) || m.trim() === ''; // Permitir vacíos por si acaso
      });

      if (!filteredData.length) {
        showState('empty');
        return;
      }

      // Ordenar por hora
      AppState.appointments = [...filteredData].sort((a, b) => a.HORA_CITA.localeCompare(b.HORA_CITA));
      showState('content');
      updateActiveIndex();
      renderLayout();
    })
    .catch(err => {
      console.error('Error fetching appointments:', err);
      showState('error');
    });
}

function updateActiveIndex() {
  const now = hhmm();
  // Encontrar la primera cita cuya hora es mayor o igual a la actual
  const idx = AppState.appointments.findIndex(a => a.HORA_CITA >= now);
  
  if (idx === -1) {
    // Si ya pasaron todas, la activa es la última de la lista
    AppState.activeIndex = AppState.appointments.length - 1;
  } else {
    AppState.activeIndex = idx;
  }
}

/* ── RENDERIZADO ──────────────────────────────────────────────────────── */

function renderLayout() {
  const listContainer = document.getElementById('queue-list');
  if (!listContainer) return;

  const apps = AppState.appointments;
  const activeIdx = AppState.activeIndex;

  if (apps.length === 0) return;

  // Cita Activa (Hero)
  const activeApp = apps[activeIdx] || apps[0];
  
  document.getElementById('hero-time').textContent = activeApp.HORA_CITA;
  document.getElementById('hero-name').textContent = activeApp.NOMBRE;
  document.getElementById('hero-model-badge').textContent = activeApp.MODELO;
  document.getElementById('hero-year').textContent = activeApp.ANO ? `Modelo ${activeApp.ANO}` : '';

  // Limpiar lista de cola
  listContainer.innerHTML = '';

  // Determinar citas próximas (todas las siguientes a la activa)
  // Si la activa es la última, mostrar solo ella o una lista vacía
  const upcomingApps = apps.slice(activeIdx + 1);

  // Medir cuántas caben dinámicamente
  const containerHeight = listContainer.clientHeight || 400; // fallback a 400px si no ha renderizado
  const itemHeight = 68; // aproximado con gap incluido
  const maxItems = Math.max(1, Math.floor(containerHeight / itemHeight));

  const itemsToRender = upcomingApps.slice(0, maxItems);

  if (itemsToRender.length > 0) {
    itemsToRender.forEach((app, index) => {
      const card = document.createElement('div');
      card.className = `card-queue-item${window.CONFIG.ANIMATIONS_ENABLED ? ' animate-in' : ''}`;
      if (window.CONFIG.ANIMATIONS_ENABLED) {
        card.style.animationDelay = `${index * 60}ms`;
      }

      card.innerHTML = `
        <div class="card-queue-left">
          <div class="card-queue-time-box">
            <span class="card-queue-time">${app.HORA_CITA}</span>
          </div>
          <span class="card-queue-name">${app.NOMBRE}</span>
        </div>
        <span class="card-queue-vehicle">${app.MODELO} ${app.ANO}</span>
      `;
      listContainer.appendChild(card);
    });
  } else {
    // Si no hay más citas próximas, mostrar un placeholder premium
    const emptyCard = document.createElement('div');
    emptyCard.className = 'card-queue-item is-empty';
    emptyCard.innerHTML = `
      <div class="card-queue-left">
        <div class="card-queue-time-box">
          <span class="card-queue-time">--:--</span>
        </div>
        <span class="card-queue-name">Fin de Agenda</span>
      </div>
      <span class="card-queue-vehicle">No hay más citas próximas</span>
    `;
    listContainer.appendChild(emptyCard);
  }
}

/* ── GESTIÓN DE ESTADOS ───────────────────────────────────────────────── */

function showState(state) {
  const loading = document.getElementById('state-loading');
  const empty = document.getElementById('state-empty');
  const error = document.getElementById('state-error');
  const heroZone = document.getElementById('hero-zone');
  const queueZone = document.getElementById('queue-zone');

  // Ocultar todos por defecto
  [loading, empty, error].forEach(el => { if (el) el.style.display = 'none'; });

  if (state === 'loading' && loading) {
    loading.style.display = 'flex';
  } else if (state === 'empty' && empty) {
    empty.style.display = 'flex';
  } else if (state === 'error' && error) {
    error.style.display = 'flex';
  } else if (state === 'content') {
    if (heroZone) heroZone.style.display = 'flex';
    if (queueZone) queueZone.style.display = 'flex';
  }

  // Sobrescribir textos desde configuración
  const texts = window.CONFIG?.TEXTS;
  if (texts) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('loading-text', texts.LOADING);
    set('empty-text', texts.EMPTY);
    set('error-text', texts.ERROR);
  }
}

window.addEventListener('beforeunload', () => {
  if (AppState.clockId) clearInterval(AppState.clockId);
});
