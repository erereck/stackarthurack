(() => {
  'use strict';

  const installButton = document.querySelector('#installApp');
  if (!installButton) return;

  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function hideIfInstalled() {
    if (isStandalone()) installButton.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
    installButton.textContent = 'INSTALAR APP';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installButton.hidden = true;
  });

  installButton.addEventListener('click', async () => {
    if (isStandalone()) {
      installButton.hidden = true;
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
      }
      return;
    }

    if (isIOS) {
      alert('No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.');
      return;
    }

    alert('Se o botão nativo não aparecer, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  hideIfInstalled();
})();
