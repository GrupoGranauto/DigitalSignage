/**
 * Digital Signage - Panel de Hostess
 * Control de Citas y Asignación Activa por Agencia
 */

const HostessState = {
  selectedAgency: null,
  appointments: [],
  activeFolio: null,
  pollId: null
};

// Mapeo de Agencias permitidas y su formato
const AGENCIES = [
  { key: 'NISSAUTO', label: 'Nissauto' },
  { key: 'MORELOS', label: 'Morelos' },
  { key: 'CABORCA', label: 'Caborca' },
  { key: 'CANANEA', label: 'Cananea' },
  { key: 'INFINITI', label: 'Infiniti' },
  { key: 'NAVOJOA', label: 'Navojoa' },
  { key: 'GUAYMAS', label: 'Guaymas' },
  { key: 'PEÑASCO', label: 'Puerto Peñasco' },
  { key: 'MAGDALENA', label: 'Magdalena' },
  { key: 'GRANAUTO', label: 'GranAuto' },
  { key: 'NOGALES', label: 'Nogales' },
  { key: 'AGUA PRIETA', label: 'Agua Prieta' }
];

let completedExpanded = false;

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('auth-verified', (e) => {
    const user = e.detail;
    setupUserProfile(user);
    initHostess(user);
  });
});

function setupUserProfile(user) {
  const avatarEl = document.getElementById('user-profile-avatar');
  const nameEl = document.getElementById('user-profile-name');
  const roleEl = document.getElementById('user-profile-role');
  const logoutBtn = document.getElementById('logout-button');

  if (avatarEl) {
    avatarEl.src = user.picture || 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23cbd5e1"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>';
  }
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) {
    roleEl.textContent = user.role === 'admin' ? 'Administrador' : `Hostess - ${user.agency}`;
  }

  if (logoutBtn) {
    // Clonar para evitar doble binding
    const newLogoutBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
    
    newLogoutBtn.addEventListener('click', () => {
      fetch('/api/auth/logout', { method: 'POST' })
        .then(() => {
          window.location.replace('/login.html');
        })
        .catch(err => {
          console.error('Error al cerrar sesión:', err);
          window.location.replace('/login.html');
        });
    });
  }
}

function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn) {
      resolve(confirm(message));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;

    // Clonar los botones para limpiar todos los event listeners anteriores y prevenir fugas de eventos o bloqueos
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    modal.style.display = 'flex';

    newOkBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      resolve(true);
    }, { once: true });

    newCancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      resolve(false);
    }, { once: true });
  });
}

function initHostess(user) {
  document.getElementById('change-agency-button').addEventListener('click', clearAgency);
  
  const toggleBtn = document.getElementById('completed-accordion-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleCompletedSection);
  }
  
  if (user.role === 'hostess') {
    // Hostess va directo a su panel
    HostessState.selectedAgency = user.agency;
    const changeBtn = document.getElementById('change-agency-button');
    if (changeBtn) changeBtn.style.display = 'none';
    showPanel();
  } else {
    // Admin puede seleccionar
    const changeBtn = document.getElementById('change-agency-button');
    if (changeBtn) changeBtn.style.display = 'block';
    
    if (HostessState.selectedAgency) {
      showPanel();
    } else {
      showSelectionGrid();
    }
  }
}

function toggleCompletedSection() {
  completedExpanded = !completedExpanded;
  const content = document.getElementById('completed-accordion-content');
  const arrow = document.getElementById('completed-accordion-arrow');
  if (content) content.style.display = completedExpanded ? 'block' : 'none';
  if (arrow) {
    if (completedExpanded) {
      arrow.classList.add('is-expanded');
    } else {
      arrow.classList.remove('is-expanded');
    }
  }
}

/* ── VISTAS ────────────────────────────────────────────────────────────── */

function showSelectionGrid() {
  stopPolling();
  stopSSE();
  
  document.getElementById('agency-selection-view').style.display = 'block';
  document.getElementById('hostess-panel-view').style.display = 'none';

  const grid = document.getElementById('agency-grid');
  grid.innerHTML = '';

  AGENCIES.forEach(agency => {
    const card = document.createElement('div');
    card.className = 'agency-card';
    card.innerHTML = `<h2 class="agency-name-title">${agency.label}</h2>`;
    card.addEventListener('click', () => selectAgency(agency.key));
    grid.appendChild(card);
  });
}

function showPanel() {
  document.getElementById('agency-selection-view').style.display = 'none';
  document.getElementById('hostess-panel-view').style.display = 'block';

  // Mostrar badge
  const agencyObj = AGENCIES.find(a => a.key === HostessState.selectedAgency);
  document.getElementById('display-agency-badge').textContent = agencyObj ? agencyObj.label : HostessState.selectedAgency;

  loadAppointments();
  startPolling();
  startSSE();
}

function selectAgency(agencyKey) {
  HostessState.selectedAgency = agencyKey;
  showPanel();
}

function clearAgency() {
  HostessState.selectedAgency = null;
  showSelectionGrid();
}

/* ── POLLING / DATOS ───────────────────────────────────────────────────── */

let sseSource = null;

function startSSE() {
  if (!HostessState.selectedAgency) return;

  if (sseSource) {
    sseSource.close();
  }

  const sseUrl = `/api/events?agencia=${encodeURIComponent(HostessState.selectedAgency)}`;
  sseSource = new EventSource(sseUrl);

  sseSource.onmessage = function(event) {
    console.log('[SSE Hostess] Notificación recibida:', event.data);
    loadAppointments();
  };

  sseSource.onerror = function(err) {
    console.error('[SSE Hostess] Error de conexión SSE, reintentando en 5s...', err);
    sseSource.close();
    setTimeout(startSSE, 5000);
  };
}

function stopSSE() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
}

function startPolling() {
  stopPolling();
  HostessState.pollId = setInterval(loadAppointments, 60000); // Polling lento de contingencia (60s)
}

function stopPolling() {
  if (HostessState.pollId) {
    clearInterval(HostessState.pollId);
    HostessState.pollId = null;
  }
}

function loadAppointments() {
  if (!HostessState.selectedAgency) return;

  const url = `${window.CONFIG.API_ENDPOINT}?agencia=${encodeURIComponent(HostessState.selectedAgency)}`;

  fetch(url, { headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(res => {
      const appointments = (res && typeof res === 'object' && Array.isArray(res.appointments)) ? res.appointments : (Array.isArray(res) ? res : []);
      const activeFolio = (res && typeof res === 'object') ? res.activeFolio : null;
      const attendingFolios = (res && typeof res === 'object') ? (res.attendingFolios || []) : [];
      const completedFolios = (res && typeof res === 'object') ? (res.completedFolios || []) : [];
      const noShowFolios = (res && typeof res === 'object') ? (res.noShowFolios || []) : [];

      HostessState.appointments = [...appointments].sort((a, b) => a.HORA_CITA.localeCompare(b.HORA_CITA));
      HostessState.activeFolio = activeFolio;
      HostessState.attendingFolios = attendingFolios;
      HostessState.completedFolios = completedFolios;
      HostessState.noShowFolios = noShowFolios;

      renderAppointments();
    })
    .catch(err => {
      console.error('[Hostess] Error cargando citas:', err);
    });
}

/* ── RENDER ────────────────────────────────────────────────────────────── */

function renderAppointments() {
  const container = document.getElementById('appointments-list');
  const completedSection = document.getElementById('completed-section');
  const completedList = document.getElementById('completed-list');
  
  const activeSection = document.getElementById('active-appointments-section');
  const activeList = document.getElementById('active-appointments-list');

  // Limpiar contenedores
  if (container) container.innerHTML = '';
  if (activeList) activeList.innerHTML = '';
  if (completedList) completedList.innerHTML = '';

  if (HostessState.appointments.length === 0) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Sin citas para hoy</h3>
          <p>No se encontraron citas de servicio programadas para esta agencia el día de hoy.</p>
        </div>
      `;
    }
    if (activeSection) activeSection.style.display = 'none';
    if (completedSection) completedSection.style.display = 'none';
    return;
  }

  const attendingFolios = HostessState.attendingFolios || [];
  const completedFolios = HostessState.completedFolios || [];
  const noShowFolios = HostessState.noShowFolios || [];
  const activeFolio = HostessState.activeFolio;

  let activeScreenCount = 0;
  let pendingCount = 0;
  let completedCount = 0;

  HostessState.appointments.forEach(app => {
    const isPrimary = app.FOLIO_CITA === activeFolio;
    const isAttending = attendingFolios.includes(app.FOLIO_CITA);
    const isCompleted = completedFolios.includes(app.FOLIO_CITA);
    const isNoShow = noShowFolios.includes(app.FOLIO_CITA);
    const isDone = isCompleted || isNoShow;

    const card = document.createElement('div');
    
    let cardClass = 'hostess-card';
    if (isPrimary) {
      cardClass += ' is-attending';
    } else if (isAttending) {
      cardClass += ' is-attending-secondary';
    } else if (isDone) {
      cardClass += ' is-completed';
    }
    
    card.className = cardClass;

    let actionsHtml = '';
    if (isCompleted) {
      actionsHtml = `
        <div class="hostess-card-actions">
          <div class="hostess-card-actions-row" style="gap: 8px;">
            <span class="completed-badge" style="flex: 1; justify-content: center; text-align: center;">✓ Salida dada</span>
            <button class="action-btn reattend-btn" style="flex: 1.2;" onclick="setAttending('${app.FOLIO_CITA}')">Atender</button>
            <button class="action-btn queue-return-btn" style="flex: 1.2;" onclick="setRegresarFila('${app.FOLIO_CITA}')">Regresar a fila</button>
          </div>
        </div>
      `;
    } else if (isNoShow) {
      actionsHtml = `
        <div class="hostess-card-actions">
          <div class="hostess-card-actions-row" style="gap: 8px;">
            <span class="no-show-badge" style="flex: 1; justify-content: center; text-align: center;">✗ No asistió</span>
            <button class="action-btn reattend-btn" style="flex: 1.2;" onclick="setAttending('${app.FOLIO_CITA}')">Atender</button>
            <button class="action-btn queue-return-btn" style="flex: 1.2;" onclick="setRegresarFila('${app.FOLIO_CITA}')">Regresar a fila</button>
          </div>
        </div>
      `;
    } else if (isPrimary) {
      actionsHtml = `
        <div class="hostess-card-actions">
          <div class="hostess-card-actions-row">
            <span class="status-badge active-signage"><span class="pulse-dot"></span> En Pantalla</span>
          </div>
          <div class="hostess-card-actions-row" style="gap: 8px;">
            <button class="action-btn exit-btn" style="flex: 1.5;" onclick="setSalida('${app.FOLIO_CITA}')">Vehículo recibido</button>
            <button class="action-btn queue-return-btn" style="flex: 1.2;" onclick="setRegresarFila('${app.FOLIO_CITA}')">Regresar a fila</button>
          </div>
        </div>
      `;
    } else if (isAttending) {
      actionsHtml = `
        <div class="hostess-card-actions">
          <div class="hostess-card-actions-row">
            <span class="status-badge attending-status"><span class="pulse-dot"></span> Atendiendo</span>
          </div>
          <div class="hostess-card-actions-row" style="gap: 8px;">
            <button class="action-btn screen-btn" style="flex: 1.2;" onclick="setAttending('${app.FOLIO_CITA}')">En Pantalla</button>
            <button class="action-btn exit-btn" style="flex: 1.2;" onclick="setSalida('${app.FOLIO_CITA}')">Vehículo recibido</button>
            <button class="action-btn queue-return-btn" style="flex: 1.2;" onclick="setRegresarFila('${app.FOLIO_CITA}')">Regresar a fila</button>
          </div>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="hostess-card-actions">
          <div class="hostess-card-actions-row" style="gap: 8px;">
            <button class="attend-btn" style="flex: 2;" onclick="setAttending('${app.FOLIO_CITA}')">Atender</button>
            <button class="action-btn noshow-btn" style="flex: 1;" onclick="setNoShow('${app.FOLIO_CITA}')">No Asistió</button>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="hostess-card-top">
        <div class="hostess-card-time">${app.HORA_CITA}</div>
        <div class="hostess-card-details">
          <div class="hostess-card-name">${toTitleCase(app.NOMBRE)}</div>
          <div class="hostess-card-meta">
            <div class="meta-row">
              <svg class="meta-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.27-3.82c.14-.4.52-.68.96-.68h9.54c.44 0 .82.28.96.68L19 11H5z"/></svg>
              <span class="vehicle">${toTitleCase(app.MODELO)} ${app.ANO || ''}</span>
            </div>
            <div class="meta-row">
              <svg class="meta-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <span class="advisor">${toTitleCase(app.ASESOR_SERVICIO) || 'Sin asignar'}</span>
            </div>
          </div>
        </div>
      </div>
      ${actionsHtml}
    `;

    if (isDone) {
      if (completedList) {
        completedList.appendChild(card);
        completedCount++;
      }
    } else if (isPrimary || isAttending) {
      if (activeList) {
        activeList.appendChild(card);
        activeScreenCount++;
      }
    } else {
      if (container) {
        container.appendChild(card);
        pendingCount++;
      }
    }
  });

  // Mostrar/Ocultar la sección activa
  if (activeSection) {
    activeSection.style.display = activeScreenCount > 0 ? 'block' : 'none';
  }

  // Actualizar el contador del acordeón
  const countBadge = document.getElementById('completed-count-badge');
  if (countBadge) {
    countBadge.textContent = completedCount;
  }

  // Mostrar u ocultar el acordeón completo si hay citas completadas
  if (completedSection) {
    completedSection.style.display = completedCount > 0 ? 'block' : 'none';
  }

  // Sincronizar el estado de apertura/cierre del acordeón
  const completedContent = document.getElementById('completed-accordion-content');
  const completedArrow = document.getElementById('completed-accordion-arrow');
  if (completedContent) {
    completedContent.style.display = completedExpanded ? 'block' : 'none';
  }
  if (completedArrow) {
    if (completedExpanded) {
      completedArrow.classList.add('is-expanded');
    } else {
      completedArrow.classList.remove('is-expanded');
    }
  }

  // Si no hay citas pendientes en la fila de espera
  if (pendingCount === 0 && container) {
    if (activeScreenCount > 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No hay más citas en espera</h3>
          <p>Todas las citas restantes están siendo atendidas o están en pantalla.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Todas las citas atendidas</h3>
          <p>Has finalizado la atención de todas las citas de hoy.</p>
        </div>
      `;
    }
  }
}

/* ── ACCIONES ──────────────────────────────────────────────────────────── */

window.setAttending = function(folio) {
  if (!HostessState.selectedAgency) return;

  const app = HostessState.appointments.find(a => a.FOLIO_CITA === folio);
  const nombreCita = app ? app.NOMBRE : '';
  const isAttending = HostessState.attendingFolios && HostessState.attendingFolios.includes(folio);
  
  const confirmMsg = isAttending
    ? (nombreCita ? `¿Desea colocar la cita de ${toTitleCase(nombreCita)} en la pantalla principal?` : '¿Desea colocar esta cita en pantalla?')
    : (nombreCita ? `¿Desea iniciar la atención de la cita para ${toTitleCase(nombreCita)}?` : '¿Desea iniciar la atención de esta cita?');

  showConfirmModal(isAttending ? 'Poner en Pantalla' : 'Iniciar Atención', confirmMsg).then(confirmed => {
    if (!confirmed) return;

    const url = '/api/atender';
    const payload = {
      agencia: HostessState.selectedAgency,
      folio: folio
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(res => {
        if (res.success) {
          loadAppointments();
        }
      })
      .catch(err => {
        console.error('[Hostess] Error al atender cita:', err);
        alert('Hubo un error al marcar la cita como atendida. Por favor, reintenta.');
      });
  });
};

window.setSalida = function(folio) {
  if (!HostessState.selectedAgency) return;

  const app = HostessState.appointments.find(a => a.FOLIO_CITA === folio);
  const nombreCita = app ? app.NOMBRE : '';
  const confirmMsg = nombreCita
    ? `¿Desea marcar como recibido el vehículo para la cita de ${toTitleCase(nombreCita)}?`
    : '¿Desea marcar esta cita como vehículo recibido?';

  showConfirmModal('Vehículo Recibido', confirmMsg).then(confirmed => {
    if (!confirmed) return;

    const url = '/api/atender';
    const payload = {
      agencia: HostessState.selectedAgency,
      folio: folio,
      action: 'salida'
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(res => {
        if (res.success) {
          loadAppointments();
        }
      })
      .catch(err => {
        console.error('[Hostess] Error al marcar vehículo recibido:', err);
        alert('Hubo un error al marcar el vehículo como recibido. Por favor, reintenta.');
      });
  });
};

window.setNoShow = function(folio) {
  if (!HostessState.selectedAgency) return;

  const app = HostessState.appointments.find(a => a.FOLIO_CITA === folio);
  const nombreCita = app ? app.NOMBRE : '';
  const confirmMsg = nombreCita
    ? `¿Desea marcar a ${toTitleCase(nombreCita)} como "No asistió"?`
    : '¿Desea marcar esta cita como "No asistió"?';

  showConfirmModal('Marcar Inasistencia', confirmMsg).then(confirmed => {
    if (!confirmed) return;

    const url = '/api/atender';
    const payload = {
      agencia: HostessState.selectedAgency,
      folio: folio,
      action: 'no-asistio'
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(res => {
        if (res.success) {
          loadAppointments();
        }
      })
      .catch(err => {
        console.error('[Hostess] Error al marcar cita como no asistida:', err);
        alert('Hubo un error al marcar la cita como no asistida. Por favor, reintenta.');
      });
  });
};

window.setRegresarFila = function(folio) {
  if (!HostessState.selectedAgency) return;

  const app = HostessState.appointments.find(a => a.FOLIO_CITA === folio);
  const nombreCita = app ? app.NOMBRE : '';
  const confirmMsg = nombreCita
    ? `¿Desea regresar la cita de ${toTitleCase(nombreCita)} a la fila de pendientes?`
    : '¿Desea regresar esta cita a la fila de pendientes?';

  showConfirmModal('Regresar a Fila', confirmMsg).then(confirmed => {
    if (!confirmed) return;

    const url = '/api/atender';
    const payload = {
      agencia: HostessState.selectedAgency,
      folio: folio,
      action: 'regresar-a-fila'
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(res => {
        if (res.success) {
          loadAppointments();
        }
      })
      .catch(err => {
        console.error('[Hostess] Error al regresar cita a la fila:', err);
        alert('Hubo un error al regresar la cita a la fila. Por favor, reintenta.');
      });
  });
};

/* ── AUXILIARES ────────────────────────────────────────────────────────── */

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
