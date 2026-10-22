const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    value: '', hidden: false, disabled: false, textContent: '', innerHTML: '',
    listeners: {}, elements: [], dataset: {},
    classList: {add() {}, remove() {}, toggle() {}},
    setAttribute() {}, removeAttribute() {}, setCustomValidity() {}, reportValidity() {},
    append() {}, insertBefore() {},
    addEventListener(name, fn) {this.listeners[name] = fn;}
  });
  return elements.get(id);
};
const daily = element('daily-nav'), period = element('period-nav');
daily.dataset.view = 'daily'; period.dataset.view = 'period';
const month = element('month-radio'), custom = element('custom-radio');
month.value = 'month'; custom.value = 'custom';
let selectedMode = month, queries = 0, resolvePeriod;
const window = {addEventListener() {}, matchMedia: () => ({matches: false, addEventListener() {}})};
const context = {window, console, setTimeout, clearTimeout,
  document: {
    getElementById: element,
    querySelector: selector => selector.includes('range-mode') ? selectedMode : daily,
    querySelectorAll: selector => selector.includes('range-mode') ? [month, custom] : [daily, period]
  },
  TonyAPI: {
    getDayOff: async () => ({dia_semana: null, dia_excecao: null, tipo_excecao: null}),
    getDay: async date => ({date, exists: false, revenueCents: null, expenseCents: null,
      profitCents: null, taxCents: null, complete: false, taxRate: 0.15}),
    getPeriod: () => {queries++; return new Promise(resolve => {resolvePeriod = resolve;});}
  }};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Frontend', 'finance.js'), 'utf8'), context);
context.TonyFinance = window.TonyFinance;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Frontend', 'app.js'), 'utf8'), context);
const submit = () => element('period-form').listeners.submit({preventDefault() {}});
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  assert.equal(queries, 0);
  assert.equal(element('period-results').hidden, true);
  assert.equal(element('period-message').textContent, 'clique ver mês completo para ver os dados');
  period.listeners.click();
  assert.equal(queries, 0);
  element('selected-month').value = '2030-03';
  element('selected-month').listeners.change();
  assert.equal(queries, 0);
  submit();
  assert.equal(queries, 1);
  assert.equal(element('period-results').hidden, true);
  resolvePeriod([]); await flush();
  assert.equal(element('period-results').hidden, false);
  assert.equal(element('period-message').hidden, true);
  element('selected-month').value = '2030-04';
  element('selected-month').listeners.change();
  assert.equal(element('period-results').hidden, true);
  assert.equal(queries, 1);
  submit();
  assert.equal(queries, 2);
  // Mudar filtros invalida a consulta anterior, inclusive se ela terminar depois.
  element('selected-month').value = '2030-05';
  element('selected-month').listeners.change();
  resolvePeriod([]); await flush();
  assert.equal(element('period-results').hidden, true);
  selectedMode = custom; custom.listeners.change();
  element('period-preset').value = 'last'; element('period-preset').listeners.change();
  element('start-date').listeners.input();
  element('retry').listeners.click();
  assert.equal(queries, 2);
  assert.match(element('period-message').textContent, /Aplicar período/);
  submit(); assert.equal(queries, 3);
  resolvePeriod([]); await flush();
  assert.equal(element('period-results').hidden, false);
  daily.listeners.click(); period.listeners.click();
  await flush();
  assert.equal(queries, 3);
  assert.equal(element('period-results').hidden, true);
  console.log('Visão por período só consulta no botão; filtros e respostas antigas não exibem dados.');
})().catch(error => {console.error(error); process.exitCode = 1;});
