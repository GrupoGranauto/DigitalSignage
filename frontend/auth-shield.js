/**
 * Digital Signage - Auth Shield
 * Previene el destello de contenido protegido y valida la sesión y roles.
 */
(function () {
  // Ocultar el body inicialmente
  const style = document.createElement('style');
  style.id = 'auth-shield-style';
  style.innerHTML = 'body { display: none !important; }';
  document.head.appendChild(style);

  fetch('/api/auth/me')
    .then(res => {
      if (!res.ok) {
        throw new Error('No autenticado');
      }
      return res.json();
    })
    .then(data => {
      window.currentUser = data.user;
      
      const currentPath = window.location.pathname;
      
      // Si un hostess intenta entrar a admin.html, redirigir a su panel de hostess
      if (currentPath.includes('admin.html') && window.currentUser.role !== 'admin') {
        console.warn('[Auth Shield] Acceso denegado a administrador. Redirigiendo a hostess.');
        window.location.replace('/hostess.html');
        return;
      }

      // Quitar la ocultación del body
      const styleEl = document.getElementById('auth-shield-style');
      if (styleEl) styleEl.remove();

      // Notificar que la autenticación está lista
      document.dispatchEvent(new CustomEvent('auth-verified', { detail: window.currentUser }));
    })
    .catch(err => {
      console.warn('[Auth Shield] Redirigiendo a login:', err.message);
      // Guardar la página de origen para volver después del login si corresponde
      const currentPath = window.location.pathname;
      if (!currentPath.includes('login.html')) {
        window.location.replace('/login.html');
      }
    });
})();
