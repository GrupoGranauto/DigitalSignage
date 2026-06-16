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

document.addEventListener('DOMContentLoaded', initHostess);

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

function initHostess() {
  document.getElementById('change-agency-button').addEventListener('click', clearAgency);
  
  const toggleBtn = document.getElementById('completed-accordion-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleCompletedSection);
  }
  
  if (HostessState.selectedAgency) {
    showPanel();
  } else {
    showSelectionGrid();
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

  container.innerHTML = '';
  if (completedList) completedList.innerHTML = '';

  if (HostessState.appointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Sin citas para hoy</h3>
        <p>No se encontraron citas de servicio programadas para esta agencia el día de hoy.</p>
      </div>
    `;
    if (completedSection) completedSection.style.display = 'none';
    return;
  }

  const attendingFolios = HostessState.attendingFolios || [];
  const completedFolios = HostessState.completedFolios || [];
  const noShowFolios = HostessState.noShowFolios || [];
  const activeFolio = HostessState.activeFolio;

  let activeCount = 0;
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
            <div class="meta-row"><span class="meta-label">Vehículo:</span> <span class="vehicle">${toTitleCase(app.MODELO)} ${app.ANO || ''}</span></div>
            <div class="meta-row"><span class="meta-label">Asesor:</span> <span class="advisor">${toTitleCase(app.ASESOR_SERVICIO) || 'Sin asignar'}</span></div>
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
    } else {
      container.appendChild(card);
      activeCount++;
    }
  });

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

  // Si no hay citas activas, mostrar empty state amigable en la lista principal
  if (activeCount === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Todas las citas atendidas</h3>
        <p>Has finalizado la atención de todas las citas de hoy.</p>
      </div>
    `;
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
