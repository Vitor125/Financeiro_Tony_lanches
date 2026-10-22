/* Dashboard: a interface exibe o lucro calculado e salvo pelo backend. */
(() => {
  const $ = id => document.getElementById(id);
  const {totals, parseMoney} = TonyFinance;
  const money = cents => cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const percent = value => value === null ? '—' : value.toLocaleString('pt-BR', {maximumFractionDigits: 2}) + '%';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const businessToday = () => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  function firstLaunchDate() {
    const date = new Date(businessToday() + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() - 7);
    return date.toISOString().slice(0, 10);
  }
  const weekdayNames = ['', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  const isoWeekday = date => (new Date(`${date}T00:00:00Z`).getUTCDay() || 7);
  const weekStart = date => {
    const [year, month, dayNumber] = date.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, dayNumber);
    const dayIndex = (new Date(timestamp).getUTCDay() + 6) % 7;
    return timestamp - dayIndex * 86400000;
  };
  const isDayOff = date => {
    if (!dayOff) return false;
    if (date === dayOff.dia_excecao) return true;
    if (dayOff.tipo_excecao === 'substituir' && dayOff.dia_excecao &&
        Number(dayOff.dia_semana) === isoWeekday(date) && weekStart(date) === weekStart(dayOff.dia_excecao)) return false;
    return Number(dayOff.dia_semana) === isoWeekday(date);
  };
  const canLaunch = () => dayOffLoaded && day && day.date === $('daily-date').value && !day.exists && !isDayOff(day.date) && day.date >= firstLaunchDate() && day.date <= businessToday();
  function dailyDateLimit() {
    const limit = businessToday();
    $('daily-date').max = limit;
    return limit;
  }
  function validateClosingDate() {
    const value = $('daily-date').value;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= dailyDateLimit();
    const message = valid ? '' : 'Escolha hoje ou uma data anterior (horário de São Paulo). Datas futuras não são permitidas.';
    $('daily-date').setCustomValidity(message);
    if (!valid) throw new Error(message);
  }
  const readableDate = date => new Date(date + 'T12:00:00').toLocaleDateString('pt-BR');
  const monthName = month => new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
  let view = 'daily', day = null, dayOff = null, dayOffLoaded = false, dayRequest = 0, periodRequest = 0, saving = false, toastTimer;
  let dashboardStarted = false;
  let sessionVersion = 0;
  let managedDay = null, manageRequest = 0, managing = false;
  const mobileLayout = window.matchMedia('(max-width: 620px)');
  let dailyLayout = '';

  function updateDailyLayout() {
    const selected = $('daily-date').value;
    // Histórico existente é consulta; dia sem cadastro continua priorizando o fechamento.
    const history = day && day.exists && day.date === selected && selected < businessToday();
    const layout = mobileLayout.matches ? (history ? 'history' : 'closing') : 'desktop';
    if (layout === dailyLayout) return;
    dailyLayout = layout;
    const focused = document.activeElement;
    const panel = $('daily-view'), grid = $('daily-grid'), calculator = $('daily-calculator');
    const report = $('daily-report'), indicators = $('daily-stats'), records = $('daily-record-card');
    const taxSettings = $('daily-tax-settings'), dayOffSettings = $('day-off-settings'), dateSlot = $('mobile-date-slot');
    if (mobileLayout.matches) {
      dateSlot.hidden = false; grid.hidden = true;
      dateSlot.append($('daily-date-wrap'));
      // Move os próprios elementos: a ordem de leitura e de teclado acompanha a visual.
      if (history) panel.append(dateSlot, report, indicators, records, calculator, taxSettings, dayOffSettings, grid);
      else panel.append(dateSlot, calculator, report, indicators, records, taxSettings, dayOffSettings, grid);
    } else {
      dateSlot.hidden = true; grid.hidden = false;
      calculator.insertBefore($('daily-date-wrap'), $('closing-date'));
      grid.append(calculator, report);
      panel.append(dateSlot, indicators, grid, taxSettings, dayOffSettings, records);
    }
    if (focused && focused !== document.body && focused.isConnected && document.activeElement !== focused) {
      focused.focus({preventScroll: true});
    }
  }
  mobileLayout.addEventListener('change', updateDailyLayout);

  // Mensagens textuais usam textContent para não interpretar conteúdo da API como HTML.
  function showError(message) { $('error-text').textContent = message; $('error-banner').hidden = false; }
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000);
  }
  function stats(id, result, profitLabel = 'Lucro diário') {
    const cards = [
      {label: 'Faturamento bruto', value: result.revenue, icon: '↗', className: 'revenue', note: 'Total informado ao backend'},
      {label: 'Despesas', value: result.expenses, icon: '↙', className: 'expenses', note: 'Somatório dos totais diários'},
      {label: 'Imposto descontado', value: result.tax, icon: '%', className: '', note: 'Desconto sobre o faturamento bruto'},
      {label: result.profit !== null && result.profit < 0 ? profitLabel.replace('Lucro', 'Prejuízo') : profitLabel, value: result.profit, icon: '$', className: 'highlight', note: result.margin === null ? 'Margem indisponível' : `${percent(result.margin)} de margem`}
    ];
    $(id).innerHTML = cards.map(card => `<div class="stat-card ${card.className}"><div class="stat-top"><span>${card.label}</span><span class="stat-symbol" aria-hidden="true">${card.icon}</span></div><div class="stat-value ${card.value < 0 ? 'negative' : ''}">${money(card.value)}</div><div class="stat-foot">${card.value === null ? 'Valor ainda não registrado' : card.note}</div></div>`).join('');
  }
  // Mostra um fechamento diário, sem inventar lançamentos individuais/categorias que o banco não guarda.
  function renderDay(fillInputs = true) {
    const result = totals([day]); stats('daily-stats', result);
    $('entry-date-label').textContent = readableDate(day.date);
    $('result-date').textContent = readableDate(day.date);
    $('daily-result').innerHTML = `<div class="profit-label">${result.profit !== null && result.profit < 0 ? 'Prejuízo diário' : 'Lucro diário'}</div><div class="profit-value ${result.profit < 0 ? 'negative' : ''}">${money(result.profit)}</div><div class="margin-pill">${result.margin === null ? 'Margem indisponível' : `${percent(result.margin)} de margem`}</div><div class="balance-labels"><div>Faturamento<strong class="financial-revenue">${money(result.revenue)}</strong></div><div>Imposto descontado<strong>${money(result.tax)}</strong></div></div>`;
    $('daily-expense-total').textContent = money(day.expenseCents);
    $('daily-expense-count').textContent = day.expenseCents === null ? 'Total ainda não informado.' : `Total registrado em ${readableDate(day.date)}.`;
    $('day-status').textContent = isDayOff(day.date) ? 'Dia de folga: não é permitido fazer lançamentos nesta data.' : day.exists ? 'Esta data já foi registrada. Alterações e recálculos são feitos em Editar e excluir dados.'
      : day.date < firstLaunchDate() ? 'O prazo de lançamento nesta aba terminou. Adicione esta data em Editar e excluir dados.'
      : 'Data disponível para um único lançamento. Informe os dois totais para salvar.';
    $('record-count').textContent = day.exists ? '1 fechamento' : 'Sem fechamento';
    $('daily-records').innerHTML = day.exists ? `<tr><td>${readableDate(day.date)}</td><td class="number ${result.revenue === null ? '' : 'financial-revenue'}">${money(result.revenue)}</td><td class="number">${money(result.expenses)}</td><td class="number">${money(result.tax)}</td><td class="number ${result.profit === null ? '' : result.profit < 0 ? 'negative' : 'financial-profit'}">${money(result.profit)}</td></tr>` : '<tr><td colspan="5" class="empty">Nenhum fechamento salvo para esta data.</td></tr>';
    if (fillInputs) {
      $('revenue-amount').value = day.revenueCents === null ? '' : (day.revenueCents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      $('expense-amount').value = day.expenseCents === null ? '' : (day.expenseCents / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
  }
  async function loadDay() {
    const date = $('daily-date').value;
    if (!date || saving) return;
    const request = ++dayRequest;
    $('save-button').disabled = true;
    $('daily-edit-link').hidden = true;
    $('error-banner').hidden = true; $('daily-view').classList.add('loading');
    $('revenue-amount').setCustomValidity(''); $('expense-amount').setCustomValidity('');
    try {
      validateClosingDate();
      const result = await TonyAPI.getDay(date);
      if (request !== dayRequest) return;
      day = result; renderDay(); renderTax(result.taxRate); updateDailyLayout();
      window.TonyReminders?.accept(result.reminders);
    } catch (error) {
      if (request !== dayRequest) return;
      window.TonyReminders?.invalidate();
      day = null; $('tax-current').textContent = 'Indisponível'; $('daily-stats').innerHTML = '';
      $('entry-date-label').textContent = readableDate(date);
      $('daily-result').innerHTML = '<p class="empty">Não foi possível carregar o resultado.</p>';
      $('daily-expense-total').textContent = '—'; $('daily-expense-count').textContent = 'Total indisponível.';
      $('day-status').textContent = 'A consulta falhou. Consulte novamente antes de salvar.';
      $('daily-records').innerHTML = '<tr><td colspan="5" class="empty">Dados indisponíveis.</td></tr>';
      $('record-count').textContent = ''; updateDailyLayout(); showError(error.message);
    } finally { if (request === dayRequest) { $('daily-view').classList.remove('loading'); updateDailyWriteAccess(); } }
  }
  function updateDailyWriteAccess() {
    const allowed = !saving && canLaunch();
    ['save-button', 'revenue-amount', 'expense-amount'].forEach(id => $(id).disabled = !allowed);
    $('daily-edit-link').hidden = !day || day.date !== $('daily-date').value || !!canLaunch();
  }
  // O formulário envia faturamento e despesas juntos, conforme calcular_dia().
  $('entry-form').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    try { validateClosingDate(); } catch (error) { showError(error.message); $('daily-date').reportValidity(); return; }
    if (!day || day.date !== $('daily-date').value) { showError('Consulte a data selecionada antes de salvar.'); return; }
    if (isDayOff(day.date)) { showError('Esta data está definida como dia de folga. Altere o dia fixo ou a exceção para fazer um lançamento.'); updateDailyWriteAccess(); return; }
    if (!canLaunch()) { showError('Esta data deve ser adicionada ou alterada em Editar e excluir dados.'); updateDailyWriteAccess(); return; }
    const values = {};
    for (const id of ['revenue-amount', 'expense-amount']) {
      try { values[id] = parseMoney($(id).value); }
      catch (error) { $(id).setCustomValidity(error.message); $(id).reportValidity(); return; }
    }
    saving = true;
    const session = sessionVersion;
    const controls = [...$('entry-form').elements, $('daily-date'), ...document.querySelectorAll('[data-view]')];
    controls.forEach(control => control.disabled = true);
    $('save-button').textContent = 'Salvando e calculando…'; $('error-banner').hidden = true;
    try {
      const result = await TonyAPI.saveDay($('daily-date').value, values['revenue-amount'], values['expense-amount']);
      if (session !== sessionVersion) return;
      day = result;
      day.exists = true;
      renderDay(); renderTax(day.taxRate); updateDailyLayout(); toast('Salvo com sucesso!');
      window.TonyReminders?.recordChanged(day.date, day.complete);
    } catch (error) {
      // Uma perda de conexão pode ocorrer após o commit; consulte antes de reenviar.
      if (session !== sessionVersion) return;
      console.error('Não foi possível concluir o salvamento do fechamento:', error.message);
      showError(`${error.message} Não foi possível confirmar o resultado. Consulte esta data antes de tentar novamente.`);
      day = null;
    } finally {
      saving = false; controls.forEach(control => control.disabled = false);
      $('save-button').textContent = 'Salvar e calcular o dia';
      updateDailyWriteAccess();
    }
  });
  ['revenue-amount', 'expense-amount'].forEach(id => {
    $(id).addEventListener('input', () => $(id).setCustomValidity(''));
    $(id).addEventListener('blur', () => {
      try { if ($(id).value) $(id).value = (parseMoney($(id).value) / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}); } catch { /* Validação será mostrada ao salvar. */ }
    });
  });

  // A taxa atual afeta os próximos cálculos; não reescreve automaticamente o histórico.
  function renderTax(rate) {
    $('tax-current').textContent = rate === null ? 'Não cadastrada' : percent(rate * 100);
  }
  $('tax-form').addEventListener('submit', async event => {
    event.preventDefault(); const text = $('tax-rate').value.trim();
    if (!text) { toast('Nenhuma taxa informada. A taxa atual foi preservada.'); return; }
    if (!/^\d+(?:[,.]\d{1,6})?$/.test(text)) { $('tax-rate').setCustomValidity('Informe um percentual válido, como 15 ou 6,5.'); $('tax-rate').reportValidity(); return; }
    const rate = Number(text.replace(',', '.')) / 100;
    if (!Number.isFinite(rate) || rate > 1 || Math.abs(rate * 1e6 - Math.round(rate * 1e6)) > 1e-7) { $('tax-rate').setCustomValidity('Informe de 0% a 100%, com até quatro casas decimais no percentual.'); $('tax-rate').reportValidity(); return; }
    if (!window.confirm(`Atualizar a taxa de imposto para ${percent(rate * 100)}? Esta taxa será usada nos próximos cálculos.`)) return;
    // Mostra o andamento enquanto a API grava a nova taxa global.
    $('save-tax').disabled = true; $('save-tax').textContent = 'Atualizando…';
    try {
      const result = await TonyAPI.saveTax(rate);
      $('tax-rate').value = ''; renderTax(result.taxRate);
      toast(result.alterado === false ? 'Esta já é a taxa de imposto atual.' : 'Taxa de imposto atualizada.');
    }
    catch (error) { showError(error.message); }
    finally { $('save-tax').disabled = false; $('save-tax').textContent = 'Atualizar taxa de imposto'; }
  });
  $('tax-rate').addEventListener('input', () => $('tax-rate').setCustomValidity(''));
  function renderDayOff(config) {
    dayOff = config || {dia_semana: null, dia_excecao: null, tipo_excecao: null};
    const weekday = Number(dayOff.dia_semana);
    $('day-off-weekday').value = weekday >= 1 && weekday <= 7 ? String(weekday) : '';
    $('day-off-weekday-current').textContent = weekdayNames[weekday] || 'Não configurado';
    $('day-off-status').textContent = weekdayNames[weekday] ? `Lançamentos bloqueados toda ${weekdayNames[weekday].toLowerCase()}.` : 'Escolha um dia fixo da semana.';
    $('day-off-exception-date').value = dayOff.dia_excecao || '';
    $('day-off-exception-type').value = dayOff.tipo_excecao || 'adicional';
    $('day-off-exception-status').textContent = dayOff.dia_excecao
      ? dayOff.tipo_excecao === 'substituir'
        ? `Na semana de ${readableDate(dayOff.dia_excecao)}, a folga fixa será transferida para esta data.`
        : `Esta data também fica bloqueada: ${readableDate(dayOff.dia_excecao)}.`
      : 'Nenhuma exceção temporária definida.';
    $('clear-day-off-exception').hidden = !dayOff.dia_excecao;
    if (day) renderDay(false);
    updateDailyWriteAccess();
  }
  async function loadDayOff() {
    $('save-day-off').disabled = $('save-day-off-exception').disabled = $('clear-day-off-exception').disabled = true;
    try { renderDayOff(await TonyAPI.getDayOff()); dayOffLoaded = true; updateDailyWriteAccess(); }
    catch (error) { dayOffLoaded = false; dayOff = null; $('day-off-status').textContent = 'Não foi possível confirmar a configuração. Tente novamente.'; showError(error.message); updateDailyWriteAccess(); }
    finally { $('save-day-off').disabled = $('save-day-off-exception').disabled = $('clear-day-off-exception').disabled = false; }
  }
  $('day-off-form').addEventListener('submit', async event => {
    event.preventDefault();
    const weekday = Number($('day-off-weekday').value);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) { showError('Escolha um dia fixo da semana.'); return; }
    $('save-day-off').disabled = true;
    try { await TonyAPI.saveDayOff(weekday); renderDayOff({...dayOff, dia_semana: weekday}); dayOffLoaded = true; updateDailyWriteAccess(); toast(`Folga fixa alterada para ${weekdayNames[weekday]}.`); }
    catch (error) { showError(error.message); }
    finally { $('save-day-off').disabled = false; }
  });
  $('day-off-exception-form').addEventListener('submit', async event => {
    event.preventDefault();
    const date = $('day-off-exception-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showError('Escolha uma data para a exceção temporária.'); return; }
    const type = $('day-off-exception-type').value;
    $('save-day-off-exception').disabled = true;
    try {
      const saved = await TonyAPI.saveDayOffException(date, type);
      renderDayOff({...dayOff, dia_excecao: saved.dia_excecao, tipo_excecao: saved.tipo_excecao});
      dayOffLoaded = true;
      toast('Exceção temporária salva.');
    } catch (error) { showError(error.message); }
    finally { $('save-day-off-exception').disabled = false; }
  });
  $('clear-day-off-exception').addEventListener('click', async () => {
    $('clear-day-off-exception').disabled = true;
    try {
      await TonyAPI.clearDayOffException();
      renderDayOff({...dayOff, dia_excecao: null, tipo_excecao: null});
      dayOffLoaded = true;
      toast('Exceção temporária removida.');
    } catch (error) { showError(error.message); }
    finally { $('clear-day-off-exception').disabled = false; }
  });
  loadDayOff();
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
        svg += `<rect x="${center + (series - 1) * bar * 1.25 - bar / 2}" y="${Math.min(y(0), y(value))}" width="${bar}" height="${Math.abs(y(0) - y(value))}" rx="3" fill="${series === 2 && value < 0 ? '#dc352f' : ['#ffdc29', '#dc352f', '#137333'][series]}"><title>${month.month}: ${money(value)}</title></rect>`;
      });
      svg += `<text x="${center}" y="240" text-anchor="middle" font-size="12" fill="#777">${month.month.slice(5)}/${month.month.slice(2, 4)}</text>`;
    });
    $('chart').innerHTML = svg + '</svg>';
  }
  function renderPeriod(days, start, end) {
    const result = totals(days), months = monthsFor(days, start, end); stats('period-stats', result, 'Lucro do período'); renderChart(months);
    const pending = days.filter(day => !day.complete).length;
    $('period-summary').innerHTML = `<div class="period-summary-row"><span>Dias cadastrados</span><strong>${days.length}</strong></div><div class="period-summary-row"><span>Dias completos</span><strong>${days.length - pending}</strong></div><div class="period-summary-row"><span>Dias pendentes</span><strong>${pending}</strong></div><p class="field-help">${pending ? 'Há valores não registrados. Os totais afetados aparecem como traço.' : 'O lucro usa os valores já registrados.'}</p>`;
    $('monthly-records').innerHTML = months.map(month => `<tr><td>${monthName(month.month)}</td><td class="number ${month.revenue === null ? '' : 'financial-revenue'}">${money(month.revenue)}</td><td class="number">${money(month.expenses)}</td><td class="number">${money(month.tax)}</td><td class="number ${month.profit === null ? '' : month.profit < 0 ? 'negative' : 'financial-profit'}">${money(month.profit)}</td><td class="number">${percent(month.margin)}</td></tr>`).join('');
    $('period-caption').textContent = `${readableDate(start)} a ${readableDate(end)} · Somente os dias dentro do intervalo. Traço indica informação pendente.`;
  }
  async function loadPeriod() {
    const {start, end} = range(); if (!start || !end) return;
    if (start > end) { $('end-date').setCustomValidity('A data final deve ser igual ou posterior à inicial.'); $('end-date').reportValidity(); return; }
    if (Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 10) { showError('Selecione um período de até 10 anos.'); return; }
    const request = ++periodRequest; $('error-banner').hidden = true; $('period-view').classList.add('loading');
    $('period-results').hidden = true;
    $('period-message').hidden = false; $('period-message').textContent = 'Consultando período…';
    try {
      const days = await TonyAPI.getPeriod(start, end); if (request !== periodRequest) return; renderPeriod(days, start, end);
      $('period-results').hidden = false; $('period-message').hidden = true;
    } catch (error) {
      if (request !== periodRequest) return;
      $('period-stats').innerHTML = ''; $('period-summary').textContent = 'Consulta indisponível.';
      $('chart').innerHTML = '<p class="empty">Dados indisponíveis.</p>';
      $('monthly-records').innerHTML = '';
      $('period-message').textContent = 'Não foi possível consultar. Clique no botão para tentar novamente.'; showError(error.message);
    } finally { if (request === periodRequest) $('period-view').classList.remove('loading'); }
  }
  function resetPeriod() {
    // Invalida respostas antigas sem consultar a API ao abrir ou mudar filtros.
    ++periodRequest;
    $('period-view').classList.remove('loading');
    $('period-results').hidden = true;
    $('period-message').hidden = false;
    $('period-message').textContent = document.querySelector('[name="range-mode"]:checked').value === 'month'
      ? 'clique ver mês completo para ver os dados'
      : 'Clique em Aplicar período para ver os dados.';
  }
  // Eventos de filtro mantêm controles visíveis e validação sincronizados.
  $('period-form').addEventListener('submit', event => { event.preventDefault(); loadPeriod(); });
  document.querySelectorAll('[name="range-mode"]').forEach(radio => radio.addEventListener('change', () => { setMode(radio.value); resetPeriod(); }));
  $('selected-month').addEventListener('change', resetPeriod);
  $('period-preset').addEventListener('change', () => { setPreset($('period-preset').value); resetPeriod(); });
  ['start-date', 'end-date'].forEach(id => $(id).addEventListener('input', () => { $('end-date').setCustomValidity(''); $('period-preset').value = 'custom'; resetPeriod(); }));
  function resetManagement(message = 'Escolha a data e clique em Consultar registro.') {
    ++manageRequest; managedDay = null;
    $('manage-editor').hidden = true; $('manage-message').textContent = message;
  }
  function renderManagedDay() {
    $('manage-editor').hidden = false;
    $('manage-date-label').textContent = readableDate(managedDay.date);
    $('manage-new-date').value = managedDay.date;
    $('manage-new-date').max = businessToday();
    $('manage-new-date').disabled = !managedDay.exists;
    $('manage-new-date').setCustomValidity('');
    $('manage-delete').hidden = !managedDay.exists;
    $('manage-save').textContent = managedDay.exists ? 'Salvar e recalcular' : 'Adicionar e calcular';
    $('manage-summary').textContent = `Bruto: ${money(managedDay.revenueCents)} · Despesas: ${money(managedDay.expenseCents)} · Lucro: ${money(managedDay.profitCents)}`;
    for (const [id, value] of [['manage-revenue', managedDay.revenueCents], ['manage-expenses', managedDay.expenseCents]]) {
      $(id).value = value === null ? '' : (value / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      $(id).setCustomValidity('');
    }
    const future = managedDay.date > businessToday();
    $('manage-save').disabled = managedDay.taxRate === null;
    $('manage-tax-note').textContent = future ? 'Corrija a data para hoje ou um dia anterior, ou exclua este registro.'
      : managedDay.taxRate === null ? 'Cadastre a taxa de imposto no cálculo diário antes de editar.'
      : `Ao salvar, o lucro será recalculado com a taxa atual de ${percent(managedDay.taxRate * 100)}. Os totais do mês e do ano serão atualizados.`;
    $('manage-message').textContent = managedDay.exists ? 'Registro carregado. Confira a data e os valores antes de alterar.' : 'Não há registro nesta data. Informe os totais para adicionar e calcular.';
  }
  async function loadManagedDay() {
    if (managing) return;
    const date = $('manage-date').value;
    resetManagement('Consultando registro…');
    if (!date) { resetManagement(); return; }
    const request = manageRequest;
    $('error-banner').hidden = true;
    $('manage-search-button').disabled = true;
    try {
      const result = await TonyAPI.getDay(date);
      if (request !== manageRequest) return;
      managedDay = result; renderManagedDay();
      window.TonyReminders?.accept(result.reminders);
    } catch (error) {
      if (request !== manageRequest) return;
      resetManagement('Não foi possível consultar. Clique em Consultar registro para tentar novamente.'); showError(error.message);
    } finally { $('manage-search-button').disabled = false; }
  }
  function invalidateReports(date) {
    resetPeriod();
    if (day && day.date === date) { ++dayRequest; day = null; }
  }
  async function mutateManagedDay(deleting) {
    if (managing || !managedDay || managedDay.date !== $('manage-date').value) return;
    const original = managedDay;
    if (deleting && !original.exists) return;
    let revenue, expenses, newDate = original.date;
    if (!deleting) {
      newDate = $('manage-new-date').value;
      $('manage-new-date').max = businessToday();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate > businessToday()) { $('manage-new-date').setCustomValidity('Escolha hoje ou uma data anterior.'); $('manage-new-date').reportValidity(); showError('Datas futuras não podem ser registradas.'); return; }
      for (const id of ['manage-revenue', 'manage-expenses']) {
        try { const value = parseMoney($(id).value); if (id === 'manage-revenue') revenue = value; else expenses = value; }
        catch (error) { $(id).setCustomValidity(error.message); $(id).reportValidity(); return; }
      }
    }
    const prompt = deleting ? `Excluir todo o registro de ${readableDate(original.date)}? Esta ação não pode ser desfeita.`
      : `${original.exists ? 'Salvar e recalcular' : 'Adicionar'} o faturamento de ${readableDate(original.date)}${newDate !== original.date ? ' na nova data ' + readableDate(newDate) : ''}? Será usada a taxa atual de imposto.`;
    if (!window.confirm(prompt)) return;
    managing = true; ++manageRequest; $('error-banner').hidden = true;
    const session = sessionVersion;
    const controls = [$('manage-date'), $('manage-new-date'), $('manage-search-button'), $('manage-save'), $('manage-delete'), $('manage-revenue'), $('manage-expenses'), ...document.querySelectorAll('[data-view]')];
    controls.forEach(control => control.disabled = true);
    $('manage-message').textContent = deleting ? 'Excluindo registro…' : 'Salvando alterações…';
    try {
      if (deleting) {
        await TonyAPI.deleteDay(original);
        if (session !== sessionVersion) return;
        resetManagement(`Registro de ${readableDate(original.date)} excluído.`); toast('Registro excluído.');
        window.TonyReminders?.recordChanged(original.date, false);
      } else {
        const result = await TonyAPI.editDay(original, revenue, expenses, newDate);
        if (session !== sessionVersion) return;
        managedDay = result;
        if (original.date !== newDate) window.TonyReminders?.recordChanged(original.date, false);
        window.TonyReminders?.recordChanged(result.date, result.complete);
        $('manage-date').value = managedDay.date;
        renderManagedDay(); toast('Alterações salvas.');
      }
      invalidateReports(original.date);
      if (newDate !== original.date) invalidateReports(newDate);
    } catch (error) {
      // Uma falha de rede pode ocorrer depois do commit: exige nova consulta.
      if (session !== sessionVersion) return;
      resetManagement('Consulte novamente para confirmar o estado do registro antes de continuar.');
      window.TonyReminders?.invalidate();
      invalidateReports(original.date); showError(error.message);
    } finally {
      managing = false; controls.forEach(control => control.disabled = false);
      if (managedDay) { $('manage-save').disabled = managedDay.taxRate === null; $('manage-new-date').disabled = !managedDay.exists; }
    }
  }
  $('manage-search').addEventListener('submit', event => { event.preventDefault(); loadManagedDay(); });
  $('manage-date').addEventListener('input', () => { if (!managing) resetManagement(); });
  $('manage-form').addEventListener('submit', event => { event.preventDefault(); mutateManagedDay(false); });
  $('manage-delete').addEventListener('click', () => mutateManagedDay(true));
  ['manage-revenue', 'manage-expenses'].forEach(id => $(id).addEventListener('input', () => $(id).setCustomValidity('')));
  $('manage-new-date').addEventListener('input', () => $('manage-new-date').setCustomValidity(''));

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (saving || managing) return;
    view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => { item.classList.toggle('active', item === button); if (item === button) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    $('daily-view').hidden = view !== 'daily'; $('period-view').hidden = view !== 'period'; $('daily-date-wrap').hidden = view !== 'daily';
    $('manage-view').hidden = view !== 'manage';
    $('reminders-view').hidden = view !== 'reminders';
    $('page-title').innerHTML = ({daily: 'Calculo diário', period: 'Consultar mês e período', manage: 'Editar e excluir dados', reminders: 'Lembretes'}[view]) + '<span>.</span>';
    $('page-description').textContent = ({daily: 'Fechamento com faturamento, despesas e imposto.', period: 'Lucros registrados no período.', manage: 'Consulte uma data para corrigir os valores ou excluir seu fechamento.', reminders: 'Escolha quando lembrar dos lançamentos pendentes.'}[view]);
    resetManagement();
    resetPeriod(); $('error-banner').hidden = true;
    if (view === 'daily') loadDay();
  }));
  $('retry').addEventListener('click', () => { if (view === 'daily') loadDay(); else if (view === 'manage') loadManagedDay(); else resetPeriod(); });
  $('daily-edit-link').addEventListener('click', event => {
    event.preventDefault(); if (saving || managing) return;
    const date = $('daily-date').value;
    document.querySelector('[data-view="manage"]').click();
    $('manage-date').value = date;
    loadManagedDay();
  });
  window.addEventListener('tony:reminder-open', event => {
    if (saving || managing || !/^\d{4}-\d{2}-\d{2}$/.test(event.detail)) return;
    document.querySelector('[data-view="manage"]').click();
    $('manage-date').value = event.detail; loadManagedDay();
  });
  // Inicialização não realiza escritas no backend nem recalcula o histórico.
  $('daily-date').value = dailyDateLimit(); $('selected-month').value = businessToday().slice(0, 7);
  $('manage-date').value = businessToday(); resetManagement();
  updateDailyLayout();
  updateDailyWriteAccess();
  setPreset('month'); setMode('month'); resetPeriod(); $('mode-label').textContent = 'Dados da API';
  document.querySelector('[data-view="daily"]').setAttribute('aria-current', 'page');
  window.addEventListener('tony:authenticated', () => {
    resetManagement();
    resetPeriod();
    if (dashboardStarted) {
      loadDay();
      return;
    }
    dashboardStarted = true;
    loadDay();
  });
  window.addEventListener('tony:signed-out', () => {
    ++sessionVersion;
    ++dayRequest; day = null; resetPeriod(); resetManagement();
    ['daily-stats', 'daily-result', 'daily-records'].forEach(id => $(id).innerHTML = '');
    ['revenue-amount', 'expense-amount', 'manage-revenue', 'manage-expenses'].forEach(id => $(id).value = '');
    $('daily-view').classList.remove('loading');
    updateDailyWriteAccess();
  });
})();
