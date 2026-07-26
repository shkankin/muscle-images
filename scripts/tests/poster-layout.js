const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8541;
const cat=fs.readFileSync(path.join(ROOT,'figures.json'),'utf8');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}
 const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
const BURST=fs.readFileSync(path.join(ROOT,'images/muscle_burst.png'));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?' — '+x:''));};
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const b=await chromium.launch();
 for(const w of [390,430,820]){
  const ctx=await b.newContext({viewport:{width:w,height:900},isMobile:true,hasTouch:true});
  // The wordmark is deliberately slow here: its box must already be reserved
  // before the file lands, or the whole sheet gets shoved down when it does.
  await ctx.route(/raw\.githubusercontent\.com/,async rt=>{const u=rt.request().url();
    if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
    if(/muscle_burst/.test(u)){await new Promise(r=>setTimeout(r,900));
      return rt.fulfill({status:200,contentType:'image/png',body:BURST});}
    return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
  // real layout-shift accounting, straight from the browser
  await ctx.addInitScript(()=>{window.__cls=0;
    new PerformanceObserver(l=>{for(const e of l.getEntries())
      if(!e.hadRecentInput) window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});
    window.__gridTop=[];const t0=performance.now();
    const tick=()=>{const g=document.getElementById('grid');
      if(g&&g.children.length) window.__gridTop.push(Math.round(g.getBoundingClientRect().top+window.scrollY));
      if(performance.now()-t0<3200) requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const pg=await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(250);
  // ── the wordmark's box must exist BEFORE the image does ──
  const pre=await pg.evaluate(()=>{const i=document.querySelector('.masthead img');
    return {h:Math.round(i.getBoundingClientRect().height),complete:i.complete,
            ratio:getComputedStyle(i).aspectRatio};});
  ok(`w${w}: wordmark declares an aspect-ratio`,/\d/.test(pre.ratio)&&pre.ratio!=='auto',pre.ratio);
  await pg.waitForTimeout(1800);
  const g=await pg.evaluate(()=>{
    const img=document.querySelector('.masthead img').getBoundingClientRect();
    const cells=[...document.querySelectorAll('.cell')].map(e=>e.getBoundingClientRect());
    const under=cells.filter(r=>r.top<img.bottom && r.left+r.width/2>img.left && r.left+r.width/2<img.right);
    const cz=Number(getComputedStyle(document.querySelector('.sheet')).zIndex);
    const mz=Number(getComputedStyle(document.querySelector('.masthead')).zIndex);
    return {overlap:under.length?Math.round(img.bottom-under[0].top):0,
            bleed:Math.round(-img.left), onTop:cz>mz,
            fieldSolid:getComputedStyle(document.getElementById('field')).backgroundColor};});
  // ── nothing may move once the art lands ──
  const shift=await pg.evaluate(()=>({cls:+window.__cls.toFixed(4),
    tops:[...new Set(window.__gridTop)],
    doc:document.body.scrollHeight,
    field:parseInt(document.getElementById('field').style.height)||0,
    bursts:parseInt(document.getElementById('bursts').style.height)||0}));
  const drift=Math.max(...shift.tops)-Math.min(...shift.tops);
  console.log(`  ${w}px: logo bleeds ${g.bleed}px | grid overlaps ${g.overlap}px | cells above ${g.onTop} | CLS ${shift.cls} | grid drift ${drift}px`);
  ok(`w${w}: grid does not move when the wordmark loads`,drift===0,`drift ${drift}px through ${shift.tops.join('->')}`);
  ok(`w${w}: layout shift stays negligible`,shift.cls<0.01,`CLS ${shift.cls}`);
  // the burst layer is sized from the document height — a stale value leaves a
  // visible seam where the starbursts stop partway down the sheet
  ok(`w${w}: burst layer covers the whole sheet`,Math.abs(shift.bursts-shift.doc)<=2,
     `bursts ${shift.bursts}px vs doc ${shift.doc}px`);
  ok(`w${w}: field layer covers the whole sheet`,Math.abs(shift.field-shift.doc)<=2,
     `field ${shift.field}px vs doc ${shift.doc}px`);
  ok(`w${w}: logo bleeds off edge`,g.bleed>0,JSON.stringify(g));
  ok(`w${w}: grid overlaps logo`,g.overlap>0,JSON.stringify(g));
  ok(`w${w}: cells above logo`,g.onTop);
  ok(`w${w}: field solid #633159`,g.fieldSolid==='rgb(99, 49, 89)',g.fieldSolid);
  // ── the starburst layer must be decoration and nothing else ──
  // .burst.hero once collided with the detail screen's .hero, inheriting a
  // black background, a cream border, aspect-ratio:1/1 and position:relative —
  // a rotated dark square painted across the poster field, which read as an
  // inexplicable seam between two purples.
  const bl=await pg.evaluate(()=>[...document.querySelectorAll('#bursts *')].map(e=>{
    const c=getComputedStyle(e);
    return {cls:e.className,tag:e.tagName,pos:c.position,bg:c.backgroundColor,
            bw:parseFloat(c.borderTopWidth)||0,ar:c.aspectRatio,
            top:Math.round(e.offsetTop),declared:parseInt(e.style.top||'-1')};}));
  const opaque=bl.filter(e=>e.bg!=='rgba(0, 0, 0, 0)'&&e.bg!=='transparent');
  const bordered=bl.filter(e=>e.bw>0);
  const misplaced=bl.filter(e=>e.tag==='DIV'&&e.pos!=='absolute');
  ok(`w${w}: no burst paints a background`,opaque.length===0,JSON.stringify(opaque.slice(0,2)));
  ok(`w${w}: no burst draws a border`,bordered.length===0,JSON.stringify(bordered.slice(0,2)));
  ok(`w${w}: every burst is absolutely positioned`,misplaced.length===0,JSON.stringify(misplaced.slice(0,2)));
  const heroB=bl.find(e=>/burst-hero/.test(e.cls));
  ok(`w${w}: hero burst lands where it was placed`,
     !!heroB&&Math.abs(heroB.top-heroB.declared)<=2,JSON.stringify(heroB));
  await ctx.close();
 }
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
