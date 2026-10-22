/* Rotas reais de faturamento.py; nenhuma falha é substituída por demonstração. */
(() => {
  const config = window.TONY_CONFIG;
  const {normalizeDay} = window.TonyFinance;
  function requestErrorMessage(status, method, path) {
    if (status === 400) return 'Confira os dados informados e tente novamente.';
    if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
    if (status === 403) return 'Seu acesso não está autorizado. Entre com uma conta liberada para o financeiro.';
    if (status === 404) return 'Não encontramos os dados desta data. Atualize a tela e tente novamente.';
    if (status === 409) return path === '/Faturamento/calcular_dia'
      ? 'Esta data já foi registrada ou está definida como dia de folga. Consulte a configuração antes de continuar.'
      : 'Este registro foi alterado, a data está ocupada ou foi definida como dia de folga. Consulte novamente antes de continuar.';
    if (status >= 500) {
      if (method === 'DELETE') return 'Não foi possível excluir agora. Consulte novamente para confirmar o estado do registro.';
      return method === 'POST' || method === 'PUT'
        ? 'Não foi possível salvar agora. Tente novamente em instantes.'
        : 'Não foi possível carregar os dados agora. Tente novamente em instantes.';
    }
    return 'Não foi possível concluir sua solicitação. Tente novamente.';
  }
  // Preserva status HTTP para distinguir ausência de data de falhas no servidor/banco.
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const method = options.method || 'GET';
    try {
      const token = await window.TonyAuth.getIdToken();
      const response = await fetch(config.apiBaseUrl.replace(/\/$/, '') + path, {
        ...options, credentials: 'omit', signal: controller.signal, cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body ? {'Content-Type': 'application/json'} : {}),
          ...options.headers
        }
      });
      let data;
      try { data = await response.json(); }
      catch {
        console.error('A API retornou uma resposta inválida.', {path, status: response.status});
        throw new Error('Não foi possível interpretar a resposta do servidor. Tente novamente.');
      }
      if (!response.ok) {
        console.error('A API recusou a solicitação.', {path, status: response.status});
        const error = new Error(requestErrorMessage(response.status, method, path));
        error.status = response.status;
        if (response.status === 401) await window.TonyAuth.signOut();
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('A solicitação à API excedeu o tempo limite.', {path, method});
        throw new Error('O servidor demorou a responder. Verifique os dados antes de tentar novamente.');
      }
      if (error instanceof TypeError) {
        console.error('Não foi possível conectar à API.', {path, method});
        throw new Error('Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.');
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function readTax(value) {
    if (value === null) return null;
    const rate = Number(value);
    if (value === undefined || !Number.isFinite(rate) || rate < 0) throw new Error('Não foi possível confirmar a taxa de imposto. Tente novamente.');
    return rate;
  }
  window.TonyAPI = {
    async getDayOff() {
      const data = await request('/Faturamento/dia_folga');
      if (data.dia_semana !== null && (!Number.isInteger(data.dia_semana) || data.dia_semana < 1 || data.dia_semana > 7)) throw new Error('Não foi possível confirmar o dia fixo de folga.');
      if (data.dia_excecao !== null && (typeof data.dia_excecao !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.dia_excecao))) throw new Error('Não foi possível confirmar a exceção de folga.');
      if (data.dia_excecao === null ? data.tipo_excecao !== null : !['adicional', 'substituir'].includes(data.tipo_excecao)) throw new Error('Não foi possível confirmar o tipo de exceção.');
      return {dia_semana: data.dia_semana, dia_excecao: data.dia_excecao, tipo_excecao: data.tipo_excecao};
    },
    async saveDayOff(weekday) {
      const data = await request('/Faturamento/dia_folga', {method: 'POST', body: JSON.stringify({dia_semana: weekday})});
      if (data.dia_semana !== weekday) throw new Error('Não foi possível confirmar o dia fixo salvo.');
      return data.dia_semana;
    },
    async saveDayOffException(date, type) {
      const data = await request('/Faturamento/dia_folga/excecao', {method: 'POST', body: JSON.stringify({dia_excecao: date, tipo_excecao: type})});
      if (data.dia_excecao !== date || data.tipo_excecao !== type) throw new Error('Não foi possível confirmar a exceção salva.');
      return data;
    },
    async clearDayOffException() {
      const data = await request('/Faturamento/dia_folga/excecao', {method: 'DELETE'});
      if (data.dia_excecao !== null || data.tipo_excecao !== null) throw new Error('Não foi possível confirmar a remoção da exceção.');
    },
    saveReminderConfig: config => request('/Lembretes/config', {method: 'PUT', body: JSON.stringify(config)}),
    registerPush: subscription => request('/Lembretes/dispositivo', {method: 'POST', body: JSON.stringify(subscription)}),
    unregisterPush: endpoint => request('/Lembretes/dispositivo', {method: 'DELETE', body: JSON.stringify({endpoint})}),
    async editDay(day, revenueCents, expenseCents, newDate = day.date) {
      const data = await request(`/Faturamento/registro/${day.date}`, {method: day.exists === false ? 'POST' : 'PUT', body: JSON.stringify({
        original: day.exists === false ? null : originalValues(day), nova_data: newDate, faturamento_bruto_diario: (revenueCents / 100).toFixed(2), despesas_diarias: (expenseCents / 100).toFixed(2)
      })});
      const saved = normalizeDay(data);
      if (!saved.complete || saved.date !== newDate) throw new Error('Consulte novamente para confirmar a alteração.');
      return {...saved, exists: true, taxRate: readTax(data.taxa_imposto_atual)};
    },
    async deleteDay(day) {
      const data = await request(`/Faturamento/registro/${day.date}`, {method: 'DELETE', body: JSON.stringify({original: originalValues(day)})});
      if (data.excluido !== true || data.dia_mes_ano !== day.date) throw new Error('Consulte novamente para confirmar a exclusão.');
      return data;
    },
    async getDay(date) {
      const data = await request(`/Faturamento/resumo_diario/${date}${window.TonyReminders ? '?lembretes=1' : ''}`);
      const result = normalizeDay(data);
      if (result.date !== date) throw new Error('Não foi possível confirmar os dados da data selecionada. Tente novamente.');
      return {...result, exists: data.existe, taxRate: readTax(data.taxa_imposto_atual), reminders: data.lembretes};
    },
    async getPeriod(start, end) {
      // Transfere somente os dias solicitados, filtrados pelo banco.
      const query = new URLSearchParams({inicio: start, fim: end});
      const rows = await request(`/Faturamento_geral?${query}`);
      if (!Array.isArray(rows)) throw new Error('Não foi possível carregar os fechamentos do período. Tente novamente.');
      const days = rows.map(normalizeDay).filter(day => day.date >= start && day.date <= end);
      if (new Set(days.map(day => day.date)).size !== days.length) throw new Error('Não foi possível calcular o período com segurança. Atualize a tela e tente novamente.');
      return days.sort((a, b) => a.date.localeCompare(b.date));
    },
    async saveTax(rate) {
      // Fração no backend: 15% informado na tela equivale a 0.15 na API.
      const data = await request('/Faturamento/taxa_imposto_atual', {method: 'POST', body: JSON.stringify({taxa_imposto_atual: String(rate)})});
      return {...data, taxRate: readTax(data.taxa_imposto_atual)};
    },
    async saveDay(date, revenueCents, expenseCents) {
      // Ambos são totais diários em reais. O cálculo e a persistência ficam na rotina existente.
      const data = await request('/Faturamento/calcular_dia', {method: 'POST', body: JSON.stringify({
        dia_mes_ano: date, faturamento_bruto_diario: (revenueCents / 100).toFixed(2), despesas_diarias: (expenseCents / 100).toFixed(2)
      })});
      const saved = normalizeDay(data);
      if (!saved.complete || saved.date !== date) throw new Error('Não foi possível confirmar o fechamento. Consulte esta data antes de tentar novamente.');
      return {...saved, taxRate: readTax(data.taxa_imposto_atual)};
    }
  };
  function originalValues(day) {
    const reais = cents => cents === null ? null : (cents / 100).toFixed(2);
    return {faturamento_bruto_diario: reais(day.revenueCents), despesas_diarias: reais(day.expenseCents), faturamento_liquido_diario: reais(day.profitCents)};
  }
})();
