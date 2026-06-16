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

/* ── UTILIDADES ──────────────────────────────────────────────────────── */

/**
 * Convierte un string a Title Case: primera letra de cada palabra en mayúscula,
 * el resto en minúscula. Ej: "RAMIREZ MIRANDA" → "Ramirez Miranda"
 */
function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-)\S/g, ch => ch.toUpperCase());
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

      // Ordenar por hora
      AppState.appointments = [...data].sort((a, b) => a.HORA_CITA.localeCompare(b.HORA_CITA));
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
  // Encontrar la última cita cuya hora es menor o igual a la actual (la última que ya inició)
  let idx = -1;
  for (let i = AppState.appointments.length - 1; i >= 0; i--) {
    if (AppState.appointments[i].HORA_CITA <= now) {
      idx = i;
      break;
    }
  }
  
  if (idx === -1) {
    // Si ninguna cita ha empezado aún (ej. temprano en la mañana), la activa es la primera
    AppState.activeIndex = 0;
  } else {
    AppState.activeIndex = idx;
  }
}

/* ── RENDERIZADO ──────────────────────────────────────────────────────── */

let queueInterval = null;
let queuePage = 0;

function renderLayout() {
  const listContainer = document.getElementById('queue-list');
  if (!listContainer) return;

  const apps = AppState.appointments;
  const activeIdx = AppState.activeIndex;

  if (apps.length === 0) return;

  // Cita Activa (Hero)
  const activeApp = apps[activeIdx] || apps[0];
  
  document.getElementById('hero-time').textContent = activeApp.HORA_CITA;
  document.getElementById('hero-name').textContent = toTitleCase(activeApp.NOMBRE);
  document.getElementById('hero-model-badge').textContent = toTitleCase(activeApp.MODELO);
  document.getElementById('hero-year').textContent = activeApp.ANO ? `Modelo ${activeApp.ANO}` : '';
  
  const advisorEl = document.getElementById('hero-advisor');
  if (advisorEl) {
    advisorEl.textContent = activeApp.ASESOR_SERVICIO ? `Asesor: ${toTitleCase(activeApp.ASESOR_SERVICIO)}` : '';
  }

  // Determinar citas próximas
  const upcomingApps = apps.slice(activeIdx + 1);

  const containerHeight = listContainer.clientHeight || 400;
  const itemHeight = 68;
  const maxItems = Math.max(1, Math.floor(containerHeight / itemHeight));

  // Limpiar intervalo anterior
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }

  if (upcomingApps.length > maxItems) {
    // Si hay más citas de las que caben, iniciar rotación
    queueInterval = setInterval(() => {
      queuePage++;
      if (queuePage * maxItems >= upcomingApps.length) {
        queuePage = 0;
      }
      renderQueuePage(upcomingApps, maxItems, queuePage, listContainer);
    }, 8000); // Cambiar de página cada 8 segundos
  } else {
    queuePage = 0;
  }

  renderQueuePage(upcomingApps, maxItems, queuePage, listContainer);
}

function renderQueuePage(upcomingApps, maxItems, page, listContainer) {
  listContainer.innerHTML = '';
  
  const startIdx = page * maxItems;
  const itemsToRender = upcomingApps.slice(startIdx, startIdx + maxItems);

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
          <div class="card-queue-time">${app.HORA_CITA}</div>
        </div>
        <div class="card-queue-info">
          <div class="card-queue-name">${toTitleCase(app.NOMBRE)}</div>
          <div class="card-queue-advisor">Asesor: ${toTitleCase(app.ASESOR_SERVICIO) || 'Asignado en recepción'}</div>
        </div>
      </div>
      <div class="card-queue-right">
        <div class="card-queue-agency">Nissauto</div>
        <div class="card-queue-vehicle">${toTitleCase(app.MODELO)} ${app.ANO}</div>
      </div>
    `;
      listContainer.appendChild(card);
    });
  } else {
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
