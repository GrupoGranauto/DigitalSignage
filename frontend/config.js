/**
 * Configuración de la aplicación Digital Signage - Citas de Servicio
 */
const CONFIG = {
  // URL del endpoint REST propio
  API_ENDPOINT: '/api/citas-servicio',

  // Intervalo de rotación de páginas en milisegundos (7 segundos)
  PAGINATION_INTERVAL: 7000,

  // Activar/desactivar animaciones de transición
  ANIMATIONS_ENABLED: true,

  // Título principal de la pantalla
  TITLE: 'Citas de Servicio',

  // Zona horaria para comparación de hora (opcional, por defecto local del navegador)
  TIMEZONE: 'America/Mexico_City',

  // Textos para los distintos estados de la aplicación
  TEXTS: {
    LOADING: 'Cargando citas de hoy...',
    EMPTY: 'Agradecemos su preferencia. En este momento, nuestros asesores se encuentran brindando atención personalizada en taller y recepción de servicio. Si tiene una cita programada o requiere asistencia, por favor diríjase al mostrador. Estamos listos para atenderle.',
    ERROR: 'No fue posible cargar las citas',
    ERROR_RELOAD: 'Presione aquí para recargar la pantalla o pulse F5',
    NEXT_APPOINTMENT_BADGE: 'Próxima cita',
    FINISHED_APPOINTMENT_BADGE: 'Finalizada'
  }
};

// Exportar configuración para navegadores o entornos de pruebas
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}
