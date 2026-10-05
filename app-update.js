(() => {
  const BUILD_VERSION = '20261002-update-popup-1';
  const VERSION_KEY = 'steadyhands-app-build';

  async function registerFreshWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const registration = await navigator.serviceWorker.register('sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      await registration.update().catch(() => {});
      return registration;
    } catch (error) {
      console.warn('App update service unavailable:', error);
      return null;
    }
  }

  async function clearOldAppCaches() {
    if (!('caches' in window)) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch {}
  }

  function injectStyles() {
    if (document.querySelector('#appUpdateStyles')) return;
    const style = document.createElement('style');
    style.id = 'appUpdateStyles';
    style.textContent = `
      .app-update-popup{
        position:fixed;
        left:50%;
        bottom:calc(88px + env(safe-area-inset-bottom));
        transform:translateX(-50%);
        z-index:5000;
        display:flex;
        align-items:center;
        gap:10px;
        width:min(390px,calc(100% - 28px));
        padding:10px 11px 10px 13px;
        border:1px solid rgba(26,71,113,.12);
        border-radius:16px;
        background:#102945;
        color:#fff;
        box-shadow:0 14px 34px rgba(7,24,42,.28);
      }
      .app-update-popup-copy{
        flex:1;
        min-width:0;
      }
      .app-update-popup-copy strong{
        display:block;
        font-size:12px;
        line-height:1.2;
        margin-bottom:2px;
      }
      .app-update-popup-copy span{
        display:block;
        font-size:10px;
        line-height:1.3;
        color:#c7d6e5;
      }
      .app-update-popup button{
        border:0;
        border-radius:10px;
        background:#1688ff;
        color:#fff;
        min-height:36px;
        padding:0 13px;
        font:inherit;
        font-size:11px;
        font-weight:900;
        cursor:pointer;
        white-space:nowrap;
      }
      .app-update-popup button:disabled{opacity:.65;cursor:default}
    `;
    document.head.appendChild(style);
  }

  function showUpdatePopup(registration) {
    if (document.querySelector('#appUpdatePopup')) return;

    injectStyles();

    const popup = document.createElement('div');
    popup.id = 'appUpdatePopup';
    popup.className = 'app-update-popup';
    popup.innerHTML = `
      <div class="app-update-popup-copy">
        <strong>Update available</strong>
        <span>A newer version is ready.</span>
      </div>
      <button type="button">Update</button>
    `;

    const button = popup.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Updating…';

      try {
        await clearOldAppCaches();

        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }

        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update().catch(() => {});
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          }
        }

        localStorage.setItem(VERSION_KEY, BUILD_VERSION);
        const url = new URL(location.href);
        url.searchParams.set('app_update', Date.now().toString());
        location.replace(url.toString());
      } catch (error) {
        console.error('Unable to update app:', error);
        button.disabled = false;
        button.textContent = 'Update';
      }
    });

    document.body.appendChild(popup);
  }

  function rememberCurrentBuild() {
    try {
      localStorage.setItem(VERSION_KEY, BUILD_VERSION);
    } catch {}
  }

  async function initUpdater() {
    const registration = await registerFreshWorker();

    if (!registration) {
      rememberCurrentBuild();
      return;
    }

    // If a new service worker is already waiting, silent activation may not have
    // been possible because the installed app is still using the old controller.
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdatePopup(registration);
      return;
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          showUpdatePopup(registration);
        }
      });
    });

    // Normal case: no popup. Fresh files load automatically.
    rememberCurrentBuild();
  }

  let reloading = false;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      rememberCurrentBuild();
      location.reload();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUpdater, { once:true });
  } else {
    initUpdater();
  }
})();
