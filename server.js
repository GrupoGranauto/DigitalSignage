/**
 * Digital Signage - Servidor de Citas de Servicio
 *
 * Lee la tabla de BigQuery configurada en .env (BQ_TABLE).
 * Para cambiar entre tabla de prueba y producción, edita .env y reinicia.
 */

require('dotenv').config();

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
const KEY_FILE     = path.join(__dirname, 'service-account.json');

// Parsear proyecto, dataset y tabla desde BQ_TABLE (formato: project.dataset.table)
const [GCP_PROJECT, DATASET_ID, TABLE_ID] = BQ_TABLE.split('.');

const BIGQUERY_QUERY = `
  SELECT
    FOLIO_CITA,
    HORA_CITA,
    NOMBRE,
    MODELO,
    CAST(ANO AS STRING) AS ANO,
    ASESOR_SERVICIO
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

  if (!fs.existsSync(KEY_FILE)) {
    console.error(`\n[ERROR] No se encontró: ${KEY_FILE}`);
    console.error('  → Coloca tu archivo JSON de Service Account y renómbralo a service-account.json\n');
    return null;
  }

  bqClient = new BigQuery({ projectId: GCP_PROJECT, keyFilename: KEY_FILE });
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
    ASESOR_SERVICIO: String(r.ASESOR_SERVICIO || '')
  }));

  cache = { data, timestamp: now };
  return data;
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
  '.jpg':  'image/jpeg'
};

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/citas-servicio' && req.method === 'GET') {
    try {
      const data = await fetchCitas();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('[ERROR API]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  let filePath = '.' + decodeURIComponent(req.url.split('?')[0]);
  if (filePath === './') filePath = './index.html';

  console.log(`[HTTP] Petición: ${req.url} -> filePath: ${filePath}`);

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error(`[HTTP] Error al leer archivo ${filePath}:`, err.code);
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

  if (!fs.existsSync(KEY_FILE)) {
    console.warn('\n  ⚠️  AVISO: No se encontró service-account.json');
    console.warn('     La API fallará hasta que agregues las credenciales.\n');
  } else {
    console.log('\n  ✅ Credenciales : service-account.json\n');
  }
});
