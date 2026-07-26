// ════════════════════════════════════════════════════════════════════
// detail-stability.js — v2.5
// Nothing the user did not ask to move may move.
//   • switching tab / logging a color / picking a shot keeps your scroll
//   • the OWN/WANT buttons sit at the same height on every figure
//   • owned vs unowned poster cells are numerically distinguishable
// The viewport is deliberately short (430x740) so the detail screen really
// does scroll — on a tall phone some figures fit whole and a scroll-restore
// check would pass without ever having scrolled.
// ════════════════════════════════════════════════════════════════════
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..'),PORT=8627;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
            '.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'};
const catRaw=fs.readFileSync(path.join(ROOT,'figures.json'),'utf8');
const cat=catRaw;   // served to the page as-is; parsed separately where the rows are needed
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
 fs.createReadStream(f).pipe(r);});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?' — '+x:''));};

// WCAG relative luminance, and an alpha composite so a translucent border can
// be compared against what actually lands on screen rather than its declared
// value. Asserting these numerically is the house rule — twice now something
// has shipped invisible and looked fine in a screenshot.
const rgba=s=>{const m=s.match(/[\d.]+/g).map(Number);return[m[0],m[1],m[2],m.length>3?m[3]:1];};
const over=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
const lum=c=>{const f=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*f[0]+.7152*f[1]+.0722*f[2];};
const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};

const swipe=async(pg,dir)=>{await pg.evaluate(d=>{
  const el=document.querySelector('.detail');
  const mk=(t,x,y)=>new TouchEvent(t,{bubbles:true,cancelable:true,
    changedTouches:[new Touch({identifier:1,target:el,clientX:x,clientY:y})]});
  if(d>0){el.dispatchEvent(mk('touchstart',330,500));el.dispatchEvent(mk('touchend',110,505));}
  else{el.dispatchEvent(mk('touchstart',110,500));el.dispatchEvent(mk('touchend',330,505));}
},dir); await pg.waitForTimeout(320);};

const openRow=async(pg,id)=>{
  await pg.evaluate(i=>{const r=document.querySelector(`.lrow[data-row="${i}"]`);
    if(r) r.scrollIntoView({block:'center'});},id);
  await pg.waitForTimeout(200);
  await pg.locator(`.lrow[data-row="${id}"]`).click();
  await pg.waitForTimeout(500);
};

(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:430,height:740},isMobile:true,hasTouch:true});
 await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
   if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
   // One shot is deliberately missing. The hero <img> is now reused across
   // shots instead of rebuilt, so the fallback listener's hide-on-404 has to
   // be undone when you move to a shot that does exist.
   if(/MUSCLEFigure002pt\.(jpg|JPG)$/.test(u)) return rt.fulfill({status:404,body:''});
   return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
 const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
 await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(1400);

 // ── 1. the poster sheet: owned must be obvious from across the grid ──
 const c1=pg.locator('.cell[data-cell="001"]');
 const unowned=await c1.evaluate(e=>({
   border:getComputedStyle(e).borderTopColor,
   bg:getComputedStyle(e).backgroundColor,
   star:e.querySelector('.star').getBoundingClientRect().width,
   fill:getComputedStyle(e.querySelector('.star path')).fill,
   stroke:getComputedStyle(e.querySelector('.star path')).stroke}));
 await c1.click(); await pg.waitForTimeout(300);
 const owned=await c1.evaluate(e=>({
   border:getComputedStyle(e).borderTopColor,
   star:e.querySelector('.star').getBoundingClientRect().width,
   fill:getComputedStyle(e.querySelector('.star path')).fill,
   stroke:getComputedStyle(e.querySelector('.star path')).stroke}));

 ok('cell is marked owned on tap',await c1.evaluate(e=>e.classList.contains('owned')));
 ok('owned and unowned borders differ',unowned.border!==owned.border,
    `${unowned.border} vs ${owned.border}`);
 // the unowned border is translucent, so compare what actually paints
 const offPaint=over(rgba(unowned.border),rgba(unowned.bg));
 const onPaint=rgba(owned.border).slice(0,3);
 const sep=ratio(offPaint,onPaint);
 ok('borders separate by >=3:1 once composited',sep>=3,
    `${sep.toFixed(2)}:1 — off ${offPaint.map(Math.round)} vs on ${onPaint}`);
 console.log(`      border separation ${sep.toFixed(2)}:1`);
 ok('owned star is a clear size up',owned.star>=unowned.star*1.25,
    `${unowned.star.toFixed(1)}px -> ${owned.star.toFixed(1)}px`);
 // The printed poster has a solid white star in every slot — an empty one must
 // stay solid white, never hollowed out. The owned/unowned read is carried by
 // the border and the size step instead.
 ok('unowned star is SOLID white',/255,\s*255,\s*255/.test(unowned.fill)&&unowned.fill!=='none',
    `fill ${unowned.fill}`);
 ok('unowned star is not stroked',unowned.stroke==='none'||/^rgba\(0, 0, 0, 0\)$/.test(unowned.stroke),
    unowned.stroke);
 ok('owned star is filled gold',/255,\s*215,\s*0/.test(owned.fill),owned.fill);
 // white on the near-black cell has to stay legible in its own right
 const sr=ratio(rgba(unowned.fill).slice(0,3),rgba(unowned.bg).slice(0,3));
 ok('white star readable on the cell',sr>=4.5,`${sr.toFixed(2)}:1`);
 // white vs gold alone is a weak signal (~1.4:1) — this is exactly why the
 // border does the work. Assert the star is a supporting cue, not the only one.
 const starSep=ratio(rgba(unowned.fill).slice(0,3),rgba(owned.fill).slice(0,3));
 console.log(`      star fill separation ${starSep.toFixed(2)}:1 (border carries ${sep.toFixed(2)}:1)`);
 ok('border out-separates the star fills',sep>starSep,
    `border ${sep.toFixed(2)} vs star ${starSep.toFixed(2)}`);
 await c1.click(); await pg.waitForTimeout(250);   // put it back

 // ── 2. the detail screen: switching tab must not move you ──
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(700);
 await openRow(pg,'002');                       // long notes — a tall screen
 const scrollable=await pg.evaluate(()=>{const d=document.querySelector('.detail');
   return d.scrollHeight-d.clientHeight;});
 ok('detail screen actually scrolls here',scrollable>120,`${scrollable}px of travel`);
 await pg.evaluate(()=>{document.querySelector('.detail').scrollTop=140;});
 await pg.waitForTimeout(250);
 const yBefore=await pg.evaluate(()=>document.querySelector('.detail').scrollTop);
 ok('scrolled down the detail screen',yBefore>100,`scrollTop ${yBefore}`);

 await pg.locator('[data-dtab="want"]').click();await pg.waitForTimeout(320);
 const yTab=await pg.evaluate(()=>document.querySelector('.detail').scrollTop);
 ok('switching to WANT keeps your place',Math.abs(yTab-yBefore)<4,`${yBefore} -> ${yTab}`);
 ok('WANT tab did become active',
    await pg.locator('[data-dtab="want"]').evaluate(e=>e.classList.contains('on')));

 await pg.locator('[data-chip]').first().click();await pg.waitForTimeout(320);
 const yChip=await pg.evaluate(()=>document.querySelector('.detail').scrollTop);
 ok('logging a color keeps your place',Math.abs(yChip-yBefore)<4,`${yBefore} -> ${yChip}`);
 ok('the color went to the WANT list',await pg.evaluate(()=>{
   const c=JSON.parse(localStorage.getItem('muscle-collection')||'{}');
   return (c['002']&&c['002'].want_colors||[]).length===1&&(c['002'].colors||[]).length===0;}));
 ok('chip repainted as active',
    await pg.locator('[data-chip]').first().evaluate(e=>e.classList.contains('on')));
 ok('tab count updated in place',
    /WANT \(1\)/.test(await pg.locator('[data-dtab="want"]').textContent()));

 const shots=await pg.locator('[data-shot]').count();
 if(shots>1){
   // nth(1) is Flesh, which is already showing — take the group shot instead.
   const src0=await pg.locator('.hero img').getAttribute('src');
   await pg.locator('[data-shot]').first().click();await pg.waitForTimeout(320);
   const yShot=await pg.evaluate(()=>document.querySelector('.detail').scrollTop);
   ok('picking a shot keeps your place',Math.abs(yShot-yBefore)<4,`${yBefore} -> ${yShot}`);
   ok('the hero image actually changed',await pg.locator('.hero img').getAttribute('src')!==src0,
      `${src0} -> ${await pg.locator('.hero img').getAttribute('src')}`);

   // ── the reused hero must recover from a missing shot ──
   const purple=pg.locator('[data-shot="Purple"]');
   if(await purple.count()){
     await purple.click();await pg.waitForTimeout(700);
     ok('a missing shot hides the hero',
        await pg.locator('.hero img').evaluate(e=>e.style.display==='none'));
     await pg.locator('[data-shot="Flesh"]').click();await pg.waitForTimeout(500);
     const back=await pg.locator('.hero img').evaluate(e=>({
       display:e.style.display,src:e.getAttribute('src'),w:e.getBoundingClientRect().width}));
     ok('hero comes back for the next good shot',back.display!=='none'&&back.w>50,JSON.stringify(back));
     ok('and it is the shot you picked',/MUSCLEFigure002ft\.jpg$/.test(back.src),back.src);
   }
 }

 // back to OWN and confirm it still records ownership after the refactor
 await pg.locator('[data-dtab="own"]').click();await pg.waitForTimeout(300);
 await pg.locator('[data-chip]').first().click();await pg.waitForTimeout(300);
 ok('OWN mode still records ownership',await pg.evaluate(()=>{
   const c=JSON.parse(localStorage.getItem('muscle-collection')||'{}');
   return (c['002']&&c['002'].colors||[]).length===1;}));
 ok('owning a wanted color clears the want',await pg.evaluate(()=>{
   const c=JSON.parse(localStorage.getItem('muscle-collection')||'{}');
   return (c['002'].want_colors||[]).length===0;}));
 await pg.locator('#dback').click();await pg.waitForTimeout(600);

 // ── 3. the buttons sit at the same height on every figure ──
 // The pair is chosen FROM THE CATALOG at runtime: we need three consecutive
 // figures where the kana line appears and disappears, which is the case that
 // used to shove the OWN/WANT buttons down a line. Hard-coding ids here broke
 // the moment a Japanese name was filled in for one of them — and filling
 // those in is ongoing work, so the test has to follow the data.
 const rows=JSON.parse(catRaw);
 let pick=null;
 for(let i=0;i<rows.length-2;i++){
   const a=rows[i],b=rows[i+1],c=rows[i+2];
   const heavy=r=>!!(r.origin||r.notes);          // prose lines shift things independently
   if(heavy(a)||heavy(b)||heavy(c)) continue;
   const k=r=>!!(r.jp&&r.jp.trim());
   if(k(a)!==k(b)||k(b)!==k(c)){pick=[a.id,b.id,c.id,[k(a),k(b),k(c)]];break;}
 }
 if(!pick){
   console.log('  (every remaining run of three figures agrees on kana — skipping the pair check)');
 } else {
   const [i1,i2,i3,kflags]=pick;
   const tabsY=()=>pg.evaluate(()=>{
     const t=document.querySelector('.tabs'),d=document.querySelector('.detail');
     return Math.round(t.getBoundingClientRect().top-d.getBoundingClientRect().top+d.scrollTop);});
   const kana=()=>pg.evaluate(()=>document.querySelector('.dmeta .kana').textContent.trim());

   await openRow(pg,i1);
   const y1=await tabsY(), k1=await kana();
   await swipe(pg,1);
   const y2=await tabsY(), k2=await kana();
   await swipe(pg,1);
   const y3=await tabsY(), k3=await kana();

   ok(`kana differs across ${i1}/${i2}/${i3}`,
      (k1!=='')===kflags[0]&&(k2!=='')===kflags[1]&&(k3!=='')===kflags[2],
      `"${k1}" / "${k2}" / "${k3}" vs catalog ${JSON.stringify(kflags)}`);
   ok('kana line is present even when empty',
      await pg.evaluate(()=>!!document.querySelector('.dmeta .kana')));
   ok(`buttons hold their place ${i1} -> ${i2}`,y1===y2,`${y1} vs ${y2}`);
   ok(`buttons hold their place ${i2} -> ${i3}`,y2===y3,`${y2} vs ${y3}`);
   console.log(`      tabs offset ${y1} / ${y2} / ${y3}  (kana ${JSON.stringify(kflags)})`);

   const slots=await pg.evaluate(()=>({
     orig:document.querySelector('.dmeta .orig').getBoundingClientRect().height,
     kana:document.querySelector('.dmeta .kana').getBoundingClientRect().height}));
   ok('empty identity lines still reserve room',slots.orig>=18&&slots.kana>=22,JSON.stringify(slots));
 }

 // ── 4. the mode itself still survives a swipe (v2.4's data-corrupting bug) ──
 await pg.locator('[data-dtab="want"]').click();await pg.waitForTimeout(300);
 await swipe(pg,1);
 ok('WANT survives a swipe',await pg.locator('[data-dtab="want"]').evaluate(e=>e.classList.contains('on')));
 ok('a swipe DOES reset the scroll',await pg.evaluate(()=>document.querySelector('.detail').scrollTop)===0);

 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
