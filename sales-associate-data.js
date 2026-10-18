/* Available-value rendering shared by the associate overview and action outcomes. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const secret=/(?:^|_)(password|token|secret|api_key|service_role_key)(?:_|$)/i;
  function clean(value){
    if(value==null)return undefined;
    if(typeof value==='string'){const s=value.trim();return !s||/^(null|undefined|no data|not provided|empty)$/i.test(s)?undefined:s;}
    if(Array.isArray(value)){const a=value.map(clean).filter(v=>v!==undefined);return a.length?a:undefined;}
    if(typeof value==='object'){const o={};for(const [k,v] of Object.entries(value)){if(secret.test(k.replace(/([a-z])([A-Z])/g,'$1_$2')))continue;const next=clean(v);if(next!==undefined)o[k]=next;}return Object.keys(o).length?o:undefined;}
    return value;
  }
  const label=key=>String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  function valueHTML(value){
    if(typeof value==='boolean')return value?'Yes':'No';
    if(Array.isArray(value))return value.map(v=>`<div>${valueHTML(v)}</div>`).join('');
    if(value&&typeof value==='object')return `<dl>${rows(value)}</dl>`;
    if(typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))return `<img class="sa-signature" src="${esc(value)}" alt="Associate signature">`;
    return esc(value);
  }
  function rows(record){return Object.entries(clean(record)||{}).map(([key,value])=>`<div class="sa-detail-row"><dt>${esc(label(key))}</dt><dd>${valueHTML(value)}</dd></div>`).join('');}
  function section(title,record){const body=rows(record);return body?`<section class="sa-section"><h3>${esc(title)}</h3><dl>${body}</dl></section>`:'';}
  function summary(user){return section('Overview',{
    Name:user.display_name,Email:user.email,Phone:user.phone,Country:user.country,
    'State / province':user.state||user.province||user.region,
    City:user.city,'Postal code':user.postal_code||user.zip,
    'Joined':user.created_at,'Last call':user.last_call_at,
    'Total calls':user.call_count,'Connected minutes':user.total_duration==null?undefined:Math.round(user.total_duration/60),
    'Outbound number':user.outbound_number,'Earnings (USD)':user.commission_cents==null?undefined:(user.commission_cents/100).toFixed(2)
  });}
  async function readAll(client,table,columns='*',order='user_id'){
    const result=[];let offset=0;
    for(;;){const {data,error}=await client.from(table).select(columns).order(order,{ascending:true}).range(offset,offset+499);if(error)throw error;if(!data?.length)break;result.push(...data);offset+=data.length;}
    return result;
  }
  function mergeUsers(profiles,permissions,extra=[]){
    const map=new Map();
    for(const item of extra){const id=item.id||item.user_id;if(id)map.set(String(id),{...item,user_id:String(id),display_name:item.display_name||item.name,email:item.email});}
    for(const p of profiles){const id=String(p.user_id);map.set(id,{...map.get(id),...p,user_id:id});}
    const roles=new Map(permissions.map(p=>[String(p.user_id),p]));
    return [...map.values()].map(p=>({...p,permission:roles.get(p.user_id)})).sort((a,b)=>String(a.display_name||a.email||a.user_id).localeCompare(String(b.display_name||b.email||b.user_id)));
  }
  const userLabel=u=>[clean(u?.display_name||u?.name),clean(u?.email)].filter(Boolean).join(' · ')||u?.user_id||u?.id||'';
  window.SalesAssociateData={esc,clean,label,rows,section,summary,readAll,mergeUsers,userLabel};
})();
