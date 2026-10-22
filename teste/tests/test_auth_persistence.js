const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    elements.set(id, {
      hidden: id === 'app-sidebar' || id === 'app-main',
      disabled: false,
      textContent: '',
      value: '',
      addEventListener: (name, listener) => listeners.set(`${id}:${name}`, listener)
    });
  }
  return elements.get(id);
};

let persistenceReady = false;
let authenticated = false;
let signInCalled = false;
let stateChanged, signedOut = false;
const user = {getIdToken: async () => 'test-id-token'};
const auth = {
  currentUser: user,
  setPersistence: persistence => new Promise(resolve => {
    assert.equal(persistence, 'local');
    setTimeout(() => {
      persistenceReady = true;
      resolve();
    }, 0);
  }),
  onAuthStateChanged: callback => {
    stateChanged = callback;
    assert.equal(persistenceReady, true);
    callback(user);
  },
  signInWithEmailAndPassword: async () => {
    signInCalled = true;
  },
  signOut: async () => {}
};

function firebaseAuth() {
  return auth;
}
firebaseAuth.Auth = {Persistence: {LOCAL: 'local'}};

const window = {
  TONY_CONFIG: {firebase: {}, apiBaseUrl: 'https://api.example.com'},
  dispatchEvent: event => {
    if (event.type === 'tony:authenticated') authenticated = true;
    if (event.type === 'tony:signed-out') signedOut = true;
  }
};
const firebase = {initializeApp() {}, auth: firebaseAuth};
window.firebase = firebase;
const context = {
  window,
  firebase,
  document: {getElementById: element},
  Event,
  console,
  AbortController, setTimeout, clearTimeout,
  fetch: async (url, options) => {
    assert.equal(url, 'https://api.example.com/auth/me');
    assert.equal(options.headers.Authorization, 'Bearer test-id-token');
    return {ok: true, status: 200, json: async () => ({email: 'owner@example.com'})};
  }
};

vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'Frontend', 'auth.js'), 'utf8'),
  context
);

setTimeout(() => {
  try {
    assert.equal(persistenceReady, true);
    assert.equal(authenticated, true);
    assert.equal(element('auth-gate').hidden, true);
    assert.equal(element('app-sidebar').hidden, false);
    assert.equal(element('app-main').hidden, false);
    assert.equal(signInCalled, false);
    auth.currentUser = null; stateChanged(null);
    assert.equal(signedOut, true);
    assert.equal(element('app-main').hidden, true);
    console.log('Firebase local session restores and authenticates without asking for the password again.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}, 20);
