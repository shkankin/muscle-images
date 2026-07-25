const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8561;
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
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
 await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
   if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
   return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
 const pg=await ctx.newPage();const errs=[],csp=[];
 pg.on('pageerror',e=>errs.push(e.message));
 pg.on('console',m=>{const t=m.text(); if(/Content Security Policy|Refused to/i.test(t)) csp.push(t);});
 await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
 await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(1500);

 // 1. poster untouched
 ok('poster still 236 cells',(await pg.locator('.cell').count())===236);
 const pf=await pg.evaluate(()=>getComputedStyle(document.getElementById('field')).backgroundColor);
 ok('poster field still plum',pf==='rgb(99, 49, 89)',pf);
 const posterH=await pg.evaluate(()=>document.body.scrollHeight);

 // 2. LIST: blue field, logo, dots 4-per-row, kana under name
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(800);
 const lf=await pg.evaluate(()=>getComputedStyle(document.getElementById('field')).backgroundColor);
 ok('list field is #06B0FE',lf==='rgb(6, 176, 254)',lf);
 const bodyBg=await pg.evaluate(()=>getComputedStyle(document.body).backgroundColor);
 ok('list body matches',bodyBg==='rgb(6, 176, 254)',bodyBg);
 ok('list logo present',(await pg.locator('.listlogo').count())===1);
 const lg=await pg.locator('.listlogo').evaluate(e=>{const r=e.getBoundingClientRect();
   const tb=document.querySelector('.toolbar').getBoundingClientRect();
   return {w:Math.round(r.width),aboveToolbar:r.bottom<=tb.top+2,visible:r.width>50};});
 ok('logo sits above the toolbar',lg.aboveToolbar&&lg.visible,JSON.stringify(lg));

 // dots: 4 per row
 const dots=await pg.evaluate(()=>{
   const row=[...document.querySelectorAll('.lrow')].find(r=>r.querySelectorAll('.ldots i').length>=5);
   if(!row) return 'none';
   const is=[...row.querySelectorAll('.ldots i')];
   const tops=new Set(is.map(i=>Math.round(i.getBoundingClientRect().top)));
   const firstRow=is.filter(i=>Math.round(i.getBoundingClientRect().top)===Math.min(...tops)).length;
   return {count:is.length, rows:tops.size, perRow:firstRow};});
 ok('dots wrap 4 per row',dots!=='none'&&dots.perRow===4,JSON.stringify(dots));
 ok('dots use 2 rows when >4',dots!=='none'&&dots.rows===2,JSON.stringify(dots));

 // kana below the english name
 const jp=await pg.evaluate(()=>{
   const row=[...document.querySelectorAll('.lrow')].find(r=>r.querySelector('.ljp'));
   if(!row) return 'none';
   const n=row.querySelector('.lname').getBoundingClientRect();
   const j=row.querySelector('.ljp').getBoundingClientRect();
   return {below:j.top>=n.bottom-2, nameW:Math.round(n.width)};});
 ok('kana sits below the english name',jp!=='none'&&jp.below,JSON.stringify(jp));

 // 3. The field layer must not keep a stale inline height from the poster —
 //    that's what left thousands of pixels of dead space below the content.
 const fh=await pg.evaluate(()=>{
   const f=document.getElementById('field');
   return {inline:f.style.height||'(none)',
           rendered:Math.round(f.getBoundingClientRect().height),
           doc:document.body.scrollHeight};});
 ok('field height not stuck at poster size',fh.inline==='(none)',JSON.stringify(fh));
 ok('field covers the page it is on',Math.abs(fh.rendered-fh.doc)<fh.doc*0.25,JSON.stringify(fh));

 // 4. STATS: no huge blank tail
 await pg.locator('#nav button[data-view="stats"]').click();await pg.waitForTimeout(700);
 const sh=await pg.evaluate(()=>{
   const last=document.querySelector('#v-stats .cards:last-of-type');
   return {doc:document.body.scrollHeight,
           contentEnd:Math.round(last.getBoundingClientRect().bottom+window.scrollY)};});
 ok('stats has no dead tail',sh.doc-sh.contentEnd<260,JSON.stringify(sh));

 // 5. DETAIL: flesh back restored
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(600);
 await pg.locator('.lrow[data-row="001"]').click();await pg.waitForTimeout(700);
 const shots=await pg.evaluate(()=>[...document.querySelectorAll('[data-shot]')].map(b=>b.dataset.shot));
 ok('flesh back is in the filmstrip',shots.includes('back'),shots.join(','));
 await pg.locator('[data-shot="back"]').click();await pg.waitForTimeout(400);
 const heroSrc=await pg.locator('.hero img').getAttribute('src');
 ok('back shot loads fbt.jpg',/fbt\.jpg$/.test(heroSrc),heroSrc);

 // 6. swipe steps figures
 const before=await pg.locator('.dtitle b').textContent();
 await pg.evaluate(()=>{
   const d=document.querySelector('.detail');
   const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
     changedTouches:[new Touch({identifier:1,target:d,clientX:x,clientY:y})]});
   d.dispatchEvent(mk('touchstart',330,500));
   d.dispatchEvent(mk('touchend',110,505));
 });
 await pg.waitForTimeout(500);
 const after=await pg.locator('.dtitle b').textContent();
 ok('swipe left goes to next figure',before!==after,`${before} -> ${after}`);
 await pg.evaluate(()=>{
   const d=document.querySelector('.detail');
   const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
     changedTouches:[new Touch({identifier:1,target:d,clientX:x,clientY:y})]});
   d.dispatchEvent(mk('touchstart',110,500));
   d.dispatchEvent(mk('touchend',330,505));
 });
 await pg.waitForTimeout(500);
 ok('swipe right goes back',(await pg.locator('.dtitle b').textContent())===before);

 // vertical swipe must NOT change figure
 const held=await pg.locator('.dtitle b').textContent();
 await pg.evaluate(()=>{
   const d=document.querySelector('.detail');
   const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
     changedTouches:[new Touch({identifier:1,target:d,clientX:x,clientY:y})]});
   d.dispatchEvent(mk('touchstart',220,300));
   d.dispatchEvent(mk('touchend',235,700));
 });
 await pg.waitForTimeout(400);
 ok('vertical scroll is not a swipe',(await pg.locator('.dtitle b').textContent())===held);
 await pg.locator('#dback').click();await pg.waitForTimeout(600);

 // 7. scroll position remembered
 await pg.evaluate(()=>window.scrollTo(0,1400));
 await pg.waitForTimeout(400);
 const yBefore=await pg.evaluate(()=>Math.round(window.scrollY));
 const target=await pg.evaluate(()=>{
   const rows=[...document.querySelectorAll('.lrow')];
   const vis=rows.find(r=>{const b=r.getBoundingClientRect();return b.top>60&&b.top<500;});
   if(vis) vis.click();
   return vis?vis.dataset.row:null;});
 await pg.waitForTimeout(700);
 ok('opened a row from mid-list',(await pg.locator('.detail').count())===1,String(target));
 await pg.locator('#dback').click();await pg.waitForTimeout(900);
 const yAfter=await pg.evaluate(()=>Math.round(window.scrollY));
 ok('returns to the same scroll spot',Math.abs(yAfter-yBefore)<60,`${yBefore} -> ${yAfter}`);

 // 8. coffee link in settings
 await pg.locator('#gear').click();await pg.waitForTimeout(500);
 const coffee=await pg.locator('.btn.coffee').getAttribute('href');
 ok('buy me a coffee link',coffee==='https://buymeacoffee.com/btring',coffee);
 const rel=await pg.locator('.btn.coffee').getAttribute('rel');
 ok('coffee link is safe',/noopener/.test(rel||''),rel);
 const ver=await pg.locator('#sheetp').textContent();
 ok('settings shows a version',/\d+\.\d+/.test(ver),ver.slice(0,80));
 await pg.locator('#doneS').click();await pg.waitForTimeout(300);

 ok('no CSP violations',csp.length===0,csp.slice(0,2).join(' | '));
 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
