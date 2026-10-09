(() => {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const pageMeta = {
    'index.html': { title:'Overview', active:'overview' },
    'admin.html': { title:'Salespeople', active:'salespeople' },
    'users.html': { title:'Users', active:'users' },
    'clients.html': { title:'Clients', active:'clients' },
    'preview-access.html': { title:'Preview Access', active:'preview-access' },
    'leads.html': { title:'All Leads', active:'leads' },
    'requests.html': { title:'Requests', active:'requests' },
    'activity.html': { title:'Activity', active:'activity' },
    'call-management.html': { title:'Call Management', active:'salespeople' },
    'skills.html': { title:'Skills', active:'skills' },
    'earnings.html': { title:'Finance', active:'more' },
    'company-analytics.html': { title:'Company Analytics', active:'analytics' },
    'deals.html': { title:'Deals', active:'more' },
    'payouts.html': { title:'Payouts', active:'more' },
    'phones.html': { title:'Phone Numbers', active:'more' },
    'login-activity.html': { title:'Login Activity', active:'more' },
    'audit.html': { title:'Audit Log', active:'more' },
    'system.html': { title:'System', active:'more' },
    'account.html': { title:'More', active:'more' },
    'call.html': { title:'Call Details', active:'activity' },
    'terms.html': { title:'Terms', active:'more' }
  };

  function nav(active) {
    const items = [
      ['overview','index.html','layout-dashboard','Overview'],
      ['analytics','company-analytics.html','chart-no-axes-combined','Analytics'],
      ['requests','requests.html','inbox','Requests'],
      ['leads','leads.html','contact-round','All Leads'],
      ['users','users.html','users','Users'],
      ['salespeople','admin.html','headset','Salespeople'],
      ['clients','clients.html','briefcase-business','Clients'],
      ['preview-access','preview-access.html','link-2','Preview Access'],
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

  const sideItems = [
    ['index.html','layout-dashboard','Overview'],
    ['company-analytics.html','chart-no-axes-combined','Analytics'],
    ['requests.html','inbox','Requests'],
    ['leads.html','contact-round','All Leads'],
    ['users.html','users','Users'],
    ['admin.html','headset','Salespeople'],
    ['call-management.html','phone-call','Call Management'],
    ['clients.html','briefcase-business','Clients'],
    ['preview-access.html','link-2','Preview Access'],
    ['activity.html','history','Activity'],
    ['skills.html','chart-no-axes-column-increasing','Skills'],
    ['deals.html','handshake','Deals'],
    ['payouts.html','circle-dollar-sign','Payouts'],
    ['phones.html','phone-forwarded','Phone Numbers'],
    ['login-activity.html','log-in','Login Activity'],
    ['audit.html','scroll-text','Audit Log'],
    ['system.html','activity','System'],
    ['terms.html','file-text','Terms & Conditions']
  ];

  function sideNav() {
    return sideItems.map(([href,icon,label]) => `
      <a class="admin-side-link ${page === href ? 'active' : ''}" href="${href}">
        <i data-lucide="${icon}"></i><span>${label}</span>
      </a>
    `).join('');
  }

  function installMobileSideMenu() {
    if (document.querySelector('.admin-mobile-menu')) return;

    const topbarRow = document.querySelector('.topbar .topbar-row');
    if (!topbarRow) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-mobile-menu-button';
    button.setAttribute('aria-label','Open menu');
    button.setAttribute('aria-expanded','false');
    button.innerHTML = '<i data-lucide="menu"></i>';
    topbarRow.prepend(button);

    const overlay = document.createElement('div');
    overlay.className = 'admin-side-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <aside class="admin-mobile-menu" aria-label="Admin navigation">
        <div class="admin-side-head">
          <div><span>STEADY HANDS</span><strong>Admin Menu</strong></div>
          <button type="button" class="admin-side-close" aria-label="Close menu"><i data-lucide="x"></i></button>
        </div>
        <nav class="admin-side-nav">${sideNav()}</nav>
      </aside>
    `;
    document.body.appendChild(overlay);

    const closeButton = overlay.querySelector('.admin-side-close');
    const setOpen = open => {
      overlay.hidden = !open;
      document.body.classList.toggle('admin-side-menu-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) requestAnimationFrame(() => closeButton?.focus());
      else button.focus({preventScroll:true});
    };

    button.addEventListener('click', () => setOpen(true));
    closeButton?.addEventListener('click', () => setOpen(false));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) setOpen(false);
    });
    overlay.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      document.body.classList.remove('admin-side-menu-open');
    }));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) setOpen(false);
    });
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
    installMobileSideMenu();

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
