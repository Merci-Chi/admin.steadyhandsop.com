(() => {
  const SUPABASE_URL = 'https://glonbvrcudwuzjundrii.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const client = () => {
    if (!window.supabase) return null;
    if (!window.steadyHandsCRMClient) {
      window.steadyHandsCRMClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return window.steadyHandsCRMClient;
  };

  const formatPhone = value => {
    const digits = String(value || '').replace(/\D/g,'');
    const ten = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
    if (ten.length !== 10) return value || 'No phone';
    return '(' + ten.slice(0,3) + ') ' + ten.slice(3,6) + '-' + ten.slice(6);
  };

  const formatDate = value => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  };

  async function getAdminSession() {
    const c = client();
    if (!c) return {};

    const { data:{ session } = {}, error } = await c.auth.getSession();
    if (error || !session) return {};

    const { data: permission, error: permissionError } = await c
      .from('team_permissions')
      .select('role,active')
      .eq('user_id', session.user.id)
      .maybeSingle();

    return {
      session,
      isAdmin: !permissionError && permission?.active === true && permission?.role === 'ADMIN'
    };
  }

  function denied(main) {
    main.innerHTML = `
      <section class="admin-access-denied">
        <div class="admin-access-icon"><i data-lucide="shield-x"></i></div>
        <h2>Admin access required</h2>
        <p>This page is only available to users with an active ADMIN role in Supabase.</p>
        <a href="index.html">Back to Overview</a>
      </section>`;
    window.lucide?.createIcons();
  }

  function errorState(main, message) {
    main.innerHTML = `
      <section class="admin-access-denied">
        <div class="admin-access-icon"><i data-lucide="triangle-alert"></i></div>
        <h2>Unable to load approvals</h2>
        <p>${esc(message || 'Please refresh and try again.')}</p>
        <button type="button" id="adminRetry">Try Again</button>
      </section>`;
    document.getElementById('adminRetry')?.addEventListener('click', () => location.reload());
    window.lucide?.createIcons();
  }

  async function eligibleSalespeople(c) {
    const [permissions, profiles] = await Promise.all([
      c.from('team_permissions').select('user_id,role,active,listed').in('role',['SALES','ADMIN']).eq('active',true),
      c.from('callcenter_profiles').select('user_id,display_name,email,disabled_at').is('disabled_at',null).order('display_name',{ascending:true})
    ]);
    if (permissions.error || profiles.error) throw permissions.error || profiles.error;
    const ids = new Set((permissions.data || [])
      .filter(p => ['SALES','ADMIN'].includes(p.role) && p.active === true && p.listed !== false)
      .map(p => String(p.user_id)));
    return (profiles.data || []).filter(p => !p.disabled_at && ids.has(String(p.user_id)));
  }

  async function loadApprovals(main, session) {
    const c = client();

    let salespeople;
    try {
      salespeople = await eligibleSalespeople(c);
    } catch (error) {
      errorState(main, 'Could not verify active sales associates and admins: ' + error.message);
      return;
    }

    const [
      { data: pending = [], error: pendingError },
      { data: profiles = [], error: profilesError },
      { data: phoneNumbers = [], error: phoneNumbersError },
      { data: assignments = [], error: assignmentsError }
    ] = await Promise.all([
      c
        .from('callcenter_profiles')
        .select('user_id,display_name,email,phone,phone_verified_at,phone_approval_status,phone_approval_requested_at')
        .eq('phone_approval_status','pending')
        .not('phone_verified_at','is',null)
        .order('phone_approval_requested_at',{ascending:true}),
      c
        .from('callcenter_profiles')
        .select('user_id,display_name,email')
        .order('display_name',{ascending:true}),
      c
        .from('callcenter_phone_numbers')
        .select('id,phone_number,label,active,twilio_status,requested_by_user_id,requested_at,created_at,inbound_destination,inbound_forward_number')
        .order('created_at',{ascending:true}),
      c
        .from('callcenter_phone_assignments')
        .select('id,user_id,phone_number_id,updated_at')
    ]);

    if(phoneNumbersError?.code==='42703'&&/inbound_/i.test(phoneNumbersError.message||'')){
      errorState(main,'Incoming-call routing needs its database update. Apply the Admin inbound destinations migration, then refresh.');return;
    }
    const callerIdSchemaMissing =
      phoneNumbersError?.code === '42P01' ||
      assignmentsError?.code === '42P01' ||
      phoneNumbersError?.code === 'PGRST205' || assignmentsError?.code === 'PGRST205';

    if (pendingError || profilesError || (!callerIdSchemaMissing && (phoneNumbersError || assignmentsError))) {
      errorState(main, (pendingError || profilesError || phoneNumbersError || assignmentsError)?.message);
      return;
    }

    const assignmentByPhone = new Map(
      (assignments || []).map(row => [String(row.phone_number_id), row])
    );

    const profileByUser = new Map(
      (profiles || []).map(row => [String(row.user_id), row])
    );

    const callerIdSection = callerIdSchemaMissing
      ? `
        <section class="admin-approval-section admin-callerid-section">
          <div class="admin-section-head">
            <div>
              <h2>Calling Numbers</h2>
              <p>Run the caller-ID SQL migration first, then refresh this page.</p>
            </div>
          </div>
          <div class="admin-empty">
            <i data-lucide="database-zap"></i>
            <strong>Caller ID setup required</strong>
            <span>The callcenter_phone_numbers tables do not exist yet.</span>
          </div>
        </section>`
      : `
        <section class="admin-approval-section admin-callerid-section">
          <div class="admin-section-head">
            <div>
              <h2>Calling Numbers</h2>
              <p>Add Twilio-owned numbers and assign one default caller ID to each active sales associate or admin.</p>
              <h2>Outbound Phone Numbers</h2>
              <p>Add Twilio-owned numbers and assign one default caller ID to each active sales associate or admin. Twilio readiness is confirmed manually.</p>
            </div>
            <span class="admin-count admin-phone-count">${phoneNumbers.length}</span>
          </div>

          <form class="admin-add-phone" id="adminAddPhoneForm">
            <label>
              <span>Twilio number</span>
              <input id="adminPhoneNumber" type="tel" inputmode="tel" placeholder="+17025550101" required />
            </label>
            <label>
              <span>Label</span>
              <input id="adminPhoneLabel" type="text" maxlength="60" placeholder="Sales Line 1" />
            </label>
            <button type="submit"><i data-lucide="plus"></i>Add Number</button>
          </form>

          <div class="admin-phone-list" id="adminPhoneList">
            ${phoneNumbers.length ? phoneNumbers.map(row => {
              const assignment = assignmentByPhone.get(String(row.id));
              const assignedUserId = assignment?.user_id || '';
              const assignedProfile = assignedUserId ? profileByUser.get(String(assignedUserId)) : null;
              const requestedProfile = row.requested_by_user_id ? profileByUser.get(String(row.requested_by_user_id)) : null;
              const options = [
                '<option value="">Unassigned</option>',
                ...(assignedUserId && !salespeople.some(p => String(p.user_id) === String(assignedUserId))
                  ? ['<option value="' + esc(assignedUserId) + '" selected disabled>Current assignment unavailable — choose an active sales associate, admin, or Unassigned</option>'] : []),
                ...salespeople.map(profile => {
                  const selected = String(profile.user_id) === String(assignedUserId) ? ' selected' : '';
                  const label = [profile.display_name, profile.email].filter(Boolean).join(' — ') || 'Sales associate';
                  return '<option value="' + esc(profile.user_id) + '"' + selected + '>' + esc(label) + '</option>';
                })
              ].join('');

              return `
                <article class="admin-phone-card" data-phone-id="${esc(row.id)}">
                  <div class="admin-phone-card-head">
                    <div class="admin-phone-card-icon"><i data-lucide="phone-call"></i></div>
                    <div class="admin-phone-card-copy">
                      <strong>${esc(formatPhone(row.phone_number))}</strong>
                      <span>${esc(row.label || 'Outbound caller ID')}</span>
                      ${requestedProfile ? '<small>Requested by ' + esc(requestedProfile.display_name || requestedProfile.email || 'Account') + '</small>' : ''}
                    </div>
                    <span class="admin-phone-active">${!row.active ? 'Disabled' : row.twilio_status === 'ready' ? 'Twilio Ready' : 'Pending Twilio'}</span>
                  </div>

                  <label class="admin-phone-assign">
                    <span>Assigned sales associate or admin</span>
                    <select data-phone-assignment>
                      ${options}
                    </select>
                    <small>${assignedUserId ? 'Assigned to ' + esc(assignedProfile?.display_name || assignedProfile?.email || 'an unavailable account') + '. ' + (!row.active ? 'Disabled in phone management.' : row.twilio_status !== 'ready' ? 'Confirm Twilio setup and mark ready before calling.' : 'Configured as this account’s default caller ID.') : 'This number is not assigned to an account.'}</small>
                  </label>

                  <section class="admin-phone-route" aria-label="Incoming call destination">
                    <label class="admin-phone-assign"><span>Incoming calls go to</span>
                      <select data-inbound-destination>
                        <option value="app" ${row.inbound_destination!=='forward'?'selected':''}>Outreach app</option>
                        <option value="forward" ${row.inbound_destination==='forward'?'selected':''}>Phone forwarding</option>
                      </select>
                    </label>
                    <label class="admin-phone-assign" data-inbound-forward-wrap ${row.inbound_destination!=='forward'?'hidden':''}>
                      <span>Forwarding number</span><input data-inbound-forward type="tel" placeholder="+17025550101" value="${esc(row.inbound_forward_number||'')}" ${row.inbound_destination!=='forward'?'disabled':''}>
                    </label>
                    <p>Outreach app is the default. Assign an active account to receive calls. Unanswered calls go to business voicemail.</p>
                    <button type="button" data-save-inbound>Save incoming destination</button>
                    <p data-inbound-status role="status" aria-live="polite"></p>
                  </section>
                  <div class="admin-phone-actions">
                    <button type="button" class="admin-phone-ready" data-phone-ready>
                      <i data-lucide="${row.twilio_status === 'ready' ? 'shield-check' : 'shield-alert'}"></i>
                      ${row.twilio_status === 'ready' ? 'Mark Pending' : 'Mark Twilio Ready'}
                    </button>
                    <button type="button" class="admin-phone-toggle" data-phone-toggle>
                      <i data-lucide="${row.active ? 'pause' : 'play'}"></i>
                      ${row.active ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" class="admin-phone-delete" data-phone-delete>
                      <i data-lucide="trash-2"></i>Remove
                    </button>
                  </div>
                </article>`;
            }).join('') : `
              <div class="admin-empty">
                <i data-lucide="phone-call"></i>
                <strong>No outbound numbers yet</strong>
                <span>Add a Twilio-owned phone number above.</span>
              </div>`}
          </div>
        </section>`;

    main.innerHTML = `
      <section class="admin-summary-card">
        <div class="admin-summary-icon"><i data-lucide="shield-check"></i></div>
        <div>
          <strong>Admin Access</strong>
          <span>Signed in as ${esc(session.user.email || '')}</span>
        </div>
      </section>

      ${callerIdSection}

      <section class="admin-approval-section">
        <div class="admin-section-head">
          <div>
            <h2>Pending Approvals</h2>
            <p>Phone numbers that passed SMS verification and are waiting for an admin.</p>
          </div>
          <span class="admin-count" id="pendingApprovalCount">${pending.length}</span>
        </div>

        <div class="admin-approval-list" id="pendingApprovalList">
          ${pending.length ? pending.map(row => `
            <article class="admin-approval-card" data-user-id="${esc(row.user_id)}">
              <div class="admin-approval-user">
                <div class="admin-approval-avatar">${esc((row.display_name || row.email || 'U').trim().charAt(0).toUpperCase())}</div>
                <div class="admin-approval-copy">
                  <strong>${esc(row.display_name || 'User')}</strong>
                  <span>${esc(row.email || '')}</span>
                </div>
                <span class="admin-pending-badge">Pending</span>
              </div>

              <div class="admin-phone-box">
                <span>Verified phone number</span>
                <strong>${esc(formatPhone(row.phone))}</strong>
                <small>${row.phone_verified_at ? 'SMS verified ' + esc(formatDate(row.phone_verified_at)) : ''}</small>
              </div>

              <div class="admin-approval-actions">
                <button class="admin-reject-btn" type="button" data-admin-action="reject"><i data-lucide="x"></i>Reject</button>
                <button class="admin-approve-btn" type="button" data-admin-action="approve"><i data-lucide="check"></i>Approve</button>
              </div>
            </article>
          `).join('') : `
            <div class="admin-empty">
              <i data-lucide="circle-check-big"></i>
              <strong>No pending approvals</strong>
              <span>Verified phone numbers waiting for approval will appear here.</span>
            </div>`}
        </div>
      </section>
    `;

    // Supabase may return success with zero affected rows after RLS filtering.
    const requireChangedRow = result => {
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error('No changes were saved. The record changed or access was denied. Refresh and try again.');
    };

    const updateCount = () => {
      const remaining = main.querySelectorAll('.admin-approval-card').length;
      const count = document.getElementById('pendingApprovalCount');
      if (count) count.textContent = String(remaining);
      if (!remaining) {
        const list = document.getElementById('pendingApprovalList');
        if (list) list.innerHTML = `
          <div class="admin-empty">
            <i data-lucide="circle-check-big"></i>
            <strong>No pending approvals</strong>
            <span>Verified phone numbers waiting for approval will appear here.</span>
          </div>`;
      }
      window.lucide?.createIcons();
    };

    main.querySelectorAll('[data-admin-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-approval-card');
        const userId = card?.dataset.userId;
        const action = button.dataset.adminAction;
        if (!userId || !['approve','reject'].includes(action)) return;

        const buttons = card.querySelectorAll('button');
        buttons.forEach(item => item.disabled = true);

        const payload = action === 'approve'
          ? {
              phone_approval_status:'approved',
              phone_approved_at:new Date().toISOString(),
              phone_approved_by:session.user.id
            }
          : {
              phone_approval_status:'rejected',
              phone_approved_at:null,
              phone_approved_by:session.user.id
            };

        try {
          const result = await c
            .from('callcenter_profiles')
            .update(payload)
            .eq('user_id',userId)
            .eq('phone_approval_status','pending')
            .not('phone_verified_at','is',null)
            .select('user_id');
          requireChangedRow(result);
        } catch (error) {
          alert(error.message || 'Unable to update this approval.');
          buttons.forEach(item => item.disabled = false);
          return;
        }

        card.classList.add('admin-card-removing');
        setTimeout(() => {
          card.remove();
          updateCount();
        },180);
      });
    });

    const normalizeE164 = value => {
      const raw = String(value || '').trim();
      const digits = raw.replace(/\D/g,'');
      if (!digits) return '';
      if (raw.startsWith('+')) return '+' + digits;
      if (digits.length === 10) return '+1' + digits;
      if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
      return '+' + digits;
    };

    document.getElementById('adminAddPhoneForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const number = normalizeE164(document.getElementById('adminPhoneNumber')?.value || '');
      const label = String(document.getElementById('adminPhoneLabel')?.value || '').trim();

      if (!/^\+[1-9]\d{7,14}$/.test(number)) {
        alert('Enter a valid phone number, for example +17025550101.');
        return;
      }

      if (phoneNumbers.some(row => normalizeE164(row.phone_number) === number)) {
        alert('This outbound number has already been added.');
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      try {
        const { error } = await c
          .from('callcenter_phone_numbers')
          .insert({
            phone_number:number,
            label,
            active:true,
            twilio_status:'pending',
            updated_at:new Date().toISOString()
          });

        if (error) throw error;
        location.reload();
      } catch (error) {
        submit.disabled = false;
        alert(error.message || 'Unable to add this number.');
      }
    });

    main.querySelectorAll('[data-inbound-destination]').forEach(select=>{
      const card=select.closest('.admin-phone-card');
      select.addEventListener('change',()=>{
        const forwarding=select.value==='forward';
        card.querySelector('[data-inbound-forward-wrap]').hidden=!forwarding;
        card.querySelector('[data-inbound-forward]').disabled=!forwarding;
        card.querySelector('[data-inbound-status]').textContent='Unsaved changes';
      });
    });
    main.querySelectorAll('[data-save-inbound]').forEach(button=>button.addEventListener('click',async()=>{
      const card=button.closest('.admin-phone-card'),result=card.querySelector('[data-inbound-status]');
      const mode=card.querySelector('[data-inbound-destination]').value;
      const raw=card.querySelector('[data-inbound-forward]').value.trim();
      const digits=raw.replace(/\D/g,'');
      const forward=raw.startsWith('+')?'+'+digits:digits.length===10?'+1'+digits:digits.length===11&&digits.startsWith('1')?'+'+digits:'';
      if(!['app','forward'].includes(mode)){result.textContent='Choose a valid incoming destination.';return;}
      if(mode==='forward'&&(!/^\+?[\d\s().-]+$/.test(raw)||!/^\+[1-9]\d{7,14}$/.test(forward)||phoneNumbers.some(p=>p.phone_number===forward))){result.textContent='Enter a phone number with country code outside your managed Twilio numbers.';return;}
      button.disabled=true;result.textContent='Saving incoming destination…';
      try{
        const auth=await getAdminSession();if(!auth.isAdmin)throw Error('Active Admin access is required.');
        const response=await c.from('callcenter_phone_numbers').update({inbound_destination:mode,inbound_forward_number:mode==='forward'?forward:null,updated_at:new Date().toISOString()}).eq('id',card.dataset.phoneId).select('id');
        if(response.error)throw response.error;
        if(response.data?.length!==1)throw Error('The incoming destination was not updated. Refresh and try again.');
        result.textContent=mode==='app'?'Incoming calls will ring in Outreach.':'Incoming calls will ring '+forward+'. Press 1 on that phone to answer.';
      }catch(error){result.textContent=error.message||'Could not save incoming destination.';}
      finally{button.disabled=false;}
    }));

    main.querySelectorAll('[data-phone-assignment]').forEach(select => {
      select.addEventListener('change', async () => {
        const card = select.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const userId = select.value || '';
        if (!phoneNumberId) return;

        const previousUserId = assignmentByPhone.get(String(phoneNumberId))?.user_id || '';
        select.disabled = true;

        try {
          if (userId && !(await eligibleSalespeople(c)).some(p => String(p.user_id) === String(userId))) {
            throw new Error('This account is not an active, listed sales associate or admin. Refresh and choose another account.');
          }
          // The server applies the entire reassignment in one transaction.
          const { error } = await c.rpc('admin_assign_outbound_phone', {
            p_phone_number_id:String(phoneNumberId),
            p_user_id:userId || null,
            p_expected_user_id:previousUserId || null
          });
          if (error?.code === 'PGRST202') {
            throw new Error('Phone assignment setup required. Apply sql/admin-phone-assignment.sql, then refresh. No assignments were changed.');
          }
          if (error) throw error;

          location.reload();
        } catch (error) {
          select.disabled = false;
          select.value = previousUserId;
          alert(error?.message || 'Unable to update this caller ID assignment.');
        }
      });
    });

    main.querySelectorAll('[data-phone-ready]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const phone = phoneNumbers.find(item => String(item.id) === String(phoneNumberId));
        if (!phone) return;

        const nextStatus = phone.twilio_status === 'ready' ? 'pending' : 'ready';

        if (nextStatus === 'ready' && !confirm('Only mark this number Twilio Ready after it is purchased/verified and usable as an outbound caller ID in Twilio. Continue?')) {
          return;
        }

        button.disabled = true;

        try {
          const result = await c
            .from('callcenter_phone_numbers')
            .update({ twilio_status:nextStatus, updated_at:new Date().toISOString() })
            .eq('id',phoneNumberId)
            .select('id');
          requireChangedRow(result);

          // Readiness never changes ownership. Use the assignment selector explicitly.

          location.reload();
        } catch (error) {
          button.disabled = false;
          alert(error?.message || 'Unable to update Twilio verification status.');
        }
      });
    });

    main.querySelectorAll('[data-phone-toggle]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        const phone = phoneNumbers.find(item => String(item.id) === String(phoneNumberId));
        if (!phone) return;

        button.disabled = true;
        try {
          const result = await c
            .from('callcenter_phone_numbers')
            .update({ active:!phone.active, updated_at:new Date().toISOString() })
            .eq('id',phoneNumberId)
            .select('id');
          requireChangedRow(result);
          location.reload();
        } catch (error) {
          button.disabled = false;
          alert(error.message || 'Unable to update this number.');
          return;
        }
      });
    });

    main.querySelectorAll('[data-phone-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        const card = button.closest('.admin-phone-card');
        const phoneNumberId = card?.dataset.phoneId;
        if (!phoneNumberId) return;
        if (!confirm('Remove this outbound phone number from the system?')) return;

        button.disabled = true;
        try {
          const result = await c
            .from('callcenter_phone_numbers')
            .delete()
            .eq('id',phoneNumberId)
            .select('id');
          requireChangedRow(result);
          location.reload();
        } catch (error) {
          button.disabled = false;
          alert(error.message || 'Unable to remove this number.');
          return;
        }
      });
    });

    window.lucide?.createIcons();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const main = document.getElementById('adminSettingsContent');
    if (!main) return;

    try {
      const { session, isAdmin } = await getAdminSession();
      if (!session) { denied(main); return; }
      if (!isAdmin) {
        denied(main);
        return;
      }

      await loadApprovals(main, session);
    } catch (error) {
      errorState(main, error?.message);
    }
  });
})();
