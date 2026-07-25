const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),PORT=8581;
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
// WCAG relative luminance → contrast ratio
function lum(r,g,b){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
function ratio(a,b){const L1=lum(...a),L2=lum(...b);
  return ((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05));}
const rgb=s=>s.match(/\d+/g).slice(0,3).map(Number);
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

 // 1. status bar left to the system
 const tc=await pg.evaluate(()=>document.querySelectorAll('meta[name="theme-color"]').length);
 ok('no fixed theme-color meta',tc===0,String(tc));
 const manTheme=await pg.evaluate(async()=>{
   const r=await fetch(document.querySelector('link[rel=manifest]').href);
   const j=await r.json();
   return {hasTheme:'theme_color' in j, icons:j.icons.map(i=>i.src+' ('+i.purpose+')')};});
 ok('manifest leaves theme to the OS',!manTheme.hasTheme,JSON.stringify(manTheme));

 // 2. new app icon
 const ic=await pg.evaluate(()=>({
   fav:document.querySelector('link[rel=icon]').getAttribute('href'),
   apple:document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')}));
 ok('favicon is icon.png',ic.fav==='images/icon.png',JSON.stringify(ic));
 ok('apple icon is icon.png',ic.apple==='images/icon.png',JSON.stringify(ic));
 ok('manifest uses icon.png',manTheme.icons.some(s=>/images\/icon\.png \(any\)/.test(s)),JSON.stringify(manTheme.icons));
 ok('maskable is the padded variant',manTheme.icons.some(s=>/maskable-1024\.png \(maskable\)/.test(s)),
    JSON.stringify(manTheme.icons));

 // 3. LIST readability on blue
 await pg.locator('#nav button[data-view="list"]').click();await pg.waitForTimeout(800);
 const field=rgb(await pg.evaluate(()=>getComputedStyle(document.getElementById('field')).backgroundColor));
 ok('list field still #06B0FE',field.join()==='6,176,254',field.join());
 const cnt=rgb(await pg.evaluate(()=>getComputedStyle(document.querySelector('.count')).color));
 const cr=ratio(cnt,field);
 ok('count text readable on blue',cr>=4.5,`contrast ${cr.toFixed(2)}:1 for rgb(${cnt})`);

 // row accents use logo colors and read on the dark row
 const row=await pg.evaluate(()=>{
   const r=document.querySelector('.lrow');
   const bg=getComputedStyle(r).backgroundColor;
   return {bg, num:getComputedStyle(r.querySelector('.lnum')).color,
           name:getComputedStyle(r.querySelector('.lname')).color};});
 const rowBg=rgb(row.bg), num=rgb(row.num);
 ok('figure number is logo orange',num.join()==='255,102,0',num.join());
 ok('number readable on the row',ratio(num,rowBg)>=4.5,`contrast ${ratio(num,rowBg).toFixed(2)}:1`);
 const jpc=await pg.evaluate(()=>{
   const r=[...document.querySelectorAll('.lrow')].find(x=>x.querySelector('.ljp'));
   return r?getComputedStyle(r.querySelector('.ljp')).color:null;});
 if(jpc){const j=rgb(jpc);
   ok('kana is logo yellow',j.join()==='255,215,0',j.join());
   ok('kana readable on the row',ratio(j,rowBg)>=4.5,`contrast ${ratio(j,rowBg).toFixed(2)}:1`);}

 // 4. detail header follows the room
 await pg.locator('.lrow[data-row="001"]').click();await pg.waitForTimeout(700);
 const bar=await pg.evaluate(()=>getComputedStyle(document.querySelector('.dtop')).backgroundColor);
 const bcol=rgb(bar);
 ok('detail header is blue-toned on the list',bcol[2]>bcol[0]&&bcol[2]>40,bar);
 ok('detail header is not plum',!(bcol[0]>bcol[2]),bar);
 await pg.locator('#dback').click();await pg.waitForTimeout(600);

 // poster keeps its own plum header
 await pg.locator('#nav button[data-view="poster"]').click();await pg.waitForTimeout(700);
 const posterBar=await pg.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--topbar').trim());
 ok('poster keeps the plum header',/46, 22, 42/.test(posterBar),posterBar);

 ok('no CSP violations',csp.length===0,csp.slice(0,2).join(' | '));
 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
