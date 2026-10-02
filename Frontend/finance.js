/* Conversões e agregações da interface. O faturamento líquido vem do backend. */
(() => {
  const missing = value => value === null || value === undefined || value === '';
  // O Flask envia reais; centavos são usados apenas no front para somas e exibição.
  function toCents(value) {
    if (missing(value)) return null;
    const number = Number(value), cents = Math.round(number * 100);
    if (!Number.isFinite(number) || !Number.isSafeInteger(cents)) throw new Error('Valor monetário inválido retornado pela API.');
    return cents;
  }
  // Datas PostgreSQL podem ser serializadas pelo Flask no formato HTTP em GMT.
  function dateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new Error('Data inválida retornada pela API.');
    return date.toISOString().slice(0, 10);
  }
  function normalizeDay(row) {
    if (!row || typeof row !== 'object') throw new Error('Resposta diária inválida.');
    const revenue = toCents(row.faturamento_bruto_diario), expenses = toCents(row.despesas_diarias), profit = toCents(row.faturamento_liquido_diario);
    return {date: dateKey(row.dia_mes_ano), exists: true, revenueCents: revenue, expenseCents: expenses, profitCents: profit,
      // Imposto descontado no líquido salvo: nunca reaplica a taxa atual ao histórico.
      taxCents: [revenue, expenses, profit].some(missing) ? null : revenue - expenses - profit,
      complete: ![revenue, expenses, profit].some(missing)};
  }
  // Um campo incompleto torna seu total pendente; null nunca é tratado como zero.
  function totals(days) {
    const sum = field => days.some(day => missing(day[field])) ? null : days.reduce((total, day) => total + day[field], 0);
    const revenue = sum('revenueCents'), expenses = sum('expenseCents'), profit = sum('profitCents'), tax = sum('taxCents');
    return {revenue, expenses, profit, tax, margin: revenue && profit !== null ? profit / revenue * 100 : null};
  }
  // Valores brasileiros são convertidos antes do envio; zero é válido, negativos não.
  function parseMoney(text) {
    const cleaned = text.trim().replace(/^R\$\s*/, '');
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(cleaned)) throw new Error('Use um valor válido, como 1.250,50.');
    const [whole, fraction = ''] = cleaned.replace(/\./g, '').split(',');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents > 99999999999) throw new Error('Informe um valor de até R$ 999.999.999,99.');
    return cents;
  }
  window.TonyFinance = {toCents, dateKey, normalizeDay, totals, parseMoney};
})();
