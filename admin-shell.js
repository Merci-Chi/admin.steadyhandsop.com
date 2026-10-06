(() => {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const pageMeta = {
    'index.html': { title:'Overview', active:'overview' },
    'admin.html': { title:'Users', active:'users' },
    'leads.html': { title:'Leads', active:'more' },
    'activity.html': { title:'Activity', active:'activity' },
    'skills.html': { title:'Skills', active:'skills' },
    'earnings.html': { title:'Finance', active:'more' },
    'deals.html': { title:'Deals', active:'more' },
    'payouts.html': { title:'Payouts', active:'more' },
    'account.html': { title:'Admin Settings', active:'more' },
    'call.html': { title:'Call Details', active:'activity' },
    'terms.html': { title:'Terms', active:'more' }
  };

  function nav(active) {
    const items = [
      ['overview','index.html','layout-dashboard','Overview'],
      ['users','admin.html','users','Users'],
      ['activity','activity.html','history','Activity'],
      ['skills','skills.html','chart-no-axes-column-increasing','Skills'],
      ['more','account.html','menu','More']
    ];

    return items.map(([key,href,icon,label]) => `
      <a class="nav-item ${active === key ? 'active' : ''}" href="${href}">
        <i data-lucide="${icon}"></i><span>${label}</span>
      </a>
    `).join('');
  }

  function applyAdminShell() {
    const meta = pageMeta[page] || { title:'Admin', active:'more' };

    document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach(el => {
      el.setAttribute('content','Steady Hands Admin');
    });

    document.title = meta.title + ' • Steady Hands Admin';

    const h1 = document.querySelector('.topbar h1, .call-topbar h1');
    if (h1) h1.textContent = meta.title;

    document.querySelectorAll('.bottom-nav').forEach(el => {
      el.innerHTML = nav(meta.active);
    });

    document.body.classList.add('admin-app-shell');

    // The separate admin app never originates outbound calls.
    document.querySelectorAll('.call-controls, .call-btn').forEach(el => {
      if (page === 'call.html') el.hidden = true;
    });

    window.lucide?.createIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAdminShell);
  } else {
    applyAdminShell();
  }
})();
