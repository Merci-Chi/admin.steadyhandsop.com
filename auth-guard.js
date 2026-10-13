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

      // Never grant access based only on a stored session or a cached role.
      const { data: permission, error: permissionError } = await withTimeout(
        client.from('team_permissions').select('role,active')
          .eq('user_id', session.user.id).maybeSingle(),
        'Administrator permission check'
      );
      if (permissionError) throw permissionError;
      if (currentAttempt !== attempt) return;

      if (permission?.active !== true ||
          String(permission?.role || '').toUpperCase() !== ADMIN_ROLE) {
        showCheckError('This account does not have active administrator access.');
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
