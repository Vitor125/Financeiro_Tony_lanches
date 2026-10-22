const localFlaskHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

window.TONY_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDCoKdSOTJzRj2WEzH9OXCBrufFxnVXRzk',
    authDomain: 'financeiro-tony-lanches.firebaseapp.com',
    projectId: 'financeiro-tony-lanches',
    storageBucket: 'financeiro-tony-lanches.firebasestorage.app',
    messagingSenderId: '496088465756',
    appId: '1:496088465756:web:1cf0a3cf1166a0a71c4199'
  },
  // API pública do Cloud Run; CORS é limitado aos domínios do Firebase Hosting.
  apiBaseUrl: localFlaskHost ? '' : 'https://financeiro-tony-lanches-84954471063.southamerica-east1.run.app',
  requestTimeoutMs: 45000
};
