const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodes = new Map(), events = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {hidden: true, value: '', checked: false, dataset: {}, textContent: '', children: [], listeners: {}, elements: [],
    replaceChildren() {this.children=[];}, append(child) {this.children.push(child);}, addEventListener(name, cb) {this.listeners[name]=cb;}});
  return nodes.get(id);
}
const weekdays = [1,2,3,4,5,6,7].map(i => {const n=node('weekday'+i);n.value=String(i);return n;});
const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const previous = offset => new Date(Date.parse(today+'T12:00:00Z')-offset*86400000).toISOString().slice(0,10);
let writes=0, registrations=0, resolveSave;
const context = {console, Intl, Date, Uint8Array, atob, CustomEvent: class {constructor(type, args) {this.type=type;this.detail=args.detail;}},
  navigator: {}, document:{getElementById:node,querySelectorAll:()=>weekdays,createElement:()=>({children:[],listeners:{},append(n){this.children.push(n);},addEventListener(k,v){this.listeners[k]=v;}})},
  window:{addEventListener:(k,v)=>events.set(k,v),dispatchEvent:event=>events.get(event.type)?.(event)},
  TonyAPI:{saveReminderConfig: data=>{writes++;return new Promise(resolve=>resolveSave=()=>resolve(data));},registerPush:()=>{registrations++;}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../Frontend/reminders.js'),'utf8'),context);
const reminders=context.window.TonyReminders;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const accept = config => reminders.accept({hoje:today,pendentes:[previous(1),previous(2),previous(7)],config:config||{ativo:true,dias:1,semana:[1,2,3,4,5,6,7]},chave_publica:'public'});
(async()=>{
  assert.equal(writes,0);
  accept(); assert.equal(node('reminder-pending').children.length,1);
  assert.equal(node('reminder-banner').hidden,false);
  accept({ativo:true,dias:2,semana:[1,2,3,4,5,6,7]}); assert.equal(node('reminder-pending').children.length,2);
  reminders.recordChanged(previous(1),true); assert.equal(node('reminder-pending').children.length,1);
  reminders.recordChanged(previous(1),false); assert.equal(node('reminder-pending').children.length,2);
  accept({ativo:false,dias:7,semana:[1]}); assert.equal(node('reminder-banner').hidden,true);
  accept({ativo:true,dias:7,semana:[new Date(previous(7)+'T12:00:00Z').getUTCDay()||7]});
  assert.equal(node('reminder-pending').children.length,1);
  assert.equal(writes,0);
  node('reminder-form').listeners.submit({preventDefault(){}});
  events.get('tony:signed-out')(); resolveSave(); await flush();
  assert.equal(node('reminder-banner').hidden,true);
  assert.equal(node('reminder-pending').children.length,0);
  assert.equal(node('reminder-days').value,'1');
  node('push-enable').listeners.click(); await flush();
  assert.equal(registrations,0);
  assert.match(node('reminder-feedback').textContent,/navegador/);
  reminders.invalidate(); assert.equal(node('reminder-banner').hidden,true);
  console.log('Lembretes: janela, dias da semana, alterações sem consultas extras e limpeza da sessão aprovados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
