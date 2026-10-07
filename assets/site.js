/* Navigazione, contenuti gestiti e gallerie. */
(() => {
 const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const wa=s=>'https://wa.me/393471327177?text='+encodeURIComponent(s||'Buongiorno, vorrei informazioni.');
 async function getJSON(path){try{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return await r.json();}catch(e){console.warn('Contenuto gestito non disponibile:',path,e);return null;}}

 async function renderManagedContent(){
  const galleryRail=document.querySelector('[data-managed-gallery]');
  if(galleryRail){
   const data=await getJSON('data/gallery.json');
   const allItems=(data?.items||[]).filter(x=>x.active!==false);
   const featured=allItems.filter(x=>x.featured_home===true);
   const items=featured.length?featured:allItems.slice(0,12);
   if(items.length){galleryRail.innerHTML=items.map(x=>`<figure class="work-slide"><img loading="lazy" src="${esc(x.image)}" alt="${esc(x.alt||x.title)}" decoding="async" width="1000" height="750"><figcaption><span class="work-category">${esc(x.category||'Lavoro')}</span>${esc(x.title)}<a class="photo-link" href="${esc(x.service_url||'#servizi')}">Scopri il servizio →</a></figcaption></figure>`).join('');}
  }
  const promoGrid=document.querySelector('[data-managed-promotions]');
  const homeFeatured=document.querySelector('[data-managed-featured-promo]');
  if(promoGrid||homeFeatured){
   const data=await getJSON('data/promotions.json');
   const items=(data?.items||[]).filter(x=>x.active!==false);
   if(promoGrid&&items.length){promoGrid.innerHTML=items.map(x=>`<article class="promo-card">${x.image?`<div class="managed-promo-image"><img loading="lazy" src="${esc(x.image)}" alt="${esc(x.title)}"></div>`:''}<span class="promo-badge">${esc(x.badge||x.category||'PROMO')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p>${x.bullets?.length?`<ul>${x.bullets.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}<div class="managed-promo-actions">${x.whatsapp_text?`<a class="primary inline" href="${wa(x.whatsapp_text)}" rel="noopener">Verifica disponibilità</a>`:''}${x.service_url?`<a class="text-link" href="${esc(x.service_url)}">${esc(x.button_label||'Scopri il servizio')} →</a>`:''}</div></article>`).join('');}
   if(homeFeatured&&items.length){
    const x=items.find(i=>i.featured)||items[0];
    homeFeatured.innerHTML=`<span class="promo-badge">${esc(x.badge||'PROMO')}</span><small>${esc(x.category||'OFFERTA')}</small><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><b>Vai alle promozioni →</b>`;
   }
  }
 }

 function setupUI(){
  const header=document.querySelector('header'), toggle=document.querySelector('.menu'), nav=document.querySelector('#main-nav');
  const service=document.querySelector('.nav-services'), serviceToggle=document.querySelector('.services-toggle');
  const setServices=open=>{if(!service)return;service.classList.toggle('expanded',open);serviceToggle?.setAttribute('aria-expanded',String(open));};
  const setMenu=(open,focus=false)=>{if(!toggle||!header)return;header.classList.toggle('open',open);document.body.classList.toggle('menu-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Chiudi menu':'Apri menu');toggle.textContent=open?'×':'☰';if(!open)setServices(false);if(focus)toggle.focus();};
  toggle?.addEventListener('click',()=>setMenu(!header.classList.contains('open')));
  serviceToggle?.addEventListener('click',()=>setServices(!service.classList.contains('expanded')));
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('click',e=>{if(service&&!service.contains(e.target))setServices(false);if(header&&!header.contains(e.target))setMenu(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(header?.classList.contains('open'))setMenu(false,true);else if(service?.classList.contains('expanded')){setServices(false);serviceToggle?.focus();}}});
  window.matchMedia('(min-width:1101px)').addEventListener('change',e=>{if(e.matches)setMenu(false);});
  const year=document.getElementById('year');if(year)year.textContent=new Date().getFullYear();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.work-carousel-section').forEach(section=>{
   const rail=section.querySelector('.work-carousel'),prev=section.querySelector('.carousel-prev'),next=section.querySelector('.carousel-next');if(!rail||!prev||!next)return;
   const slides=[...rail.querySelectorAll('.work-slide')];if(!slides.length)return;
   section.querySelector('.gallery-status')?.remove();
   const status=document.createElement('p');status.className='gallery-status';status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');rail.after(status);
   const step=()=>slides[0].getBoundingClientRect().width+(parseFloat(getComputedStyle(rail).columnGap)||0);
   const update=()=>{prev.disabled=rail.scrollLeft<3;next.disabled=rail.scrollLeft>=rail.scrollWidth-rail.clientWidth-3;let start=Math.min(slides.length,Math.round(rail.scrollLeft/step())+1);status.textContent=`Foto ${start}–${Math.min(slides.length,start+Math.max(1,Math.floor((rail.clientWidth+(parseFloat(getComputedStyle(rail).columnGap)||0))/step()))-1)} di ${slides.length}`;};
   const move=direction=>rail.scrollBy({left:direction*step(),behavior:reduced.matches?'auto':'smooth'});
   prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
   rail.addEventListener('keydown',e=>{if(e.target!==rail)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}if(e.key==='Home'||e.key==='End'){e.preventDefault();rail.scrollTo({left:e.key==='Home'?0:rail.scrollWidth,behavior:reduced.matches?'auto':'smooth'});}});
   rail.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});new ResizeObserver(update).observe(rail);update();
  });
 }
 renderManagedContent().finally(setupUI);
})();

// v16: stato apertura in base agli orari Google (Europe/Rome)
(function(){
  const el=document.getElementById('hours-status');
  if(!el)return;
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
    const get=t=>parts.find(p=>p.type===t)?.value;
    const wd=get('weekday');
    const h=Number(get('hour')); const m=Number(get('minute'));
    const mins=h*60+m;
    const isSunday=wd==='Sun';
    const isSaturday=wd==='Sat';
    const closesAt=isSaturday?840:1140; // sab 14:00, lun-ven 19:00
    const open=!isSunday && mins>=480 && mins<closesAt;
    el.classList.remove('is-open','is-closed');
    el.classList.add(open?'is-open':'is-closed');
    if(open){
      el.querySelector('strong').textContent=`Aperto ora · chiude alle ${isSaturday?'14:00':'19:00'}`;
    }else if(isSunday){
      el.querySelector('strong').textContent='Chiuso oggi';
    }else if(mins<480){
      el.querySelector('strong').textContent='Chiuso ora · apre alle 08:00';
    }else{
      el.querySelector('strong').textContent='Chiuso ora';
    }
  }catch(e){ el.querySelector('strong').textContent='Lun–Ven 08:00–19:00 · Sab 08:00–14:00'; }
})();
