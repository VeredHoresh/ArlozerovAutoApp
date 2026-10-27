let installPrompt;
const installButton = document.querySelector('#install-app');
const dialog = document.querySelector('#install-dialog');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; dialog.close(); });
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
installButton.hidden = !!standalone;
installButton.addEventListener('click', async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  document.querySelector('#install-local-note').hidden = !local;
  dialog.showModal();
});
document.querySelector('#close-install').addEventListener('click', () => dialog.close());
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('offline', () => { document.querySelector('#connection-status').hidden = false; });
window.addEventListener('online', () => { document.querySelector('#connection-status').hidden = true; });
document.querySelector('#connection-status').hidden = navigator.onLine;
