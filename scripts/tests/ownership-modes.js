const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8621;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const catRaw=fs.readFileSync(path.join(ROOT,'figures.json'),'utf8');
const cat=catRaw;
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
 // ── v3.2 filters: color and class must be answered TOGETHER ──
 // Evaluated separately, "Red + Class A" returned figures made in Red that were
 // class A in some OTHER color. Ground truth is computed from figures.json here,
 // so the assertion is about the data rather than about the UI agreeing with itself.
 const rows=JSON.parse(catRaw);
 const pick=(()=>{
   for(const c of ['Red','Green','Purple','Dark Blue','Light Blue']){
     for(const L of ['A','B','C']){
       const joint=rows.filter(r=>(r.cls||{})[c]===L).length;
       const loose=rows.filter(r=>(r.colors||[]).includes(c)
                    &&Object.values(r.cls||{}).includes(L)).length;
       if(joint>0&&loose>joint+3) return {c,L,joint,loose};
     }
   }
   return null;})();
 if(!pick){ console.log('  (no color/class pair separates the two readings in this catalog)'); }
 else {
   const {c,L,joint,loose}=pick;
   console.log(`      ${c} + Class ${L}: correct answer ${joint}, the old loose reading ${loose}`);
   await pg.locator('#filterBtn').click();await pg.waitForTimeout(400);
   await pg.locator(`[data-f="color"][data-v="${c}"]`).click();await pg.waitForTimeout(200);
   await pg.locator(`[data-f="cls"][data-v="${L}"]`).click();await pg.waitForTimeout(200);
   const shown=await pg.evaluate(()=>document.querySelectorAll('.lrow').length);
   ok(`${c} + Class ${L} intersects on one color`,shown===joint,
      `showed ${shown}, correct is ${joint}, the OR reading would give ${loose}`);
   // the sheet must not jump while you tap through it
   await pg.evaluate(()=>{const s=document.getElementById('sheetp');s.scrollTop=120;});
   await pg.waitForTimeout(150);
   const before=await pg.evaluate(()=>document.getElementById('sheetp').scrollTop);
   await pg.locator('[data-f="cls"][data-v="C"]').click();await pg.waitForTimeout(250);
   const after=await pg.evaluate(()=>document.getElementById('sheetp').scrollTop);
   ok('filter sheet keeps its scroll when you tap a chip',Math.abs(after-before)<4,
      `${before} -> ${after}`);
   await pg.locator('#clearF').click();await pg.waitForTimeout(400);
 }

 // ── scope: catalog vs only what I own ──
 await pg.locator('#filterBtn').click();await pg.waitForTimeout(400);
 const hasScope=await pg.evaluate(()=>!!document.querySelector('[data-f="scope"][data-v="mine"]'));
 ok('filters offer a my-collection scope',hasScope);
 if(hasScope){
   // own exactly one figure, in one color, and check the scope narrows to it
   await pg.locator('#clearF').click();await pg.waitForTimeout(300);
   const seed=await pg.evaluate(()=>{
     const c={}; c['001']={owned:true,colors:['Flesh'],want:false,want_colors:[],notes:'',ts:0};
     localStorage.setItem('muscle-collection',JSON.stringify(c));
     return true;});
   await pg.reload({waitUntil:'domcontentloaded'});
   await pg.waitForSelector('.cell, .lrow');await pg.waitForTimeout(900);
   const lv=pg.locator('#nav button[data-view="list"]');
   if(await lv.count()) { await lv.click(); await pg.waitForTimeout(500); }
   await pg.locator('#filterBtn').click();await pg.waitForTimeout(400);
   await pg.locator('[data-f="scope"][data-v="mine"]').click();await pg.waitForTimeout(200);
   await pg.locator('[data-f="color"][data-v="Flesh"]').click();await pg.waitForTimeout(300);
   const mine=await pg.evaluate(()=>document.querySelectorAll('.lrow').length);
   ok('scope=mine limits color to what you own',mine===1,`${mine} rows (should be just #001)`);
   await pg.locator('[data-f="scope"][data-v="catalog"]').click();await pg.waitForTimeout(300);
   const all=await pg.evaluate(()=>document.querySelectorAll('.lrow').length);
   ok('scope=catalog goes back to every Flesh figure',all>mine,`${all} vs ${mine}`);
   await pg.locator('#clearF').click();await pg.waitForTimeout(400);
 }

 // ── search: ranges and comma lists ──
 const trySearch=async(q)=>{
   await pg.evaluate(v=>{const s=document.getElementById('search');
     s.value=v; s.dispatchEvent(new Event('input',{bubbles:true}));},q);
   await pg.waitForTimeout(350);
   return await pg.evaluate(()=>[...document.querySelectorAll('.lrow')].map(r=>r.dataset.row));};
 const r1=await trySearch('1-34');
 ok('range 1-34 returns exactly 34 figures',r1.length===34,`${r1.length}`);
 ok('range 1-34 is the right 34',r1[0]==='001'&&r1[r1.length-1]==='034',`${r1[0]}..${r1[r1.length-1]}`);
 const r2=await trySearch('1, 7, 43, 76');
 ok('comma list returns exactly those 4',r2.length===4&&r2.join()==='001,007,043,076',r2.join());
 const r3=await trySearch('1-5, 20, 30-32');
 ok('mixed range and list works',r3.join()==='001,002,003,004,005,020,030,031,032',r3.join());
 const r4=await trySearch('13');
 ok('a bare number still matches as a substring',r4.length>1,`${r4.length} rows`);
 const r5=await trySearch('kinniku');
 ok('text search still works',r5.length>1,`${r5.length} rows`);
 await trySearch('');

 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
