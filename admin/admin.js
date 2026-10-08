
(() => {
  'use strict';

  const REPO = 'frankk75/gianlucalatina-site';
  const BRANCH = 'main';
  const API = 'https://api.github.com';
  const CATEGORY_URLS = {
    'Idraulica':'idraulica.html#lavori',
    'Impianti gas':'idraulica.html#impianti-gas',
    'Autoclavi':'idraulica.html#autoclavi',
    'Disotturazione':'idraulica.html#disotturazioni',
    'Climatizzazione':'climatizzazione.html#lavori',
    'Caldaie':'caldaie.html#lavori',
    'Ristrutturazioni':'ristrutturazioni.html#lavori',
    'Avvolgibili':'avvolgibili.html#lavori'
  };

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = {token: sessionStorage.getItem('gl_admin_token') || '', gallery:null, promotions:null};

  function setBusy(on, text='Pubblicazione in corso…'){
    $('#busy-overlay').classList.toggle('hidden', !on);
    $('#busy-text').textContent = text;
  }
  function msg(el, text='', type=''){
    el.textContent=text; el.className='status'+(type?' '+type:'');
  }
  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function slug(s){
    return String(s||'foto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48) || 'foto';
  }
  function bytesToBase64(bytes){
    let bin='', chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) bin += String.fromCharCode(...bytes.subarray(i,i+chunk));
    return btoa(bin);
  }
  function textToBase64(str){ return bytesToBase64(new TextEncoder().encode(str)); }
  function base64ToText(str){
    const clean=(str||'').replace(/\n/g,'');
    const bin=atob(clean); const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function gh(path, options={}){
    if(!state.token) throw new Error('Sessione non collegata a GitHub.');
    const res = await fetch(API + path, {
      ...options,
      headers:{
        'Accept':'application/vnd.github+json',
        'Authorization':'Bearer '+state.token,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(options.headers||{})
      }
    });
    if(!res.ok){
      let detail=''; try{ const j=await res.json(); detail=j.message||''; }catch{}
      throw new Error(detail || `Errore GitHub ${res.status}`);
    }
    return res.status===204 ? null : res.json();
  }

  async function validateToken(){
    const user=await gh('/user');
    const repo=await gh('/repos/'+REPO);
    if(!repo.permissions?.push) throw new Error('Il token non ha permessi di scrittura sul repository del sito.');
    return user.login;
  }

  async function loadJson(path){
    const file=await gh(`/repos/${REPO}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`);
    return {sha:file.sha, data:JSON.parse(base64ToText(file.content))};
  }

  async function saveJson(path, data, sha, message){
    return gh(`/repos/${REPO}/contents/${path}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message, content:textToBase64(JSON.stringify(data,null,2)+'\n'), sha, branch:BRANCH})
    });
  }

  async function uploadBlob(path, blob, message){
    const bytes=new Uint8Array(await blob.arrayBuffer());
    return gh(`/repos/${REPO}/contents/${path}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message, content:bytesToBase64(bytes), branch:BRANCH})
    });
  }

  async function optimizeImage(file){
    const max=1800, quality=.86;
    let bitmap;
    if('createImageBitmap' in window){
      bitmap=await createImageBitmap(file, {imageOrientation:'from-image'});
    }else{
      bitmap=await new Promise((resolve,reject)=>{
        const img=new Image(); const u=URL.createObjectURL(file);
        img.onload=()=>{URL.revokeObjectURL(u); resolve(img)}; img.onerror=reject; img.src=u;
      });
    }
    const w=bitmap.width||bitmap.naturalWidth, h=bitmap.height||bitmap.naturalHeight;
    const scale=Math.min(1,max/Math.max(w,h));
    const cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas'); canvas.width=cw; canvas.height=ch;
    const ctx=canvas.getContext('2d',{alpha:false}); ctx.drawImage(bitmap,0,0,cw,ch);
    if(bitmap.close) bitmap.close();
    return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Impossibile elaborare la foto.')),'image/jpeg',quality));
  }

  function previewFile(input, box){
    const file=input.files?.[0];
    if(!file){box.innerHTML='Anteprima foto'; box.classList.add('empty'); return;}
    const u=URL.createObjectURL(file);
    box.classList.remove('empty'); box.innerHTML=`<img src="${u}" alt="Anteprima">`;
    box.querySelector('img').onload=()=>URL.revokeObjectURL(u);
  }

  async function refreshAll(){
    const [g,p]=await Promise.all([loadJson('data/gallery.json'), loadJson('data/promotions.json')]);
    state.gallery=g; state.promotions=p;
    renderPhotos(); renderPromotions();
  }

  function showDashboard(login){
    $('#login-view').classList.add('hidden'); $('#dashboard-view').classList.remove('hidden');
    $('#logout-btn').classList.remove('hidden'); $('#connection-label').textContent='GitHub: '+login;
  }
  function showLogin(){
    $('#login-view').classList.remove('hidden'); $('#dashboard-view').classList.add('hidden');
    $('#logout-btn').classList.add('hidden'); $('#connection-label').textContent='Non collegato';
  }

  function photoThumb(path){ return '../'+String(path||'').replace(/^\/+/,''); }

  function renderPhotos(){
    if(!state.gallery) return;
    const filter=$('#photo-filter').value;
    const items=(state.gallery.data.items||[]).map((x,i)=>({...x,_i:i}))
      .filter(x=>!filter || x.category===filter);
    $('#photo-count').textContent=`${items.length} foto`;
    $('#photos-list').innerHTML=items.length ? items.map(x=>`
      <article class="content-item">
        <img src="${esc(photoThumb(x.image))}" alt="">
        <div class="content-meta">
          <b>${esc(x.title)}</b>
          <span class="badge ${x.active===false?'off':''}">${esc(x.category||'Lavoro')}</span>
          <small>${x.active===false?'Nascosta dal sito':'Visibile sul sito e in Home'}</small>
        </div>
        <div class="item-actions">
          <button class="btn ghost" data-photo-edit="${x._i}" type="button">Modifica</button>
          <button class="btn ghost" data-photo-toggle="${x._i}" type="button">${x.active===false?'Mostra':'Nascondi'}</button>
          <button class="btn danger" data-photo-remove="${x._i}" type="button">Rimuovi</button>
        </div>
      </article>`).join('') : '<div class="empty-list">Nessuna foto in questa categoria.</div>';
  }

  function resetPhotoForm(){
    $('#photo-form').reset(); $('#photo-edit-index').value='';
    $('#photo-form-title').textContent='Aggiungi foto lavoro'; $('#photo-save-btn').textContent='Pubblica foto';
    $('#photo-cancel-btn').classList.add('hidden'); $('#photo-file-hint').textContent='Obbligatoria per un nuovo lavoro. L’immagine viene ottimizzata prima del caricamento.';
    $('#photo-preview').innerHTML='Anteprima foto'; $('#photo-preview').classList.add('empty'); msg($('#photo-status'));
  }

  function editPhoto(i){
    const x=state.gallery.data.items[i]; if(!x) return;
    $('#photo-edit-index').value=i; $('#photo-category').value=x.category||'Idraulica';
    $('#photo-title').value=x.title||''; $('#photo-alt').value=x.alt||'';
    $('#photo-file').value=''; $('#photo-form-title').textContent='Modifica foto lavoro'; $('#photo-save-btn').textContent='Salva modifiche';
    $('#photo-cancel-btn').classList.remove('hidden'); $('#photo-file-hint').textContent='Facoltativa: scegli una nuova foto solo se vuoi sostituire quella attuale.';
    $('#photo-preview').classList.remove('empty'); $('#photo-preview').innerHTML=`<img src="${esc(photoThumb(x.image))}" alt="">`;
    $('#photo-form').scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function publishPhoto(ev){
    ev.preventDefault();
    const editRaw=$('#photo-edit-index').value, edit=editRaw===''?null:Number(editRaw);
    const cat=$('#photo-category').value, title=$('#photo-title').value.trim(), alt=$('#photo-alt').value.trim() || `${title} a Siracusa`;
    const file=$('#photo-file').files?.[0];
    if(!title){msg($('#photo-status'),'Inserisci il titolo del lavoro.','err');return}
    if(edit===null && !file){msg($('#photo-status'),'Seleziona una foto da pubblicare.','err');return}
    try{
      setBusy(true, edit===null?'Caricamento foto e aggiornamento sito…':'Salvataggio modifiche…');
      let current=await loadJson('data/gallery.json');
      let items=current.data.items||[];
      let imagePath = edit!==null ? items[edit]?.image : '';
      if(file){
        const blob=await optimizeImage(file);
        const name=`${slug(cat)}-${Date.now()}-${slug(title)}.jpg`;
        imagePath=`assets/uploads/lavori/${slug(cat)}/${name}`;
        await uploadBlob(imagePath,blob,`Aggiunge foto lavoro: ${title}`);
      }
      const item={title,category:cat,image:imagePath,alt,service_url:CATEGORY_URLS[cat]||'index.html#lavori',active:true,featured_home:true,updated_at:new Date().toISOString()};
      if(edit===null) items.unshift(item); else items[edit]={...items[edit],...item};
      current.data.items=items;
      await saveJson('data/gallery.json',current.data,current.sha, edit===null?`Pubblica lavoro: ${title}`:`Aggiorna lavoro: ${title}`);
      state.gallery=await loadJson('data/gallery.json'); renderPhotos(); resetPhotoForm();
      msg($('#photo-status'),'Foto pubblicata. Comparirà nella categoria scelta e in “Interventi realizzati”.','ok');
    }catch(e){msg($('#photo-status'),e.message,'err')}finally{setBusy(false)}
  }

  async function togglePhoto(i){
    try{
      setBusy(true,'Aggiornamento visibilità…');
      const current=await loadJson('data/gallery.json'); const x=current.data.items[i]; if(!x) throw new Error('Foto non trovata.');
      x.active = x.active===false ? true : false;
      await saveJson('data/gallery.json',current.data,current.sha,`${x.active?'Mostra':'Nasconde'} lavoro: ${x.title}`);
      state.gallery=await loadJson('data/gallery.json'); renderPhotos();
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  async function removePhoto(i){
    const x=state.gallery?.data?.items?.[i]; if(!x) return;
    if(!confirm(`Rimuovere "${x.title}" dalle gallerie del sito?\n\nIl file immagine resterà archiviato su GitHub per sicurezza.`)) return;
    try{
      setBusy(true,'Rimozione dalla galleria…');
      const current=await loadJson('data/gallery.json'); current.data.items.splice(i,1);
      await saveJson('data/gallery.json',current.data,current.sha,`Rimuove lavoro dalla galleria: ${x.title}`);
      state.gallery=await loadJson('data/gallery.json'); renderPhotos();
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  function renderPromotions(){
    if(!state.promotions) return;
    const items=(state.promotions.data.items||[]).map((x,i)=>({...x,_i:i}));
    $('#promo-list').innerHTML=items.length ? items.map(x=>`
      <article class="content-item">
        ${x.image?`<img src="${esc(photoThumb(x.image))}" alt="">`:'<div></div>'}
        <div class="content-meta">
          <b>${esc(x.title)}</b>
          <span class="badge ${x.active===false?'off':''}">${esc(x.badge||x.category||'PROMO')}</span>
          <small>${x.featured?'In evidenza in Home · ':''}${x.active===false?'Nascosta':'Visibile'}</small>
        </div>
        <div class="item-actions">
          <button class="btn ghost" data-promo-edit="${x._i}" type="button">Modifica</button>
          <button class="btn ghost" data-promo-toggle="${x._i}" type="button">${x.active===false?'Mostra':'Nascondi'}</button>
          <button class="btn danger" data-promo-remove="${x._i}" type="button">Rimuovi</button>
        </div>
      </article>`).join('') : '<div class="empty-list">Nessuna promozione pubblicata.</div>';
  }

  function resetPromoForm(){
    $('#promo-form').reset(); $('#promo-edit-index').value=''; $('#promo-badge').value='PROMO';
    $('#promo-form-title').textContent='Aggiungi promozione'; $('#promo-save-btn').textContent='Pubblica promozione';
    $('#promo-cancel-btn').classList.add('hidden'); $('#promo-preview').innerHTML='Anteprima immagine'; $('#promo-preview').classList.add('empty'); msg($('#promo-status'));
  }

  function editPromo(i){
    const x=state.promotions.data.items[i]; if(!x) return;
    $('#promo-edit-index').value=i; $('#promo-title').value=x.title||''; $('#promo-category').value=x.category||'';
    $('#promo-badge').value=x.badge||'PROMO'; $('#promo-description').value=x.description||'';
    $('#promo-bullets').value=(x.bullets||[]).join('\n'); $('#promo-service').value=x.service_url||'climatizzazione.html';
    $('#promo-button').value=x.button_label||''; $('#promo-whatsapp').value=x.whatsapp_text||''; $('#promo-featured').checked=!!x.featured;
    $('#promo-file').value=''; $('#promo-form-title').textContent='Modifica promozione'; $('#promo-save-btn').textContent='Salva modifiche';
    $('#promo-cancel-btn').classList.remove('hidden');
    if(x.image){$('#promo-preview').classList.remove('empty');$('#promo-preview').innerHTML=`<img src="${esc(photoThumb(x.image))}" alt="">`}
    $('#promo-form').scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function publishPromo(ev){
    ev.preventDefault();
    const editRaw=$('#promo-edit-index').value, edit=editRaw===''?null:Number(editRaw);
    const title=$('#promo-title').value.trim(), file=$('#promo-file').files?.[0];
    if(!title){msg($('#promo-status'),'Inserisci il titolo.','err');return}
    try{
      setBusy(true,edit===null?'Pubblicazione promozione…':'Salvataggio promozione…');
      const current=await loadJson('data/promotions.json'); const items=current.data.items||[];
      let imagePath=edit!==null?items[edit]?.image:'';
      if(file){
        const blob=await optimizeImage(file); const name=`promo-${Date.now()}-${slug(title)}.jpg`;
        imagePath=`assets/uploads/promozioni/${name}`; await uploadBlob(imagePath,blob,`Aggiunge immagine promozione: ${title}`);
      }
      const featured=$('#promo-featured').checked;
      if(featured) items.forEach(x=>x.featured=false);
      const item={
        title,
        category:$('#promo-category').value.trim(),
        badge:$('#promo-badge').value.trim()||'PROMO',
        description:$('#promo-description').value.trim(),
        bullets:$('#promo-bullets').value.split('\n').map(x=>x.trim()).filter(Boolean),
        image:imagePath,
        service_url:$('#promo-service').value,
        button_label:$('#promo-button').value.trim()||'Scopri il servizio',
        whatsapp_text:$('#promo-whatsapp').value.trim(),
        active:true,
        featured,
        updated_at:new Date().toISOString()
      };
      if(edit===null) items.unshift(item); else items[edit]={...items[edit],...item};
      current.data.items=items;
      await saveJson('data/promotions.json',current.data,current.sha,edit===null?`Pubblica promozione: ${title}`:`Aggiorna promozione: ${title}`);
      state.promotions=await loadJson('data/promotions.json'); renderPromotions(); resetPromoForm();
      msg($('#promo-status'),'Promozione pubblicata sul sito.','ok');
    }catch(e){msg($('#promo-status'),e.message,'err')}finally{setBusy(false)}
  }

  async function togglePromo(i){
    try{
      setBusy(true,'Aggiornamento promozione…');
      const current=await loadJson('data/promotions.json'); const x=current.data.items[i]; if(!x) throw new Error('Promozione non trovata.');
      x.active=x.active===false?true:false;
      await saveJson('data/promotions.json',current.data,current.sha,`${x.active?'Mostra':'Nasconde'} promozione: ${x.title}`);
      state.promotions=await loadJson('data/promotions.json'); renderPromotions();
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  async function removePromo(i){
    const x=state.promotions?.data?.items?.[i]; if(!x) return;
    if(!confirm(`Rimuovere la promozione "${x.title}" dal sito?`)) return;
    try{
      setBusy(true,'Rimozione promozione…');
      const current=await loadJson('data/promotions.json'); current.data.items.splice(i,1);
      await saveJson('data/promotions.json',current.data,current.sha,`Rimuove promozione: ${x.title}`);
      state.promotions=await loadJson('data/promotions.json'); renderPromotions();
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  // Login
  $('#connect-btn').addEventListener('click', async()=>{
    const token=$('#token-input').value.trim(); if(!token){msg($('#login-status'),'Incolla il token GitHub.','err');return}
    state.token=token; sessionStorage.setItem('gl_admin_token',token); setBusy(true,'Verifica accesso GitHub…');
    try{
      const login=await validateToken(); await refreshAll(); showDashboard(login); msg($('#login-status'));
    }catch(e){state.token='';sessionStorage.removeItem('gl_admin_token');msg($('#login-status'),e.message,'err')}finally{setBusy(false)}
  });
  $('#logout-btn').addEventListener('click',()=>{state.token='';sessionStorage.removeItem('gl_admin_token');$('#token-input').value='';showLogin()});

  // Tabs
  $$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.tab').forEach(x=>x.classList.toggle('active',x===btn));
    $$('.tab-panel').forEach(x=>x.classList.add('hidden'));
    $('#tab-'+btn.dataset.tab).classList.remove('hidden');
  }));

  // Forms/previews
  $('#photo-file').addEventListener('change',()=>previewFile($('#photo-file'),$('#photo-preview')));
  $('#promo-file').addEventListener('change',()=>previewFile($('#promo-file'),$('#promo-preview')));
  $('#photo-form').addEventListener('submit',publishPhoto);
  $('#promo-form').addEventListener('submit',publishPromo);
  $('#photo-cancel-btn').addEventListener('click',resetPhotoForm);
  $('#promo-cancel-btn').addEventListener('click',resetPromoForm);
  $('#photo-filter').addEventListener('change',renderPhotos);
  $('#photos-refresh').addEventListener('click',async()=>{setBusy(true,'Aggiornamento elenco…');try{state.gallery=await loadJson('data/gallery.json');renderPhotos()}catch(e){alert(e.message)}finally{setBusy(false)}});
  $('#promo-refresh').addEventListener('click',async()=>{setBusy(true,'Aggiornamento elenco…');try{state.promotions=await loadJson('data/promotions.json');renderPromotions()}catch(e){alert(e.message)}finally{setBusy(false)}});

  // Delegated list actions
  $('#photos-list').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.photoEdit!==undefined) editPhoto(Number(b.dataset.photoEdit));
    if(b.dataset.photoToggle!==undefined) togglePhoto(Number(b.dataset.photoToggle));
    if(b.dataset.photoRemove!==undefined) removePhoto(Number(b.dataset.photoRemove));
  });
  $('#promo-list').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.promoEdit!==undefined) editPromo(Number(b.dataset.promoEdit));
    if(b.dataset.promoToggle!==undefined) togglePromo(Number(b.dataset.promoToggle));
    if(b.dataset.promoRemove!==undefined) removePromo(Number(b.dataset.promoRemove));
  });

  // Auto-reconnect for the current browser session only.
  (async()=>{
    if(!state.token){showLogin();return}
    setBusy(true,'Ripristino sessione…');
    try{const login=await validateToken();await refreshAll();showDashboard(login)}
    catch{state.token='';sessionStorage.removeItem('gl_admin_token');showLogin()}
    finally{setBusy(false)}
  })();
})();
