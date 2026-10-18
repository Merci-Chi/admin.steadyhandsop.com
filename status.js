(() => {
  'use strict';
  const $=id=>document.getElementById(id),d=window.SalesAssociateData,esc=d.esc;
  let users=[],items=[],history=[],selected=null,busy=false,ready=false,opener=null;
  const date=value=>value?new Date(value).toLocaleString():'';
  const ownItems=id=>items.filter(x=>x.user_id===id);
  function progress(id){const rows=ownItems(id);return rows.length?`${rows.filter(x=>x.completed).length} of ${rows.length} complete`:'No checklist items yet';}
  function renderList(){
    const q=$('status-search').value.trim().toLowerCase();
    const rows=users.filter(u=>[u.display_name,u.email,u.user_id].some(v=>String(v||'').toLowerCase().includes(q)));
    $('status-notice').textContent=`${rows.length} of ${users.length} associates`;
    $('status-list').innerHTML=rows.map(u=>`<div class="status-card"><button type="button" class="status-person" data-open="${esc(u.user_id)}"><strong>${esc(u.display_name||u.email||u.user_id)}</strong>${u.email&&u.display_name?`<small>${esc(u.email)}</small>`:''}</button><span class="status-count">${esc(progress(u.user_id))}</span><button type="button" class="status-plus" data-add="${esc(u.user_id)}" aria-label="Add checklist item for ${esc(d.userLabel(u))}">+</button></div>`).join('')||'<p class="sa-empty">No matching associates.</p>';
  }
  function renderDialog(){
    if(!selected)return;
    const rows=ownItems(selected.user_id).sort((a,b)=>Number(a.completed)-Number(b.completed)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    $('status-name').textContent=d.userLabel(selected);
    $('status-progress').textContent=progress(selected.user_id);
    $('status-items').innerHTML=rows.map(x=>`<label class="status-item ${x.completed?'is-complete':''}"><input type="checkbox" data-item="${esc(x.id)}" ${x.completed?'checked':''} ${busy?'disabled':''}><span><span class="status-item-title">${esc(x.title)}</span>${x.completed_at?`<small>Completed ${esc(date(x.completed_at))}</small>`:''}</span></label>`).join('')||'<p class="sa-empty">Add the first next step above.</p>';
    const events=history.filter(x=>x.user_id===selected.user_id).sort((a,b)=>b.changed_at.localeCompare(a.changed_at)||b.id.localeCompare(a.id));
    $('status-history').innerHTML=events.map(x=>`<div class="status-event"><strong>${esc(({added:'Added',completed:'Completed',reopened:'Reopened'})[x.action]||x.action)}</strong> · ${esc(x.title)}<small>${esc(date(x.changed_at))}</small></div>`).join('')||'<p class="sa-empty">No history yet.</p>';
  }
  async function load(force=false){
    if(busy&&!force)return;
    ready=false;$('status-refresh').disabled=true;$('status-notice').textContent='Loading associates…';
    const c=window.steadyHandsCRMClient;
    try{
      const [profiles,permissions,allItems,allHistory]=await Promise.all([
        d.readAll(c,'callcenter_profiles'),d.readAll(c,'team_permissions'),
        d.readAll(c,'associate_status_items','*','id'),d.readAll(c,'associate_status_history','*','id')
      ]);
      const allowed=permissions.filter(p=>(String(p.role).toUpperCase()==='SALES'||p.sales_enabled===true)&&p.listed!==false);
      const profileMap=new Map(profiles.map(p=>[p.user_id,p]));
      users=allowed.map(p=>({...profileMap.get(p.user_id),user_id:p.user_id})).sort((a,b)=>d.userLabel(a).localeCompare(d.userLabel(b)));
      items=allItems;history=allHistory;ready=true;renderList();
      if(selected){selected=users.find(u=>u.user_id===selected.user_id)||null;if(selected)renderDialog();else $('status-dialog').close();}
    }catch(error){$('status-list').innerHTML='';$('status-notice').textContent='Could not load status: '+(error.message||String(error))+'. If setup is pending, run sql/associate-status.sql and refresh.';}
    finally{$('status-refresh').disabled=false;}
  }
  function open(id,add,button){
    if(!ready||busy)return;
    selected=users.find(u=>u.user_id===id);if(!selected)return;
    opener=button;$('status-title').value='';$('status-message').textContent='';$('status-history-panel').open=false;
    renderDialog();$('status-dialog').showModal();if(add)$('status-title').focus();
  }
  function setBusy(value){
    busy=value;$('status-refresh').disabled=value;
    $('status-dialog').querySelectorAll('input,button').forEach(el=>{el.disabled=value;});
  }
  async function mutate(name,args){
    setBusy(true);$('status-message').textContent='Saving…';
    try{
      const {data,error}=await window.steadyHandsCRMClient.rpc(name,args);
      if(error)throw error;if(!data?.id)throw new Error('The database did not confirm the save.');
      // Reload authoritative history after every mutation; do not invent timestamps.
      await load(true);
      if(!ready)throw new Error('The save was confirmed, but status could not be refreshed. Close this popup and refresh before continuing.');
      $('status-message').textContent='Saved.';return true;
    }catch(error){$('status-message').textContent=(error.message||String(error))+' Refresh before retrying if the outcome is uncertain.';return false;}
    finally{setBusy(false);renderDialog();if(!ready)$('status-dialog').querySelectorAll('#status-add input,#status-add button,[data-item]').forEach(el=>{el.disabled=true;});}
  }
  $('status-list').addEventListener('click',event=>{const button=event.target.closest('[data-open],[data-add]');if(button)open(button.dataset.open||button.dataset.add,Boolean(button.dataset.add),button);});
  $('status-search').addEventListener('input',()=>{if(ready)renderList();});
  $('status-refresh').addEventListener('click',()=>load());
  $('status-close').addEventListener('click',()=>{if(!busy)$('status-dialog').close();});
  $('status-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('status-dialog').addEventListener('close',()=>{selected=null;if(opener?.isConnected)opener.focus();else $('status-search').focus();});
  $('status-add').addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||!selected)return;
    const title=$('status-title').value.trim();if(!title){$('status-message').textContent='Enter a checklist item.';$('status-title').focus();return;}
    if(await mutate('associate_status_add',{p_user_id:selected.user_id,p_title:title})){$('status-title').value='';$('status-title').focus();}
  });
  $('status-items').addEventListener('change',async event=>{
    const input=event.target.closest('[data-item]');if(!input)return;
    const item=items.find(x=>x.id===input.dataset.item);if(!ready||busy||!item){renderDialog();return;}
    const id=item.id;
    await mutate('associate_status_set_completed',{p_item_id:id,p_completed:input.checked,p_expected_completed:item.completed});
    $('status-items').querySelector(`[data-item="${id}"]`)?.focus();
  });
  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();
