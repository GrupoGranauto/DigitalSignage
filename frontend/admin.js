/**
 * Digital Signage - Administrador de Embeds
 * Generación de enlaces y previsualización
 */

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

let selectedAgency = null;

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('auth-verified', (e) => {
    const user = e.detail;
    setupUserProfile(user);
    initAdmin();
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
  if (roleEl) roleEl.textContent = 'Administrador';

  if (logoutBtn) {
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

function initAdmin() {
  renderAgencyGrid();
  setupCopyButtons();
  setupTabs();
  loadUsers();
}

function setupTabs() {
  const btnScreens = document.getElementById('tab-screens-btn');
  const btnUsers = document.getElementById('tab-users-btn');
  const secScreens = document.getElementById('section-screens');
  const secUsers = document.getElementById('section-users');

  if (!btnScreens || !btnUsers || !secScreens || !secUsers) return;

  btnScreens.addEventListener('click', () => {
    btnScreens.classList.add('active');
    btnUsers.classList.remove('active');
    secScreens.style.display = 'block';
    secUsers.style.display = 'none';
  });

  btnUsers.addEventListener('click', () => {
    btnUsers.classList.add('active');
    btnScreens.classList.remove('active');
    secScreens.style.display = 'none';
    secUsers.style.display = 'block';
    loadUsers();
  });
}

function loadUsers() {
  fetch('/api/admin/users')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(users => {
      renderUsers(users);
    })
    .catch(err => {
      console.error('[Admin Users] Error cargando usuarios:', err);
    });
}

function renderUsers(users) {
  const pendingContainer = document.getElementById('pending-users-list');
  const approvedContainer = document.getElementById('approved-users-list');

  if (!pendingContainer || !approvedContainer) return;

  pendingContainer.innerHTML = '';
  approvedContainer.innerHTML = '';

  const pendingUsers = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status === 'approved');

  // Renderizar Pendientes
  if (pendingUsers.length === 0) {
    pendingContainer.innerHTML = `<p class="no-users-msg" style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.95rem; padding: 24px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px;">No hay usuarios pendientes de aprobación.</p>`;
  } else {
    pendingUsers.forEach(user => {
      const card = document.createElement('div');
      card.className = 'user-card';
      
      const avatarSrc = user.picture || 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23cbd5e1"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>';
      const agencyOptions = AGENCIES.map(a => `<option value="${a.key}">${a.label}</option>`).join('');

      card.innerHTML = `
        <div class="user-card-header">
          <div class="user-card-avatar-container">
            <img src="${avatarSrc}" alt="${user.name}" class="user-card-avatar-img">
          </div>
          <div class="user-card-info">
            <div class="user-card-name">${user.name}</div>
            <div class="user-card-email">${user.email}</div>
            <div class="user-card-method">Registro: ${user.method === 'google' ? 'Google' : 'Normal'}</div>
          </div>
        </div>
        <div class="user-card-actions-form">
          <div class="form-group-row">
            <label>Rol:</label>
            <select class="user-role-select" id="role-select-${user.id}">
              <option value="hostess" selected>Hostess</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div class="form-group-row" id="agency-select-row-${user.id}">
            <label>Agencia:</label>
            <select class="user-agency-select" id="agency-select-${user.id}">
              ${agencyOptions}
            </select>
          </div>
          <div class="user-card-buttons">
            <button class="user-btn approve-btn" onclick="submitApprove('${user.id}')">Aprobar</button>
            <button class="user-btn reject-btn" onclick="submitReject('${user.id}', '${user.name}')">Rechazar</button>
          </div>
        </div>
      `;

      pendingContainer.appendChild(card);

      // Mostrar/Ocultar selector de agencia dinámicamente según el rol
      const roleSelect = card.querySelector(`#role-select-${user.id}`);
      const agencyRow = card.querySelector(`#agency-select-row-${user.id}`);
      roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'admin') {
          agencyRow.style.display = 'none';
        } else {
          agencyRow.style.display = 'flex';
        }
      });
    });
  }

  // Renderizar Aprobados
  if (approvedUsers.length === 0) {
    approvedContainer.innerHTML = `<p class="no-users-msg" style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.4); font-size: 0.95rem; padding: 24px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px;">No hay usuarios aprobados en el sistema.</p>`;
  } else {
    approvedUsers.forEach(user => {
      const card = document.createElement('div');
      card.className = 'user-card approved';
      
      const avatarSrc = (user.picture || 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23cbd5e1"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>').replace(/"/g, "'");
      const roleLabel = user.role === 'admin' ? 'Administrador' : 'Hostess';
      const agencyLabel = user.role === 'hostess' ? (AGENCIES.find(a => a.key === user.agency)?.label || user.agency) : 'N/A';
      
      let actionButtonsHtml = '';
      if (window.currentUser && user.id !== window.currentUser.id) {
        actionButtonsHtml = `
          <button class="user-btn edit-btn" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; margin-right: 8px;" onclick="startEditUser('${user.id}', '${user.role}', '${user.agency || ''}')">Editar</button>
          <button class="user-btn reject-btn" onclick="submitReject('${user.id}', '${user.name}')">Eliminar</button>
        `;
      } else {
        actionButtonsHtml = `<span class="self-badge">Tú (Actual)</span>`;
      }

      card.innerHTML = `
        <div class="user-card-header">
          <div class="user-card-avatar-container">
            <img src="${avatarSrc}" alt="${user.name}" class="user-card-avatar-img">
          </div>
          <div class="user-card-info">
            <div class="user-card-name">${user.name}</div>
            <div class="user-card-email">${user.email}</div>
            <div class="user-card-meta-row" id="user-meta-${user.id}">
              <span class="user-role-badge ${user.role}">${roleLabel}</span>
              ${user.role === 'hostess' ? `<span class="user-agency-badge">${agencyLabel}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="user-card-footer" id="user-footer-${user.id}">
          ${actionButtonsHtml}
        </div>
      `;

      approvedContainer.appendChild(card);
    });
  }
}

window.submitApprove = function(userId) {
  const roleSelect = document.getElementById(`role-select-${userId}`);
  const agencySelect = document.getElementById(`agency-select-${userId}`);

  const role = roleSelect.value;
  const agency = role === 'hostess' ? agencySelect.value : null;

  fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role, agency })
  })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data.success) {
        loadUsers();
      }
    })
    .catch(err => {
      console.error('[Admin Approve] Error:', err);
      alert('Error al aprobar usuario.');
    });
};

window.submitReject = function(userId, userName) {
  if (!confirm(`¿Estás seguro de que deseas rechazar/eliminar al usuario ${userName}?`)) {
    return;
  }

  fetch('/api/admin/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data.success) {
        loadUsers();
      }
    })
    .catch(err => {
      console.error('[Admin Reject] Error:', err);
      alert('Error al rechazar usuario.');
    });
};

function renderAgencyGrid() {
  const grid = document.getElementById('admin-agency-grid');
  grid.innerHTML = '';

  AGENCIES.forEach(agency => {
    const card = document.createElement('div');
    card.className = 'admin-agency-card';
    card.id = `card-${agency.key.replace(/\s+/g, '_')}`;
    card.innerHTML = `<h3>${agency.label}</h3>`;
    card.addEventListener('click', () => selectAgency(agency.key));
    grid.appendChild(card);
  });
}

function selectAgency(agencyKey) {
  if (selectedAgency) {
    const prevCard = document.getElementById(`card-${selectedAgency.replace(/\s+/g, '_')}`);
    if (prevCard) prevCard.classList.remove('selected');
  }

  selectedAgency = agencyKey;

  const card = document.getElementById(`card-${agencyKey.replace(/\s+/g, '_')}`);
  if (card) card.classList.add('selected');

  const baseUrl = window.location.origin;
  const directLink = `${baseUrl}/index.html?agencia=${encodeURIComponent(agencyKey)}`;
  const iframeCode = `<iframe src="${directLink}" width="100%" height="700" frameborder="0" style="border:none; border-radius:12px;"></iframe>`;

  document.getElementById('link-direct').value = directLink;
  document.getElementById('link-iframe').value = iframeCode;

  document.getElementById('preview-frame').src = directLink;

  document.getElementById('generator-box').style.display = 'block';
}

function setupCopyButtons() {
  const copyDirectBtn = document.getElementById('btn-copy-direct');
  const copyIframeBtn = document.getElementById('btn-copy-iframe');

  copyDirectBtn.addEventListener('click', () => {
    const input = document.getElementById('link-direct');
    copyToClipboard(input.value, copyDirectBtn, 'Copiar Enlace');
  });

  copyIframeBtn.addEventListener('click', () => {
    const input = document.getElementById('link-iframe');
    copyToClipboard(input.value, copyIframeBtn, 'Copiar Iframe');
  });
}

function copyToClipboard(text, buttonEl, originalText) {
  if (!text) return;
  
  navigator.clipboard.writeText(text)
    .then(() => {
      buttonEl.textContent = '¡Copiado!';
      buttonEl.classList.add('success');

      setTimeout(() => {
        buttonEl.textContent = originalText;
        buttonEl.classList.remove('success');
      }, 2000);
    })
    .catch(err => {
      console.error('[Admin] Error al copiar al portapapeles:', err);
      alert('No se pudo copiar automáticamente. Por favor selecciona el texto del campo y cópialo manualmente.');
    });
}

window.startEditUser = function(userId, currentRole, currentAgency) {
  const metaRow = document.getElementById(`user-meta-${userId}`);
  const footer = document.getElementById(`user-footer-${userId}`);
  if (!metaRow || !footer) return;

  const agencyOptions = AGENCIES.map(a => `<option value="${a.key}" ${a.key === currentAgency ? 'selected' : ''}>${a.label}</option>`).join('');

  metaRow.style.flexDirection = 'column';
  metaRow.style.alignItems = 'flex-start';
  metaRow.style.gap = '8px';
  metaRow.innerHTML = `
    <div class="form-group-row" style="width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px;">
      <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Rol:</label>
      <select class="user-role-select" id="edit-role-${userId}" style="max-width: 140px; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.8rem;">
        <option value="hostess" ${currentRole === 'hostess' ? 'selected' : ''}>Hostess</option>
        <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrador</option>
      </select>
    </div>
    <div class="form-group-row" id="edit-agency-row-${userId}" style="width: 100%; display: ${currentRole === 'admin' ? 'none' : 'flex'}; justify-content: space-between; align-items: center; gap: 8px;">
      <label style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Agencia:</label>
      <select class="user-agency-select" id="edit-agency-${userId}" style="max-width: 140px; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.8rem;">
        ${agencyOptions}
      </select>
    </div>
  `;

  // Controlar visibilidad de la agencia según el rol seleccionado
  const roleSelect = document.getElementById(`edit-role-${userId}`);
  const agencyRow = document.getElementById(`edit-agency-row-${userId}`);
  roleSelect.addEventListener('change', () => {
    if (roleSelect.value === 'admin') {
      agencyRow.style.display = 'none';
    } else {
      agencyRow.style.display = 'flex';
    }
  });

  footer.innerHTML = `
    <button class="user-btn approve-btn" style="margin-right: 8px;" onclick="saveEditUser('${userId}')">Guardar</button>
    <button class="user-btn reject-btn" onclick="loadUsers()">Cancelar</button>
  `;
};

window.saveEditUser = function(userId) {
  const roleSelect = document.getElementById(`edit-role-${userId}`);
  const agencySelect = document.getElementById(`edit-agency-${userId}`);

  const role = roleSelect.value;
  const agency = role === 'hostess' ? agencySelect.value : null;

  fetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role, agency })
  })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      if (data.success) {
        loadUsers();
      }
    })
    .catch(err => {
      console.error('[Admin Edit Save] Error:', err);
      alert('Error al guardar los cambios del usuario.');
    });
};
