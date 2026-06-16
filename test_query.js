const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');

const BQ_TABLE = 'base-maestra-gn.Respaldo.tab_respaldo_master_citas';
const KEY_FILE = path.join(__dirname, 'service-account.json');

const bqClient = new BigQuery({
  projectId: 'base-maestra-gn',
  keyFilename: KEY_FILE
});

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
    \`\${BQ_TABLE}\`
  WHERE
    FECHA_CITA = CURRENT_DATE('America/Mexico_City')
  ORDER BY
    HORA_CITA ASC
`;

async function test() {
  console.log('Running query...');
  const [rows] = await bqClient.query({ query: BIGQUERY_QUERY, location: 'US' });
  console.log('Success, rows:', rows.length);
}

test().catch(err => {
  console.error('ERROR DETECTED:');
  console.error(err);
});
