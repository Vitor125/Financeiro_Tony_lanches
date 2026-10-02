// Abra pelo próprio Flask: http://127.0.0.1:5000/static/tony-lanches/index.html
window.TONY_CONFIG = {
  mode: 'api',
  // String vazia usa a mesma origem da página. O backend não possui prefixo '/api'.
  apiBaseUrl: '',
  credentials: 'same-origin',
  requestTimeoutMs: 45000
};
