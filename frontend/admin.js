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

document.addEventListener('DOMContentLoaded', initAdmin);

function initAdmin() {
  renderAgencyGrid();
  setupCopyButtons();
}

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
  // Deseleccionar anterior
  if (selectedAgency) {
    const prevCard = document.getElementById(`card-${selectedAgency.replace(/\s+/g, '_')}`);
    if (prevCard) prevCard.classList.remove('selected');
  }

  selectedAgency = agencyKey;

  // Seleccionar actual
  const card = document.getElementById(`card-${agencyKey.replace(/\s+/g, '_')}`);
  if (card) card.classList.add('selected');

  // Generar URLs
  const baseUrl = window.location.origin;
  const directLink = `${baseUrl}/index.html?agencia=${encodeURIComponent(agencyKey)}`;
  const iframeCode = `<iframe src="${directLink}" width="100%" height="700" frameborder="0" style="border:none; border-radius:12px;"></iframe>`;

  // Asignar a inputs
  document.getElementById('link-direct').value = directLink;
  document.getElementById('link-iframe').value = iframeCode;

  // Actualizar Vista Previa
  document.getElementById('preview-frame').src = directLink;

  // Mostrar contenedor
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
      // Fallback si falla navigator.clipboard
      alert('No se pudo copiar automáticamente. Por favor selecciona el texto del campo y cópialo manualmente.');
    });
}
