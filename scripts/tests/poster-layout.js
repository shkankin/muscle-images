const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8541;
const cat=fs.readFileSync(path.join(ROOT,'figures.json'),'utf8');
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);r.end();return;}
 const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png'};
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x&&!c?' — '+x:''));};
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const b=await chromium.launch();
 for(const w of [390,430,820]){
  const ctx=await b.newContext({viewport:{width:w,height:900},isMobile:true,hasTouch:true});
  await ctx.route(/raw\.githubusercontent\.com/,rt=>{const u=rt.request().url();
    if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
    return rt.fulfill({status:200,contentType:'image/png',body:PNG});});
  const pg=await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForSelector('.cell',{timeout:12000});await pg.waitForTimeout(1200);
  const g=await pg.evaluate(()=>{
    const img=document.querySelector('.masthead img').getBoundingClientRect();
    const cells=[...document.querySelectorAll('.cell')].map(e=>e.getBoundingClientRect());
    const under=cells.filter(r=>r.top<img.bottom && r.left+r.width/2>img.left && r.left+r.width/2<img.right);
    const cz=Number(getComputedStyle(document.querySelector('.sheet')).zIndex);
    const mz=Number(getComputedStyle(document.querySelector('.masthead')).zIndex);
    return {overlap:under.length?Math.round(img.bottom-under[0].top):0,
            bleed:Math.round(-img.left), onTop:cz>mz,
            fieldSolid:getComputedStyle(document.getElementById('field')).backgroundColor};});
  console.log(`  ${w}px: logo bleeds ${g.bleed}px | grid overlaps ${g.overlap}px | cells above ${g.onTop}`);
  ok(`w${w}: logo bleeds off edge`,g.bleed>0,JSON.stringify(g));
  ok(`w${w}: grid overlaps logo`,g.overlap>0,JSON.stringify(g));
  ok(`w${w}: cells above logo`,g.onTop);
  ok(`w${w}: field solid #633159`,g.fieldSolid==='rgb(99, 49, 89)',g.fieldSolid);
  await ctx.close();
 }
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
