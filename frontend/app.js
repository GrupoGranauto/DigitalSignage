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
  const params = new URLSearchParams(window.location.search);
  const agencia = params.get('agencia');

  if (!agencia) {
    // Si no hay agencia en la URL, redirigir a login o a su panel correspondiente
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('No autenticado');
        return res.json();
      })
      .then(data => {
        const user = data.user;
        if (user.role === 'admin') {
          window.location.replace('/admin.html');
        } else if (user.role === 'hostess') {
          window.location.replace('/hostess.html');
        } else {
          window.location.replace('/login.html');
        }
      })
      .catch(() => {
        window.location.replace('/login.html');
      });
    return;
  }

  // Si hay agencia en la URL, mostrar la pantalla de Signage
  document.documentElement.classList.remove('portal-mode');
  document.body.classList.remove('portal-mode');
  const portal = document.getElementById('portal-container');
  if (portal) portal.style.display = 'none';
  const appContainer = document.getElementById('app-container');
  if (appContainer) appContainer.style.display = 'flex';

  startClock();
  loadData();
  startSSE();

  // Polling lento de contingencia (cada 60 segundos)
  setInterval(loadData, 60000);

  const retryBtn = document.getElementById('retry-button');
  if (retryBtn) retryBtn.addEventListener('click', loadData);
}

let sseSource = null;
function startSSE() {
  const params = new URLSearchParams(window.location.search);
  const agencia = params.get('agencia');
  if (!agencia) return;

  if (sseSource) {
    sseSource.close();
  }

  const sseUrl = `/api/events?agencia=${encodeURIComponent(agencia)}`;
  sseSource = new EventSource(sseUrl);

  sseSource.onmessage = function(event) {
    console.log('[SSE] Notificación recibida:', event.data);
    loadData();
  };

  sseSource.onerror = function(err) {
    console.error('[SSE] Error de conexión SSE, reintentando en 5s...', err);
    sseSource.close();
    setTimeout(startSSE, 5000);
  };
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
 * el resto en minúscula. Limpia espacios extras y puntos al final.
 * Ej: "RAMIREZ MIRANDA ." → "Ramirez Miranda"
 */
function toTitleCase(str) {
  if (!str) return '';
  let cleaned = str.trim();
  if (cleaned.endsWith('.')) {
    cleaned = cleaned.slice(0, -1).trim();
  }
  return cleaned
    .toLowerCase()
    .replace(/(?:^|\s|-)\S/g, ch => ch.toUpperCase());
}

const AGENCIA_MAP = {
  'NISSAUTO': 'Nissauto',
  'MORELOS': 'Morelos',
  'CABORCA': 'Caborca',
  'CANANEA': 'Cananea',
  'INFINITI': 'Infiniti',
  'NAVOJOA': 'Navojoa',
  'GUAYMAS': 'Guaymas',
  'PEÑASCO': 'Puerto Peñasco',
  'MAGDALENA': 'Magdalena',
  'GRANAUTO': 'GranAuto',
  'NOGALES': 'Nogales',
  'AGUA PRIETA': 'Agua Prieta',
  'AGUAPRIETA': 'Agua Prieta',
  'PUERTO PEÑASCO': 'Puerto Peñasco'
};

function formatAgencia(agenciaRaw) {
  if (!agenciaRaw) return 'Nissauto';
  const key = agenciaRaw.trim().toUpperCase();
  return AGENCIA_MAP[key] || toTitleCase(agenciaRaw);
}

function formatTimeHTML(timeStr) {
  if (!timeStr) return '';
  return timeStr.replace(':', '<span class="time-colon">:</span>');
}


/* ── DATOS ────────────────────────────────────────────────────────────── */

function loadData() {
  // Solo mostrar overlay de loading la primera vez para evitar parpadeos molestos al hacer polling
  if (AppState.appointments.length === 0) {
    showState('loading');
  }

  const params = new URLSearchParams(window.location.search);
  const agencia = params.get('agencia');
  let url = window.CONFIG.API_ENDPOINT;
  if (agencia) {
    url += '?agencia=' + encodeURIComponent(agencia);
  }

  fetch(url, { headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(res => {
      // Manejar formato nuevo { appointments, activeFolio } o anterior de arreglo directo
      const appointments = (res && typeof res === 'object' && Array.isArray(res.appointments)) ? res.appointments : (Array.isArray(res) ? res : []);
      const activeFolio = (res && typeof res === 'object') ? res.activeFolio : null;
      const attendingFolios = (res && typeof res === 'object') ? (res.attendingFolios || []) : [];
      const completedFolios = (res && typeof res === 'object') ? (res.completedFolios || []) : [];
      const noShowFolios = (res && typeof res === 'object') ? (res.noShowFolios || []) : [];

      // Verificar si quedan citas activas para mostrar en pantalla
      const hasActiveAppointments = appointments.some(app => {
        return !completedFolios.includes(app.FOLIO_CITA) && !noShowFolios.includes(app.FOLIO_CITA);
      });

      if (!appointments.length || !hasActiveAppointments) {
        showState('empty');
        return;
      }

      // Ordenar por hora
      AppState.appointments = [...appointments].sort((a, b) => a.HORA_CITA.localeCompare(b.HORA_CITA));
      AppState.activeFolio = activeFolio;
      AppState.attendingFolios = attendingFolios;
      AppState.completedFolios = completedFolios;
      AppState.noShowFolios = noShowFolios;

      showState('content');
      updateActiveIndex();
      renderLayout();
    })
    .catch(err => {
      console.error('Error fetching appointments:', err);
      if (AppState.appointments.length === 0) {
        showState('error');
      }
    });
}

function updateActiveIndex() {
  const completed = AppState.completedFolios || [];
  const noShow = AppState.noShowFolios || [];

  // Solo consideramos como activa la cita establecida explícitamente en el Panel de Hostess
  if (AppState.activeFolio && !completed.includes(AppState.activeFolio) && !noShow.includes(AppState.activeFolio)) {
    const idx = AppState.appointments.findIndex(app => app.FOLIO_CITA === AppState.activeFolio);
    if (idx !== -1) {
      AppState.activeIndex = idx;
      return;
    }
  }

  // Si no hay ninguna cita marcada explícitamente como activa por la Hostess, no hay activeIndex
  AppState.activeIndex = -1;
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
  const activeApp = apps[activeIdx];
  const activeFolio = activeApp ? activeApp.FOLIO_CITA : null;
  
  const labelTextEl = document.querySelector('.hero-label-text');
  const dotEl = document.getElementById('hero-dot');
  const timeBoxEl = document.getElementById('hero-time-box');
  const nameEl = document.getElementById('hero-name');
  const vehicleEl = document.getElementById('hero-vehicle');

  if (activeApp) {
    if (labelTextEl) labelTextEl.textContent = 'ACTUALMENTE ATENDIENDO';
    if (dotEl) dotEl.style.display = 'inline-block';
    if (timeBoxEl) timeBoxEl.style.display = 'flex';
    
    document.getElementById('hero-time').innerHTML = formatTimeHTML(activeApp.HORA_CITA);
    nameEl.textContent = toTitleCase(activeApp.NOMBRE);
    
    vehicleEl.innerHTML = `
      <span class="hero-agency-badge" id="hero-agency-badge">${formatAgencia(activeApp.AGENCIA)}</span>
      <span class="hero-model-badge" id="hero-model-badge">${toTitleCase(activeApp.MODELO)}</span>
      <span class="hero-year" id="hero-year">${activeApp.ANO ? `Modelo ${activeApp.ANO}` : ''}</span>
      <span class="hero-advisor" id="hero-advisor">${activeApp.ASESOR_SERVICIO ? `Asesor: ${toTitleCase(activeApp.ASESOR_SERVICIO)}` : ''}</span>
    `;
  } else {
    // Si no hay ninguna cita activa/siendo atendida, mostrar una tarjeta de bienvenida limpia en la zona roja
    if (labelTextEl) labelTextEl.textContent = 'BIENVENIDOS';
    if (dotEl) dotEl.style.display = 'none';
    if (timeBoxEl) timeBoxEl.style.display = 'none';
    
    nameEl.textContent = 'Recepción de Servicio';
    vehicleEl.innerHTML = `
      <span class="hero-year" style="font-size: 1.4rem; font-weight: 500; color: rgba(255,255,255,0.9);">
        Por favor, tome asiento en la sala de espera. En un momento le atenderemos.
      </span>
    `;
  }

  // Renderizar la barra de "También en Atención" (Disimulada/Sutil)
  const attendingBar = document.getElementById('attending-bar');
  const attendingList = document.getElementById('attending-bar-list');
  if (attendingBar && attendingList) {
    const otherAttendingFolios = (AppState.attendingFolios || []).filter(f => f !== activeFolio);
    const otherAttendingApps = otherAttendingFolios.map(folio => {
      return apps.find(app => app.FOLIO_CITA === folio);
    }).filter(Boolean);

    if (otherAttendingApps.length > 0) {
      attendingList.innerHTML = '';
      otherAttendingApps.forEach(app => {
        const badge = document.createElement('div');
        badge.className = 'attending-badge';
        badge.innerHTML = `
          <span class="attending-badge-dot"></span>
          <span>${app.HORA_CITA} - ${toTitleCase(app.NOMBRE)} (${toTitleCase(app.MODELO)})</span>
        `;
        attendingList.appendChild(badge);
      });
      attendingBar.style.display = 'flex';
    } else {
      attendingBar.style.display = 'none';
      attendingList.innerHTML = '';
    }
  }

  // Determinar citas próximas (excluyendo la activa, en atención, terminadas o no asistidas)
  const upcomingApps = apps.filter(app => {
    if (app.FOLIO_CITA === activeFolio) return false;
    if (AppState.attendingFolios && AppState.attendingFolios.includes(app.FOLIO_CITA)) return false;
    if (AppState.completedFolios && AppState.completedFolios.includes(app.FOLIO_CITA)) return false;
    if (AppState.noShowFolios && AppState.noShowFolios.includes(app.FOLIO_CITA)) return false;
    return true;
  });

  const containerHeight = listContainer.clientHeight || 400;
  
  // Medir la altura real de la primera tarjeta y el gap si ya están renderizados
  const firstCard = listContainer.querySelector('.card-queue-item');
  const computedGap = window.getComputedStyle(listContainer).gap;
  const gapValue = computedGap ? parseFloat(computedGap) : 24; // fallback a 0.8rem (~24px)
  const itemHeight = (firstCard && firstCard.offsetHeight > 40)
    ? (firstCard.offsetHeight + gapValue)
    : 140; // fallback inicial si la lista está vacía

  // Número de ítems que caben completamente
  const fullyVisibleItems = Math.max(1, Math.floor(containerHeight / itemHeight));
  // Si sobra espacio para mostrar parte del siguiente (al menos 20px), lo renderizamos (se cortará al final)
  const hasCutoff = (containerHeight % itemHeight) > 20;
  const maxItemsToShow = hasCutoff ? fullyVisibleItems + 1 : fullyVisibleItems;
  const stepSize = fullyVisibleItems;

  // Limpiar intervalo anterior
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }

  if (upcomingApps.length > maxItemsToShow) {
    // Si hay más citas de las que caben, iniciar rotación
    queueInterval = setInterval(() => {
      rotateQueue(upcomingApps, maxItemsToShow, stepSize, listContainer);
    }, window.CONFIG.PAGINATION_INTERVAL || 7000); // Cambiar de página según configuración
  } else {
    queuePage = 0;
  }

  renderQueuePage(upcomingApps, maxItemsToShow, queuePage, stepSize, listContainer);
}

function rotateQueue(upcomingApps, maxItemsToShow, stepSize, listContainer) {
  const cards = listContainer.querySelectorAll('.card-queue-item');

  const proceedToNextPage = () => {
    queuePage++;
    if (queuePage * stepSize >= upcomingApps.length) {
      queuePage = 0;
    }
    renderQueuePage(upcomingApps, maxItemsToShow, queuePage, stepSize, listContainer);
  };

  if (cards.length > 0 && window.CONFIG.ANIMATIONS_ENABLED) {
    cards.forEach((card, idx) => {
      card.classList.remove('sweep-in-up');
      card.style.animationDelay = `${idx * 50}ms`;
      card.classList.add('sweep-out-up');
    });

    // Esperar a que la última tarjeta termine de salir (350ms de animación + delay)
    const totalDelay = 350 + (cards.length - 1) * 50;
    setTimeout(proceedToNextPage, totalDelay);
  } else {
    proceedToNextPage();
  }
}

function renderQueuePage(upcomingApps, maxItemsToShow, page, stepSize, listContainer) {
  listContainer.innerHTML = '';
  
  const startIdx = page * stepSize;
  const itemsToRender = upcomingApps.slice(startIdx, startIdx + maxItemsToShow);

  if (itemsToRender.length > 0) {
    itemsToRender.forEach((app, index) => {
      const card = document.createElement('div');
      const animationClass = window.CONFIG.ANIMATIONS_ENABLED ? ' sweep-in-up' : '';
      card.className = `card-queue-item${animationClass}`;
      if (window.CONFIG.ANIMATIONS_ENABLED) {
        card.style.animationDelay = `${index * 60}ms`;
      }

      card.innerHTML = `
      <div class="card-queue-left">
        <div class="card-queue-time-box">
          <div class="card-queue-time">${formatTimeHTML(app.HORA_CITA)}</div>
        </div>
        <div class="card-queue-info">
          <div class="card-queue-name">${toTitleCase(app.NOMBRE)}</div>
          <div class="card-queue-advisor">Asesor: ${toTitleCase(app.ASESOR_SERVICIO) || 'Asignado en recepción'}</div>
        </div>
      </div>
      <div class="card-queue-right">
        <div class="card-queue-agency">${formatAgencia(app.AGENCIA)}</div>
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
