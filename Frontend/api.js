/* Rotas reais de faturamento.py; nenhuma falha é substituída por demonstração. */
(() => {
  const config = window.TONY_CONFIG;
  const {normalizeDay} = window.TonyFinance;
  // Preserva status HTTP para distinguir ausência de data de falhas no servidor/banco.
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch(config.apiBaseUrl.replace(/\/$/, '') + path, {
        ...options, credentials: config.credentials, signal: controller.signal, cache: 'no-store',
        headers: {Accept: 'application/json', ...(options.body ? {'Content-Type': 'application/json'} : {})}
      });
      let data;
      try { data = await response.json(); }
      catch { throw new Error('O servidor não retornou JSON válido. Abra o front pela origem do Flask.'); }
      if (!response.ok) {
        const error = new Error([data.erro || 'Falha na API.', data.detalhe].filter(Boolean).join(' '));
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('O servidor demorou a responder. Consulte o dia antes de repetir um salvamento.');
      if (error instanceof TypeError) throw new Error('Não foi possível acessar o Flask. Abra o front pela mesma origem da API e confira a conexão.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  window.TonyAPI = {
    async getDay(date) {
      try {
        const result = normalizeDay(await request(`/Faturamento/dia_mes_ano/${date}`));
        if (result.date !== date) throw new Error('A API retornou uma data diferente da solicitada.');
        return result;
      } catch (error) {
        // Um dia sem cadastro não possui resultado confirmado de zero reais.
        if (error.status === 404) return {date, exists: false, revenueCents: null, expenseCents: null, profitCents: null, taxCents: null, complete: false};
        throw error;
      }
    },
    async getPeriod(start, end) {
      // Não há rota de intervalo. A lista geral é filtrada no front, sem escrever agregações no banco.
      const rows = await request('/Faturamento_geral');
      if (!Array.isArray(rows)) throw new Error('A API geral deve retornar uma lista de dias.');
      const days = rows.map(normalizeDay).filter(day => day.date >= start && day.date <= end);
      if (new Set(days.map(day => day.date)).size !== days.length) throw new Error('Datas duplicadas na API. O período não foi somado para evitar resultados incorretos.');
      return days.sort((a, b) => a.date.localeCompare(b.date));
    },
    async getTax() {
      const data = await request('/Faturamento/taxa_imposto_atual');
      if (data.taxa_imposto_atual === null) return null;
      const rate = Number(data.taxa_imposto_atual);
      if (!Number.isFinite(rate) || rate < 0) throw new Error('Taxa de imposto inválida retornada pela API.');
      return rate;
    },
    async saveTax(rate) {
      // Fração no backend: 15% informado na tela equivale a 0.15 na API.
      return request('/Faturamento/taxa_imposto_atual', {method: 'POST', body: JSON.stringify({taxa_imposto_atual: String(rate)})});
    },
    async saveDay(date, revenueCents, expenseCents) {
      if (await this.getTax() === null) throw new Error('Cadastre a taxa de imposto antes de salvar e calcular o dia.');
      // Ambos são totais diários em reais. O cálculo e a persistência ficam na rotina existente.
      const data = await request('/Faturamento/calcular_dia', {method: 'POST', body: JSON.stringify({
        dia_mes_ano: date, faturamento_bruto_diario: (revenueCents / 100).toFixed(2), despesas_diarias: (expenseCents / 100).toFixed(2)
      })});
      const saved = normalizeDay(data);
      if (!saved.complete || saved.date !== date) throw new Error('Fechamento incompleto na resposta. Consulte o dia antes de reenviar.');
      return saved;
    }
  };
})();
