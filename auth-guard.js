// Admin-only authentication gate for admin.steadyhandsop.com
(() => {
  if (location.pathname.endsWith('/login.html')) return;

  const ADMIN_ROLE = 'ADMIN';
  document.documentElement.classList.add('auth-checking');

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function showAccessDenied(message) {
    document.documentElement.classList.remove('auth-checking');
    document.body.innerHTML = `
      <main class="admin-access-screen">
        <section class="admin-access-card">
          <div class="admin-access-icon"><i data-lucide="shield-alert"></i></div>
          <h1>Administrator access required</h1>
          <p>${escapeHtml(message || 'This app is restricted to Steady Hands administrators.')}</p>
          <button type="button" id="adminAccessSignOut">Return to sign in</button>
        </section>
      </main>
    `;
    window.lucide?.createIcons();
    document.getElementById('adminAccessSignOut')?.addEventListener('click', async () => {
      try { await window.steadyHandsCRMClient?.auth.signOut(); } catch {}
      location.replace('login.html');
    });
  }

  async function runAdminAccessCheck() {
    try {
      if (!window.supabase) throw new Error('Sign-in library unavailable');

      const client = window.steadyHandsCRMClient || window.supabase.createClient(
        'https://glonbvrcudwuzjundrii.supabase.co',
        'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      window.steadyHandsCRMClient = client;

      const { data:sessionData, error:sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData?.session;
      if (!session?.user?.id) {
        location.replace('login.html');
        return;
      }

      const { data:permission, error:permissionError } = await client
        .from('team_permissions')
        .select('role,active')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (permissionError) throw permissionError;

      if (permission?.active !== true || String(permission?.role || '').toUpperCase() !== ADMIN_ROLE) {
        await client.auth.signOut();
        showAccessDenied('Your account does not have active administrator access.');
        return;
      }

      window.steadyHandsAdminSession = {
        user: session.user,
        permission
      };

      document.documentElement.classList.remove('auth-checking');
      window.dispatchEvent(new CustomEvent('steadyhands:admin-ready', {
        detail: window.steadyHandsAdminSession
      }));
    } catch (error) {
      console.error('Admin access check failed:', error);
      showAccessDenied(error?.message || 'Unable to verify administrator access.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAdminAccessCheck, { once: true });
  } else {
    runAdminAccessCheck();
  }

  // Never leave the admin shell invisibly stuck if startup event handling fails.
  window.setTimeout(() => {
    if (document.documentElement.classList.contains('auth-checking')) {
      showAccessDenied('Administrator sign-in check did not finish. Reload the page or return to sign in.');
    }
  }, 10000);
})();
