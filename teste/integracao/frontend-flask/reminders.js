/* Lembretes: snapshot da consulta diária, preferências por conta e push opcional. */
(() => {
  const $ = id => document.getElementById(id);
  let snapshot = null, publicKey = '', busy = false, revision = 0;
  const defaults = () => ({ativo: true, dias: 1, semana: [1, 2, 3, 4, 5, 6, 7]});
  let config = defaults();
  const dateText = value => new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo'});
  const weekdayInputs = () => [...document.querySelectorAll('[name="reminder-weekday"]')];
  function fill() {
    $('reminder-enabled').checked = config.ativo;
    $('reminder-days').value = String(config.dias);
    weekdayInputs().forEach(input => input.checked = config.semana.includes(Number(input.value)));
  }
  function readForm() {
    const semana = weekdayInputs().filter(input => input.checked).map(input => Number(input.value));
    if (!semana.length) throw new Error('Escolha pelo menos um dia da semana.');
    return {ativo: $('reminder-enabled').checked, dias: Number($('reminder-days').value), semana};
  }
  function render() {
    const list = $('reminder-pending'); list.replaceChildren();
    $('reminder-banner').hidden = true;
    if (!config.ativo) { $('reminder-status').textContent = 'Lembretes desativados nesta conta.'; return; }
    if (!snapshot) { $('reminder-status').textContent = 'Consulte o cálculo diário para verificar os lançamentos pendentes.'; return; }
    const now = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    if (now !== snapshot.hoje) { $('reminder-status').textContent = 'O dia mudou. Atualize a consulta diária para verificar as pendências.'; return; }
    const end = Date.parse(snapshot.hoje + 'T12:00:00Z');
    const pending = snapshot.pendentes.filter(date => {
      const day = new Date(date + 'T12:00:00Z'), age = Math.round((end - day.getTime()) / 86400000);
      return age >= 1 && age <= config.dias && config.semana.includes(day.getUTCDay() || 7);
    });
    $('reminder-status').textContent = pending.length ? `${pending.length} dia(s) sem fechamento completo no intervalo escolhido.` : 'Nenhum lançamento pendente no intervalo escolhido.';
    $('reminder-checked').textContent = `Verificado junto da consulta diária de ${dateText(snapshot.hoje)}. Alterações em outros aparelhos aparecem na próxima consulta.`;
    $('reminder-banner').hidden = pending.length === 0;
    $('reminder-banner-text').textContent = `${pending.length} dia(s) aguardando lançamento. Confira seus lembretes.`;
    for (const date of pending) {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'reminder-date';
      button.textContent = `Consultar ${dateText(date)}`;
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('tony:reminder-open', {detail: date})));
      item.append(button); list.append(item);
    }
  }
  function reset() {
    ++revision; snapshot = null; publicKey = ''; config = defaults();
    delete $('reminder-form').dataset.dirty; fill(); render();
    $('reminder-checked').textContent = '';
    $('reminder-feedback').textContent = ''; $('push-status').textContent = '';
  }
  async function subscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
  }
  function pushStatus() {
    const session = revision;
    subscription().then(current => {
      if (session !== revision) return;
      $('push-status').textContent = current ? 'Notificações ativadas neste aparelho. A verificação acontece às 9h (São Paulo).' : 'Notificações desativadas neste aparelho.';
    }).catch(() => { if (session === revision) $('push-status').textContent = 'Não foi possível conferir a inscrição deste aparelho.'; });
  }
  window.TonyReminders = {
    accept(data) {
      if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.hoje) || !Array.isArray(data.pendentes) || data.pendentes.length > 7 || data.pendentes.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
        snapshot = null; render(); return;
      }
      snapshot = {hoje: data.hoje, pendentes: [...data.pendentes]};
      publicKey = data.chave_publica || '';
      // Uma resposta de consulta não apaga alterações ainda não salvas no formulário.
      config = data.config || defaults();
      if (!$('reminder-form').dataset.dirty) fill();
      render(); pushStatus();
    },
    recordChanged(date, complete) {
      if (!snapshot) return;
      const age = (Date.parse(snapshot.hoje + 'T12:00:00Z') - Date.parse(date + 'T12:00:00Z')) / 86400000;
      if (age < 1 || age > 7) return;
      snapshot.pendentes = snapshot.pendentes.filter(item => item !== date);
      if (!complete) snapshot.pendentes.push(date);
      snapshot.pendentes.sort(); render();
    },
    invalidate() { snapshot = null; render(); },
    async disconnectDevice() {
      try {
        const current = await subscription();
        if (!current) return;
        try { await TonyAPI.unregisterPush(current.endpoint); }
        catch { console.warn('A inscrição expirada será removida na próxima verificação diária.'); }
        finally { await current.unsubscribe(); }
      } catch { console.warn('Não foi possível remover a inscrição de notificações.'); }
    },
    async unsubscribeLocal() {
      try { const current = await subscription(); if (current) await current.unsubscribe(); }
      catch { console.warn('Não foi possível remover a inscrição local de notificações.'); }
    }
  };
  $('reminder-form').addEventListener('input', () => $('reminder-form').dataset.dirty = 'true');
  async function saveConfig() {
    const session = revision;
    const next = readForm();
    const saved = await TonyAPI.saveReminderConfig(next);
    if (session !== revision) return;
    config = saved; delete $('reminder-form').dataset.dirty; fill(); render();
  }
  async function action(callback) {
    if (busy) return;
    busy = true; const session = revision;
    const controls = [...$('reminder-form').elements, $('push-enable'), $('push-disable')];
    controls.forEach(input => input.disabled = true); $('reminder-feedback').textContent = '';
    try { await callback(session); }
    catch (error) { if (session === revision) $('reminder-feedback').textContent = error.message || 'Não foi possível concluir. Tente novamente.'; }
    finally { busy = false; controls.forEach(input => input.disabled = false); }
  }
  $('reminder-form').addEventListener('submit', event => {
    event.preventDefault();
    action(async session => { await saveConfig(); if (session === revision) $('reminder-feedback').textContent = 'Preferências salvas nesta conta.'; });
  });
  $('push-enable').addEventListener('click', () => action(async session => {
    if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) throw new Error('Este navegador não oferece Web Push. No iPhone/iPad, use o app adicionado à Tela de Início em um sistema compatível.');
    if (!publicKey) throw new Error('Consulte o cálculo diário antes de ativar as notificações.');
    // Pedido feito no clique da pessoa, antes de aguardar chamadas à API.
    if (await Notification.requestPermission() !== 'granted') throw new Error('As notificações não foram autorizadas. Você pode liberar a permissão nas configurações do navegador.');
    if (session !== revision) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active) throw new Error('A instalação ainda está sendo preparada. Reabra o app e tente novamente.');
    const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.length % 4) % 4));
    const key = Uint8Array.from(raw, char => char.charCodeAt(0));
    let current = await registration.pushManager.getSubscription();
    const created = !current;
    if (!current) current = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key});
    if (session !== revision) { await current.unsubscribe(); return; }
    try {
      await saveConfig();
      if (session !== revision) { await current.unsubscribe(); return; }
      await TonyAPI.registerPush(current.toJSON());
    } catch (error) { if (created) await current.unsubscribe(); throw error; }
    if (session !== revision) { await current.unsubscribe(); return; }
    pushStatus(); $('reminder-feedback').textContent = 'Aparelho cadastrado. A primeira verificação será às 9h (São Paulo).';
  }));
  $('push-disable').addEventListener('click', () => action(async session => {
    const current = await subscription();
    if (current) {
      await TonyAPI.unregisterPush(current.endpoint);
      await current.unsubscribe();
    }
    if (session === revision) pushStatus();
  }));
  $('reminder-configure').addEventListener('click', () => document.querySelector('[data-view="reminders"]').click());
  window.addEventListener('tony:signed-out', reset);
  window.addEventListener('tony:authenticated', reset);
  fill(); render();
})();
