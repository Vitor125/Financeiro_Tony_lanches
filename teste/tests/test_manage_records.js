const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', elements: [], dataset: {}, listeners: {},
    classList: {add() {}, remove() {}, toggle() {}}, setAttribute() {}, removeAttribute() {}, append() {}, insertBefore() {},
    setCustomValidity(value) {this.validityMessage = value;}, reportValidity() {}, click() {this.listeners.click();}, addEventListener(name, fn) {this.listeners[name] = fn;}});
  return nodes.get(id);
};
const navs = ['daily', 'period', 'manage'].map(view => {const item = node(view + '-nav'); item.dataset.view = view; return item;});
const mode = node('month'); mode.value = 'month';
let queries = 0, edits = 0, deletes = 0, confirmed = false, resolveDay, failure = false;
const record = date => ({date, exists: true, complete: true, revenueCents: 100000, expenseCents: 25000, profitCents: 60000, taxCents: 15000, taxRate: 0.15});
const events = new Map();
const window = {confirm: () => confirmed, addEventListener(name, fn) {events.set(name, fn);}, matchMedia: () => ({matches: true, addEventListener() {}})};
const context = {window, console, setTimeout: () => 1, clearTimeout() {},
  document: {getElementById: node, querySelector: sel => sel.includes('range-mode') ? mode : sel.includes('manage') ? navs[2] : navs[0], querySelectorAll: sel => sel.includes('range-mode') ? [mode] : navs},
  TonyAPI: {
    getDayOff: async () => ({dia_semana: null, dia_excecao: null, tipo_excecao: null}),
    getDay: date => {queries++; return new Promise(resolve => {resolveDay = value => resolve(value || record(date));});},
    editDay: async (original, revenue, expenses, newDate) => {edits++; if (failure) throw new Error('Conflito'); return {...original, date: newDate, exists: true, revenueCents: revenue, expenseCents: expenses};},
    deleteDay: async () => {deletes++; if (failure) throw new Error('Conflito'); return {excluido: true};}
  }};
for (const file of ['finance.js', 'app.js']) {
  if (file === 'app.js') context.TonyFinance = window.TonyFinance;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Frontend', file), 'utf8'), context);
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const submit = id => node(id).listeners.submit({preventDefault() {}});
const load = async value => {node('manage-date').value = value; submit('manage-search'); resolveDay(); await flush();};
(async () => {
  navs[2].listeners.click();
  assert.equal(queries, 0); assert.equal(node('manage-view').hidden, false); assert.equal(node('daily-view').hidden, true);
  await load('2000-01-01'); assert.equal(queries, 1); assert.equal(node('manage-editor').hidden, false);
  assert.equal(node('manage-revenue').value, '1.000,00');
  submit('manage-form'); await flush(); assert.equal(edits, 0);
  node('manage-delete').listeners.click(); await flush(); assert.equal(deletes, 0);
  confirmed = true; node('manage-revenue').value = '1200,00';
  submit('manage-form'); await flush(); assert.equal(edits, 1); assert.equal(queries, 1);
  assert.equal(node('manage-date').disabled, false);
  node('manage-delete').listeners.click(); await flush(); assert.equal(deletes, 1); assert.equal(queries, 1);
  assert.equal(node('manage-editor').hidden, true);
  node('manage-delete').listeners.click(); await flush(); assert.equal(deletes, 1);
  // Resposta atrasada não reaparece depois de mudar a data.
  submit('manage-search'); node('manage-date').value = '2000-02-01'; node('manage-date').listeners.input();
  resolveDay(); await flush(); assert.equal(node('manage-editor').hidden, true);
  // Ausência, falha e consulta futura não permitem editar inadvertidamente.
  submit('manage-search'); resolveDay({...record('2000-02-01'), exists: false}); await flush();
  assert.equal(node('manage-editor').hidden, false);
  assert.equal(node('manage-delete').hidden, true);
  node('manage-revenue').value = '100,00'; node('manage-expenses').value = '20,00';
  submit('manage-form'); await flush(); assert.equal(edits, 2);
  assert.equal(node('manage-new-date').disabled, false);
  node('manage-new-date').value = '2000-03-01';
  submit('manage-form'); await flush(); assert.equal(edits, 3);
  assert.equal(node('manage-date').value, '2000-03-01');
  await load('2000-02-01'); failure = true; submit('manage-form'); await flush();
  assert.equal(node('manage-editor').hidden, true); assert.equal(node('error-banner').hidden, false);
  failure = false; await load('2099-01-01');
  const editsBeforeFuture = edits; submit('manage-form'); await flush(); assert.equal(edits, editsBeforeFuture);
  node('manage-delete').listeners.click(); await flush(); assert.equal(deletes, 2);
  node('daily-date').value = '2000-04-01';
  const beforeLink = queries;
  node('daily-edit-link').listeners.click({preventDefault() {}});
  assert.equal(node('manage-date').value, '2000-04-01');
  assert.equal(node('manage-view').hidden, false);
  assert.equal(queries, beforeLink + 1);
  resolveDay(); await flush();
  assert.equal(node('manage-editor').hidden, false);
  submit('manage-form');
  events.get('tony:signed-out')(); await flush();
  assert.equal(node('manage-editor').hidden, true);
  assert.equal(node('manage-revenue').value, '');
  assert.equal(node('save-button').disabled, true);
  console.log('Gestão: consulta manual, confirmação, edição/exclusão sem consultas extras e proteção contra respostas antigas.');
})().catch(error => {console.error(error); process.exitCode = 1;});
