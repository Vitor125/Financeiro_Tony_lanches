(() => {
  const gate = document.getElementById('auth-gate');
  const sidebar = document.getElementById('app-sidebar');
  const main = document.getElementById('app-main');
  const form = document.getElementById('login-form');
  const button = document.getElementById('login-button');
  const message = document.getElementById('auth-message');
  const authConfig = window.TONY_CONFIG.firebase;
  let auth;
  let authError = '';
  let stateRevision = 0;

  function showMessage(text) {
    message.textContent = text;
  }

  function showLogin(text = authError) {
    gate.hidden = false;
    sidebar.hidden = true;
    main.hidden = true;
    showMessage(text);
    document.getElementById('retry-access').hidden = !auth?.currentUser;
  }

  function firebaseError(error) {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      return 'E-mail ou senha incorretos.';
    }
    if (error.code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde e tente novamente.';
    if (error.code === 'auth/network-request-failed') return 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.';
    return 'Não foi possível entrar. Confira a conta e tente novamente.';
  }

  if (!window.firebase || !authConfig) {
    showLogin('O Firebase Authentication não pôde ser carregado.');
    button.disabled = true;
    return;
  }

  try {
    firebase.initializeApp(authConfig);
    auth = firebase.auth();
    window.TonyAuth = {
      getIdToken: async () => {
        const user = auth.currentUser;
        if (!user) throw new Error('Faça login para acessar os dados.');
        return user.getIdToken();
      },
      signOut: async () => {
        await window.TonyReminders?.unsubscribeLocal();
        return auth.signOut();
      }
    };
  } catch (error) {
    console.error('Firebase Authentication não pôde ser inicializado:', error);
    showLogin('A configuração do Firebase Authentication está indisponível.');
    button.disabled = true;
    return;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Entrando…';
    showMessage('');
    try {
      await auth.signInWithEmailAndPassword(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value
      );
    } catch (error) {
      console.error('Não foi possível entrar:', error.code || error.name);
      showMessage(firebaseError(error));
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    authError = '';
    try {
      await window.TonyReminders?.disconnectDevice();
      await window.TonyAuth.signOut();
    } catch (error) {
      console.error('Não foi possível encerrar a sessão:', error);
      showLogin('Não foi possível encerrar a sessão. Tente novamente.');
    }
  });

  async function validateBackendAccess(user, revision) {
    showLogin('Login confirmado. Verificando autorização do dashboard…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), window.TONY_CONFIG.requestTimeoutMs || 45000);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${window.TONY_CONFIG.apiBaseUrl}/auth/me`, {
        headers: {Accept: 'application/json', Authorization: `Bearer ${token}`},
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
      try {
        await response.json();
      } catch {
        throw new Error('Seu login foi reconhecido, mas não conseguimos conectar ao sistema. Tente novamente em instantes.');
      }
      if (revision !== stateRevision) return;
      if (response.status === 403) {
        authError = 'Esta conta ainda não tem acesso ao financeiro. Entre com uma conta autorizada ou fale com o responsável.';
        await auth.signOut();
        return;
      }
      if (response.status === 401) {
        authError = 'Sua sessão expirou. Entre novamente para continuar.';
        await auth.signOut();
        return;
      }
      if (!response.ok) {
        console.error('O sistema não conseguiu confirmar o acesso.', {status: response.status});
        throw new Error('Não conseguimos confirmar seu acesso agora. Tente novamente em instantes.');
      }
      authError = '';
      document.getElementById('login-password').value = '';
      gate.hidden = true;
      sidebar.hidden = false;
      main.hidden = false;
      window.dispatchEvent(new Event('tony:authenticated'));
    } catch (error) {
      if (revision !== stateRevision) return;
      console.error('Não foi possível validar o acesso ao sistema.', error.name || 'Error');
      authError = error.name === 'AbortError' ? 'O servidor demorou a responder. Clique em Tentar acesso novamente.' : error instanceof TypeError
        ? 'Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.'
        : error.message || 'Não foi possível confirmar seu acesso. Tente novamente.';
      showLogin(authError);
    } finally { clearTimeout(timer); }
  }
  document.getElementById('retry-access').addEventListener('click', () => {
    if (auth.currentUser) validateBackendAccess(auth.currentUser, ++stateRevision);
  });

  button.disabled = true;
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
      button.disabled = false;
      auth.onAuthStateChanged(user => {
        const revision = ++stateRevision;
        if (!user) {
          document.getElementById('login-password').value = '';
          window.dispatchEvent(new Event('tony:signed-out'));
          showLogin();
          return;
        }
        validateBackendAccess(user, revision);
      });
    })
    .catch(error => {
      console.error('Não foi possível manter a sessão Firebase neste navegador:', error);
      showLogin('Não foi possível preparar a sessão persistente. Verifique as configurações do navegador e tente novamente.');
      button.disabled = true;
    });
})();
