const { BigQuery } = require('@google-cloud/bigquery');
const bqClient = new BigQuery({ projectId: 'base-maestra-gn' });

async function run() {
  const query = `
    SELECT FOLIO_CITA, HORA_CITA, NOMBRE, MODELO, ANO
    FROM \`base-maestra-gn.Respaldo.tab_respaldo_master_citas_prueba\`
    WHERE FECHA_CITA = CURRENT_DATE('America/Mexico_City')
  `;
  const [rows] = await bqClient.query({ query });
  console.log("Rows returned:", rows.length);
  if (rows.length > 0) {
    console.log("Sample:", rows[0]);
  }
}

run().catch(console.error);
