// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — app.js
// Three views (poster / list / stats), a figure detail screen, and the
// collection store. No framework, no build step.
// APP_VERSION must match VERSION in sw.js — the SW cache name drives the
// update prompt, so they are bumped together every release.
// ════════════════════════════════════════════════════════════════════
const APP_VERSION='3.0';
const REPO='shkankin/muscle-images';
const RAW='https://raw.githubusercontent.com/'+REPO+'/main';
const IMG=RAW+'/images';
const TOTAL=236;
const COLL_KEY='muscle-collection';

const COLORS=[
  {k:'Flesh',hex:'#E5A594',s:'f'},{k:'Dark Blue',hex:'#31508C',s:'db'},
  {k:'Light Blue',hex:'#6FA9C9',s:'lb'},{k:'Red',hex:'#C6413A',s:'r'},
  {k:'Green',hex:'#5E9E62',s:'g'},{k:'Neon Orange',hex:'#F2571E',s:'o'},
  {k:'Salmon',hex:'#DD8A78',s:'s'},{k:'Purple',hex:'#7C5AA6',s:'p'},
  {k:'Magenta',hex:'#B54A83',s:'m'}
];
const HEX={},SUF={};
COLORS.forEach(function(c){HEX[c.k]=c.hex;SUF[c.k]=c.s;});
const CLS_HEX={A:'#FFD700',B:'#06B0FE',C:'#B9C4D6'};
const RANK={C:0,B:1,A:2};

const $=function(id){return document.getElementById(id);};
const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.95 6.1 6.65.92-4.85 4.63 1.2 6.6L12 17.5 6.05 20.65l1.2-6.6L2.4 9.42l6.65-.92z"/></svg>';

let figs=[],coll={},activeFig=null,detailColor='Flesh',detailTab='own',view='poster';
let filters={own:'all',color:'',cls:''};

function loadColl(){try{coll=JSON.parse(localStorage.getItem(COLL_KEY)||'{}')||{};}catch(e){coll={};}}
function saveColl(){try{localStorage.setItem(COLL_KEY,JSON.stringify(coll));}catch(e){}}
function entry(id){
  if(!coll[id]) coll[id]={owned:false,colors:[],want:false,want_colors:[],notes:'',ts:0};
  if(!Array.isArray(coll[id].colors)) coll[id].colors=[];
  if(!Array.isArray(coll[id].want_colors)) coll[id].want_colors=[];
  return coll[id];
}
function ownedColors(id){return (coll[id]&&Array.isArray(coll[id].colors))?coll[id].colors:[];}
function wantColors(id){return (coll[id]&&Array.isArray(coll[id].want_colors))?coll[id].want_colors:[];}
// Owning ANY color ticks the star, so the poster and the detail screen agree.
function isOwned(id){return ownedColors(id).length>0;}
function isWanted(id){return wantColors(id).length>0;}

function toggleOwnColor(id,color){
  const e=entry(id),i=e.colors.indexOf(color);
  if(i>=0){e.colors.splice(i,1);}
  else{
    e.colors.push(color);
    const w=e.want_colors.indexOf(color);
    if(w>=0) e.want_colors.splice(w,1);   // getting one you hunted clears it
  }
  e.owned=e.colors.length>0;e.ts=Date.now();saveColl();
}
function toggleWantColor(id,color){
  const e=entry(id),i=e.want_colors.indexOf(color);
  if(i>=0) e.want_colors.splice(i,1); else e.want_colors.push(color);
  e.want=e.want_colors.length>0;e.ts=Date.now();saveColl();
}
// Poster tap adds/removes flesh only, leaving other colors intact.
function togglePosterOwn(id){toggleOwnColor(id,'Flesh');}

function topClass(f){
  let best=null,vals=Object.values(f.cls||{});
  for(let i=0;i<vals.length;i++){const v=vals[i];
    if(!(v in RANK))continue; if(best===null||RANK[v]>RANK[best]) best=v;}
  return best;
}

async function loadFigs(){
  try{
    const r=await fetch(RAW+'/figures.json',{cache:'no-cache'});
    if(!r.ok) throw new Error('http');
    const rows=await r.json();
    figs=rows.map(function(f){return{
      id:f.id||String(f.num).padStart(3,'0'),
      num:f.num!=null?Number(f.num):Number(f.id),
      name:f.name||'',aka:f.aka||'',jp:f.jp||'',origin:f.origin||'',notes:f.notes||'',
      rarity:f.rarity||'common',
      colors:(Array.isArray(f.colors)&&f.colors.length)?f.colors:['Flesh'],
      cls:(f.cls&&typeof f.cls==='object')?f.cls:{}};
    }).sort(function(a,b){return a.num-b.num;});
  }catch(e){
    figs=[];
    for(let i=1;i<=TOTAL;i++) figs.push({id:String(i).padStart(3,'0'),num:i,name:'',aka:'',jp:'',
      origin:'',notes:'',rarity:'common',colors:['Flesh'],cls:{}});
  }
}
function dispName(f){return f.aka||f.name||('Figure '+f.num);}
function subName(f){return (f.aka&&f.name)?f.name:'';}

function cell(f){
  const owned=isOwned(f.id),k=topClass(f);
  return '<button class="cell '+(owned?'owned':'')+'" data-cell="'+esc(f.id)+'" aria-pressed="'+owned+'"'
    +' aria-label="No. '+f.num+' '+esc(dispName(f))+(owned?', collected':'')+'">'
    +'<span class="fig"><img src="'+IMG+'/MUSCLEFigure'+f.id+'f_poster.png" alt="" loading="lazy" decoding="async"'
    +' data-alt="'+IMG+'/MUSCLEFigure'+f.id+'ft.jpg"'
    +' data-fallback="chain"></span>'
    +(k?'<span class="cls '+k.toLowerCase()+'">'+k+'</span>':'')
    +'<span class="num">'+f.num+'</span><span class="star">'+STAR+'</span></button>';
}
function renderPoster(){$('grid').innerHTML=figs.map(cell).join('');renderProgress();}
function renderProgress(){
  const n=figs.filter(function(f){return isOwned(f.id);}).length;
  $('pCount').textContent=n;
  $('pBar').style.width=(n/TOTAL*100).toFixed(1)+'%';
  $('pText').textContent='of '+TOTAL+' \u00b7 '+(TOTAL-n)+' to find';
}

function visible(){
  const q=($('search').value||'').trim().toLowerCase();
  return figs.filter(function(f){
    if(q&&!(String(f.num).indexOf(q)>=0||f.name.toLowerCase().indexOf(q)>=0||f.aka.toLowerCase().indexOf(q)>=0)) return false;
    if(filters.own==='owned'&&!isOwned(f.id)) return false;
    if(filters.own==='missing'&&isOwned(f.id)) return false;
    if(filters.own==='want'&&!isWanted(f.id)) return false;
    if(filters.color&&f.colors.indexOf(filters.color)<0) return false;
    if(filters.cls&&Object.values(f.cls||{}).indexOf(filters.cls)<0) return false;
    return true;
  });
}
function activeFilterCount(){return (filters.own!=='all'?1:0)+(filters.color?1:0)+(filters.cls?1:0);}

function listRow(f){
  const owned=isOwned(f.id),mine=ownedColors(f.id);
  const dots=f.colors.map(function(c){
    return '<i class="'+(mine.indexOf(c)>=0?'have':'')+'" style="background:'+(HEX[c]||'#888')+'" title="'+esc(c)+'"></i>';
  }).join('');
  // The dot grid reserves one column per color, up to 4 (it wraps to a second
  // row beyond that). It used to declare 4 columns unconditionally, so the 75
  // single-color figures reserved 60px to show one dot — 48px of dead space
  // taken straight out of the name.
  const cols=Math.min(4,Math.max(1,f.colors.length));
  return '<button class="lrow '+(owned?'owned':'')+'" data-row="'+esc(f.id)+'">'
    +'<span class="lnum">'+f.num+'</span>'
    +'<span class="lthumb"><img src="'+IMG+'/MUSCLEFigure'+f.id+'ft.jpg" alt="" loading="lazy" decoding="async" data-fallback="hide"></span>'
    +'<span class="lmain"><span class="lname">'+((f.name||f.aka)?esc(dispName(f)):'<span class="dim">unnamed</span>')+'</span>'
    +(f.jp?'<span class="ljp" lang="ja">'+esc(f.jp)+'</span>':'')+'</span>'
    +'<span class="ldots" style="--dot-cols:'+cols+'">'+dots+'</span></button>';
}
function renderList(){
  const rows=visible(),n=activeFilterCount(),fb=$('filterBtn');
  fb.classList.toggle('on',n>0);
  fb.innerHTML='Filters'+(n?' <span class="badge">'+n+'</span>':'');
  $('listCount').textContent=rows.length+' of '+TOTAL+(n?' (filtered)':'');
  $('rows').innerHTML=rows.length?rows.map(listRow).join(''):'<div class="empty">No matches.</div>';
}

function renderStats(){
  const owned=figs.filter(function(f){return isOwned(f.id);});
  const pct=(owned.length/TOTAL*100).toFixed(1);
  let variants=0;
  figs.forEach(function(f){variants+=ownedColors(f.id).length;});
  const wanted=figs.filter(function(f){return isWanted(f.id);}).length;
  const perColor=COLORS.map(function(c){
    const made=figs.filter(function(f){return f.colors.indexOf(c.k)>=0;}).length;
    const have=figs.filter(function(f){return ownedColors(f.id).indexOf(c.k)>=0;}).length;
    return {k:c.k,hex:c.hex,made:made,have:have};
  });
  function clsRow(L){
    const made=figs.filter(function(f){return Object.values(f.cls||{}).indexOf(L)>=0;}).length;
    const have=figs.filter(function(f){
      const mine=ownedColors(f.id);
      return Object.keys(f.cls||{}).some(function(c){return f.cls[c]===L&&mine.indexOf(c)>=0;});
    }).length;
    return {L:L,made:made,have:have};
  }
  // Targets #statsBody, NOT #v-stats — the ring hero above it is static markup
  // in index.html and would be wiped by a re-render.
  // No "Completion" heading here: the hero already titles the page, and the
  // completion card is what overlaps the artwork, so it has to come first.
  $('statsBody').innerHTML=
    '<div class="bigstat"><div class="pct">'+pct+'%</div>'
    +'<div class="sub">'+owned.length+' of '+TOTAL+' sculpts \u00b7 '+(TOTAL-owned.length)+' to find</div>'
    +'<div class="meter"><i style="width:'+pct+'%"></i></div></div>'
    +'<div class="sec">Collection</div><div class="cards">'
    +'<div class="card"><b>'+owned.length+'</b><span>SCULPTS</span></div>'
    +'<div class="card"><b>'+variants+'</b><span>COLOR COPIES</span></div>'
    +'<div class="card"><b>'+wanted+'</b><span>ON WANT LIST</span></div></div>'
    +'<div class="sec">By color</div>'
    +perColor.map(function(c){return '<div class="cbar"><span class="dot" style="background:'+c.hex+'"></span>'
      +'<span class="nm">'+esc(c.k)+'</span><span class="tr"><i style="width:'
      +(c.made?(c.have/c.made*100).toFixed(1):0)+'%;background:'+c.hex+'"></i></span>'
      +'<span class="vl">'+c.have+'/'+c.made+'</span></div>';}).join('')
    +'<div class="sec">By class</div>'
    +['A','B','C'].map(function(L){const r=clsRow(L);
      return '<div class="cbar"><span class="dot" style="background:'+CLS_HEX[L]+'"></span>'
      +'<span class="nm">Class '+L+'</span><span class="tr"><i style="width:'
      +(r.made?(r.have/r.made*100).toFixed(1):0)+'%;background:'+CLS_HEX[L]+'"></i></span>'
      +'<span class="vl">'+r.have+'/'+r.made+'</span></div>';}).join('')
    +'<div class="sec">Catalog</div><div class="cards">'
    +'<div class="card"><b>'+figs.filter(function(f){return f.name||f.aka;}).length+'</b><span>NAMED</span></div>'
    +'<div class="card"><b>'+figs.filter(function(f){return f.jp;}).length+'</b><span>JAPANESE</span></div>'
    +'<div class="card"><b>'+figs.filter(function(f){return Object.keys(f.cls||{}).length;}).length+'</b><span>CLASSED</span></div></div>';
}

function shotsFor(f){
  const out=[{k:'group',label:'Group',url:IMG+'/MUSCLEFigure'+f.id+'t.jpg'}];
  const seen={};
  const all=['Flesh'].concat(f.colors);
  for(let i=0;i<all.length;i++){
    const c=all[i];
    if(seen[c]||!SUF[c]) continue;
    seen[c]=1;
    out.push({k:c,label:c,url:IMG+'/MUSCLEFigure'+f.id+SUF[c]+'t.jpg'});
    // The flesh BACK shot sits right beside the flesh front — they are a pair,
    // and it's the only reverse view that exists for most figures.
    if(c==='Flesh') out.push({k:'back',label:'Flesh \u2014 back',url:IMG+'/MUSCLEFigure'+f.id+'fbt.jpg'});
  }
  return out;
}
// Overlay scroll lock. Pinning the body with position:fixed is the only
// approach that reliably stops scroll chaining on iOS Safari and Android
// Chrome both; the saved offset makes the restore exact rather than
// approximate, which is what the old rAF-and-hope restore was doing.
// Programmatic jumps must not inherit the page's smooth scrolling — the
// restore-on-close would otherwise sail down from the top every time.
//
// Flipping the inline scroll-behavior is NOT enough on its own: the property
// is read when the scroll is initiated, and an inline style change hasn't been
// recalculated yet at that point, so scrollTo saw the stale 'smooth' and
// animated anyway. That silently defeated every jump in the app — most
// visibly, switching poster -> list glided up from wherever you were. The
// behavior argument is honoured immediately, so it does the real work; the
// inline flip stays as the fallback path for engines that reject the argument.
function jumpTo(y){
  const r=document.documentElement, prev=r.style.scrollBehavior;
  r.style.scrollBehavior='auto';
  try{ window.scrollTo({top:y,left:0,behavior:'instant'}); }
  catch(e){ window.scrollTo(0,y); }
  requestAnimationFrame(function(){ r.style.scrollBehavior=prev; });
}
// Same story for scrollIntoView — it takes the same argument.
function jumpIntoView(el,opts){
  const o={};
  for(const k in opts) o[k]=opts[k];
  const r=document.documentElement, prev=r.style.scrollBehavior;
  r.style.scrollBehavior='auto';
  o.behavior='instant';
  try{ el.scrollIntoView(o); }
  catch(e){ delete o.behavior; el.scrollIntoView(o); }
  requestAnimationFrame(function(){ r.style.scrollBehavior=prev; });
}

let lockY=0, lockDepth=0;
function lockScroll(){
  if(lockDepth++) return;
  lockY=window.scrollY||document.documentElement.scrollTop||0;
  const b=document.body;
  b.style.position='fixed'; b.style.top=(-lockY)+'px';
  b.style.left='0'; b.style.right='0'; b.style.width='100%';
  b.classList.add('locked');
}
function unlockScroll(){
  if(lockDepth===0) return;
  if(--lockDepth) return;
  const b=document.body;
  b.style.position=''; b.style.top=''; b.style.left='';
  b.style.right=''; b.style.width='';
  b.classList.remove('locked');
  jumpTo(lockY);
}

// The figure you were last looking at, so the list can point it out when you
// come back — after swiping through a few, you land somewhere you never
// scrolled to, and finding your place again is otherwise guesswork.
let lastSeenId=null;

function openDetail(id){
  activeFig=null;
  for(let i=0;i<figs.length;i++) if(figs[i].id===id) activeFig=figs[i];
  if(!activeFig) return;
  lockScroll();
  // detailTab persists on purpose. It is a working mode ("I'm marking wants
  // right now"), and silently snapping it back to OWN meant a tap intended
  // as a want was recorded as ownership.
  detailColor='Flesh';
  history.pushState({detail:id},'');
  renderDetail();
}
function closeDetail(){
  lastSeenId=activeFig?activeFig.id:null;
  activeFig=null;
  const d=$('detail'); if(d) d.remove();
  unlockScroll();
  renderCurrent();
  revealLastSeen();
}

// Mark the row you just came from and, if it's off-screen (because you swiped
// to a different figure), bring it into view.
function revealLastSeen(){
  if(!lastSeenId||view!=='list') return;
  const row=document.querySelector('.lrow[data-row="'+lastSeenId+'"]');
  if(!row) return;
  row.classList.add('just-seen');
  const r=row.getBoundingClientRect();
  const pad=90;
  if(r.top<pad||r.bottom>window.innerHeight-pad){
    jumpIntoView(row,{block:'center'});
  }
  setTimeout(function(){ row.classList.remove('just-seen'); },2600);
}

// Step to the next/previous figure. Follows the list you came from, so a
// filtered or searched list steps within those results rather than jumping
// to figures you've filtered out.
function stepFigure(dir){
  if(!activeFig) return;
  let pool=(view==='list')?visible():figs;
  if(!pool.length) pool=figs;
  let i=-1;
  for(let n=0;n<pool.length;n++) if(pool[n].id===activeFig.id) i=n;
  if(i<0){ pool=figs; for(let n=0;n<pool.length;n++) if(pool[n].id===activeFig.id) i=n; }
  const j=i+dir;
  if(j<0||j>=pool.length) return;
  activeFig=pool[j];
  detailColor='Flesh';   // the tab is deliberately NOT reset — see openDetail
  history.replaceState({detail:activeFig.id},'');
  renderDetail();
  const d=$('detail'); if(d) d.scrollTop=0;
}
// ── the parts of the detail screen that change without changing figure ──
// Switching tab, logging a color and picking a shot all repaint these. They
// live in their own builders so renderDetail() (full build) and syncDetail()
// (in-place repaint) can never drift apart.
function chipsHTML(f){
  const mine=ownedColors(f.id),want=wantColors(f.id);
  const list=detailTab==='own'?mine:want;
  return f.colors.map(function(c){
    const on=list.indexOf(c)>=0;
    const alsoOwned=detailTab==='want'&&mine.indexOf(c)>=0;
    const k=(f.cls||{})[c];
    return '<button class="chip '+(on?'on':'')+' '+(alsoOwned?'dim':'')+'" data-chip="'+esc(c)+'">'
      +'<i style="background:'+(HEX[c]||'#888')+'"></i>'+esc(c)
      +(k?'<span class="k" style="background:'+CLS_HEX[k]+'">'+k+'</span>':'')
      +(alsoOwned?'<span style="font-size:11px">\u2713 owned</span>':'')+'</button>';
  }).join('');
}
function hintText(){
  return detailTab==='own'
    ?'Tap each color you own. Owning any color fills the poster star.'
    :'Tap the colors you are still hunting.';
}
function tabLabel(which,f){
  const n=(which==='own'?ownedColors(f.id):wantColors(f.id)).length;
  return (which==='own'?'OWN':'WANT')+(n?' ('+n+')':'');
}
function activeShot(f){
  const shots=shotsFor(f);
  let a=shots[0];
  for(let i=0;i<shots.length;i++) if(shots[i].k===detailColor) a=shots[i];
  return a;
}

// Repaint the tab, the chips and the hero WITHOUT rebuilding the overlay.
// Rebuilding drops #detail and re-inserts it, which resets its scrollTop —
// so switching to WANT, or logging a colour from halfway down the screen,
// threw you back to the top. The scroll position is the user's place in the
// screen and nothing they didn't ask for should move it.
function syncDetail(){
  const f=activeFig,d=$('detail');
  if(!f||!d) return;
  const shot=activeShot(f);
  const img=d.querySelector('.hero img');
  if(img&&img.getAttribute('src')!==shot.url){
    // A previous shot may have 404'd and been hidden by the fallback
    // listener; clear that state or the slot stays blank for a good image.
    img.dataset.upper=''; delete img.dataset.tried; img.style.display='';
    img.setAttribute('src',shot.url); img.alt=dispName(f);
  }
  const hn=d.querySelector('.heroname'); if(hn) hn.textContent=shot.label;
  const fb=d.querySelectorAll('.film button');
  for(let i=0;i<fb.length;i++) fb[i].classList.toggle('on',fb[i].dataset.shot===detailColor);
  ['own','want'].forEach(function(t){
    const b=d.querySelector('[data-dtab="'+t+'"]');
    if(!b) return;
    b.classList.toggle('on',detailTab===t);
    b.textContent=tabLabel(t,f);
  });
  const cw=d.querySelector('.chips');
  if(cw){cw.className='chips '+(detailTab==='want'?'want-mode':'');cw.innerHTML=chipsHTML(f);}
  const h=d.querySelector('.hint'); if(h) h.textContent=hintText();
}

function renderDetail(){
  const f=activeFig; if(!f) return;
  const shots=shotsFor(f);
  const chips=chipsHTML(f);
  const active=activeShot(f);
  const html='<div class="detail" id="detail"><div class="dtop">'
    +'<button class="back" id="dback" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>'
    +'<div class="dtitle"><b>'+esc(dispName(f))+'</b><span>No. '+f.num
    +((f.rarity&&f.rarity!=='common')?' \u00b7 '+esc(f.rarity):'')+'</span></div></div>'
    +'<div class="dbody"><div class="hero">'
    +'<img src="'+esc(active.url)+'" alt="'+esc(dispName(f))+'" data-fallback="hide">'
    +'<span class="heroname">'+esc(active.label)+'</span></div>'
    +'<div class="film">'+shots.map(function(s){
      return '<button class="'+(s.k===detailColor?'on':'')+'" data-shot="'+esc(s.k)+'">'
        +'<img src="'+esc(s.url)+'" alt="'+esc(s.label)+'" loading="lazy" data-fallback="dim"></button>';
    }).join('')+'</div>'
    // The original name and the kana line are ALWAYS emitted, empty or not.
    // Only 114 of 236 figures carry a Japanese name and 24 a US release name,
    // so letting those lines appear and disappear moved the OWN/WANT buttons
    // up and down on every swipe. The slots are reserved in CSS instead and
    // fill in as the catalog does.
    +'<div class="dmeta">'
    +'<div class="orig">'+esc(subName(f))+'</div>'
    +'<div class="kana" lang="ja">'+esc(f.jp)+'</div>'
    +(f.origin?'<div class="note">'+esc(f.origin)+'</div>':'')
    +(f.notes?'<div class="note">'+esc(f.notes)+'</div>':'')
    +'</div><div class="tabs">'
    +'<button class="'+(detailTab==='own'?'on':'')+'" data-dtab="own">'+tabLabel('own',f)+'</button>'
    +'<button class="want '+(detailTab==='want'?'on':'')+'" data-dtab="want">'+tabLabel('want',f)+'</button>'
    +'</div><div class="chips '+(detailTab==='want'?'want-mode':'')+'">'+chips+'</div>'
    +'<div class="hint">'+hintText()+'</div></div></div>';
  const old=$('detail'); if(old) old.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function closeSheet(){
  const s=$('scrim');if(s)s.remove();
  const p=$('sheetp');if(p)p.remove();
  unlockScroll();
}
function openFilters(){
  lockScroll();
  function seg(name,val,label){
    return '<button class="chip '+(filters[name]===val?'on':'')+'" data-f="'+name+'" data-v="'+esc(val)+'">'+esc(label)+'</button>';
  }
  document.body.insertAdjacentHTML('beforeend','<div class="scrim" id="scrim"></div>'
    +'<div class="sheet-p" id="sheetp"><div class="grab"></div><div class="sh-h">Filters</div>'
    +'<div class="fld">Ownership</div><div class="chips">'
    +seg('own','all','All')+seg('own','owned','Owned')+seg('own','missing','Missing')+seg('own','want','Want list')+'</div>'
    +'<div class="fld">Made in color</div><div class="chips">'+seg('color','','Any')
    +COLORS.map(function(c){return '<button class="chip '+(filters.color===c.k?'on':'')+'" data-f="color" data-v="'+esc(c.k)+'">'
      +'<i style="background:'+c.hex+'"></i>'+esc(c.k)+'</button>';}).join('')+'</div>'
    +'<div class="fld">Class</div><div class="chips">'+seg('cls','','Any')
    +['A','B','C'].map(function(L){return '<button class="chip '+(filters.cls===L?'on':'')+'" data-f="cls" data-v="'+L+'">'
      +'<span class="k" style="background:'+CLS_HEX[L]+'">'+L+'</span>Class '+L+'</button>';}).join('')+'</div>'
    +'<button class="btn" id="clearF" style="margin-top:18px">Clear all filters</button>'
    +'<button class="btn gold" id="doneF">Done</button></div>');
}
function openSettings(){
  lockScroll();
  document.body.insertAdjacentHTML('beforeend','<div class="scrim" id="scrim"></div>'
    +'<div class="sheet-p" id="sheetp"><div class="grab"></div><div class="sh-h">Settings</div>'
    +'<div class="fld">Your collection</div>'
    +'<button class="btn" id="expBtn">Export collection</button>'
    +'<button class="btn" id="impBtn">Import collection</button>'
    +'<input type="file" id="impFile" accept="application/json" hidden>'
    +'<div class="fld">Catalog</div><button class="btn" id="reloadBtn">Reload catalog</button>'
    +'<div class="fld">Support</div>'
    +'<a class="btn coffee" href="https://buymeacoffee.com/btring" target="_blank" rel="noopener noreferrer">'
    +'Buy me a coffee</a>'
    +'<div class="fld">About</div><div style="font-size:13px;color:var(--ink-3);line-height:1.5">'
    +'All 236 figures of the first-generation M.U.S.C.L.E. line. '
    +'A free, non-commercial fan project. Catalog data from community sources.'
    +'<br><span style="opacity:.7">Version '+APP_VERSION+'</span></div>'
    +'<button class="btn gold" id="doneS" style="margin-top:16px">Done</button></div>');
}
function toast(msg){
  const t=$('toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('on');},1800);
}

function renderBursts(){
  if(!document.body.classList.contains('v-poster')){
    $('bursts').innerHTML='';
    $('bursts').style.height='';
    $('field').style.height='';   // else the tall poster field pads the page
    return;
  }
  const h=document.body.scrollHeight||3000,W=window.innerWidth||430;
  const out=[],imgs=['red_star.png','green_star.png'];
  const heroSize=Math.round(W*1.45);
  // NOT class "hero" — that is the detail screen's image frame, and this layer
  // would inherit its black background, cream border, 1:1 aspect-ratio and
  // position:relative, painting a rotated dark square across the poster field.
  out.push('<div class="burst burst-hero" style="top:'+Math.round(h*0.62)+'px;left:'+Math.round(-heroSize*0.05)
    +'px;width:'+heroSize+'px;opacity:.5;transform:rotate(-12deg)"><img src="'+IMG+'/red_star.png" alt=""></div>');
  let y=620,i=0;
  while(y<h-200){
    if(Math.abs(y-h*0.62)>=heroSize*0.42){
      const size=190+((i*67)%220),off=-(size*(0.05+((i*31)%6)/100));
      out.push('<div class="burst" style="top:'+Math.round(y)+'px;'+(i%2===0?'left':'right')+':'+Math.round(off)
        +'px;width:'+size+'px;opacity:'+(0.38+((i*13)%22)/100).toFixed(2)
        +';transform:rotate('+(((i*47)%60)-30)+'deg)"><img src="'+IMG+'/'+imgs[i%2]+'" alt=""></div>');
    }
    y+=420+((i*97)%320);i++;
  }
  $('bursts').innerHTML=out.join('');
  $('bursts').style.height=h+'px';
  $('field').style.height=h+'px';
}

function setView(v,skipStore){
  view=v;
  document.body.className='v-'+v;
  ['poster','list','stats'].forEach(function(k){$('v-'+k).classList.toggle('on',k===v);});
  const kids=$('nav').children;
  for(let i=0;i<kids.length;i++) kids[i].classList.toggle('on',kids[i].dataset.view===v);
  if(v==='list') renderList();
  if(v==='stats') renderStats();
  if(v==='poster'){renderPoster();requestAnimationFrame(function(){setTimeout(renderBursts,50);});}
  else renderBursts();   // clears the burst layer AND the stretched field
  jumpTo(0);
}
function renderCurrent(){
  if(view==='poster'){renderPoster();renderBursts();}
  else if(view==='list') renderList();
  else renderStats();
}

document.addEventListener('click',function(e){
  const nav=e.target.closest('#nav button');
  if(nav){setView(nav.dataset.view);return;}

  const c=e.target.closest('[data-cell]');
  if(c){
    togglePosterOwn(c.dataset.cell);
    const on=isOwned(c.dataset.cell);
    c.classList.toggle('owned',on);c.setAttribute('aria-pressed',String(on));
    renderProgress();
    try{if(navigator.vibrate)navigator.vibrate(8);}catch(err){}
    return;
  }
  const r=e.target.closest('[data-row]');
  if(r){openDetail(r.dataset.row);return;}

  if(e.target.closest('#dback')){history.back();return;}
  // These three repaint in place — a full renderDetail() would reset the
  // overlay's scrollTop and bounce you to the top of the screen mid-task.
  const dt=e.target.closest('[data-dtab]');
  if(dt){detailTab=dt.dataset.dtab;syncDetail();return;}
  const sh=e.target.closest('[data-shot]');
  if(sh){detailColor=sh.dataset.shot;syncDetail();return;}
  const ch=e.target.closest('[data-chip]');
  if(ch&&activeFig){
    const col=ch.dataset.chip;
    if(detailTab==='own') toggleOwnColor(activeFig.id,col); else toggleWantColor(activeFig.id,col);
    syncDetail();return;
  }

  if(e.target.closest('#filterBtn')){openFilters();return;}
  if(e.target.closest('#gear')){openSettings();return;}
  const fx=e.target.closest('[data-f]');
  if(fx){filters[fx.dataset.f]=fx.dataset.v;closeSheet();openFilters();renderList();return;}
  
  if(e.target.closest('#clearF')){filters={own:'all',color:'',cls:''};closeSheet();renderList();return;}
  if(e.target.closest('#doneF')||e.target.closest('#doneS')||e.target.id==='scrim'){closeSheet();return;}

  if(e.target.closest('#expBtn')){
    const blob=new Blob([JSON.stringify(coll,null,1)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='muscle-collection-'+new Date().toISOString().slice(0,10)+'.json';a.click();
    toast('Collection exported');return;
  }
  if(e.target.closest('#impBtn')){$('impFile').click();return;}
  if(e.target.closest('#reloadBtn')){location.reload();return;}
});

document.addEventListener('change',async function(e){
  if(e.target.id==='impFile'&&e.target.files&&e.target.files[0]){
    try{
      const data=JSON.parse(await e.target.files[0].text());
      if(data&&typeof data==='object'){coll=data;saveColl();closeSheet();renderCurrent();toast('Collection imported');}
    }catch(err){toast('Could not read that file');}
  }
});
// Swipe across the detail screen to walk the set. Ignored on the filmstrip
// (it scrolls horizontally itself) and on anything that scrolls sideways.
let swx=0,swy=0,swt=0,swok=false;
document.addEventListener('touchstart',function(e){
  if(!activeFig||!e.changedTouches.length){swok=false;return;}
  if(e.target.closest('.film')){swok=false;return;}
  const t=e.changedTouches[0];
  swx=t.clientX;swy=t.clientY;swt=Date.now();swok=true;
},{passive:true});
document.addEventListener('touchend',function(e){
  if(!swok||!activeFig||!e.changedTouches.length) return;
  swok=false;
  const t=e.changedTouches[0];
  const dx=t.clientX-swx, dy=t.clientY-swy;
  if(Date.now()-swt>700) return;                 // a slow drag isn't a swipe
  if(Math.abs(dx)<60) return;                    // too short to be deliberate
  if(Math.abs(dx)<Math.abs(dy)*1.5) return;      // that was a scroll
  stepFigure(dx<0?1:-1);
},{passive:true});

// Arrow keys do the same thing on a desktop.
document.addEventListener('keydown',function(e){
  if(!activeFig) return;
  if(e.key==='ArrowRight') stepFigure(1);
  else if(e.key==='ArrowLeft') stepFigure(-1);
  else if(e.key==='Escape') history.back();
});

$('search').addEventListener('input',renderList);
window.addEventListener('popstate',function(){if(activeFig) closeDetail();});
let rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(renderBursts,200);});
// The burst layer is sized from the document height, so anything that lands
// late (art, a font swap) has to re-trigger it. The wordmark's height is
// reserved in CSS so this should be a no-op — it is here so a future asset
// without a reserved box can't quietly reintroduce the seam.
window.addEventListener('load',function(){renderBursts();});

// ── image fallbacks ───────────────────────────────────────────────
// The CSP blocks inline handlers, and 'error' does not bubble, so this
// listens in the capture phase. data-fallback says what to do:
//   chain → poster cell: try the 'ft' thumbnail, then the keshi ghost
//   hide  → drop the image out of the layout
//   dim   → keep the slot but fade it (filmstrip)
// A few files in the repo use an uppercase .JPG, so every mode retries
// that once before giving up — GitHub Pages is case-sensitive.
document.addEventListener('error',function(e){
  const t=e.target;
  if(!t||t.tagName!=='IMG'||!t.dataset.fallback) return;
  if(!t.dataset.upper&&/\.jpg$/i.test(t.src)&&t.src.indexOf('.JPG')<0){
    t.dataset.upper='1'; t.src=t.src.replace(/\.jpg$/i,'.JPG'); return;
  }
  const mode=t.dataset.fallback;
  if(mode==='chain'){
    if(!t.dataset.tried){
      t.dataset.tried='1'; t.dataset.upper='';
      const m=t.src.match(/MUSCLEFigure(\d{3})f_poster\.png$/);
      if(m){ t.src=IMG+'/MUSCLEFigure'+m[1]+'ft.jpg'; return; }
    }
    const g=document.createElement('span'); g.className='ghost';
    if(t.parentNode) t.replaceWith(g);
    return;
  }
  if(mode==='hide'){ t.style.display='none'; return; }
  if(mode==='dim'){ t.style.opacity='.15'; return; }
},true);

// ── service worker ────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
  navigator.serviceWorker.addEventListener('message',function(e){
    if(e.data&&e.data.type==='UPDATE_AVAILABLE') toast('Update ready \u2014 reopen to apply');
  });
}

(async function init(){
  loadColl();
  await loadFigs();
  // The poster is the app's face, so it always opens there. Desktop is the
  // one exception: the poster is a phone-shaped artifact and a wide screen
  // carries far more in list form. Deliberately NOT remembered — a single tap
  // on List used to pin the app to it permanently.
  setView(window.innerWidth>=1001?'list':'poster',true);
})();
