// Optional PWA installation. Normal website and HTML file launching remain unchanged.
let installPrompt = null;
let installationCompleted = false;
const installButton = document.querySelector('#installAppBtn');
const installDialog = document.querySelector('#installAppDialog');
const installHelpText = document.querySelector('#installAppInstructions');

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}
function refreshInstallButton() {
  if (installButton) installButton.hidden = installationCompleted || isInstalledApp();
}
function installationInstructions() {
  const agent = navigator.userAgent || '';
  const isMobile = /iPhone|iPad|iPod|Android/i.test(agent);
  const isSafari = /Safari/i.test(agent) && !/Chrome|CriOS|Edg|Chromium|FxiOS/i.test(agent);
  const isMac = /Macintosh|Mac OS X/i.test(agent);
  const isEdge = /Edg\//i.test(agent);
  if (isMobile && /iPhone|iPad|iPod/i.test(agent)) {
    return 'On iPhone or iPad: open this site in Safari, tap Share, then Add to Home Screen.';
  }
  if (isSafari && isMac) {
    return 'On Mac: open this site in Safari, then choose File → Add to Dock.';
  }
  if (isEdge) {
    return 'In Microsoft Edge: open the browser menu (⋯), select Apps → Install this site as an app.';
  }
  if (/Chrome|Chromium/i.test(agent)) {
    return 'In Chrome: open the browser menu (⋮) and choose Cast, save and share → Install page as app (or use the install icon in the address bar).';
  }
  return 'For an app window on Windows or Mac, open this site in Microsoft Edge or Google Chrome and choose Install app from the browser menu. Safari on Mac also supports File → Add to Dock.';
}
function showInstallHelp() {
  if (!installDialog || !installHelpText) return;
  installHelpText.textContent = installationInstructions();
  if (!installDialog.open) installDialog.showModal();
}
function handleInstallClick() {
  if (isInstalledApp()) return;
  if (!installPrompt) {
    showInstallHelp();
    return;
  }
  const prompt = installPrompt;
  installPrompt = null;
  // Must be called immediately on click, before any awaited work.
  try {
    prompt.prompt();
    Promise.resolve(prompt.userChoice).then(choice => {
      if (choice?.outcome !== 'accepted') refreshInstallButton();
    }).catch(() => showInstallHelp());
  } catch {
    showInstallHelp();
  }
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  refreshInstallButton();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installationCompleted = true;
  refreshInstallButton();
});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refreshInstallButton);
installButton?.addEventListener('click', handleInstallClick);
document.querySelector('#closeInstallAppDialogBtn')?.addEventListener('click', () => installDialog?.close());
installDialog?.addEventListener('click', event => {
  if (event.target === installDialog) installDialog.close();
});
refreshInstallButton();

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch(error => console.warn('PWA installation support unavailable:', error.message));
  });
}
