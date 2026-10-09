(() => {
  const esc = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  let state = { leads:[], users:[], filter:'active', assignee:'', query:'' };

  const isArchived = lead => lead.admin_archived === true;
  const fmtDate = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };

  function userLabel(userId) {
    const user = state.users.find(row => String(row.user_id) === String(userId));
    return user ? (user.display_name || user.email || 'User') : 'Unassigned';
  }

  function renderSummary() {
    const el = document.getElementById('adminLeadSummary');
    const active = state.leads.filter(row => !isArchived(row)).length;
    const archived = state.leads.filter(isArchived).length;
    const assigned = state.leads.filter(row => !!row.assigned_user_id).length;
    el.innerHTML = `
      <div><strong>${state.leads.length}</strong><span>Total</span></div>
      <div><strong>${active}</strong><span>Active</span></div>
      <div><strong>${archived}</strong><span>Archived</span></div>
      <div><strong>${assigned}</strong><span>Assigned</span></div>`;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.leads.filter(lead => {
      if (state.filter === 'active' && isArchived(lead)) return false;
      if (state.filter === 'archived' && !isArchived(lead)) return false;
      if (state.assignee && String(lead.assigned_user_id || '') !== state.assignee) return false;
      if (!q) return true;
      return [lead.company,lead.name,lead.phone,lead.email,lead.notes,lead.stage,lead.outcome,userLabel(lead.assigned_user_id)]
        .some(value => String(value || '').toLowerCase().includes(q));
    });
  }

  function renderList() {
    const list = document.getElementById('adminLeadList');
    const rows = filtered();
    list.innerHTML = rows.length ? rows.map(lead => `
      <button type="button" class="admin-lead-card" data-lead-id="${esc(lead.id)}">
        <span class="admin-lead-card-icon"><i data-lucide="building-2"></i></span>
        <span class="admin-lead-card-main">
          <span class="admin-lead-card-head">
            <strong>${esc(lead.company || lead.name || 'Unnamed lead')}</strong>
            ${isArchived(lead) ? '<span class="admin-lead-archived">Archived</span>' : ''}
          </span>
          <small>${esc(lead.name || 'No contact')} · ${esc(lead.phone || 'No phone')}</small>
          <span class="admin-lead-meta">
            <b>${esc(userLabel(lead.assigned_user_id))}</b>
            <b>${esc(lead.stage || 'No stage')}</b>
            <b>${esc(lead.outcome || 'No outcome')}</b>
          </span>
        </span>
        <i data-lucide="chevron-right"></i>
      </button>`).join('') : '<div class="cc-empty">No leads match this view.</div>';

    list.querySelectorAll('[data-lead-id]').forEach(button => {
      button.addEventListener('click', () => openLead(button.dataset.leadId));
    });
    window.lucide?.createIcons();
  }

  function assigneeOptions(selected='') {
    return ['<option value="">Unassigned</option>']
      .concat(state.users.map(user => `<option value="${esc(user.user_id)}" ${String(selected)===String(user.user_id)?'selected':''}>${esc(user.display_name || user.email || 'User')}</option>`))
      .join('');
  }

  function openLead(id) {
    const lead = state.leads.find(row => String(row.id) === String(id));
    if (!lead) return;
    const overlay = document.getElementById('adminLeadDrawerOverlay');
    const drawer = document.getElementById('adminLeadDrawer');

    drawer.innerHTML = `
      <div class="admin-user-drawer-head">
        <div>
          <span class="admin-kicker">LEAD</span>
          <h2>${esc(lead.company || lead.name || 'Lead')}</h2>
          <p>Created ${esc(fmtDate(lead.created_at))}</p>
        </div>
        <button type="button" id="adminCloseLead"><i data-lucide="x"></i></button>
      </div>

      <div class="admin-lead-form-grid">
        <label>Company<input id="leadCompany" value="${esc(lead.company || '')}"></label>
        <label>Contact<input id="leadName" value="${esc(lead.name || '')}"></label>
        <label>Phone<input id="leadPhone" value="${esc(lead.phone || '')}"></label>
        <label>Email<input id="leadEmail" type="email" value="${esc(lead.email || '')}"></label>
        <label>Stage<input id="leadStage" value="${esc(lead.stage || '')}"></label>
        <label>Outcome<input id="leadOutcome" value="${esc(lead.outcome || '')}"></label>
        <label class="full">Assigned to<select id="leadAssigned">${assigneeOptions(lead.assigned_user_id)}</select></label>
        <label class="full">Notes<textarea id="leadNotes">${esc(lead.notes || '')}</textarea></label>
      </div>

      <div class="admin-lead-actions">\n        <button type="button" id="adminSharePreview" class="primary"><i data-lucide="link"></i>Create Preview Signup Link</button>
        <button type="button" class="primary" id="adminSaveLead"><i data-lucide="save"></i>Save Changes</button>
        <button type="button" id="adminArchiveLead"><i data-lucide="${isArchived(lead)?'archive-restore':'archive'}"></i>${isArchived(lead)?'Restore Lead':'Archive Lead'}</button>
        <button type="button" class="danger" id="adminDeleteLead"><i data-lucide="trash-2"></i>Delete Permanently</button>
      </div>
      <p class="admin-user-action-message" id="adminLeadMessage"></p>
    `;

    overlay.hidden = false;
    const close = () => overlay.hidden = true;
    drawer.querySelector('#adminCloseLead').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };

    drawer.querySelector('#adminSharePreview').onclick=async()=>{
      const button=drawer.querySelector('#adminSharePreview');
      const msg=drawer.querySelector('#adminLeadMessage');
      const key=String(lead.sitekey||'').trim();
      const url=String(lead.previewurl||'').trim();
      if(!key||!url){msg.textContent='Save a site key and preview URL on this lead before generating a link.';return}
      if(!/^https:\/\//i.test(url)){msg.textContent='Preview URL must start with https://';return}
      button.disabled=true;msg.textContent='Creating a private preview invitation…';
      const {data,error}=await window.steadyHandsCRMClient.rpc('create_portal_preview_invite',{p_site_key:key,p_site_title:lead.company||lead.name||'Website Preview',p_preview_url:url});
      button.disabled=false;
      if(error){msg.textContent='Could not create invitation: '+error.message;return}
      try{await navigator.clipboard.writeText(data);msg.textContent='Preview signup link copied to clipboard.'}
      catch{msg.textContent='Preview signup link: '+data}
    };
    drawer.querySelector('#adminSaveLead').onclick = async () => {
      const msg = drawer.querySelector('#adminLeadMessage');
      const payload = {
        company: drawer.querySelector('#leadCompany').value.trim(),
        name: drawer.querySelector('#leadName').value.trim(),
        phone: drawer.querySelector('#leadPhone').value.trim(),
        email: drawer.querySelector('#leadEmail').value.trim(),
        stage: drawer.querySelector('#leadStage').value.trim(),
        outcome: drawer.querySelector('#leadOutcome').value.trim(),
        assigned_user_id: drawer.querySelector('#leadAssigned').value || null,
        assigned: drawer.querySelector('#leadAssigned').value ? userLabel(drawer.querySelector('#leadAssigned').value) : '',
        notes: drawer.querySelector('#leadNotes').value.trim()
      };
      msg.textContent = 'Saving…';
      const { data, error } = await window.steadyHandsCRMClient
        .from('crm').update(payload).eq('id',lead.id).select('*').single();
      if (error) { msg.textContent = error.message; return; }
      Object.assign(lead,data);
      msg.textContent = 'Lead saved.';
      renderSummary(); renderList();
    };

    drawer.querySelector('#adminArchiveLead').onclick = async () => {
      const next = !isArchived(lead);
      if (!confirm((next ? 'Archive' : 'Restore') + ' this lead?')) return;
      const msg = drawer.querySelector('#adminLeadMessage');
      msg.textContent = next ? 'Archiving…' : 'Restoring…';
      const { data, error } = await window.steadyHandsCRMClient
        .from('crm')
        .update({admin_archived:next,admin_archived_at:next?new Date().toISOString():null})
        .eq('id',lead.id).select('*').single();
      if (error) { msg.textContent = error.message; return; }
      Object.assign(lead,data);
      renderSummary(); renderList(); openLead(lead.id);
    };

    drawer.querySelector('#adminDeleteLead').onclick = async () => {
      if (!confirm('Permanently delete this lead? This cannot be undone.')) return;
      const msg = drawer.querySelector('#adminLeadMessage');
      msg.textContent = 'Deleting…';
      const { error } = await window.steadyHandsCRMClient.from('crm').delete().eq('id',lead.id);
      if (error) { msg.textContent = error.message; return; }
      state.leads = state.leads.filter(row => String(row.id) !== String(lead.id));
      close(); renderSummary(); renderList();
    };

    window.lucide?.createIcons();
  }

  function openNewLead() {
    const overlay = document.getElementById('adminLeadDrawerOverlay');
    const drawer = document.getElementById('adminLeadDrawer');
    drawer.innerHTML = `
      <div class="admin-user-drawer-head">
        <div><span class="admin-kicker">NEW LEAD</span><h2>Add Lead</h2><p>Create a CRM lead for the team.</p></div>
        <button type="button" id="adminCloseLead"><i data-lucide="x"></i></button>
      </div>
      <div class="admin-lead-form-grid">
        <label>Company<input id="leadCompany"></label>
        <label>Contact<input id="leadName"></label>
        <label>Phone<input id="leadPhone"></label>
        <label>Email<input id="leadEmail" type="email"></label>
        <label>Stage<input id="leadStage" value="outreach"></label>
        <label>Outcome<input id="leadOutcome"></label>
        <label class="full">Assigned to<select id="leadAssigned">${assigneeOptions()}</select></label>
        <label class="full">Notes<textarea id="leadNotes"></textarea></label>
      </div>
      <div class="admin-lead-actions"><button class="primary" id="adminCreateLead"><i data-lucide="plus"></i>Create Lead</button></div>
      <p class="admin-user-action-message" id="adminLeadMessage"></p>`;

    overlay.hidden = false;
    const close = () => overlay.hidden = true;
    drawer.querySelector('#adminCloseLead').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };

    drawer.querySelector('#adminCreateLead').onclick = async () => {
      const msg = drawer.querySelector('#adminLeadMessage');
      const assignee = drawer.querySelector('#leadAssigned').value || null;
      const payload = {
        company: drawer.querySelector('#leadCompany').value.trim(),
        name: drawer.querySelector('#leadName').value.trim(),
        phone: drawer.querySelector('#leadPhone').value.trim(),
        email: drawer.querySelector('#leadEmail').value.trim(),
        stage: drawer.querySelector('#leadStage').value.trim() || 'outreach',
        outcome: drawer.querySelector('#leadOutcome').value.trim(),
        assigned_user_id: assignee,
        assigned: assignee ? userLabel(assignee) : '',
        notes: drawer.querySelector('#leadNotes').value.trim(),
        admin_archived:false
      };
      if (!payload.company && !payload.name) { msg.textContent = 'Enter a company or contact name.'; return; }
      msg.textContent = 'Creating…';
      const { data, error } = await window.steadyHandsCRMClient.from('crm').insert(payload).select('*').single();
      if (error) { msg.textContent = error.message; return; }
      state.leads.unshift(data);
      close(); renderSummary(); renderList();
    };

    window.lucide?.createIcons();
  }

  async function load() {
    const c = window.steadyHandsCRMClient;
    if (!c) return;
    const list = document.getElementById('adminLeadList');

    try {
      const [leadsResult, usersResult] = await Promise.all([
        c.from('crm')
          .select('id,company,name,phone,altphone,email,website,domain,notes,issue,concerns,origin,assigned,assigned_user_id,tags,sources,stage,outcome,callbackdate,callbackat,lastcalled,timezone,leadpotential,tier,previewurl,sitekey,has_site_preview,admin_archived,admin_archived_at,created_at')
          .order('created_at',{ascending:false})
          .limit(5000),
        c.from('callcenter_profiles')
          .select('user_id,display_name,email')
          .order('display_name',{ascending:true})
      ]);
      if (leadsResult.error) throw leadsResult.error;
      if (usersResult.error) throw usersResult.error;

      state.leads = leadsResult.data || [];
      state.users = usersResult.data || [];

      const assigneeFilter = document.getElementById('adminLeadAssigneeFilter');
      assigneeFilter.innerHTML = '<option value="">All users</option>' + state.users.map(user => `<option value="${esc(user.user_id)}">${esc(user.display_name || user.email || 'User')}</option>`).join('');

      renderSummary(); renderList();
    } catch (error) {
      console.error('Unable to load leads:',error);
      list.innerHTML = `<section class="admin-dashboard-error"><strong>Unable to load leads.</strong><p>${esc(error?.message || 'Please refresh and try again.')}</p></section>`;
    }
  }

  document.getElementById('adminLeadSearch')?.addEventListener('input', e => { state.query=e.target.value||''; renderList(); });
  document.getElementById('adminAddLead')?.addEventListener('click', openNewLead);
  document.getElementById('adminLeadAssigneeFilter')?.addEventListener('change', e => { state.assignee=e.target.value||''; renderList(); });
  document.querySelectorAll('[data-lead-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.leadFilter || 'active';
      document.querySelectorAll('[data-lead-filter]').forEach(item => item.classList.toggle('active', item===button));
      renderList();
    });
  });

  if (window.steadyHandsAdminSession) load();
  else window.addEventListener('steadyhands:admin-ready', load, {once:true});
})();