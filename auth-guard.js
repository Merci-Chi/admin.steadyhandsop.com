// Admin-only authentication gate for admin.steadyhandsop.com
(() => {
  if (location.pathname.endsWith('/login.html')) return;

  const ADMIN_ROLE = 'ADMIN';
  const CHECK_TIMEOUT_MS = 30000;
  let attempt = 0;
  document.documentElement.classList.add('auth-checking');

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function showCheckError(message) {
    document.documentElement.classList.remove('auth-checking');
    document.body.innerHTML = `
      <main class="admin-access-screen">
        <section class="admin-access-card">
          <div class="admin-access-icon"><i data-lucide="shield-alert"></i></div>
          <h1>Unable to verify administrator access</h1>
          <p>${escapeHtml(message || 'The sign-in check could not finish. Your account has not been signed out.')}</p>
          <button type="button" id="adminAccessRetry">Try again</button>
          <button type="button" id="adminAccessSignOut">Return to sign in</button>
        </section>
      </main>`;
    window.lucide?.createIcons();
    document.getElementById('adminAccessRetry')?.addEventListener('click', () => location.reload());
    document.getElementById('adminAccessSignOut')?.addEventListener('click', async () => {
      try { await window.steadyHandsCRMClient?.auth.signOut(); } catch (error) {
        console.warn('Admin sign-out failed:', error);
      }
      location.replace('login.html');
    });
  }

  function withTimeout(promise, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' timed out. Check your connection and try again.')), CHECK_TIMEOUT_MS);
      })
    ]).finally(() => clearTimeout(timer));
  }

  async function runAdminAccessCheck() {
    const currentAttempt = ++attempt;
    try {
      if (!window.supabase) throw new Error('Sign-in library unavailable. Reload the page.');
      const client = window.steadyHandsCRMClient || window.supabase.createClient(
        'https://glonbvrcudwuzjundrii.supabase.co',
        'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
      window.steadyHandsCRMClient = client;

      const { data: sessionData, error: sessionError } = await withTimeout(
        client.auth.getSession(), 'Session check'
      );
      if (sessionError) throw sessionError;
      if (currentAttempt !== attempt) return;
      const session = sessionData?.session;
      if (!session?.user?.id) {
        location.replace('login.html');
        return;
      }

      // Query RLS-protected permissions with the authenticated session token.
      // An abortable network request avoids a stalled Supabase query hanging the app.
      const controller = new AbortController();
      const permissionTimer = setTimeout(() => controller.abort(), 8000);
      let permission;
      try {
        const params = new URLSearchParams({
          select: 'role,active',
          user_id: 'eq.' + session.user.id,
          limit: '1'
        });
        const response = await fetch(
          'https://glonbvrcudwuzjundrii.supabase.co/rest/v1/team_permissions?' + params.toString(),
          {
            headers: {
              apikey: 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
              Authorization: 'Bearer ' + session.access_token,
              Accept: 'application/json'
            },
            cache: 'no-store',
            signal: controller.signal
          }
        );
        if (!response.ok) {
          const details = await response.text();
          throw new Error('Permission request failed (' + response.status + '): ' + details.slice(0, 240));
        }
        const rows = await response.json();
        permission = Array.isArray(rows) ? rows[0] : null;
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Permission check timed out. Try again.');
        throw error;
      } finally {
        clearTimeout(permissionTimer);
      }

      if (currentAttempt !== attempt) return;

      if (permission?.active !== true ||
          String(permission?.role || '').toUpperCase() !== ADMIN_ROLE) {
        showCheckError('Unauthorized — this account does not have active ADMIN access.');
        return;
      }

      window.steadyHandsAdminSession = { user: session.user, permission };
      document.documentElement.classList.remove('auth-checking');
      window.dispatchEvent(new CustomEvent('steadyhands:admin-ready', {
        detail: window.steadyHandsAdminSession
      }));
    } catch (error) {
      if (currentAttempt !== attempt) return;
      console.error('Admin access check failed:', error);
      showCheckError(error?.message || 'Unable to verify administrator access.');
    }
  }

  // Begin when the DOM is usable; each async operation has its own timeout.
  // A fixed page-load timer previously replaced the dashboard during slow sign-ins.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAdminAccessCheck, { once: true });
  } else {
    runAdminAccessCheck();
  }
})();
