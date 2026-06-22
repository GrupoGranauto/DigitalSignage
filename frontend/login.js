/**
 * Digital Signage - Controlador de Login y Registro
 */

const AVATARS = [
  { label: 'Rojo', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23c3002f"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' },
  { label: 'Gris', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23475569"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' },
  { label: 'Verde', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%2310b981"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' },
  { label: 'Naranja', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%23ea580c"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' },
  { label: 'Azul', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%230284c7"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' },
  { label: 'Morado', value: 'data:image/svg+xml;utf8,<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="%237c3aed"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6.1 0-8 4-8 4h16s-1.9-4-8-4z"/></svg>' }
];

document.addEventListener('DOMContentLoaded', initLogin);

function initLogin() {
  setupTabs();
  setupForms();
  loadGoogleAuth();
  setupPasswordVisibilityToggle();
  setupViewSwitcher();
}

/* ── PESTAÑAS ───────────────────────────────────────────────────────────── */
function setupTabs() {
  const tabLogin = document.getElementById('tab-login-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');
  const googleSection = document.getElementById('google-auth-section');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'block';
    formRegister.style.display = 'none';
    googleSection.style.display = 'block';
    clearAlert();
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = 'block';
    formLogin.style.display = 'none';
    googleSection.style.display = 'none'; // El registro se hace por el formulario o con Google directo en login
    clearAlert();
  });
}



/* ── ALERTAS ────────────────────────────────────────────────────────────── */
function showAlert(message, type = 'error') {
  const alertEl = document.getElementById('status-alert');
  alertEl.className = 'login-alert';
  
  if (type === 'error') alertEl.classList.add('alert-error');
  else if (type === 'success') alertEl.classList.add('alert-success');
  else if (type === 'info') alertEl.classList.add('alert-info');

  alertEl.textContent = message;
  alertEl.style.display = 'block';
}

function clearAlert() {
  const alertEl = document.getElementById('status-alert');
  alertEl.style.display = 'none';
  alertEl.textContent = '';
}

/* ── FORMULARIOS ────────────────────────────────────────────────────────── */
function setupForms() {
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAlert();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('login-submit-btn');

    setLoading(submitBtn, true);

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
      .then(async res => {
        const data = await res.json();
        if (res.status === 404) {
          showAlert('Usuario no encontrado. Redirigiendo al formulario de registro...', 'info');
          setTimeout(() => {
            const tabRegister = document.getElementById('tab-register-btn');
            if (tabRegister) tabRegister.click();
            const regEmailInput = document.getElementById('reg-email');
            if (regEmailInput) {
              regEmailInput.value = email;
            }
            const formTitle = document.getElementById('form-title');
            const formSubtitle = document.getElementById('form-subtitle');
            if (formTitle) formTitle.innerHTML = 'Solicitar <span class="text-red">Registro</span>';
            if (formSubtitle) formSubtitle.textContent = 'Ingresa tus datos para registrar tu cuenta en el portal.';
            clearAlert();
          }, 1500);
          throw new Error('USER_REDIRECT');
        }
        if (res.status === 403) {
          throw new Error(data.error || 'Aprobación pendiente');
        }
        if (!res.ok) {
          throw new Error(data.error || 'Credenciales incorrectas');
        }
        return data;
      })
      .then(data => {
        if (data.success) {
          redirectUser(data.user);
        }
      })
      .catch(err => {
        if (err.message !== 'USER_REDIRECT') {
          showAlert(err.message, err.message.includes('pendiente') ? 'info' : 'error');
        }
        setLoading(submitBtn, false);
      });
  });

  formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAlert();

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    const picture = 'images/FotoPerfil.png';
    const submitBtn = document.getElementById('register-submit-btn');

    setLoading(submitBtn, true);

    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, picture })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrarse');
        return data;
      })
      .then(data => {
        showAlert(data.message || 'Registro completado. Espera aprobación.', 'success');
        formRegister.reset();
        
        // Regresar a login después de 4s
        setTimeout(() => {
          const btnGoToLogin = document.getElementById('go-to-login');
          if (btnGoToLogin) {
            btnGoToLogin.click();
          } else {
            document.getElementById('tab-login-btn').click();
          }
        }, 4000);
      })
      .catch(err => {
        showAlert(err.message, 'error');
      })
      .finally(() => {
        setLoading(submitBtn, false);
      });
  });

  const formForgot1 = document.getElementById('forgot-password-step1-form');
  const formForgot2 = document.getElementById('forgot-password-step2-form');

  if (formForgot1) {
    formForgot1.addEventListener('submit', (e) => {
      e.preventDefault();
      clearAlert();

      const email = document.getElementById('forgot-email').value;
      const submitBtn = document.getElementById('forgot-submit-btn1');

      setLoading(submitBtn, true);

      fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al enviar código');
          return data;
        })
        .then(data => {
          showAlert(data.message || 'Código enviado con éxito', 'success');
          document.getElementById('reset-email').value = email;
          formForgot1.style.display = 'none';
          formForgot2.style.display = 'block';
          const formTitle = document.getElementById('form-title');
          const formSubtitle = document.getElementById('form-subtitle');
          if (formTitle) formTitle.innerHTML = 'Crear <span class="text-red">Nueva Contraseña</span>';
          if (formSubtitle) formSubtitle.textContent = 'Ingresa el código enviado y tu nueva contraseña. Si no lo recibes, revisa tu carpeta de spam.';
        })
        .catch(err => {
          showAlert(err.message, 'error');
        })
        .finally(() => {
          setLoading(submitBtn, false);
        });
    });
  }

  if (formForgot2) {
    formForgot2.addEventListener('submit', (e) => {
      e.preventDefault();
      clearAlert();

      const email = document.getElementById('reset-email').value;
      const token = document.getElementById('reset-code').value;
      const password = document.getElementById('reset-new-password').value;
      const confirmPassword = document.getElementById('reset-confirm-password').value;
      const submitBtn = document.getElementById('forgot-submit-btn2');

      if (password !== confirmPassword) {
        showAlert('Las contraseñas no coinciden', 'error');
        return;
      }

      if (token.trim().length !== 6) {
        showAlert('El código de verificación debe tener 6 dígitos', 'error');
        return;
      }

      setLoading(submitBtn, true);

      fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password })
      })
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al restablecer contraseña');
          return data;
        })
        .then(data => {
          showAlert(data.message || 'Contraseña restablecida correctamente. Ya puedes iniciar sesión.', 'success');
          formForgot2.reset();
          setTimeout(() => {
            document.getElementById('go-back-to-login').click();
          }, 3000);
        })
        .catch(err => {
          showAlert(err.message, 'error');
        })
        .finally(() => {
          setLoading(submitBtn, false);
        });
    });
  }
}

function setLoading(buttonEl, isLoading) {
  if (isLoading) {
    buttonEl.classList.add('loading-state');
    buttonEl.disabled = true;
  } else {
    buttonEl.classList.remove('loading-state');
    buttonEl.disabled = false;
  }
}

/* ── VERIFICACIÓN GOOGLE ─────────────────────────────────────────────────── */
function loadGoogleAuth() {
  fetch('/api/auth/config')
    .then(r => r.json())
    .then(config => {
      const gSection = document.getElementById('google-auth-section');
      const customGoogleBtn = document.querySelector('.custom-google-btn');
      const realOverlay = document.querySelector('.google-real-overlay');

      if (config.googleClientId) {
        window.googleClientId = config.googleClientId;
        // Esperar a que la librería de Google cargue completamente
        checkGoogleLibraryLoaded();
      } else {
        console.warn('[Google Auth] GOOGLE_CLIENT_ID no configurado en el backend');
        // Mantener el botón visible en la interfaz y asociarle un mensaje si se hace clic
        if (realOverlay) {
          realOverlay.style.display = 'none';
        }
        if (customGoogleBtn) {
          customGoogleBtn.addEventListener('click', () => {
            showAlert('El inicio de sesión con Google no está configurado en el servidor. Configura GOOGLE_CLIENT_ID en el archivo .env', 'info');
          });
        }
      }
    })
    .catch(err => {
      console.error('[Google Auth] Error al cargar configuración:', err);
    });
}

function checkGoogleLibraryLoaded() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    initGoogleButton();
  } else {
    // Reintentar en 200ms
    setTimeout(checkGoogleLibraryLoaded, 200);
  }
}

function initGoogleButton() {
  google.accounts.id.initialize({
    client_id: window.googleClientId,
    callback: handleGoogleCredentialResponse,
    context: 'signin',
    auto_prompt: false
  });

  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 380
    }
  );
}

function handleGoogleCredentialResponse(response) {
  clearAlert();
  
  const submitBtn = document.getElementById('login-submit-btn');
  setLoading(submitBtn, true);

  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: response.credential })
  })
    .then(async res => {
      const data = await res.json();
      if (res.status === 403) {
        throw new Error(data.error || 'Aprobación pendiente');
      }
      if (!res.ok) throw new Error(data.error || 'Error al autenticar con Google');
      return data;
    })
    .then(data => {
      if (data.success) {
        redirectUser(data.user);
      }
    })
    .catch(err => {
      showAlert(err.message, err.message.includes('pendiente') ? 'info' : 'error');
      setLoading(submitBtn, false);
    });
}

/* ── REDIRECCIÓN DE USUARIO ──────────────────────────────────────────────── */
function redirectUser(user) {
  if (user.role === 'admin') {
    window.location.replace('/admin.html');
  } else if (user.role === 'hostess') {
    window.location.replace('/hostess.html');
  } else {
    showAlert('Tu cuenta está pendiente de aprobación y asignación de rol por el administrador.', 'info');
  }
}

/* ── HELPERS ADICIONALES PARA NUEVA UI ────────────────────────────────────── */
function setupPasswordVisibilityToggle() {
  const toggleBtn = document.getElementById('toggle-password-visibility');
  const passwordInput = document.getElementById('login-password');
  
  if (!toggleBtn || !passwordInput) return;

  const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye w-4 h-4"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  
  const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off w-4 h-4"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.574 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-3.444 4.887M9.017 9.017a3.5 3.5 0 1 0 4.966 4.966M2 2l20 20M3.515 12.261A10.716 10.716 0 0 0 2.062 12c1.73-4.39 6-7.5 11-7.5 1.5 0 2.92.3 4.21.841M12 16.5a10.72 10.72 0 0 1-7.733-4.239"></path></svg>`;

  toggleBtn.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleBtn.innerHTML = EYE_CLOSED;
    } else {
      passwordInput.type = 'password';
      toggleBtn.innerHTML = EYE_OPEN;
    }
  });
}

function setupViewSwitcher() {
  const btnGoToRegister = document.getElementById('go-to-register');
  const btnGoToLogin = document.getElementById('go-to-login');
  const tabLogin = document.getElementById('tab-login-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const formTitle = document.getElementById('form-title');
  const formSubtitle = document.getElementById('form-subtitle');

  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const btnGoBackToLogin = document.getElementById('go-back-to-login');
  const btnCancelReset = document.getElementById('btn-cancel-reset');
  const btnResendCode = document.getElementById('btn-resend-code');
  const formForgot1 = document.getElementById('forgot-password-step1-form');
  const formForgot2 = document.getElementById('forgot-password-step2-form');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');
  const googleSection = document.getElementById('google-auth-section');

  const showForgot1 = () => {
    formLogin.style.display = 'none';
    formRegister.style.display = 'none';
    if (formForgot1) formForgot1.style.display = 'block';
    if (formForgot2) formForgot2.style.display = 'none';
    if (googleSection) googleSection.style.display = 'none';
    if (formTitle) formTitle.innerHTML = 'Recuperar <span class="text-red">Contraseña</span>';
    if (formSubtitle) formSubtitle.textContent = 'Ingresa tu correo para recibir un código de verificación de 6 dígitos.';
    clearAlert();
  };

  const showLogin = () => {
    if (tabLogin) tabLogin.click(); // Restablece login y googleSection
    if (formForgot1) formForgot1.style.display = 'none';
    if (formForgot2) formForgot2.style.display = 'none';
    if (formTitle) formTitle.innerHTML = 'Bienvenido a <span class="text-red">GranAuto</span>';
    if (formSubtitle) formSubtitle.textContent = 'Ingresa tus datos para acceder al portal corporativo.';
    clearAlert();
  };

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showForgot1();
    });
  }

  if (btnGoBackToLogin) {
    btnGoBackToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      showLogin();
    });
  }

  if (btnCancelReset) {
    btnCancelReset.addEventListener('click', (e) => {
      e.preventDefault();
      showLogin();
    });
  }

  if (btnResendCode) {
    btnResendCode.addEventListener('click', (e) => {
      e.preventDefault();
      const email = document.getElementById('reset-email').value;
      if (email) {
        document.getElementById('forgot-email').value = email;
        showForgot1();
        // Clicar automáticamente para reenviar
        const submitBtn1 = document.getElementById('forgot-submit-btn1');
        if (submitBtn1) submitBtn1.click();
      }
    });
  }

  if (btnGoToRegister) {
    btnGoToRegister.addEventListener('click', () => {
      if (tabRegister) tabRegister.click();
      if (formTitle) formTitle.innerHTML = 'Solicitar <span class="text-red">Registro</span>';
      if (formSubtitle) formSubtitle.textContent = 'Ingresa tus datos para registrar tu cuenta en el portal.';
    });
  }

  if (btnGoToLogin) {
    btnGoToLogin.addEventListener('click', () => {
      if (tabLogin) tabLogin.click();
      if (formTitle) formTitle.innerHTML = 'Bienvenido a <span class="text-red">GranAuto</span>';
      if (formSubtitle) formSubtitle.textContent = 'Ingresa tus datos para acceder al portal corporativo.';
    });
  }
}
