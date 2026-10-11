/* Salesperson tools: uses existing admin data and explicit backend availability reporting. */
(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id);
  const demoDefault='';
  const c=()=>window.steadyHandsCRMClient;
  async function invoke(action,body,output){
    output.textContent='Contacting account service…';
    const client=c();if(!client){output.textContent='Not connected to Supabase.';return;}
    try{
      const {data,error}=await client.functions.invoke('admin-salesperson-accounts',{body:{action,...body}});
      if(error)throw new Error(error.message||'Account service unavailable');
      if(!data?.ok)throw new Error(data?.error||'Account service did not confirm success');
      output.textContent=data.message||'Request completed successfully.';
      if(data.temporary_password)output.textContent+=' Temporary password (copy now): '+data.temporary_password;
      if(action==='create')setTimeout(()=>location.reload(),1600);
    }catch(err){output.textContent='NOT COMPLETED: '+(err.message||String(err))+'. Configure and deploy the protected admin-salesperson-accounts Edge Function first.';}
  }
  function setupCreate(){
    const panel=$('salespersonCreatePanel');if(!panel)return;
    $('salespersonCreateToggle').onclick=()=>{panel.hidden=!panel.hidden};
    $('salespersonCreateForm').onsubmit=async ev=>{
      ev.preventDefault();const out=$('salespersonCreateResult');const name=$('newSalespersonName').value.trim(), username=$('newSalespersonUsername').value.trim().toLowerCase(),password=$('newSalespersonPassword').value;
      if(!/^[a-z][a-z0-9._-]{2,40}$/.test(username)){out.textContent='Username must start with a letter and contain 3–41 allowed characters.';return;}
      if(!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{12,}$/.test(password)){out.textContent='Use 12+ characters, including uppercase, lowercase, a number and symbol.';return;}
      await invoke('create',{display_name:name,email:username+'@steadyhandsop.com',temporary_password:password},out);
    };
  }
  function enhanceDrawer(){
    const d=$('adminUserDrawer');if(!d||!d.querySelector('#adminCloseUser')||d.querySelector('#salespersonExtras'))return;
    const id=new URLSearchParams(location.search).get('user')||document.querySelector('.admin-user-card[data-id].selected')?.dataset.id||'';
    const email=d.querySelector('.admin-user-drawer-head p')?.textContent||'';
    const heading=d.querySelector('.admin-user-drawer-head h2')?.textContent||'';
    const match=[...document.querySelectorAll('.admin-user-card[data-id]')].find(b=>b.textContent.includes(email));
    const userId=match?.dataset.id||id;
    const wrap=document.createElement('section');wrap.id='salespersonExtras';wrap.className='salesperson-extra';
    wrap.innerHTML=`<h3>Salesperson management</h3><p>Use the same login account for activity and caller ID assignments. A Twilio number must be configured in Phone Numbers and the calling backend must honor that mapping.</p>
      <div class="salesperson-tool-grid">
        <a href="salesperson-progress.html?user=${encodeURIComponent(userId)}">Progress dashboard</a><a href="activity.html?user=${encodeURIComponent(userId)}">Call activity</a>
        <a href="deals.html?user=${encodeURIComponent(userId)}">Customer progress / deals</a>
        <a href="earnings.html?user=${encodeURIComponent(userId)}">Sales / earnings</a>
        <a href="call-management.html">Assign leads and follow-ups</a>
        <a href="phones.html">Assign Twilio caller ID</a>
        <a href="login-activity.html?user=${encodeURIComponent(userId)}">Login activity</a>
        <a href="onboarding.html?user=${encodeURIComponent(userId)}">Onboarding answers & agreements</a>
      </div>
      <h3>Demo link</h3><label class="salesperson-label">Demo URL <input type="url" id="salespersonDemoUrl" placeholder="https://your-demo-domain.example" /></label>
      <button type="button" id="salespersonCopyDemo">Copy demo invitation</button><small id="salespersonDemoMsg" role="status"></small>
      <h3>Account actions</h3><p>These require a protected Supabase Edge Function. No password or account changes happen in the browser.</p>
      <button type="button" id="salespersonResetPassword">Generate new temporary password</button>
      <button type="button" id="salespersonResetOnboarding">Reset onboarding</button><p id="salespersonActionStatus" role="status"></p>`;
    wrap.insertAdjacentHTML('beforeend',`<h3>Work and phone management</h3>
      <div class="salesperson-tool-grid"><a href="onboarding.html?user=${encodeURIComponent(userId)}">Onboarding</a><a href="tasks.html?user=${encodeURIComponent(userId)}">Tasks</a><a href="call-management.html">Lead queues</a></div>
      <label class="salesperson-label">Assigned outbound Twilio number<select id="salespersonPhoneSelect"><option value="">Loading numbers…</option></select></label>
      <button type="button" id="salespersonSavePhone">Save phone assignment</button><p id="salespersonPhoneResult" role="status"></p>
      <h3>Task assignment</h3><form id="salespersonTaskForm"><label class="salesperson-label">Task title<input id="salespersonTaskTitle" required maxlength="150"></label>
      <label class="salesperson-label">Instructions<textarea id="salespersonTaskNotes" maxlength="4000"></textarea></label>
      <label class="salesperson-label">Due date<input id="salespersonTaskDue" type="datetime-local"></label>
      <label class="salesperson-label">Priority<select id="salespersonTaskPriority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
      <button type="submit">Assign task</button><p id="salespersonTaskResult" role="status"></p></form>
      <h3>Assigned tasks</h3><div id="salespersonTaskList">Loading…</div>`);
    d.append(wrap);
    if(userId){
      (async()=>{const sel=$('salespersonPhoneSelect'),client=c();try{const [nums,assigned]=await Promise.all([client.from('callcenter_phone_numbers').select('id,phone_number,label,active').eq('active',true),client.from('callcenter_phone_assignments').select('phone_number_id').eq('user_id',userId).maybeSingle()]);if(nums.error||assigned.error)throw nums.error||assigned.error;sel.replaceChildren(new Option('Unassigned',''));for(const n of nums.data||[])sel.add(new Option(`${n.phone_number} — ${n.label||'Twilio'}`,n.id));sel.value=assigned.data?.phone_number_id||'';}catch(e){$('salespersonPhoneResult').textContent='Could not load numbers: '+e.message;}})();
      $('salespersonSavePhone').onclick=()=>invoke('assign_phone',{user_id:userId,phone_number_id:$('salespersonPhoneSelect').value||null},$('salespersonPhoneResult'));
      async function loadTasks(){const out=$('salespersonTaskList');const {data,error}=await c().from('outreach_tasks').select('id,title,status,priority,due_at,created_at').eq('assigned_to',userId).order('created_at',{ascending:false}).limit(50);if(error){out.textContent=error.message;return;}out.replaceChildren();if(!data?.length){out.textContent='No assigned tasks';return;}for(const t of data){const p=document.createElement('p');p.textContent=`${t.title} · ${t.status} · ${t.priority||'normal'} · ${t.due_at?new Date(t.due_at).toLocaleString():'No deadline'}`;out.append(p);}}
      loadTasks();
      $('salespersonTaskForm').onsubmit=async ev=>{ev.preventDefault();const msg=$('salespersonTaskResult');msg.textContent='Saving task…';const due=$('salespersonTaskDue').value;const {data:{user:actor},error:authErr}=await c().auth.getUser();if(authErr||!actor){msg.textContent='Admin session required';return;}const {error}=await c().from('outreach_tasks').insert({assigned_to:userId,created_by:actor.id,title:$('salespersonTaskTitle').value.trim(),notes:$('salespersonTaskNotes').value.trim(),priority:$('salespersonTaskPriority').value,status:'pending',due_at:due?new Date(due).toISOString():null});msg.textContent=error?'NOT SAVED: '+error.message:'Task assigned.';if(!error){ev.target.reset();loadTasks();}};
    }
    $('salespersonDemoUrl').value=sessionStorage.getItem('sh-demo-url')||demoDefault;
    $('salespersonCopyDemo').onclick=async()=>{
      const url=$('salespersonDemoUrl').value.trim();const msg=$('salespersonDemoMsg');
      if(!/^https:\/\/[^\s]+$/i.test(url)){msg.textContent='Enter your actual HTTPS demo URL first.';return;}
      sessionStorage.setItem('sh-demo-url',url);
      const text=`Hi ${heading||'there'}, here's the Steady Hands demo: ${url}`;
      try{await navigator.clipboard.writeText(text);msg.textContent='Invitation copied. Paste into a message to send.'}catch{msg.textContent='Copy manually: '+text}
    };
    $('salespersonResetPassword').onclick=()=>{if(!userId){$('salespersonActionStatus').textContent='Cannot determine this user ID.';return;}if(confirm('Generate a new temporary password for '+email+'?'))invoke('reset_password',{user_id:userId},$('salespersonActionStatus'))};
    $('salespersonResetOnboarding').onclick=()=>{if(!userId){$('salespersonActionStatus').textContent='Cannot determine this user ID.';return;}if(confirm('Require '+email+' to complete onboarding again?'))invoke('reset_onboarding',{user_id:userId},$('salespersonActionStatus'))};
  }
  document.addEventListener('click',ev=>{if(ev.target.closest('.admin-user-card[data-id]'))setTimeout(enhanceDrawer,0)});
  new MutationObserver(()=>enhanceDrawer()).observe($('adminUserDrawer'),{childList:true});
  setupCreate();enhanceDrawer();
})();
