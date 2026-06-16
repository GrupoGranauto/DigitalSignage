/**
 * Digital Signage - Servidor de Citas de Servicio
 *
 * Lee la tabla de BigQuery configurada en .env (BQ_TABLE).
 * Para cambiar entre tabla de prueba y producción, edita .env y reinicia.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { BigQuery } = require('@google-cloud/bigquery');

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN (desde .env)
// ──────────────────────────────────────────────────────────────────────────────

const PORT         = parseInt(process.env.PORT         || '8080');
const CACHE_MIN    = parseInt(process.env.CACHE_MINUTES || '5');
const BQ_TABLE     = process.env.BQ_TABLE || 'base-maestra-gn.Respaldo.tab_respaldo_master_citas';
const KEY_FILE     = path.join(__dirname, '../service-account.json');
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const STATE_FILE   = path.join(__dirname, 'state.json');

// Cargar estado
let activeState = { date: '', agencies: {} };

// Clientes conectados por SSE (agrupados por agencia en mayúsculas)
const sseClients = {};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      activeState = JSON.parse(content);
    }
  } catch (err) {
    console.error('[State] Error al cargar state.json:', err.message);
  }
  
  // Limpieza diaria si el día cambió (Zona horaria de México)
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
  if (activeState.date !== todayStr) {
    console.log(`[State] Nueva fecha detectada (${todayStr}). Reiniciando estado.`);
    activeState = { date: todayStr, agencies: {} };
    saveState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(activeState, null, 2), 'utf8');
  } catch (err) {
    console.error('[State] Error al guardar state.json:', err.message);
  }
}

function notifyAgencyUpdate(agencia) {
  if (!agencia) return;
  const keys = [agencia.trim().toUpperCase(), 'GLOBAL'];
  keys.forEach(key => {
    const clients = sseClients[key];
    if (clients && clients.length > 0) {
      console.log(`[SSE] Notificando actualización a ${clients.length} clientes en ${key}`);
      clients.forEach(client => {
        try {
          client.write('data: update\n\n');
        } catch (e) {
          console.error('[SSE] Error al notificar cliente:', e.message);
        }
      });
    }
  });
}

// Cargar estado inicialmente
loadState();

// Parsear proyecto, dataset y tabla desde BQ_TABLE (formato: project.dataset.table)
const [GCP_PROJECT] = BQ_TABLE.split('.');

const BIGQUERY_QUERY = `
  SELECT
    FOLIO_CITA,
    HORA_CITA,
    NOMBRE,
    MODELO,
    CAST(ANO AS STRING) AS ANO,
    ASESOR_SERVICIO,
    AGENCIA
  FROM
    \`${BQ_TABLE}\`
  WHERE
    FECHA_CITA = CURRENT_DATE('America/Mexico_City')
  ORDER BY
    HORA_CITA ASC
`;

// ──────────────────────────────────────────────────────────────────────────────
// CLIENTE BIGQUERY
// ──────────────────────────────────────────────────────────────────────────────

let bqClient = null;

function getBigQueryClient() {
  if (bqClient) return bqClient;

  let options = { projectId: GCP_PROJECT };

  if (process.env.GCP_CREDENTIALS_JSON) {
    try {
      let rawJson = process.env.GCP_CREDENTIALS_JSON;
      if (rawJson.startsWith('"') || rawJson.includes('\\"')) {
        try { rawJson = JSON.parse(rawJson); } catch (e) {}
      }
      options.credentials = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      console.log('[BigQuery] Usando credenciales desde la variable de entorno GCP_CREDENTIALS_JSON');
    } catch (e) {
      console.error('[ERROR] La variable GCP_CREDENTIALS_JSON no contiene un JSON válido:', e.message);
      return null;
    }
  }
  else if (fs.existsSync(KEY_FILE)) {
    options.keyFilename = KEY_FILE;
    console.log('[BigQuery] Usando credenciales desde el archivo service-account.json');
  }
  else {
    console.error(`\n[ERROR] No hay credenciales de BigQuery.`);
    return null;
  }

  bqClient = new BigQuery(options);
  console.log(`[BigQuery] Cliente listo — Proyecto: ${GCP_PROJECT}`);
  return bqClient;
}

// ──────────────────────────────────────────────────────────────────────────────
// CACHÉ EN MEMORIA
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_TTL = CACHE_MIN * 60 * 1000;
let cache = { data: null, timestamp: 0 };

async function fetchCitas() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    console.log('[API] Caché activo');
    return cache.data;
  }

  const bq = getBigQueryClient();
  if (!bq) throw new Error('Sin credenciales de BigQuery (falta service-account.json)');

  console.log(`[BigQuery] Consultando ${BQ_TABLE}...`);
  const [rows] = await bq.query({ query: BIGQUERY_QUERY, location: 'US' });
  console.log(`[BigQuery] ${rows.length} citas obtenidas`);

  const data = rows.map(r => ({
    FOLIO_CITA:      String(r.FOLIO_CITA      || ''),
    HORA_CITA:       String(r.HORA_CITA       || '').substring(0, 5),
    NOMBRE:          String(r.NOMBRE          || ''),
    MODELO:          String(r.MODELO          || ''),
    ANO:             String(r.ANO             || ''),
    ASESOR_SERVICIO: String(r.ASESOR_SERVICIO || ''),
    AGENCIA:         String(r.AGENCIA         || '')
  }));

  cache = { data, timestamp: now };
  return data;
}

async function getCitasFiltered(agenciaFilter) {
  loadState();

  const allCitas = await fetchCitas();

  // Filtrar si viene el parámetro de agencia
  let filtered = allCitas;
  if (agenciaFilter) {
    const filterUpper = agenciaFilter.trim().toUpperCase();
    filtered = allCitas.filter(c => {
      const ag = String(c.AGENCIA || '').trim().toUpperCase();
      
      // Normalización de PEÑASCO
      if (filterUpper === 'PEÑASCO' || filterUpper === 'PUERTO PEÑASCO') {
        return ag === 'PEÑASCO' || ag === 'PUERTO PEÑASCO';
      }
      // Normalización de AGUA PRIETA
      if (filterUpper === 'AGUAPRIETA' || filterUpper === 'AGUA PRIETA') {
        return ag === 'AGUAPRIETA' || ag === 'AGUA PRIETA';
      }
      
      return ag === filterUpper;
    });
  }

  // Obtener el folio activo para esta agencia (o GLOBAL si no filtra)
  const agencyKey = (agenciaFilter || 'GLOBAL').trim().toUpperCase();
  let agencyState = activeState.agencies[agencyKey];

  // Migración y normalización del estado de la agencia
  if (typeof agencyState === 'string') {
    agencyState = {
      primary: agencyState,
      attending: [agencyState],
      completed: [],
      noShows: []
    };
  } else if (!agencyState || typeof agencyState !== 'object') {
    agencyState = {
      primary: null,
      attending: [],
      completed: [],
      noShows: []
    };
  }

  // Asegurar que contengan los arrays correspondientes
  if (!Array.isArray(agencyState.attending)) agencyState.attending = agencyState.primary ? [agencyState.primary] : [];
  if (!Array.isArray(agencyState.completed)) agencyState.completed = [];
  if (!Array.isArray(agencyState.noShows)) agencyState.noShows = [];

  return {
    appointments: filtered,
    activeFolio: agencyState.primary || null,
    attendingFolios: agencyState.attending,
    completedFolios: agencyState.completed,
    noShowFolios: agencyState.noShows
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SERVIDOR HTTP
// ──────────────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.otf':  'font/otf',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2'
};

const server = http.createServer(async (req, res) => {
  // Helper para escribir headers de CORS
  const setCorsHeaders = (status, headers = {}) => {
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      ...headers
    });
  };

  if (req.method === 'OPTIONS') {
    setCorsHeaders(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/events' && req.method === 'GET') {
    const agencia = parsedUrl.searchParams.get('agencia');
    const agencyKey = (agencia || 'GLOBAL').trim().toUpperCase();

    // Establecer headers de SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Enviar primer mensaje ping para mantener conexión abierta
    res.write(':ok\n\n');

    if (!sseClients[agencyKey]) {
      sseClients[agencyKey] = [];
    }
    sseClients[agencyKey].push(res);
    console.log(`[SSE] Nuevo cliente conectado para agencia: ${agencyKey}. Total: ${sseClients[agencyKey].length}`);

    // Heartbeat cada 30 segundos
    const keepAliveInterval = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
      } catch (e) {
        // Ignorar si ya se cerró
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAliveInterval);
      if (sseClients[agencyKey]) {
        sseClients[agencyKey] = sseClients[agencyKey].filter(client => client !== res);
        console.log(`[SSE] Cliente desconectado para agencia: ${agencyKey}. Restantes: ${sseClients[agencyKey].length}`);
      }
    });
    return;
  }

  if (pathname === '/api/citas-servicio' && req.method === 'GET') {
    try {
      const agencia = parsedUrl.searchParams.get('agencia');
      const data = await getCitasFiltered(agencia);
      setCorsHeaders(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[ERROR API]', err.message);
      setCorsHeaders(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/api/atender' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { agencia, folio, action } = payload; // action puede ser 'atender' o 'salida'

        if (!agencia) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La agencia es requerida' }));
          return;
        }

        loadState();
        const agencyKey = agencia.trim().toUpperCase();
        let agencyState = activeState.agencies[agencyKey];

        // Migración/normalización del estado
        if (typeof agencyState === 'string') {
          agencyState = {
            primary: agencyState,
            attending: [agencyState],
            completed: [],
            noShows: []
          };
        } else if (!agencyState || typeof agencyState !== 'object') {
          agencyState = {
            primary: null,
            attending: [],
            completed: [],
            noShows: []
          };
        }

        if (!Array.isArray(agencyState.attending)) agencyState.attending = agencyState.primary ? [agencyState.primary] : [];
        if (!Array.isArray(agencyState.completed)) agencyState.completed = [];
        if (!Array.isArray(agencyState.noShows)) agencyState.noShows = [];

        const act = action || 'atender';

        if (act === 'atender') {
          if (folio) {
            // Agregar a atendiendo si no está
            if (!agencyState.attending.includes(folio)) {
              agencyState.attending.push(folio);
            }
            // Asignar como principal
            agencyState.primary = folio;
            // Remover de completados si estaba
            agencyState.completed = agencyState.completed.filter(f => f !== folio);
            // Remover de no-shows si estaba
            agencyState.noShows = agencyState.noShows.filter(f => f !== folio);
          }
        } else if (act === 'salida') {
          if (folio) {
            // Remover de atendiendo
            agencyState.attending = agencyState.attending.filter(f => f !== folio);
            // Agregar a completados
            if (!agencyState.completed.includes(folio)) {
              agencyState.completed.push(folio);
            }
            // Remover de no-shows si estaba
            agencyState.noShows = agencyState.noShows.filter(f => f !== folio);
            // Si el folio que sale era el principal, cambiar el principal al último restante en atendiendo
            if (agencyState.primary === folio) {
              agencyState.primary = agencyState.attending.length > 0 ? agencyState.attending[agencyState.attending.length - 1] : null;
            }
          }
        } else if (act === 'no-asistio') {
          if (folio) {
            // Remover de atendiendo
            agencyState.attending = agencyState.attending.filter(f => f !== folio);
            // Agregar a no-shows
            if (!agencyState.noShows.includes(folio)) {
              agencyState.noShows.push(folio);
            }
            // Remover de completados si estaba
            agencyState.completed = agencyState.completed.filter(f => f !== folio);
            // Si el folio que no asistió era el principal, cambiar el principal al último restante
            if (agencyState.primary === folio) {
              agencyState.primary = agencyState.attending.length > 0 ? agencyState.attending[agencyState.attending.length - 1] : null;
            }
          }
        } else if (act === 'regresar-a-fila') {
          if (folio) {
            // Remover de todos los estados activos/completados/no-shows
            agencyState.attending = agencyState.attending.filter(f => f !== folio);
            agencyState.completed = agencyState.completed.filter(f => f !== folio);
            agencyState.noShows = agencyState.noShows.filter(f => f !== folio);
            // Si el folio era el principal, cambiar al último restante de atendiendo
            if (agencyState.primary === folio) {
              agencyState.primary = agencyState.attending.length > 0 ? agencyState.attending[agencyState.attending.length - 1] : null;
            }
          }
        }

        activeState.agencies[agencyKey] = agencyState;
        saveState();

        console.log(`[State] Acción '${act}' ejecutada en Agencia ${agencyKey} para folio: ${folio}. Principal actual: ${agencyState.primary}`);

        // Notificar a las pantallas vía SSE
        notifyAgencyUpdate(agencyKey);

        setCorsHeaders(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({ 
          success: true, 
          activeFolio: agencyState.primary,
          attendingFolios: agencyState.attending,
          completedFolios: agencyState.completed,
          noShowFolios: agencyState.noShows
        }));
      } catch (err) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON malformado o error del servidor' }));
      }
    });
    return;
  }

  // Servir archivos estáticos desde frontend/
  let relativePath = decodeURIComponent(req.url.split('?')[0]);
  if (relativePath === '/') relativePath = '/index.html';

  const filePath = path.join(FRONTEND_DIR, relativePath);

  // Prevenir path traversal fuera de frontend/
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  console.log(`[HTTP] Petición: ${req.url} -> ${path.relative(path.join(__dirname, '..'), filePath)}`);

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code !== 'ENOENT') console.error(`[HTTP] Error al leer ${filePath}:`, err.code);
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(err.code === 'ENOENT' ? '404 No encontrado' : `Error: ${err.code}`);
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log('\n==========================================================');
  console.log('  Digital Signage — Servidor Activo');
  console.log(`  Frontend : http://localhost:${PORT}`);
  console.log(`  API      : http://localhost:${PORT}/api/citas-servicio`);
  console.log('==========================================================');
  console.log(`\n  📋 Tabla activa : ${BQ_TABLE}`);
  console.log(`  ⏱  Caché        : ${CACHE_MIN} minutos`);
  console.log(`  📁 Frontend     : ${FRONTEND_DIR}`);

  if (!fs.existsSync(KEY_FILE) && !process.env.GCP_CREDENTIALS_JSON) {
    console.warn('\n  ⚠️  AVISO: Faltan credenciales de BigQuery');
    console.warn('     La API fallará. Usa service-account.json o la variable GCP_CREDENTIALS_JSON.\n');
  } else {
    console.log('\n  ✅ Credenciales configuradas correctamente.\n');
  }
});
