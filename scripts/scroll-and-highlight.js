const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8601;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const cat=fs.readFileSync(path.join(ROOT,'figures.json'),'utf8');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
 fs.createReadStream(f).pipe(r);});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?' — '+x:''));};
function lum(r,g,b){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
function ratio(a,b){const L1=lum(...a),L2=lum(...b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);}
const rgb=s=>s.match(/\d+/g).slice(0,3).map(Number);
async function boot(w,h){
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<1000,hasTouch:w<1000});
  await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
    if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
    return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('.nav',{timeout:12000});await pg.waitForTimeout(1500);
  return {b,pg,errs};
}
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 let {b,pg,errs}=await boot(430,932);

 // ── 1. always opens on the poster, even after visiting the list ──
 ok('mobile opens on poster',await pg.evaluate(()=>document.body.classList.contains('v-poster')));
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(600);
 await pg.reload({waitUntil:'domcontentloaded'});
 await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(1400);
 ok('still opens on poster after visiting list',
    await pg.evaluate(()=>document.body.classList.contains('v-poster')));
 ok('no remembered-view key written',
    await pg.evaluate(()=>localStorage.getItem('muscle-view')===null));

 // ── 2. detail screen readability ──
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(700);
 await pg.locator('.lrow[data-row="001"]').click();await pg.waitForTimeout(700);
 const d=await pg.evaluate(()=>{
   const el=document.querySelector('.detail');
   const g=s=>{const n=document.querySelector(s);return n?getComputedStyle(n).color:null;};
   return {bg:getComputedStyle(el).backgroundColor,
           note:g('.dmeta .note'), hint:g('.hint'), sub:g('.dtitle span'),
           chip:document.querySelector('.chip')?getComputedStyle(document.querySelector('.chip')).color:null};});
 const dbg=rgb(d.bg);
 ok('detail is NOT the bright blue field',!(dbg[2]>200&&dbg[1]>140),d.bg);
 let worst=99, which='';
 for(const k of ['note','hint','sub','chip']){
   if(!d[k]) continue;
   const cr=ratio(rgb(d[k]),dbg);
   if(cr<worst){worst=cr;which=k;}
 }
 ok('all detail text readable (>=4.5:1)',worst>=4.5,`worst ${which} at ${worst.toFixed(2)}:1`);
 console.log(`      detail bg ${d.bg} · worst contrast ${worst.toFixed(2)}:1 (${which})`);

 // ── 3. scroll lock while detail is open ──
 await pg.locator('#dback').click();await pg.waitForTimeout(700);
 await pg.evaluate(()=>window.scrollTo(0,2000));await pg.waitForTimeout(400);
 const yPre=await pg.evaluate(()=>Math.round(window.scrollY));
 await pg.evaluate(()=>{
   const rows=[...document.querySelectorAll('.lrow')];
   const v=rows.find(r=>{const b=r.getBoundingClientRect();return b.top>80&&b.top<420;});
   if(v) v.click();});
 await pg.waitForTimeout(700);
 ok('body is locked while detail is open',
    await pg.evaluate(()=>document.body.classList.contains('locked')&&getComputedStyle(document.body).position==='fixed'));
 // try to scroll the page behind the overlay
 await pg.evaluate(()=>window.scrollBy(0,900));await pg.waitForTimeout(300);
 const bgMoved=await pg.evaluate(()=>Math.round(window.scrollY));
 ok('page behind does not scroll',bgMoved===0||bgMoved===yPre,`scrollY ${bgMoved}`);
 await pg.locator('#dback').click();await pg.waitForTimeout(800);
 const yPost=await pg.evaluate(()=>Math.round(window.scrollY));
 ok('scroll restored exactly on close',Math.abs(yPost-yPre)<8,`${yPre} -> ${yPost}`);
 ok('body unlocked after close',
    await pg.evaluate(()=>!document.body.classList.contains('locked')&&getComputedStyle(document.body).position!=='fixed'));

 // ── 4. highlight the figure you were just on ──
 const seen=await pg.evaluate(()=>{
   const r=document.querySelector('.lrow.just-seen');
   return r?r.dataset.row:null;});
 ok('returning row is highlighted',!!seen,String(seen));
 // after swiping to another figure, the NEW one is highlighted and in view
 await pg.locator('.lrow[data-row="010"]').click();await pg.waitForTimeout(700);
 for(let i=0;i<6;i++){
   await pg.evaluate(()=>{
     const d=document.querySelector('.detail');
     const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
       changedTouches:[new Touch({identifier:1,target:d,clientX:x,clientY:y})]});
     d.dispatchEvent(mk('touchstart',330,500));
     d.dispatchEvent(mk('touchend',110,505));});
   await pg.waitForTimeout(250);
 }
 const landed=await pg.evaluate(()=>document.querySelector('.dtitle b').textContent);
 await pg.locator('#dback').click();await pg.waitForTimeout(900);
 const after=await pg.evaluate(()=>{
   const r=document.querySelector('.lrow.just-seen');
   if(!r) return null;
   const b=r.getBoundingClientRect();
   return {id:r.dataset.row, inView:b.top>0&&b.bottom<window.innerHeight};});
 ok('swiped-to figure is the one highlighted',after&&after.id==='016',JSON.stringify(after)+' after '+landed);
 ok('highlighted row scrolled into view',after&&after.inView,JSON.stringify(after));

 // ── 5. sheets lock too ──
 await pg.locator('#filterBtn').click();await pg.waitForTimeout(500);
 ok('sheet locks the page',await pg.evaluate(()=>document.body.classList.contains('locked')));
 await pg.locator('#doneF').click();await pg.waitForTimeout(400);
 ok('sheet unlocks',await pg.evaluate(()=>!document.body.classList.contains('locked')));
 // chip taps re-open the sheet — the lock must not stack
 await pg.locator('#filterBtn').click();await pg.waitForTimeout(400);
 await pg.locator('[data-f="own"][data-v="owned"]').click();await pg.waitForTimeout(500);
 await pg.locator('#doneF').click();await pg.waitForTimeout(500);
 ok('lock does not stack across re-opens',
    await pg.evaluate(()=>!document.body.classList.contains('locked')&&getComputedStyle(document.body).position!=='fixed'));
 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();

 const dk=await boot(1280,900);
 ok('desktop still opens on list',await dk.pg.evaluate(()=>document.body.classList.contains('v-list')));
 await dk.b.close();
 console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
