/* Camada PWA independente dos cálculos financeiros e dos endpoints Flask. */
(() => {
  const installButton = document.getElementById('install-app');
  const help = document.getElementById('install-help');
  const offlineNotice = document.getElementById('offline-notice');
  const updateNotice = document.getElementById('update-notice');
  const updateButton = document.getElementById('update-app');
  let installPrompt = null;
  let pendingWorker = null;
  let refreshing = false;

  // Apps já instalados não precisam exibir novamente a ação de instalação.
  const standalone = window.matchMedia('(display-mode: standalone)');
  function updateInstalledState() {
    installButton.hidden = standalone.matches || navigator.standalone === true;
  }
  updateInstalledState();
  standalone.addEventListener('change', updateInstalledState);

  // Guarda o prompt quando o navegador confirmar que o app está instalável.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstalledState();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });

  // A instalação exige um gesto do usuário; sem prompt, apresenta instruções reais.
  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      installButton.disabled = true;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        help.showModal();
      } finally {
        installButton.disabled = false;
      }
      return;
    }
    document.getElementById('install-message').textContent = window.isSecureContext
      ? 'Abra este endereço no navegador do celular. A opção de instalação depende do navegador.'
      : 'Para instalar, abra o app em um endereço HTTPS. Abrir um arquivo ou um IP local por HTTP não permite a instalação completa.';
    help.showModal();
  });

  // Consultar ou salvar valores exige conexão com a API.
  function updateConnection() {
    offlineNotice.hidden = navigator.onLine;
    offlineNotice.textContent = 'Sem conexão. A interface está disponível, mas consultar e salvar dados exige conexão com o servidor.';
  }
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();

  // HTTPS e localhost permitem service workers; em outros contextos o dashboard continua normal.
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;

  function offerUpdate(worker) {
    pendingWorker = worker;
    updateNotice.hidden = false;
  }
  // Atualizações só substituem a versão aberta quando o usuário decide atualizar.
  updateButton.addEventListener('click', () => {
    if (!pendingWorker) return;
    if (!window.confirm('Atualizar o app agora? Valores digitados e ainda não salvos serão descartados.')) return;
    refreshing = true;
    pendingWorker.postMessage({type: 'SKIP_WAITING'});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    } catch (error) {
      // Uma falha do cache não impede lançamentos nem altera o modo de dados.
      console.warn('A interface offline não pôde ser preparada:', error);
    }
  });
})();
