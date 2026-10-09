(()=>{'use strict';
const $=s=>document.querySelector(s),db=()=>window.steadyHandsCRMClient;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],siteKeys=[],lastLink='',lastCode='',recipient='';
const message=(s,form=false)=>{$(form?'#paFormNotice':'#paNotice').textContent=s||''};
function modal(open){$('#paOverlay').hidden=!open;if(open){$('#paForm').hidden=false;$('#paResult').hidden=true;message('',true)}}
function render(){
 const q=$('#paSearch').value.toLowerCase().trim(),filter=$('#paFilter').value;
 const visible=rows.filter(r=>(!q||[r.site_key,r.site_title,r.preview_url,r.recipient_email].some(v=>String(v||'').toLowerCase().includes(q)))&&(filter==='all'||(filter==='claimed'?Boolean(r.claimed_at):!r.claimed_at)));
 $('#paTotal').textContent=rows.length;
 $('#paUnclaimed').textContent=rows.filter(x=>!x.claimed_at).length;
 $('#paConnected').textContent=rows.filter(x=>x.claimed_at).length;
 $('#paList').innerHTML=visible.length?visible.map(r=>'<article class="pa-entry"><div class="pa-info"><strong>'+esc(r.site_title)+'</strong><small>'+esc(r.site_key)+'</small><a href="'+esc(r.preview_url)+'" rel="noopener noreferrer" target="_blank">'+esc(r.preview_url)+'</a><small>'+(r.recipient_email?'Recipient: '+esc(r.recipient_email)+' · ':'')+'Created '+new Date(r.created_at).toLocaleDateString()+'</small></div><span class="pa-tag '+(r.claimed_at?'done':'')+'">'+(r.claimed_at?'Connected':r.revoked_at?'Revoked':r.expires_at&&new Date(r.expires_at)<new Date()?'Expired':'Unclaimed')+'</span><div class="pa-actions"><button class="pa-btn secondary" data-copy="'+esc(r.site_key)+'">Copy Code</button>'+(r.claimed_at||r.revoked_at?'':'<button class="pa-btn secondary" data-revoke="'+esc(r.id)+'">Revoke</button>')+'</div></article>').join(''):'<p>No invitations match your search. Create an invitation to get started.</p>';
}
async function load(){
 message('');const client=db();if(!client)return;
 const {data,error}=await client.rpc('admin_list_preview_access');
 if(error){message('Preview Access database setup is required. Run sql/admin-preview-access.sql in your main Supabase project. '+error.message);$('#paList').textContent='Preview invitations are unavailable until database setup is complete.';return}
 rows=data||[];render();
}
function validUrl(raw){try{const url=new URL(raw);return url.protocol==='https:'&&['steadyhandsop.com','viewyoursite.today'].includes(url.hostname)}catch{return false}}
async function create(e){
 e.preventDefault();const client=db(),name=$('#paName').value.trim(),type=$('#paType').value,key=$('#paKey').value.trim(),url=$('#paUrl').value.trim(),email=$('#paEmail').value.trim(),method=$('#paMethod').value;
 if(!name||!key||!validUrl(url)){message('Provide the business name, site key, and a valid HTTPS preview URL on an approved host.',true);return}
 const button=$('#paSubmit');button.disabled=true;message('Creating preview access…',true);
 const {data,error}=await client.rpc('admin_create_preview_access',{p_site_key:key,p_site_title:name,p_preview_url:url,p_site_type:type,p_recipient_email:email||null,p_access_method:method});
 button.disabled=false;if(error){message(error.message,true);return}
 const info=typeof data==='string'?JSON.parse(data):data;
 lastLink=info?.invite_link||'';lastCode=info?.site_key||key;recipient=email;
 $('#paResultCode').value=lastCode;$('#paResultLink').value=lastLink;$('#paInviteResult').hidden=!lastLink;
 $('#paForm').hidden=true;$('#paResult').hidden=false;
 await load();
}
async function copy(v){try{await navigator.clipboard.writeText(v);message('Copied to clipboard.')}catch{message('Copy failed. Select and copy the text manually.')}}
$('#paNew').onclick=()=>{$('#paForm').reset();modal(true)};
$('#paClose').onclick=$('#paCancel').onclick=$('#paDone').onclick=()=>modal(false);
$('#paOverlay').onclick=e=>{if(e.target.id==='paOverlay')modal(false)};
$('#paForm').onsubmit=create;
$('#paSearch').oninput=render;$('#paFilter').onchange=render;$('#paRefresh').onclick=load;
$('#paCopyCode').onclick=()=>copy(lastCode);$('#paCopyLink').onclick=()=>copy(lastLink);
$('#paEmailLink').onclick=()=>{if(!lastLink)return;const subject='Your Steady Hands Website Preview',body='Hello,\n\nYour website preview is ready. To connect it to your Steady Hands Client Portal account, use this private signup link:\n\n'+lastLink+'\n\nYour preview code: '+lastCode+'\n\nSteady Hands LLC';location.href='mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)};
$('#paList').onclick=async e=>{const copyButton=e.target.closest('[data-copy]');if(copyButton)return copy(copyButton.dataset.copy);const revoke=e.target.closest('[data-revoke]');if(!revoke)return;if(!confirm('Revoke this unused invitation? An existing claim will not be disconnected.'))return;revoke.disabled=true;const {error}=await db().rpc('admin_revoke_preview_access',{p_invite_id:revoke.dataset.revoke});if(error)message(error.message);else await load();revoke.disabled=false};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#paOverlay').hidden)modal(false)});
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();