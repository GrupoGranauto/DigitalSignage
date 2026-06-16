require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const { BigQuery } = require('@google-cloud/bigquery');

const BQ_TABLE   = process.env.BQ_TABLE || 'base-maestra-gn.Respaldo.tab_respaldo_master_citas';
const [PROJECT_ID] = BQ_TABLE.split('.');

const bqClient = new BigQuery({
  projectId: PROJECT_ID,
  keyFilename: path.join(__dirname, '../service-account.json')
});

async function run() {
  console.log(`[check_bq] Consultando tabla: ${BQ_TABLE}`);
  const query = `
    SELECT FOLIO_CITA, HORA_CITA, NOMBRE, MODELO, ANO
    FROM \`${BQ_TABLE}\`
    WHERE FECHA_CITA = CURRENT_DATE('America/Mexico_City')
  `;
  const [rows] = await bqClient.query({ query });
  console.log('Rows returned:', rows.length);
  if (rows.length > 0) {
    console.log('Sample:', rows[0]);
  }
}

run().catch(console.error);
