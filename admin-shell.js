(() => {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const pageMeta = {
    'index.html': { title:'Overview', active:'overview' },
    'admin.html': { title:'Sales Associates', active:'salespeople' },
    'users.html': { title:'Users', active:'users' },
    'status.html': { title:'Status', active:'salespeople' },
    'onboarding.html': { title:'Onboarding', active:'onboarding' },
    'agreement-actions.html': { title:'Agreement Actions', active:'agreement-actions' },
    'other-actions.html': { title:'Other Actions', active:'other-actions' },
    'training.html': { title:'Training', active:'training' },
    'clients.html': { title:'Clients', active:'clients' },
    'preview-access.html': { title:'Preview Access', active:'preview-access' },
    'leads.html': { title:'All Leads', active:'leads' },
    'requests.html': { title:'Requests', active:'requests' },
    'develop.html': { title:'DEVELOP', active:'develop' },
    'activity.html': { title:'Performance', active:'salespeople' },
    'call-management.html': { title:'Call Management', active:'salespeople' },
    'skills.html': { title:'Skills', active:'skills' },
    'earnings.html': { title:'Finance', active:'more' },
    'company-analytics.html': { title:'Company Analytics', active:'analytics' },
    'deals.html': { title:'Deals', active:'more' },
    'pipeline.html': { title:'Sales Pipeline', active:'more' },
    'payouts.html': { title:'Payouts', active:'more' },
    'phones.html': { title:'Phone Numbers', active:'salespeople' },
    'login-activity.html': { title:'Login Activity', active:'more' },
    'audit.html': { title:'Audit Log', active:'more' },
    'system.html': { title:'System', active:'more' },
    'account.html': { title:'More', active:'more' },
    'call.html': { title:'Call Details', active:'salespeople' },
    'terms.html': { title:'Terms', active:'more' }
  };

  function nav(active) {
    const items = [
      ['overview','index.html','layout-dashboard','Overview'],
      ['salespeople','admin.html','users','Sales Associates'],
      ['analytics','company-analytics.html','chart-no-axes-combined','Analytics'],
      ['requests','requests.html','inbox','Requests'],
      ['develop','develop.html','code-2','DEVELOP'],
      ['leads','leads.html','contact-round','All Leads'],
      ['users','users.html','users','Users'],
      ['training','training.html','graduation-cap','Training'],
      ['clients','clients.html','briefcase-business','Clients'],
      ['preview-access','preview-access.html','link-2','Preview Access'],
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
    ['develop.html','code-2','DEVELOP'],
    ['leads.html','contact-round','All Leads'],
    ['users.html','users','Users'],
    ['training.html','graduation-cap','Training'],
    ['call-management.html','phone-call','Call Management'],
    ['clients.html','briefcase-business','Clients'],
    ['preview-access.html','link-2','Preview Access'],
    ['skills.html','chart-no-axes-column-increasing','Skills'],
    ['deals.html','handshake','Deals'],
    ['pipeline.html','workflow','Sales Pipeline'],
    ['payouts.html','circle-dollar-sign','Payouts'],
    ['login-activity.html','log-in','Login Activity'],
    ['audit.html','scroll-text','Audit Log'],
    ['system.html','activity','System'],
    ['terms.html','file-text','Terms & Conditions']
  ];

  const associateItems = [
    ['admin.html','users','Overview'],
    ['status.html','list-checks','Status'],
    ['activity.html','chart-no-axes-combined','Performance'],
    ['phones.html','phone-forwarded','Phone Numbers'],
    ['onboarding.html','clipboard-check','Onboarding'],
    ['agreement-actions.html','file-signature','Agreement Actions'],
    ['other-actions.html','list-checks','Other Actions']
  ];
  function associateNav(){
    const active=associateItems.some(([href])=>href===page)||page==='call.html';
    return `<details class="admin-associates-group" ${active?'open':''}><summary><i data-lucide="users"></i><span>Sales Associates</span></summary><div>${associateItems.map(([href,icon,label])=>`<a class="admin-side-link ${page===href?'active':''}" href="${href}" ${page===href?'aria-current="page"':''}><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('')}</div></details>`;
  }
  function sideNav() {
    return associateNav()+sideItems.map(([href,icon,label]) => `
      <a class="admin-side-link ${page === href ? 'active' : ''}" href="${href}" ${page===href?'aria-current="page"':''}>
        <i data-lucide="${icon}"></i><span>${label}</span>
      </a>
    `).join('');
  }

  function developmentAlerts(){
    const client=window.steadyHandsCRMClient;
    if(!client||!window.steadyHandsAdminSession)return;
    client.from('development_requests').select('id',{count:'exact',head:true}).is('viewed_at',null).eq('status','new').then(({count,error})=>{
      if(error)return;
      document.querySelectorAll('a[href="develop.html"]').forEach(a=>{
        let badge=a.querySelector('.develop-alert-count');
        if(!badge){badge=document.createElement('b');badge.className='develop-alert-count';badge.style.cssText='background:#dc2626;color:white;border-radius:99px;padding:2px 7px;margin-left:6px;font-size:12px';a.appendChild(badge);}
        badge.textContent=count>0?String(count):'';
        badge.hidden=!count;
      });
    });
  }
  window.addEventListener('steadyhands:admin-ready',developmentAlerts);
  setInterval(()=>{if(!document.hidden)developmentAlerts()},20000);
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
    if(!document.getElementById('associatePagesStyles')){
      const style=document.createElement('link');style.id='associatePagesStyles';style.rel='stylesheet';style.href='associate-pages.css?v=20261018';document.head.appendChild(style);
    }
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
    // Desktop rail is a separate fixed scroll region from the main .app.
    if (!document.querySelector('.admin-desktop-sidebar')) {
      const rail = document.createElement('aside');
      rail.className = 'admin-desktop-sidebar';
      rail.setAttribute('aria-label', 'Admin pages');
      rail.innerHTML = '<div class="admin-desktop-brand"><small>STEADY HANDS</small><strong>Admin Menu</strong></div><nav class="admin-desktop-links">' + sideNav() + '</nav>';
      document.body.insertBefore(rail, document.body.firstChild);
    }
    installMobileSideMenu();
    developmentAlerts();

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

