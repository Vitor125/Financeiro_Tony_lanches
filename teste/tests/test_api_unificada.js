const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const calls = [];
let response;
const window = {
  TONY_CONFIG: {apiBaseUrl: 'https://api.example.com', requestTimeoutMs: 1000},
  TonyAuth: {getIdToken: async () => 'token', signOut: async () => {}}
};
const context = {window, console, URLSearchParams, AbortController, setTimeout, clearTimeout,
  fetch: async (url, options) => {
    calls.push({url, options});
    return {ok: true, status: 200, json: async () => response};
  }};
for (const name of ['finance.js', 'api.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'Frontend', name), 'utf8'), context);
}
(async () => {
  response = {dia_mes_ano: '2030-03-02', existe: false, faturamento_bruto_diario: null,
    despesas_diarias: null, faturamento_liquido_diario: null, taxa_imposto_atual: '0.15'};
  const absent = await window.TonyAPI.getDay('2030-03-02');
  assert.equal(absent.exists, false);
  assert.equal(absent.revenueCents, null);
  assert.equal(absent.taxRate, 0.15);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.com/Faturamento/resumo_diario/2030-03-02');
  response = {...response, existe: true, faturamento_bruto_diario: '1000.00',
    despesas_diarias: '250.00', faturamento_liquido_diario: '600.00'};
  calls.length = 0;
  const saved = await window.TonyAPI.saveDay('2030-03-02', 100000, 25000);
  assert.equal(saved.profitCents, 60000);
  assert.equal(saved.taxRate, 0.15);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(calls[0].options.body), {dia_mes_ano: '2030-03-02',
    faturamento_bruto_diario: '1000.00', despesas_diarias: '250.00'});
  calls.length = 0;
  response = {dia_mes_ano: '2030-03-02', faturamento_bruto_diario: '1200.00', despesas_diarias: '300.00', faturamento_liquido_diario: '720.00', taxa_imposto_atual: '0.15'};
  const edited = await window.TonyAPI.editDay(saved, 120000, 30000);
  assert.equal(edited.profitCents, 72000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).original.faturamento_bruto_diario, '1000.00');
  calls.length = 0;
  response = {dia_mes_ano: saved.date, excluido: true};
  await window.TonyAPI.deleteDay(edited);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(JSON.parse(calls[0].options.body).original.faturamento_bruto_diario, '1200.00');
  calls.length = 0;
  response = {dia_mes_ano: '2030-02-01', faturamento_bruto_diario: '100.00', despesas_diarias: '20.00', faturamento_liquido_diario: '65.00', taxa_imposto_atual: '0.15'};
  await window.TonyAPI.editDay({...saved, exists: true}, 10000, 2000, '2030-02-01');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).nova_data, '2030-02-01');
  calls.length = 0;
  await window.TonyAPI.editDay({...saved, date: '2030-02-01', exists: false}, 10000, 2000);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).original, null);
  calls.length = 0;
  response = [{dia_mes_ano: '2030-03-02', faturamento_bruto_diario: '1000.00', despesas_diarias: '250.00', faturamento_liquido_diario: '600.00'}];
  const days = await window.TonyAPI.getPeriod('2030-03-01', '2030-03-31');
  assert.equal(days.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url,
    'https://api.example.com/Faturamento_geral?inicio=2030-03-01&fim=2030-03-31');
  calls.length = 0;
  response = {alterado: true, taxa_imposto_atual: '0.20'};
  const tax = await window.TonyAPI.saveTax(0.20);
  assert.equal(tax.taxRate, 0.20);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  console.log('Consulta diária, fechamento e período: uma requisição cada, com valores e token corretos.');
})().catch(error => {console.error(error); process.exitCode = 1;});
