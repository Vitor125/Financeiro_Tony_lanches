/* Dashboard: a interface exibe o líquido calculado e salvo pelo backend. */
(() => {
  const $ = id => document.getElementById(id);
  const {totals, parseMoney} = TonyFinance;
  const money = cents => cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const percent = value => value === null ? '—' : value.toLocaleString('pt-BR', {maximumFractionDigits: 2}) + '%';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const readableDate = date => new Date(date + 'T12:00:00').toLocaleDateString('pt-BR');
  const monthName = month => new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
  let view = 'daily', day = null, dayRequest = 0, periodRequest = 0, saving = false, tax = null, toastTimer;

  // Mensagens textuais usam textContent para não interpretar conteúdo da API como HTML.
  function showError(message) { $('error-text').textContent = message; $('error-banner').hidden = false; }
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000);
  }
  function stats(id, result) {
    const cards = [
      {label: 'Faturamento bruto', value: result.revenue, icon: '↗', className: '', note: 'Total informado ao backend'},
      {label: 'Despesas', value: result.expenses, icon: '↙', className: 'expenses', note: 'Somatório dos totais diários'},
      {label: 'Imposto descontado', value: result.tax, icon: '%', className: '', note: 'Desconto no líquido registrado'},
      {label: result.profit !== null && result.profit < 0 ? 'Prejuízo líquido' : 'Lucro líquido', value: result.profit, icon: '$', className: 'highlight', note: result.margin === null ? 'Margem indisponível' : `${percent(result.margin)} de margem`}
    ];
    $(id).innerHTML = cards.map(card => `<div class="stat-card ${card.className}"><div class="stat-top"><span>${card.label}</span><span class="stat-symbol" aria-hidden="true">${card.icon}</span></div><div class="stat-value ${card.value < 0 ? 'negative' : ''}">${money(card.value)}</div><div class="stat-foot">${card.value === null ? 'Valor ainda não registrado' : card.note}</div></div>`).join('');
  }
  // Mostra um fechamento diário, sem inventar lançamentos individuais/categorias que o banco não guarda.
  function renderDay(fillInputs = true) {
    const result = totals([day]); stats('daily-stats', result);
    $('result-date').textContent = readableDate(day.date);
    $('daily-result').innerHTML = `<div class="profit-label">${result.profit !== null && result.profit < 0 ? 'Prejuízo líquido' : 'Resultado líquido registrado'}</div><div class="profit-value ${result.profit < 0 ? 'negative' : ''}">${money(result.profit)}</div><div class="margin-pill">${result.margin === null ? 'Margem indisponível' : `${percent(result.margin)} de margem`}</div><div class="balance-labels"><div>Faturamento<strong>${money(result.revenue)}</strong></div><div>Imposto descontado<strong>${money(result.tax)}</strong></div></div>`;
    $('daily-expense-total').textContent = money(day.expenseCents);
    $('daily-expense-count').textContent = day.expenseCents === null ? 'Total ainda não informado.' : `Total registrado em ${readableDate(day.date)}.`;
    $('day-status').textContent = !day.exists ? 'Dia sem cadastro. Informe os dois totais para salvar.' : day.complete ? 'Fechamento registrado no backend.' : 'Registro incompleto: preencha os totais e salve para calcular o líquido.';
    $('record-count').textContent = day.exists ? '1 fechamento' : 'Sem fechamento';
    $('daily-records').innerHTML = day.exists ? `<tr><td>${readableDate(day.date)}</td><td class="number">${money(result.revenue)}</td><td class="number">${money(result.expenses)}</td><td class="number">${money(result.tax)}</td><td class="number">${money(result.profit)}</td></tr>` : '<tr><td colspan="5" class="empty">Nenhum fechamento salvo para esta data.</td></tr>';
    if (fillInputs) {
      $('revenue-amount').value = day.revenueCents === null ? '' : (day.revenueCents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      $('expense-amount').value = day.expenseCents === null ? '' : (day.expenseCents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
  }
  async function loadDay() {
    const date = $('daily-date').value;
    if (!date || saving) return;
    const request = ++dayRequest;
    $('error-banner').hidden = true; $('daily-view').classList.add('loading');
    $('revenue-amount').setCustomValidity(''); $('expense-amount').setCustomValidity('');
    try {
      const result = await TonyAPI.getDay(date);
      if (request !== dayRequest) return;
      day = result; renderDay();
    } catch (error) {
      if (request !== dayRequest) return;
      day = null; $('daily-stats').innerHTML = '';
      $('daily-result').innerHTML = '<p class="empty">Não foi possível carregar o resultado.</p>';
      $('daily-expense-total').textContent = '—'; $('daily-expense-count').textContent = 'Total indisponível.';
      $('day-status').textContent = 'A consulta falhou. Consulte novamente antes de salvar.';
      $('daily-records').innerHTML = '<tr><td colspan="5" class="empty">Dados indisponíveis.</td></tr>';
      $('record-count').textContent = ''; showError(error.message);
    } finally { if (request === dayRequest) $('daily-view').classList.remove('loading'); }
  }
  // O formulário envia faturamento e despesas juntos, conforme calcular_dia().
  $('entry-form').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    if (!day || day.date !== $('daily-date').value) { showError('Consulte a data selecionada antes de salvar.'); return; }
    const values = {};
    for (const id of ['revenue-amount', 'expense-amount']) {
      try { values[id] = parseMoney($(id).value); }
      catch (error) { $(id).setCustomValidity(error.message); $(id).reportValidity(); return; }
    }
    saving = true;
    const controls = [...$('entry-form').elements, $('daily-date'), ...document.querySelectorAll('[data-view]')];
    controls.forEach(control => control.disabled = true);
    $('save-button').textContent = 'Salvando e calculando…'; $('error-banner').hidden = true;
    try {
      day = await TonyAPI.saveDay($('daily-date').value, values['revenue-amount'], values['expense-amount']);
      renderDay(); await loadTax(); toast('Fechamento salvo e líquido calculado pelo backend.');
    } catch (error) {
      // A rotina faz vários salvamentos. Não afirma rollback nem sucesso se uma etapa falhar.
      showError(error.message + ' O backend pode ter salvo parte do fechamento. Consulte o dia antes de reenviar.');
    } finally {
      saving = false; controls.forEach(control => control.disabled = false);
      $('save-button').textContent = 'Salvar e calcular o dia';
    }
  });
  ['revenue-amount', 'expense-amount'].forEach(id => {
    $(id).addEventListener('input', () => $(id).setCustomValidity(''));
    $(id).addEventListener('blur', () => {
      try { if ($(id).value) $(id).value = (parseMoney($(id).value) / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}); } catch { /* Validação será mostrada ao salvar. */ }
    });
  });

  // A taxa atual afeta os próximos cálculos; não reescreve automaticamente o histórico.
  async function loadTax() {
    try { tax = await TonyAPI.getTax(); $('tax-current').textContent = tax === null ? 'Não cadastrada' : percent(tax * 100); }
    catch (error) { tax = null; $('tax-current').textContent = 'Indisponível'; showError(error.message); }
  }
  $('tax-form').addEventListener('submit', async event => {
    event.preventDefault(); const text = $('tax-rate').value.trim();
    if (!text) { toast('Nenhuma taxa informada. A taxa atual foi preservada.'); return; }
    if (!/^\d+(?:[,.]\d{1,6})?$/.test(text)) { $('tax-rate').setCustomValidity('Informe um percentual válido, como 15 ou 6,5.'); $('tax-rate').reportValidity(); return; }
    const rate = Number(text.replace(',', '.')) / 100;
    if (!Number.isFinite(rate)) return;
    if (!window.confirm(`Atualizar a taxa de imposto para ${percent(rate * 100)}? Esta taxa será usada nos próximos cálculos.`)) return;
    // Mostra o andamento enquanto a API grava a nova taxa global.
    $('save-tax').disabled = true; $('save-tax').textContent = 'Atualizando…';
    try {
      const result = await TonyAPI.saveTax(rate);
      $('tax-rate').value = ''; await loadTax();
      toast(result.alterado === false ? 'Esta já é a taxa de imposto atual.' : 'Taxa de imposto atualizada.');
    }
    catch (error) { showError(error.message); }
    finally { $('save-tax').disabled = false; $('save-tax').textContent = 'Atualizar taxa de imposto'; }
  });
  $('tax-rate').addEventListener('input', () => $('tax-rate').setCustomValidity(''));
  $('daily-date').addEventListener('change', loadDay);

  // O modo mensal usa primeiro/último dia civil; o personalizado preserva as duas datas.
  function range() {
    if (document.querySelector('[name="range-mode"]:checked').value === 'custom') return {start: $('start-date').value, end: $('end-date').value};
    const month = $('selected-month').value;
    if (!/^\d{4}-\d{2}$/.test(month)) return {start: '', end: ''};
    const [year, number] = month.split('-').map(Number), last = new Date(0);
    last.setUTCFullYear(year, number, 0);
    return {start: month + '-01', end: month + '-' + String(last.getUTCDate()).padStart(2, '0')};
  }
  function setMode(mode) {
    const monthly = mode === 'month';
    $('month-filter').hidden = !monthly; $('selected-month').disabled = !monthly; $('selected-month').required = monthly;
    ['start', 'end', 'preset'].forEach(name => $(name + '-filter').hidden = monthly);
    ['start-date', 'end-date', 'period-preset'].forEach(id => $(id).disabled = monthly);
    ['start-date', 'end-date'].forEach(id => $(id).required = !monthly);
    $('end-date').setCustomValidity(''); $('filter-button').textContent = monthly ? 'Ver mês completo' : 'Aplicar período';
  }
  function setPreset(preset) {
    if (preset === 'custom') return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (preset === 'quarter' ? 2 : preset === 'last' ? 1 : 0), 1);
    const end = preset === 'last' ? new Date(now.getFullYear(), now.getMonth(), 0) : now;
    $('start-date').value = dateKey(start); $('end-date').value = dateKey(end); $('end-date').setCustomValidity('');
  }
  // Usa todos os meses do intervalo, inclusive os que não possuem registros.
  function monthsFor(days, start, end) {
    const months = [];
    for (const date = new Date(start.slice(0, 7) + '-01T12:00:00'); dateKey(date).slice(0, 7) <= end.slice(0, 7); date.setMonth(date.getMonth() + 1)) {
      const month = dateKey(date).slice(0, 7);
      months.push({month, ...totals(days.filter(day => day.date.startsWith(month)))});
    }
    return months;
  }
  // Barras sem valor registrado são omitidas; a tabela mostra o traço de pendência.
  function renderChart(months) {
    if (months.length > 12) { $('chart').innerHTML = '<p class="empty">Para o gráfico, selecione até 12 meses. Todos os meses constam na tabela.</p>'; return; }
    const width = 700, height = 255, left = 65, plotWidth = 620, plotHeight = 180;
    const values = months.flatMap(month => [month.revenue, month.expenses, month.profit]).filter(value => value !== null);
    const max = Math.max(100, ...values), min = Math.min(0, ...values), y = value => 22 + (max - value) / (max - min) * plotHeight;
    const step = plotWidth / months.length, bar = Math.min(23, step / 5);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução mensal. Valores pendentes não têm barra e aparecem como traço na tabela.">`;
    for (let index = 0; index <= 4; index++) {
      const value = max - (max - min) * index / 4, position = y(value);
      svg += `<line x1="${left}" y1="${position}" x2="685" y2="${position}" stroke="#ededed"/><text x="55" y="${position + 4}" text-anchor="end" font-size="12" fill="#888">${(value / 100).toLocaleString('pt-BR', {notation: 'compact', maximumFractionDigits: 1})}</text>`;
    }
    months.forEach((month, index) => {
      const center = left + step * (index + 0.5);
      [month.revenue, month.expenses, month.profit].forEach((value, series) => {
        if (value === null) return;
        svg += `<rect x="${center + (series - 1) * bar * 1.25 - bar / 2}" y="${Math.min(y(0), y(value))}" width="${bar}" height="${Math.abs(y(0) - y(value))}" rx="3" fill="${['#ffdc29', '#dc352f', '#252525'][series]}"><title>${month.month}: ${money(value)}</title></rect>`;
      });
      svg += `<text x="${center}" y="240" text-anchor="middle" font-size="12" fill="#777">${month.month.slice(5)}/${month.month.slice(2, 4)}</text>`;
    });
    $('chart').innerHTML = svg + '</svg>';
  }
  function renderPeriod(days, start, end) {
    const result = totals(days), months = monthsFor(days, start, end); stats('period-stats', result); renderChart(months);
    const pending = days.filter(day => !day.complete).length;
    $('period-summary').innerHTML = `<div class="period-summary-row"><span>Dias cadastrados</span><strong>${days.length}</strong></div><div class="period-summary-row"><span>Dias completos</span><strong>${days.length - pending}</strong></div><div class="period-summary-row"><span>Dias pendentes</span><strong>${pending}</strong></div><p class="field-help">${pending ? 'Há valores não registrados. Os totais afetados aparecem como traço.' : 'O lucro usa o líquido já registrado no backend.'}</p>`;
    $('monthly-records').innerHTML = months.map(month => `<tr><td>${monthName(month.month)}</td><td class="number">${money(month.revenue)}</td><td class="number">${money(month.expenses)}</td><td class="number">${money(month.tax)}</td><td class="number">${money(month.profit)}</td><td class="number">${percent(month.margin)}</td></tr>`).join('');
    $('period-caption').textContent = `${readableDate(start)} a ${readableDate(end)} · Somente os dias dentro do intervalo. Traço indica informação pendente.`;
  }
  async function loadPeriod() {
    const {start, end} = range(); if (!start || !end) return;
    if (start > end) { $('end-date').setCustomValidity('A data final deve ser igual ou posterior à inicial.'); $('end-date').reportValidity(); return; }
    if (Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 10) { showError('Selecione um período de até 10 anos.'); return; }
    const request = ++periodRequest; $('error-banner').hidden = true; $('period-view').classList.add('loading');
    try {
      const days = await TonyAPI.getPeriod(start, end); if (request !== periodRequest) return; renderPeriod(days, start, end);
    } catch (error) {
      if (request !== periodRequest) return;
      $('period-stats').innerHTML = ''; $('period-summary').textContent = 'Consulta indisponível.';
      $('chart').innerHTML = '<p class="empty">Dados indisponíveis.</p>';
      $('monthly-records').innerHTML = '<tr><td colspan="6" class="empty">Não foi possível consultar o período.</td></tr>'; showError(error.message);
    } finally { if (request === periodRequest) $('period-view').classList.remove('loading'); }
  }
  // Eventos de filtro mantêm controles visíveis e validação sincronizados.
  $('period-form').addEventListener('submit', event => { event.preventDefault(); loadPeriod(); });
  document.querySelectorAll('[name="range-mode"]').forEach(radio => radio.addEventListener('change', () => { setMode(radio.value); loadPeriod(); }));
  $('selected-month').addEventListener('change', loadPeriod);
  $('period-preset').addEventListener('change', () => { setPreset($('period-preset').value); if ($('period-preset').value !== 'custom') loadPeriod(); });
  ['start-date', 'end-date'].forEach(id => $(id).addEventListener('input', () => { $('end-date').setCustomValidity(''); $('period-preset').value = 'custom'; }));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => { item.classList.toggle('active', item === button); if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    $('daily-view').hidden = view !== 'daily'; $('period-view').hidden = view !== 'period'; $('daily-date-wrap').hidden = view !== 'daily';
    $('page-title').innerHTML = (view === 'daily' ? 'Movimento diário' : 'Visão por período') + '<span>.</span>';
    $('page-description').textContent = view === 'daily' ? 'Fechamento com faturamento, despesas e imposto.' : 'Resultados líquidos registrados no período.';
    view === 'daily' ? loadDay() : loadPeriod();
  }));
  $('retry').addEventListener('click', () => { loadTax(); view === 'daily' ? loadDay() : loadPeriod(); });
  // Inicialização não realiza escritas no backend nem recalcula o histórico.
  $('daily-date').value = dateKey(new Date()); $('selected-month').value = dateKey(new Date()).slice(0, 7);
  setPreset('month'); setMode('month'); $('mode-label').textContent = 'Dados da API';
  document.querySelector('[data-view="daily"]').setAttribute('aria-current', 'page');
  loadDay(); loadTax();
})();
