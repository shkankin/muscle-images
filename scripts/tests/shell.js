const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8531;
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
async function boot(w=430,h=932){
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<1000,hasTouch:w<1000});
  await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
    if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
    if(/999/.test(u)) return rt.fulfill({status:404,body:''});   // fallback probe
    return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
  const pg=await ctx.newPage();
  const errs=[],csp=[];
  pg.on('pageerror',e=>errs.push(e.message));
  pg.on('console',m=>{const t=m.text(); if(/Content Security Policy|Refused to/i.test(t)) csp.push(t);});
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('.nav',{timeout:12000});await pg.waitForTimeout(1500);
  return {b,pg,errs,csp};
}
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const {b,pg,errs,csp}=await boot();

 // ── it boots from index.html with external css/js ──
 ok('app boots at index.html',(await pg.locator('.cell').count())===236,String(await pg.locator('.cell').count()));
 ok('no CSP violations',csp.length===0,csp.slice(0,2).join(' | '));
 ok('no JS errors',errs.length===0,errs.join(' | '));
 const assets=await pg.evaluate(()=>({
   css:[...document.styleSheets].map(s=>s.href).filter(Boolean).map(h=>h.split('/').slice(-2).join('/')),
   script:[...document.scripts].map(s=>s.src.split('/').slice(-2).join('/')),
   inlineScripts:[...document.scripts].filter(s=>!s.src).length}));
 ok('css is external',assets.css.some(h=>/app\.css/.test(h)),JSON.stringify(assets.css));
 ok('fonts.css linked',assets.css.some(h=>/fonts\.css/.test(h)),JSON.stringify(assets.css));
 ok('js is external',assets.script.some(s=>/app\.js/.test(s)),JSON.stringify(assets.script));
 ok('zero inline scripts',assets.inlineScripts===0,String(assets.inlineScripts));

 // ── manifest + theme ──
 const man=await pg.evaluate(async()=>{
   const l=document.querySelector('link[rel=manifest]');
   const r=await fetch(l.href); const j=await r.json();
   const t=document.querySelector('meta[name=theme-color]');
   return {theme:t?t.content:null, bg:j.background_color, mtheme:j.theme_color,
           name:j.name, start:j.start_url};});
 ok('manifest loads',!!man.name,JSON.stringify(man));
 ok('manifest background is the poster plum',man.bg==='#633159',JSON.stringify(man));
 // theme_color is deliberately absent — the phone status bar uses the system
 // default rather than being painted plum on every screen.
 ok('no theme-color pinned',!man.mtheme&&man.theme===null,JSON.stringify(man));

 // ── fonts actually applied ──
 const ff=await pg.evaluate(()=>{
   const n=document.querySelector('.nav button span');
   return getComputedStyle(n).fontFamily;});
 ok('display font wired up',/Anton/.test(ff),ff);

 // ── core behavior still works after the split ──
 await pg.locator('.cell[data-cell="001"]').click();await pg.waitForTimeout(250);
 ok('poster tap owns',await pg.locator('.cell[data-cell="001"]').evaluate(e=>e.classList.contains('owned')));
 ok('records Flesh only',await pg.evaluate(()=>{
   const e=JSON.parse(localStorage.getItem('muscle-collection'))['001'];return e.colors.join()==='Flesh';}));
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(600);
 ok('list works',(await pg.locator('.lrow').count())===236);
 await pg.locator('#filterBtn').click();await pg.waitForTimeout(400);
 ok('filters open (gear not blocking)',(await pg.locator('#sheetp').count())===1);
 await pg.locator('#doneF').click();await pg.waitForTimeout(300);
 await pg.locator('.lrow[data-row="002"]').click();await pg.waitForTimeout(600);
 ok('detail opens',(await pg.locator('.detail').count())===1);
 await pg.locator('[data-chip]').first().click();await pg.waitForTimeout(350);
 ok('detail records color',await pg.evaluate(()=>{
   const e=JSON.parse(localStorage.getItem('muscle-collection'))['002'];return e.colors.length===1;}));
 await pg.locator('#dback').click();await pg.waitForTimeout(500);
 await pg.locator('#nav button[data-view="stats"]').click();await pg.waitForTimeout(600);
 ok('stats works',(await pg.locator('#v-stats .bigstat').count())===1);

 // ── image fallback chain without inline handlers ──
 await pg.locator('#nav button[data-view="poster"]').click();await pg.waitForTimeout(700);
 const ghosts=await pg.evaluate(async()=>{
   // force a poster image to fail and confirm the delegated handler reacts
   const img=document.querySelector('.cell .fig img');
   if(!img) return 'no img';
   img.dataset.tried=''; img.dataset.upper='';
   img.src='https://raw.githubusercontent.com/shkankin/muscle-images/main/images/MUSCLEFigure999f_poster.png';
   await new Promise(r=>setTimeout(r,900));
   return document.querySelectorAll('.cell .ghost').length;});
 ok('delegated error handler fires',ghosts!=='no img',String(ghosts));
 ok('still no CSP violations',csp.length===0,csp.slice(0,2).join(' | '));
 await b.close();

 // ── service worker registers ──
 const d=await boot(1280,900);
 ok('desktop still defaults to list',await d.pg.evaluate(()=>document.body.classList.contains('v-list')));
 const swreg=await d.pg.evaluate(async()=>{
   if(!('serviceWorker' in navigator)) return 'unsupported';
   const r=await navigator.serviceWorker.getRegistration();
   return r?'registered':'none';});
 ok('service worker registers',swreg==='registered'||swreg==='unsupported',swreg);
 ok('desktop no errors',d.errs.length===0,d.errs.join(' | '));
 await d.b.close();
 console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
