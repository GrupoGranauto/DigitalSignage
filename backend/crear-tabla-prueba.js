/**
 * backend/crear-tabla-prueba.js
 *
 * Crea la tabla definida en BQ_TABLE (.env) en BigQuery
 * e inserta citas de prueba centradas en la hora actual.
 *
 * Uso:
 *   npm run setup-prueba
 *   node backend/crear-tabla-prueba.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const { BigQuery } = require('@google-cloud/bigquery');

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN (desde .env)
// ──────────────────────────────────────────────────────────────────────────────

const KEY_FILE = path.join(__dirname, '../service-account.json');

const BQ_TABLE   = process.env.BQ_TABLE || 'base-maestra-gn.Respaldo.tab_respaldo_master_citas_prueba';
const [PROJECT_ID, DATASET_ID, TABLE_ID] = BQ_TABLE.split('.');

if (!PROJECT_ID || !DATASET_ID || !TABLE_ID) {
  console.error(`[ERROR] BQ_TABLE en .env no tiene el formato correcto: proyecto.dataset.tabla\n  Valor actual: "${BQ_TABLE}"`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// DATOS ALEATORIOS
// ──────────────────────────────────────────────────────────────────────────────

const NOMBRES = [
  'Alejandro García Torres', 'María López Herrera', 'Carlos Martínez Ríos',
  'Ana Rodríguez Solis', 'Luis González Peña', 'Patricia Jiménez Vera',
  'Roberto Hernández Ruiz', 'Laura Sánchez Díaz', 'Miguel Flores Morales',
  'Sandra Torres Castillo', 'Fernando Ramos Vega', 'Claudia Cruz Mendoza',
  'Héctor Moreno Alvarado', 'Gabriela Ortiz Salinas', 'Jorge Reyes Campos',
  'Verónica Chávez Luna', 'Arturo Gutiérrez Ponce', 'Diana Vargas Núñez',
  'Ernesto Medina Rojas', 'Estela Aguilar Fuentes', 'Ramón Delgado Mora',
  'Irene Navarro Blanco', 'Raúl Cabrera Serrano', 'Mónica Espinoza Trejo',
  'Eduardo Romero Padilla', 'Norma Valdez Cisneros', 'Óscar Acosta Figueroa',
  'Leticia Miranda Bravo', 'Benjamín Contreras Prado', 'Silvia Domínguez Ávila'
];

const MODELOS = [
  'Toyota Corolla', 'Nissan Sentra', 'Chevrolet Aveo', 'Volkswagen Jetta',
  'Honda Civic', 'Mazda 3', 'Ford Focus', 'Hyundai Elantra',
  'Kia Rio', 'Seat Ibiza', 'Toyota RAV4', 'Nissan X-Trail',
  'Chevrolet Equinox', 'Ford Escape', 'Honda CR-V', 'Mazda CX-5',
  'Toyota Hilux', 'Nissan NP300', 'Ford Ranger', 'Chevrolet Colorado',
  'Volkswagen Tiguan', 'Hyundai Tucson', 'Kia Sportage', 'Suzuki Swift',
  'Renault Logan', 'Peugeot 208', 'FIAT Tipo', 'Audi A3',
  'BMW Serie 1', 'Mercedes-Benz Clase A'
];

const ASESORES = [
  'Carlos Sánchez', 'Mauricio Gómez', 'Alejandra Ruiz', 'Pedro Vargas', 'Sofía Mendoza'
];

const ANOS = ['2018', '2019', '2020', '2021', '2022', '2023', '2024'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pad(n) { return String(n).padStart(2, '0'); }

// ──────────────────────────────────────────────────────────────────────────────
// GENERAR CITAS
// ──────────────────────────────────────────────────────────────────────────────

function generarCitas() {
  const now   = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const startMs = now.getTime() - 30 * 60 * 1000;
  const rows    = [];

  for (let i = 0; i < 120; i++) {
    const citaMs   = startMs + i * 60 * 1000;
    const citaDate = new Date(citaMs);
    const hora     = `${pad(citaDate.getHours())}:${pad(citaDate.getMinutes())}`;
    const folio    = `PRU-${String(10000 + i).padStart(5, '0')}`;

    let nombre = pick(NOMBRES);
    if (rows.length > 0 && rows[rows.length - 1].NOMBRE === nombre) {
      nombre = pick(NOMBRES);
    }

    rows.push({
      FOLIO_CITA:      folio,
      FECHA_CITA:      today,
      HORA_CITA:       hora,
      NOMBRE:          nombre,
      MODELO:          pick(MODELOS),
      ANO:             parseInt(pick(ANOS)),
      ASESOR_SERVICIO: pick(ASESORES)
    });
  }

  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// ESQUEMA DE LA TABLA
// ──────────────────────────────────────────────────────────────────────────────

const SCHEMA = [
  { name: 'FOLIO_CITA',      type: 'STRING',  mode: 'NULLABLE' },
  { name: 'FECHA_CITA',      type: 'DATE',    mode: 'NULLABLE' },
  { name: 'HORA_CITA',       type: 'STRING',  mode: 'NULLABLE' },
  { name: 'NOMBRE',          type: 'STRING',  mode: 'NULLABLE' },
  { name: 'MODELO',          type: 'STRING',  mode: 'NULLABLE' },
  { name: 'ANO',             type: 'INTEGER', mode: 'NULLABLE' },
  { name: 'ASESOR_SERVICIO', type: 'STRING',  mode: 'NULLABLE' }
];

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Iniciando creación de tabla en BigQuery...`);
  console.log(`   📋 Tabla objetivo: ${BQ_TABLE}\n`);

  const bq      = new BigQuery({ projectId: PROJECT_ID, keyFilename: KEY_FILE });
  const dataset = bq.dataset(DATASET_ID);
  const table   = dataset.table(TABLE_ID);

  // 1. Eliminar tabla si ya existe
  try {
    await table.delete();
    console.log(`🗑️  Tabla existente eliminada: ${TABLE_ID}`);
  } catch {
    console.log(`ℹ️  La tabla no existía (se creará nueva)`);
  }

  // 2. Crear la tabla con el esquema
  await dataset.createTable(TABLE_ID, { schema: SCHEMA });
  console.log(`✅ Tabla creada: ${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}`);

  // 3. Generar e insertar las citas
  const rows = generarCitas();
  console.log(`📋 Generando ${rows.length} citas de prueba...`);
  console.log(`   Primera cita: ${rows[0].HORA_CITA}  |  Última: ${rows[rows.length - 1].HORA_CITA}`);
  console.log(`   Fecha: ${rows[0].FECHA_CITA}`);

  await table.insert(rows);
  console.log(`\n✅ ${rows.length} citas insertadas correctamente\n`);

  console.log('─────────────────────────────────────────────────────');
  console.log('  Para usar la tabla de prueba, verifica tu .env:');
  console.log(`  BQ_TABLE=${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}`);
  console.log('─────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message, '\n');
  process.exit(1);
});
