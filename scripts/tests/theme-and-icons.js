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
const HERO=fs.readFileSync(path.join(ROOT,'images/kinnikuman.png'));
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
 // The stats hero is served late and at its real size: its box must already be
 // reserved when the stats view is painted, or the whole page shifts on load.
 await ctx.addInitScript(()=>{window.__cls=0;
   new PerformanceObserver(l=>{for(const e of l.getEntries())
     if(!e.hadRecentInput) window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});});
 await ctx.route(/raw\.githubusercontent\.com/,async rt=>{const u=rt.request().url();
   if(/figures\.json/.test(u))return rt.fulfill({status:200,contentType:'application/json; charset=utf-8',body:cat});
   if(/kinnikuman/.test(u)){await new Promise(r=>setTimeout(r,700));
     return rt.fulfill({status:200,contentType:'image/png',body:HERO});}
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

 // ── the stats hero ────────────────────────────────────────────────────
 // The artwork is only usable because its clear corner is predictable: the
 // top third is empty out to 60% of the width, and the ropes cross everything
 // below the halfway line. The caption has to stay inside that corner at every
 // width, and the stats have to climb back over the bottom without landing on
 // bare rope. All of it asserted in percentages, so it holds as the box scales.
 await pg.locator('#nav button[data-view="stats"]').click();
 await pg.waitForTimeout(300);
 // Guarded: on a tree without the hero this must report a clean FAIL below, not
 // throw and abandon the rest of the suite.
 const earlyTop=await pg.evaluate(()=>{const b=document.getElementById('statsBody');
   const c=b&&b.firstElementChild;
   return c?Math.round(c.getBoundingClientRect().top+scrollY):-1;});
 await pg.waitForTimeout(1400);
 const hero=await pg.evaluate(()=>{
   const h=document.querySelector('.shero'); if(!h) return null;
   const img=h.querySelector('img'),cap=document.querySelector('.sherocap');
   const k=document.querySelector('.sherocap .k'),t=document.querySelector('.sherocap .t');
   const body=document.getElementById('statsBody'),card=body&&body.firstElementChild;
   if(!img||!cap||!k||!t||!card) return {broken:true};
   const hb=h.getBoundingClientRect(),ib=img.getBoundingClientRect(),
         cb=cap.getBoundingClientRect(),kb=card.getBoundingClientRect();
   const alpha=s=>{const m=s.match(/[\d.]+/g).map(Number);return m.length>3?m[3]:1;};
   return {cls:+window.__cls.toFixed(4),
     cardTop:Math.round(kb.top+scrollY),
     ar:getComputedStyle(img).aspectRatio, natural:img.naturalWidth+'x'+img.naturalHeight,
     overflow:getComputedStyle(h).overflow,
     bleedL:Math.round(hb.left),bleedR:Math.round(innerWidth-hb.right),
     // Measured against the RENDERED ART, not the box: v3.4 scales the image
     // 10% without growing its layout box, so the two are no longer the same
     // rectangle and the clear zone is a percentage of the artwork.
     scale:+(ib.height/hb.height).toFixed(3),
     // Where the scaled art spills past its box. .shero clips it, so the sign
     // of these decides WHAT is lost.
     clipTop:Math.round(hb.top-ib.top), clipBot:Math.round(ib.bottom-hb.bottom),
     capRightPct:+(100*(cb.right-ib.left)/ib.width).toFixed(1),
     capBotPct:+(100*(cb.bottom-ib.top)/ib.height).toFixed(1),
     overlapPct:+(100*(hb.bottom-kb.top)/hb.height).toFixed(1),
     kColor:getComputedStyle(k).color,tColor:getComputedStyle(t).color,
     cardBg:getComputedStyle(card).backgroundColor,cardAlpha:alpha(getComputedStyle(card).backgroundColor),
     cardIs:card.className,
     bodyExists:!!body, heroFirst:h.previousElementSibling===null};});
 ok('stats view has the ring hero',!!hero&&!hero.broken,hero&&hero.broken?'hero markup incomplete':'no .shero');
 if(hero&&!hero.broken){
   ok('hero reserves its box before the art lands',hero.cls<0.01&&earlyTop===hero.cardTop,
      `CLS ${hero.cls}, card top ${earlyTop} -> ${hero.cardTop}`);
   ok('hero declares the art\u2019s true aspect-ratio',/1694/.test(hero.ar)&&hero.natural==='1694x796',
      `${hero.ar} vs natural ${hero.natural}`);
   ok('hero bleeds to both screen edges',hero.bleedL===0&&hero.bleedR===0,
      `left ${hero.bleedL} right ${hero.bleedR}`);
   ok('caption stays clear of the wrestler',hero.capRightPct<=55,`reaches ${hero.capRightPct}% of width`);
   ok('caption stays in the clear upper band',hero.capBotPct<=38,`reaches ${hero.capBotPct}% of height`);
   ok('stats overlap the artwork',hero.overlapPct>=5,`${hero.overlapPct}%`);
   ok('overlap does not swallow the ring',hero.overlapPct<=25,`${hero.overlapPct}%`);
   ok('the overlapping element is the completion card',/bigstat/.test(hero.cardIs),hero.cardIs);
   ok('overlapping card is fully opaque over the ropes',hero.cardAlpha===1,
      `${hero.cardBg} alpha ${hero.cardAlpha}`);
   ok('hero art is scaled up',hero.scale>1.05&&hero.scale<1.2,'x'+hero.scale);
   // The raised fingertips live in the top 0-5% of the artwork and the mohawk in
   // the 5-10% band, so ANY clipping at the top decapitates him. The bottom 20%
   // is only 4-6% opaque — the turnbuckle post — so that is where the spill goes.
   ok('nothing is clipped off the top of the art',hero.clipTop<=0,
      `${hero.clipTop}px lost at the top`);
   ok('the spill goes off the bottom instead',hero.scale<=1.001||hero.clipBot>0,
      `bottom spill ${hero.clipBot}px`);
   ok('scaling the art did not change its layout box',hero.cls<0.01,'CLS '+hero.cls);
   ok('hero clips its caption if the art fails',hero.overflow==='hidden',hero.overflow);
   ok('renderStats has its own container',hero.bodyExists);
   const field=rgb(await pg.evaluate(()=>getComputedStyle(document.getElementById('field')).backgroundColor));
   const rk=ratio(rgb(hero.kColor),field), rt2=ratio(rgb(hero.tColor),field);
   console.log(`      caption contrast on the field: ${rk.toFixed(2)}:1 / ${rt2.toFixed(2)}:1`);
   ok('caption label readable on the field',rk>=4.5,`${rk.toFixed(2)}:1`);
   ok('caption title readable on the field',rt2>=4.5,`${rt2.toFixed(2)}:1`);
 }
 // a re-render must not wipe the static hero
 await pg.locator('#nav button[data-view="poster"]').click();await pg.waitForTimeout(400);
 await pg.locator('#nav button[data-view="stats"]').click();await pg.waitForTimeout(600);
 ok('hero survives a re-render',await pg.evaluate(()=>!!document.querySelector('.shero img')));
 ok('stats still render below it',await pg.evaluate(()=>
   !!document.querySelector('#statsBody .bigstat .pct')||!!document.querySelector('#v-stats .bigstat .pct')));

 ok('no CSP violations',csp.length===0,csp.slice(0,2).join(' | '));
 ok('no JS errors',errs.length===0,errs.join(' | '));
 await b.close();console.log(`\n=== ${pass} passed, ${fail} failed ===`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
