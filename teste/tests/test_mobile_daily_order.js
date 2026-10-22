const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {
    id, children: [], parent: null, value: '', hidden: false, textContent: '', innerHTML: '',
    disabled: false, elements: [], dataset: {}, listeners: {},
    classList: {add() {}, remove() {}, toggle() {}},
    setAttribute() {}, removeAttribute() {}, setCustomValidity() {}, reportValidity() {},
    addEventListener(name, callback) {this.listeners[name] = callback;},
    append(...items) {
      for (const item of items) {
        if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item);
        item.parent = this; this.children.push(item);
      }
    },
    insertBefore(item, before) {
      if (item.parent) item.parent.children = item.parent.children.filter(child => child !== item);
      item.parent = this; this.children.splice(this.children.indexOf(before), 0, item);
    }
  });
  return nodes.get(id);
};
const panel = node('daily-view'), grid = node('daily-grid'), calculator = node('daily-calculator');
calculator.append(node('daily-date-wrap'), node('closing-date'));
grid.append(calculator, node('daily-report'));
panel.append(node('mobile-date-slot'), node('daily-stats'), grid,
  node('daily-tax-settings'), node('daily-record-card'));
const daily = node('daily-nav'), period = node('period-nav');
daily.dataset.view = 'daily'; period.dataset.view = 'period';
const mode = node('month-radio'); mode.value = 'month';
let resize, requests = 0, saves = 0, exists = true;
const media = {matches: true, addEventListener(name, callback) {resize = callback;}};
const window = {matchMedia: () => media, addEventListener() {}};
const context = {window, console, setTimeout, clearTimeout,
  document: {getElementById: node,
    querySelector: selector => selector.includes('range-mode') ? mode : daily,
    querySelectorAll: selector => selector.includes('range-mode') ? [mode] : [daily, period]},
  TonyAPI: {getDayOff: async () => ({dia_semana: null, dia_excecao: null, tipo_excecao: null}), saveDay: async date => {saves++; return {date, exists: true, complete: true, revenueCents: 100000, expenseCents: 25000, profitCents: 60000, taxCents: 15000, taxRate: 0.15};}, getDay: async date => {requests++; return {date, exists,
    revenueCents: exists ? 100000 : null, expenseCents: exists ? 25000 : null,
    profitCents: exists ? 60000 : null, taxCents: exists ? 15000 : null,
    complete: exists, taxRate: 0.15};}}
};
for (const name of ['finance.js', 'app.js']) {
  if (name === 'app.js') context.TonyFinance = window.TonyFinance;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Frontend', name), 'utf8'), context);
}
const ids = () => panel.children.map(item => item.id);
const flush = () => new Promise(resolve => setImmediate(resolve));
const select = async value => {node('daily-date').value = value;
  await node('daily-date').listeners.change(); await flush();};
(async () => {
  const initialDate = node('daily-date').value;
  const offset = days => {const value = new Date(initialDate + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10);};
  assert.equal(node('daily-date').max, initialDate);
  assert(ids().indexOf('daily-calculator') < ids().indexOf('daily-stats'));
  assert.equal(node('daily-date-wrap').parent.id, 'mobile-date-slot');
  await select(initialDate);
  assert(ids().indexOf('daily-calculator') < ids().indexOf('daily-report'));
  await select('2000-01-01');
  assert.equal(node('save-button').disabled, true);
  await node('entry-form').listeners.submit({preventDefault() {}});
  assert.equal(saves, 0);
  assert(ids().indexOf('daily-report') < ids().indexOf('daily-calculator'));
  const valueBeforeResize = node('revenue-amount').value;
  const callsBeforeResize = requests;
  media.matches = false; resize();
  assert.deepEqual(grid.children.map(item => item.id), ['daily-calculator', 'daily-report']);
  assert.equal(node('daily-date-wrap').parent.id, 'daily-calculator');
  assert(ids().indexOf('daily-stats') < ids().indexOf('daily-grid'));
  media.matches = true; resize();
  assert(ids().indexOf('daily-report') < ids().indexOf('daily-calculator'));
  assert.equal(requests, callsBeforeResize);
  assert.equal(node('revenue-amount').value, valueBeforeResize);
  exists = false;
  await select(offset(7)); assert.equal(node('save-button').disabled, false);
  assert.equal(node('daily-edit-link').hidden, true);
  await select(offset(8)); assert.equal(node('save-button').disabled, true);
  assert.equal(node('daily-edit-link').hidden, false);
  await select('2000-01-02');
  assert(ids().indexOf('daily-calculator') < ids().indexOf('daily-report'));
  exists = true;
  const callsBeforeInvalid = requests;
  await select('2099-01-01');
  assert.equal(requests, callsBeforeInvalid);
  assert.equal(node('error-banner').hidden, false);
  await node('entry-form').listeners.submit({preventDefault() {}});
  assert.equal(requests, callsBeforeInvalid);
  assert.equal(saves, 0);
  const todayParts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const part = type => todayParts.find(item => item.type === type).value;
  exists = false;
  await select(`${part('year')}-${part('month')}-${part('day')}`);
  assert.equal(node('save-button').disabled, false);
  assert.equal(requests, callsBeforeInvalid + 1);
  node('revenue-amount').value = '1000,00'; node('expense-amount').value = '250,00';
  await node('entry-form').listeners.submit({preventDefault() {}});
  assert.equal(saves, 1);
  assert.equal(node('save-button').disabled, true);
  await node('entry-form').listeners.submit({preventDefault() {}});
  assert.equal(saves, 1);
  assert(ids().indexOf('daily-calculator') < ids().indexOf('daily-report'));
  assert.equal(new Set(ids()).size, ids().length);
  console.log('Celular: fechamento primeiro; histórico existente primeiro; desktop restaurado sem novas consultas.');
})().catch(error => {console.error(error); process.exitCode = 1;});
