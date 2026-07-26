const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8621;
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
const swipe=async(pg,dir)=>{await pg.evaluate(d=>{
  const el=document.querySelector('.detail');
  const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:el,clientX:x,clientY:y})]});
  if(d>0){el.dispatchEvent(mk('touchstart',330,500));el.dispatchEvent(mk('touchend',110,505));}
  else{el.dispatchEvent(mk('touchstart',110,500));el.dispatchEvent(mk('touchend',330,505));}
},dir); await pg.waitForTimeout(320);};
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
 await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
   if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
   return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
 const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
 await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(1400);
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(700);

 // ── THE BUG: wishlisting across swipes must never record ownership ──
 await pg.locator('.lrow[data-row="001"]').click();await pg.waitForTimeout(600);
 await pg.locator('[data-dtab="want"]').click();await pg.waitForTimeout(350);
 ok('want tab active',await pg.locator('[data-dtab="want"]').evaluate(e=>e.classList.contains('on')));
 // mark a want, then swipe through several figures marking more
 const marked=[];
 for(let i=0;i<5;i++){
   const tabNow=await pg.locator('[data-dtab="want"]').evaluate(e=>e.classList.contains('on'));
   if(i>0) ok(`want tab survives swipe ${i}`,tabNow,'tab reset to OWN');
   const id=await pg.evaluate(()=>document.querySelector('.dtitle span').textContent);
   // Some figures were only made in flesh, so always take the first chip.
   const chips=await pg.locator('[data-chip]').count();
   if(chips>0){ await pg.locator('[data-chip]').first().click(); await pg.waitForTimeout(250); marked.push(id); }
   await swipe(pg,1);
 }
 const coll=await pg.evaluate(()=>JSON.parse(localStorage.getItem('muscle-collection')||'{}'));
 const wronglyOwned=Object.keys(coll).filter(k=>(coll[k].colors||[]).length>0);
 const wanted=Object.keys(coll).filter(k=>(coll[k].want_colors||[]).length>0);
 ok('nothing was marked OWNED',wronglyOwned.length===0,
    'owned: '+JSON.stringify(wronglyOwned.map(k=>k+':'+coll[k].colors.join('/'))));
 ok('wants were recorded',wanted.length>=4,'wanted '+wanted.length);
 ok('poster count stays 0',(await pg.evaluate(()=>{
   const c=JSON.parse(localStorage.getItem('muscle-collection')||'{}');
   return Object.keys(c).filter(k=>(c[k].colors||[]).length>0).length;}))===0);

 // want mode is visually distinct
 const look=await pg.evaluate(()=>{
   const w=document.querySelector('[data-dtab="want"]');
   const o=document.querySelector('[data-dtab="own"]');
   return {want:getComputedStyle(w).backgroundColor, own:getComputedStyle(o).backgroundColor,
           chipsMode:document.querySelector('.chips').className};});
 ok('WANT tab is visually distinct from OWN',look.want!==look.own,JSON.stringify(look));
 ok('chips flagged as want-mode',/want-mode/.test(look.chipsMode),look.chipsMode);

 // switching back to OWN then tapping records ownership properly
 await pg.locator('[data-dtab="own"]').click();await pg.waitForTimeout(300);
 await pg.locator('[data-chip]').first().click();await pg.waitForTimeout(300);
 ok('OWN mode still records ownership',await pg.evaluate(()=>{
   const c=JSON.parse(localStorage.getItem('muscle-collection')||'{}');
   return Object.keys(c).some(k=>(c[k].colors||[]).length>0);}));
 await pg.locator('#dback').click();await pg.waitForTimeout(700);

 // ── scroll restore is a jump, not a smooth ride from the top ──
 // scroll-behavior:smooth means a bare scrollTo is still animating when the
 // sample below is taken, so yBefore reads short and the exact restore looks
 // wrong. Jump instantly, the way the app's own jumpTo() does.
 await pg.evaluate(()=>{const r=document.documentElement,b=r.style.scrollBehavior;
   r.style.scrollBehavior='auto';window.scrollTo(0,2400);r.style.scrollBehavior=b;});
 await pg.waitForTimeout(500);
 const yPre=await pg.evaluate(()=>Math.round(window.scrollY));
 await pg.evaluate(()=>{
   const rows=[...document.querySelectorAll('.lrow')];
   const v=rows.find(r=>{const b=r.getBoundingClientRect();return b.top>90&&b.top<400;});
   if(v) v.click();});
 await pg.waitForTimeout(600);
 await pg.locator('#dback').click();
 // sample immediately — a smooth scroll would still be near the top here
 await pg.waitForTimeout(70);
 const yEarly=await pg.evaluate(()=>Math.round(window.scrollY));
 await pg.waitForTimeout(700);
 const yFinal=await pg.evaluate(()=>Math.round(window.scrollY));
 ok('lands at the saved spot immediately',Math.abs(yEarly-yPre)<80,`after 70ms: ${yEarly} (target ${yPre})`);
 ok('final position correct',Math.abs(yFinal-yPre)<12,`${yPre} -> ${yFinal}`);
 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
