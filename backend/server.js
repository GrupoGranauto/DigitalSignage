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
const crypto = require('crypto');
const https  = require('https');
const { BigQuery } = require('@google-cloud/bigquery');
const nodemailer = require('nodemailer');

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN (desde .env)
// ──────────────────────────────────────────────────────────────────────────────

const PORT         = parseInt(process.env.PORT         || '8080');
const CACHE_MIN    = parseInt(process.env.CACHE_MINUTES || '5');
const BQ_TABLE     = process.env.BQ_TABLE || 'base-maestra-gn.Respaldo.tab_respaldo_master_citas';
const KEY_FILE     = path.join(__dirname, '../service-account.json');
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const STATE_FILE   = path.join(__dirname, 'state.json');
const USERS_FILE   = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS DE PERSISTENCIA Y SEGURIDAD
// ──────────────────────────────────────────────────────────────────────────────

function loadJSON(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`[Persistencia] Error al leer ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Persistencia] Error al escribir ${filePath}:`, err.message);
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return checkHash === hash;
}

function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(payload);
          } else {
            reject(new Error(payload.error_description || 'Invalid token'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.session_id;
  if (!sessionId) return null;

  const sessions = loadJSON(SESSIONS_FILE, {});
  const session = sessions[sessionId];
  if (!session) return null;

  if (Date.now() > session.expires) {
    // Limpiar sesión expirada
    delete sessions[sessionId];
    saveJSON(SESSIONS_FILE, sessions);
    return null;
  }

  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.id === session.userId);
  return user || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// SERVICIO DE CORREO (SMTP / Google Apps Script)
// ──────────────────────────────────────────────────────────────────────────────

const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

async function getTransporter() {
  let hostIp = 'smtp.gmail.com';
  try {
    const dns = require('dns');
    const ipList = await dns.promises.resolve4('smtp.gmail.com');
    if (ipList && ipList.length > 0) {
      hostIp = ipList[0] || 'smtp.gmail.com';
      console.log(`📡 SMTP Resolved via IPv4 DNS: ${hostIp}`);
    }
  } catch (e) {
    console.error('DNS IPv4 resolution failed, falling back to default hostname:', e.message);
  }

  return nodemailer.createTransport({
    host: hostIp,
    port: 587,
    secure: false,
    name: 'autoinsights.mx',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    tls: {
      servername: 'smtp.gmail.com'
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
  });
}

async function sendResetPasswordEmail(to, code) {
  const subject = 'Código de recuperación de contraseña';
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; border: 1px solid #eef2f6; border-radius: 20px; background-color: #ffffff; box-shadow: 0 10px 25px rgba(0,0,0,0.03);">
        <div style="text-align: center; margin-bottom: 35px;">
            <img src="https://satisfaccion.autoinsights.mx/AUTOINSIGHTS-LOGO-01.png" alt="AutoInsights" style="width: 100%; max-width: 320px; height: auto; object-fit: contain; display: block; margin: 0 auto;" />
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 30px;">
            <h3 style="color: #0f172a; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; font-family: 'Segoe UI', system-ui, sans-serif;">Recuperación de Contraseña</h3>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 20px;">Hola,</p>
            <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 30px;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Utiliza el siguiente código único de verificación para completar el proceso:</p>
            
            <div style="text-align: center; margin: 35px 0;">
                <span style="display: inline-block; background-color: #f8fafc; color: #c11030; font-size: 38px; font-weight: 800; letter-spacing: 8px; padding: 18px 36px; border-radius: 14px; border: 1px dashed #cbd5e1; font-family: monospace;">${code}</span>
            </div>

            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 6px; margin-top: 30px;">
                <p style="font-size: 13px; color: #b45309; line-height: 1.6; margin: 0;">
                    <strong>Importante:</strong> Este código es de uso único y expirará automáticamente en 10 minutos. Si no has solicitado este cambio, por favor ignora este correo de forma segura.
                </p>
            </div>
        </div>
        <div style="border-top: 1px solid #f1f5f9; margin-top: 40px; padding-top: 20px; text-align: center;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">Este es un mensaje automático, por favor no respondas a este correo.</p>
            <p style="font-size: 11px; color: #cbd5e1; margin-top: 8px;">© ${new Date().getFullYear()} AutoInsights. Todos los derechos reservados.</p>
        </div>
    </div>
  `;

  if (GOOGLE_SCRIPT_URL) {
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html })
      });
      const resText = await response.text();
      let resData = {};
      try {
        resData = JSON.parse(resText);
      } catch (e) {
        throw new Error("Invalid response from Apps Script: " + resText.slice(0, 200));
      }

      if (resData.success) {
        console.log("📧 Correo de restablecimiento enviado via Google Apps Script a: " + to);
        return { success: true, info: resData };
      } else {
        console.warn("⚠️ Google Apps Script falló al enviar:", resData.error);
      }
    } catch (err) {
      console.error("Error enviando correo via Google Apps Script:", err.message);
    }
  }

  if (SMTP_USER && SMTP_PASS) {
    try {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: '"AutoInsights Notificaciones" <' + SMTP_USER + '>',
        to,
        subject,
        html
      });
      console.log("Correo de restablecimiento enviado a: " + to);
      return { success: true, info };
    } catch (error) {
      console.error("Error enviando correo de restablecimiento via SMTP:", error.message);
      return { success: false, error: error.message };
    }
  } else {
    console.warn("⚠️ No se configuró SMTP ni GOOGLE_SCRIPT_URL. El correo no se enviará de forma real.");
    return { success: true, mock: true };
  }
}

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

  // ──────────────────────────────────────────────────────────────────────────────
  // ENDPOINTS DE AUTENTICACIÓN
  // ──────────────────────────────────────────────────────────────────────────────

  if (pathname === '/api/auth/config' && req.method === 'GET') {
    setCorsHeaders(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));
    return;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { name, email, password, picture } = JSON.parse(body);
        if (!name || !email || !password) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Todos los campos son obligatorios' }));
          return;
        }

        const users = loadJSON(USERS_FILE, []);
        const emailLower = email.trim().toLowerCase();
        if (users.find(u => u.email.toLowerCase() === emailLower)) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'El correo electrónico ya está registrado' }));
          return;
        }

        const { salt, hash } = hashPassword(password);
        const isFirst = users.length === 0;
        const isInitialAdmin = process.env.INITIAL_ADMIN_EMAIL && (emailLower === process.env.INITIAL_ADMIN_EMAIL.trim().toLowerCase());
        const shouldBeAdmin = isFirst || isInitialAdmin;

        const newUser = {
          id: crypto.randomUUID(),
          name: name.trim(),
          email: emailLower,
          salt: salt,
          passwordHash: hash,
          picture: picture || 'images/FotoPerfil.png',
          role: shouldBeAdmin ? 'admin' : null,
          agency: null,
          status: shouldBeAdmin ? 'approved' : 'pending',
          method: 'normal',
          createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveJSON(USERS_FILE, users);

        setCorsHeaders(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: shouldBeAdmin
            ? 'Usuario administrador registrado y aprobado automáticamente.'
            : 'Usuario registrado con éxito. Su cuenta está pendiente de aprobación.'
        }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { email, password } = JSON.parse(body);
        if (!email || !password) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Correo y contraseña obligatorios' }));
          return;
        }

        const users = loadJSON(USERS_FILE, []);
        const emailLower = email.trim().toLowerCase();
        const user = users.find(u => u.email.toLowerCase() === emailLower);

        if (!user) {
          setCorsHeaders(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
          return;
        }

        if (!user.passwordHash || !user.salt) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Este usuario se registró con Google. Usa "Continuar con Google".' }));
          return;
        }

        if (!verifyPassword(password, user.salt, user.passwordHash)) {
          setCorsHeaders(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Credenciales incorrectas' }));
          return;
        }

        if (user.status === 'pending') {
          setCorsHeaders(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tu cuenta está pendiente de aprobación por el administrador.' }));
          return;
        }

        if (user.status === 'rejected') {
          setCorsHeaders(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tu cuenta ha sido rechazada.' }));
          return;
        }

        const sessionId = crypto.randomBytes(32).toString('hex');
        const sessions = loadJSON(SESSIONS_FILE, {});
        sessions[sessionId] = {
          userId: user.id,
          expires: Date.now() + 24 * 60 * 60 * 1000
        };
        saveJSON(SESSIONS_FILE, sessions);

        setCorsHeaders(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `session_id=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
        });
        res.end(JSON.stringify({
          success: true,
          user: { id: user.id, name: user.name, picture: user.picture, role: user.role, agency: user.agency }
        }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/google' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { credential } = JSON.parse(body);
        if (!credential) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ID token de Google requerido' }));
          return;
        }

        let payload;
        try {
          payload = await verifyGoogleToken(credential);
        } catch (verifyErr) {
          setCorsHeaders(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Token de Google inválido: ' + verifyErr.message }));
          return;
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (clientId && payload.aud !== clientId) {
          setCorsHeaders(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'El client ID del token no coincide' }));
          return;
        }

        const emailLower = payload.email.toLowerCase();
        const users = loadJSON(USERS_FILE, []);
        let user = users.find(u => u.email.toLowerCase() === emailLower);

        const isFirst = users.length === 0;
        const isInitialAdmin = process.env.INITIAL_ADMIN_EMAIL && (emailLower === process.env.INITIAL_ADMIN_EMAIL.trim().toLowerCase());
        const shouldBeAdmin = isFirst || isInitialAdmin;

        if (!user) {
          user = {
            id: crypto.randomUUID(),
            name: payload.name || '',
            email: emailLower,
            salt: '',
            passwordHash: '',
            picture: payload.picture || 'images/FotoPerfil.png',
            role: shouldBeAdmin ? 'admin' : null,
            agency: null,
            status: shouldBeAdmin ? 'approved' : 'pending',
            method: 'google',
            createdAt: new Date().toISOString()
          };
          users.push(user);
          saveJSON(USERS_FILE, users);
        } else if (user.method !== 'google') {
          user.method = 'google';
          if (payload.picture && !user.picture) {
            user.picture = payload.picture;
          }
          saveJSON(USERS_FILE, users);
        }

        if (user.status === 'pending') {
          setCorsHeaders(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tu cuenta está pendiente de aprobación por el administrador.' }));
          return;
        }

        if (user.status === 'rejected') {
          setCorsHeaders(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tu cuenta ha sido rechazada.' }));
          return;
        }

        const sessionId = crypto.randomBytes(32).toString('hex');
        const sessions = loadJSON(SESSIONS_FILE, {});
        sessions[sessionId] = {
          userId: user.id,
          expires: Date.now() + 24 * 60 * 60 * 1000
        };
        saveJSON(SESSIONS_FILE, sessions);

        setCorsHeaders(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': `session_id=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`
        });
        res.end(JSON.stringify({
          success: true,
          user: { id: user.id, name: user.name, picture: user.picture, role: user.role, agency: user.agency }
        }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/forgot-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { email } = JSON.parse(body);
        if (!email) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'El correo electrónico es obligatorio' }));
          return;
        }

        const users = loadJSON(USERS_FILE, []);
        const emailLower = email.trim().toLowerCase();
        const userIndex = users.findIndex(u => u.email.toLowerCase() === emailLower);

        if (userIndex === -1) {
          setCorsHeaders(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
          return;
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        users[userIndex].resetToken = code;
        users[userIndex].resetTokenExpires = Date.now() + 10 * 60 * 1000; // 10 minutos
        saveJSON(USERS_FILE, users);

        // Enviar el correo en segundo plano
        sendResetPasswordEmail(users[userIndex].email, code).catch(err => {
          console.error('❌ Error enviando correo de restablecimiento:', err.message);
        });

        setCorsHeaders(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Código de verificación enviado con éxito.' }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { email, token, password } = JSON.parse(body);
        if (!email || !token || !password) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Todos los campos son obligatorios' }));
          return;
        }

        const users = loadJSON(USERS_FILE, []);
        const emailLower = email.trim().toLowerCase();
        const userIndex = users.findIndex(u => u.email.toLowerCase() === emailLower);

        if (userIndex === -1) {
          setCorsHeaders(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
          return;
        }

        const user = users[userIndex];
        if (!user.resetToken || user.resetToken !== token || !user.resetTokenExpires || user.resetTokenExpires < Date.now()) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Código inválido, expirado o ya utilizado' }));
          return;
        }

        // Generar nueva contraseña cifrada
        const { salt, hash } = hashPassword(password);
        users[userIndex].salt = salt;
        users[userIndex].passwordHash = hash;
        users[userIndex].resetToken = null;
        users[userIndex].resetTokenExpires = null;
        users[userIndex].method = 'normal'; // Asegurar que pueda entrar con método normal si antes era otro
        saveJSON(USERS_FILE, users);

        setCorsHeaders(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.' }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      setCorsHeaders(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autenticado' }));
      return;
    }
    setCorsHeaders(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: { id: user.id, name: user.name, email: user.email, picture: user.picture, role: user.role, agency: user.agency }
    }));
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const sessionId = cookies.session_id;
    if (sessionId) {
      const sessions = loadJSON(SESSIONS_FILE, {});
      delete sessions[sessionId];
      saveJSON(SESSIONS_FILE, sessions);
    }
    setCorsHeaders(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // ENDPOINTS DE ADMINISTRACIÓN (SOLO ADMIN)
  // ──────────────────────────────────────────────────────────────────────────────

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    const user = getAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      setCorsHeaders(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Acceso denegado' }));
      return;
    }
    const users = loadJSON(USERS_FILE, []);
    const cleanUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      picture: u.picture,
      role: u.role,
      agency: u.agency,
      status: u.status,
      method: u.method,
      createdAt: u.createdAt
    }));
    setCorsHeaders(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cleanUsers));
    return;
  }

  if (pathname === '/api/admin/approve' && req.method === 'POST') {
    const currentUser = getAuthenticatedUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      setCorsHeaders(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Acceso denegado' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { userId, role, agency } = JSON.parse(body);
        if (!userId || !role) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ID de usuario y rol requeridos' }));
          return;
        }

        if (role !== 'admin' && role !== 'hostess') {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Rol inválido. Debe ser admin o hostess' }));
          return;
        }

        if (role === 'hostess' && !agency) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La agencia es requerida para el rol de hostess' }));
          return;
        }

        const users = loadJSON(USERS_FILE, []);
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
          setCorsHeaders(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
          return;
        }

        users[userIndex].role = role;
        users[userIndex].agency = role === 'hostess' ? agency.trim().toUpperCase() : null;
        users[userIndex].status = 'approved';
        saveJSON(USERS_FILE, users);

        setCorsHeaders(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Usuario aprobado con éxito' }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/admin/reject' && req.method === 'POST') {
    const currentUser = getAuthenticatedUser(req);
    if (!currentUser || currentUser.role !== 'admin') {
      setCorsHeaders(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Acceso denegado' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { userId } = JSON.parse(body);
        if (!userId) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ID de usuario requerido' }));
          return;
        }

        if (userId === currentUser.id) {
          setCorsHeaders(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No puedes eliminarte a ti mismo' }));
          return;
        }

        let users = loadJSON(USERS_FILE, []);
        const userExists = users.some(u => u.id === userId);
        if (!userExists) {
          setCorsHeaders(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Usuario no encontrado' }));
          return;
        }

        users = users.filter(u => u.id !== userId);
        saveJSON(USERS_FILE, users);

        setCorsHeaders(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Usuario rechazado/eliminado con éxito' }));
      } catch (e) {
        setCorsHeaders(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error del servidor: ' + e.message }));
      }
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // ENDPOINTS DE CITAS EXISTENTES (CON PROTECCIÓN DE ROLES)
  // ──────────────────────────────────────────────────────────────────────────────

  if (pathname === '/api/citas-servicio' && req.method === 'GET') {
    try {
      const authUser = getAuthenticatedUser(req);
      const agencia = parsedUrl.searchParams.get('agencia');

      // Si es una hostess, solo puede ver la agencia asignada
      if (authUser && authUser.role === 'hostess') {
        const assignedAgency = authUser.agency.trim().toUpperCase();
        if (agencia) {
          const reqAgencyUpper = agencia.trim().toUpperCase();
          if (reqAgencyUpper !== assignedAgency) {
            setCorsHeaders(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Acceso denegado: solo puedes ver datos de la agencia ${authUser.agency}` }));
            return;
          }
        }
      }

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
    const authUser = getAuthenticatedUser(req);
    if (!authUser) {
      setCorsHeaders(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autenticado' }));
      return;
    }

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

        // Si es hostess, validar que sea su agencia asignada
        if (authUser.role === 'hostess') {
          const assignedAgency = authUser.agency.trim().toUpperCase();
          if (agencia.trim().toUpperCase() !== assignedAgency) {
            setCorsHeaders(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Acceso denegado: solo puedes realizar cambios en tu agencia asignada (${authUser.agency})` }));
            return;
          }
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
