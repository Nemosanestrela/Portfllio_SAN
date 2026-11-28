(() => {
  'use strict';

  const defaults = Object.freeze({
    accent: '#1106ec',
    bodyColor: null,
    chromeColor: '#ffffff',
    contactColor: '#ffffff',
    marqueeColor: null,
    chromeFont: 'Anton',
    bodyFont: 'Inter',
    contactFont: 'Anton',
    marqueeFont: 'Inter',
    chromeScale: 100,
    bodyScale: 100,
    contactScale: 100,
    marqueeScale: 100,
    fontLibrary: Object.freeze([]),
    headerBlur: true,
    headerFade: true,
    footerBlur: true,
    footerFade: true,
    intro: 'smooth',
    textSpeed: 'normal',
    galleryMode: 'free',
    featuredProjectId: null,
    contactTitle: 'TEM UM PROJETO LEGAL?\nME MANDA UM OI!',
    contactAlign: 'center',
    contactUnderline: 'me manda um oi',
    typography:normalizeTypography(),
    lab:normalizeLab(),
    instagram: 'https://www.instagram.com/nemosanestrela',
    behance: '',
    footerSignature: '©SAN 2026',
  });

  const underlines = Object.freeze({
    firstUnderline: 'Para mim, criar é um processo de descoberta, uma maneira de traduzir pensamentos, referências e experiências em algo visual',
    lastUnderline: 'uma mistura de experiências, influências e um desejo constante de continuar explorando o novo',
  });

  const limits = Object.freeze({ contactTitle: 160, socialUrl: 2048, footerSignature: 100, underline: 12000 });
  const fonts = Object.freeze(['Anton', 'Inter']);
  const fontLimits = Object.freeze({ count: 30, name: 80, url: 2048, bytes: 10 * 1024 * 1024 });
  const fontIdPattern = /^font-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  const fontUploadPath = /^assets\/fonts\/uploads\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(?:woff2?|ttf|otf)$/i;
  const fontNamePattern = /^[\p{L}\p{N} _-]{1,80}$/u;

  function parseFontLink(value) {
    if (typeof value !== 'string') return null;
    const source = value.trim();
    if (!source || source.length > fontLimits.url || /[\s\\]/.test(source)) return null;
    try {
      let url = new URL(source);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      url.hash = '';
      if (url.origin === 'https://fonts.google.com') {
        const specimen = url.pathname.match(/^\/specimen\/([^/]+)\/?$/);
        if (!specimen) return null;
        const family = decodeURIComponent(specimen[1]).replace(/\+/g, ' ');
        if (!fontNamePattern.test(family)) return null;
        url = new URL('https://fonts.googleapis.com/css2');
        url.searchParams.set('family', family);
      }
      if (url.origin === 'https://fonts.googleapis.com') {
        const families = url.searchParams.getAll('family');
        if (!['/css', '/css2'].includes(url.pathname) || families.length !== 1) return null;
        const family = families[0].split(':')[0].trim();
        if (!fontNamePattern.test(family)) return null;
        if (!url.searchParams.has('display')) url.searchParams.set('display', 'swap');
        return url.href.length <= fontLimits.url ? { kind: 'google', src: url.href, family } : null;
      }
      if (!/\.(?:woff2?|ttf|otf)$/i.test(url.pathname) || url.href.length > fontLimits.url) return null;
      return { kind: 'link', src: url.href };
    } catch {
      return null;
    }
  }

  function fontFamily(key, library = []) {
    if (fonts.includes(key)) return key;
    const entry = library.find((font) => font.id === key);
    if (!entry) return undefined;
    return entry.kind === 'google' ? entry.family : `SAN ${entry.id}`;
  }

  function normalizeRanges(ranges,length){
    const result=[];
    for(const item of (Array.isArray(ranges)?ranges:[]).filter(r=>r&&Number.isInteger(r.start)&&Number.isInteger(r.end)).map(r=>({start:Math.max(0,Math.min(length,r.start)),end:Math.max(0,Math.min(length,r.end))})).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start||a.end-b.end)){
      const last=result.at(-1);if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);else result.push(item);
    }return result;
  }
  function plainTextMap(text){
    const skip=new Set();for(const match of text.matchAll(/\*\*([\s\S]+?)\*\*/g)){skip.add(match.index);skip.add(match.index+1);skip.add(match.index+match[0].length-2);skip.add(match.index+match[0].length-1);}
    let plain='';const offsets=[];for(let i=0;i<text.length;i++)if(!skip.has(i)){offsets.push(i);plain+=text[i];}return {plain,offsets};
  }
  function legacyRanges(text,phrase,ignoreCase=false){
    if(!phrase)return [];const {plain,offsets}=plainTextMap(text);let normalized='';const map=[];
    for(let i=0;i<plain.length;i++){if(/\s/.test(plain[i])){if(!normalized||normalized.endsWith(' '))continue;normalized+=' ';}else normalized+=plain[i];map.push(offsets[i]);}
    const target=String(phrase).replace(/\s+/g,' ').trim(),start=(ignoreCase?normalized.toLocaleLowerCase():normalized).indexOf(ignoreCase?target.toLocaleLowerCase():target);
    return start>=0&&target?[{start:map[start],end:map[start+target.length-1]+1}]:[];
  }
  function rebaseRanges(before,after,ranges){
    let prefix=0;while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix])prefix++;
    let end=before.length,nextEnd=after.length;while(end>prefix&&nextEnd>prefix&&before[end-1]===after[nextEnd-1]){end--;nextEnd--;}
    const shift=nextEnd-end;return normalizeRanges(normalizeRanges(ranges,before.length).map(r=>r.end<=prefix?r:r.start>=end?{start:r.start+shift,end:r.end+shift}:{start:r.start<prefix?r.start:prefix,end:r.end>end?r.end+shift:nextEnd}),after.length);
  }
  function trimRanges(text,ranges){const raw=text.replace(/\r\n?/g,'\n'),offset=raw.length-raw.trimStart().length;return normalizeRanges(normalizeRanges(ranges,raw.length).map(r=>({start:r.start-offset,end:r.end-offset})),raw.trim().length);}
  function renderedRanges(text,ranges,single=false){
    const result=[],parts=[];if(single)parts.push({text,start:0});else{let start=0;for(const separator of text.matchAll(/\n\s*\n/g)){parts.push({text:text.slice(start,separator.index),start});start=separator.index+separator[0].length;}parts.push({text:text.slice(start),start});}
    let paragraph=0;for(const part of parts){const value=single?part.text:part.text.trim();if(!value)continue;const base=part.start+(single?0:part.text.length-part.text.trimStart().length),{offsets}=plainTextMap(value);
      for(const range of normalizeRanges(ranges,text.length)){const start=offsets.filter(index=>base+index<range.start).length,end=offsets.filter(index=>base+index<range.end).length;if(end>start)result.push({paragraph,start,end});}paragraph++;
    }return result;
  }
  const textFormatting=Object.freeze({normalizeRanges,plainTextMap,legacyRanges,rebaseRanges,trimRanges,renderedRanges});
  function normalizeTypography(value){
    const output={};for(const device of ['desktop','mobile']){output[device]={};for(const role of ['chrome','body','contact','marquee']){const item=value?.[device]?.[role]||{};output[device][role]={lineHeight:Number.isFinite(item.lineHeight)&&item.lineHeight>=50&&item.lineHeight<=220?item.lineHeight:100,letterSpacing:Number.isFinite(item.letterSpacing)&&item.letterSpacing>=-.15&&item.letterSpacing<=.5?item.letterSpacing:0,fontWeight:Number.isInteger(item.fontWeight)&&item.fontWeight>=100&&item.fontWeight<=900?item.fontWeight:null};}}return output;
  }
  function normalizeLab(value){
    const number=(key,min,max,fallback)=>Number.isFinite(value?.[key])&&value[key]>=min&&value[key]<=max?value[key]:fallback;
    return {enabled:value?.enabled===true,margins:number('margins',50,200,100),spacing:number('spacing',50,200,100),coverSize:number('coverSize',60,150,100),radius:number('radius',0,80,24)};
  }
  function applyDesktopLab(value){
    const config=normalizeLab(value);
    document.getElementById('san-desktop-lab')?.remove();
    if(!config.enabled)return;
    const style=document.createElement('style');style.id='san-desktop-lab';
    const margins=config.margins/100,spacing=config.spacing/100;
    style.textContent=`@media(min-width:769px){
      :root{--gutter:clamp(${24*margins}px,${3.333*margins}vw,${64*margins}px);--radius:${config.radius}px}
      .is-grid .gallery-plane{gap:${67.2*spacing}px ${44.8*spacing}px}
      .about-photo{margin-block:clamp(${44*spacing}px,${5*spacing}vw,${84*spacing}px)}
      .about-copy p{margin-bottom:${22*spacing}px}
      .contact-layout{gap:clamp(${72*spacing}px,${7*spacing}vw,${112*spacing}px)}
    }`;
    document.head.append(style);
  }
  function applyTypography(value){
    const config=normalizeTypography(value),selectors={chrome:'.site-header,.site-header a,.site-header button,.mobile-nav,.mobile-nav a,.site-footer,.site-footer a,.view-switch,.view-switch button,.filters,.filters button',body:'.gallery-hint,.gallery-meta,.viewer-cat,.viewer-title,.viewer-info-card,.about-copy p,.about-roles,.contact-form label,.contact-form input,.contact-form textarea,.contact-form button,.contact-status',contact:'.contact-title',marquee:'.about-marquee-track'};
    if(!Object.values(config).some(device=>Object.values(device).some(v=>v.lineHeight!==100||v.letterSpacing!==0||v.fontWeight!==null)))return {destroy(){}};
    const originals=new Map(),mobile=matchMedia('(max-width:768px)');let frame=0,dead=false;
    function sync(){frame=0;if(dead)return;for(const [el,style] of originals)if(el.isConnected)for(const key of ['lineHeight','letterSpacing','fontWeight'])el.style[key]=style[key];const records=[];
      for(const [role,selector] of Object.entries(selectors))for(const el of document.querySelectorAll(selector)){if(!originals.has(el))originals.set(el,Object.fromEntries(['lineHeight','letterSpacing','fontWeight'].map(key=>[key,el.style[key]])));const css=getComputedStyle(el);records.push({el,role,lineHeight:parseFloat(css.lineHeight)||parseFloat(css.fontSize)*1.2,spacing:parseFloat(css.letterSpacing)||0,size:parseFloat(css.fontSize)});}
      for(const record of records){const choice=config[mobile.matches?'mobile':'desktop'][record.role],{el}=record;if(choice.lineHeight!==100)el.style.lineHeight=record.lineHeight*choice.lineHeight/100+'px';if(choice.letterSpacing!==0)el.style.letterSpacing=record.spacing+record.size*choice.letterSpacing+'px';if(choice.fontWeight!==null)el.style.fontWeight=choice.fontWeight;}
    }
    const schedule=()=>{if(!frame&&!dead)frame=requestAnimationFrame(sync);};const observer=new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length||record.removedNodes.length))schedule();});observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',schedule);mobile.addEventListener('change',schedule);document.fonts?.ready.then(schedule);sync();return {destroy(){dead=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);mobile.removeEventListener('change',schedule);for(const [el,style] of originals)for(const key of ['lineHeight','letterSpacing','fontWeight'])el.style[key]=style[key];}};
  }
  const settings = Object.freeze({
    defaults, underlines, limits, fonts, fontLimits, fontIdPattern, fontUploadPath, parseFontLink, fontFamily,textFormatting,normalizeTypography,applyTypography,normalizeLab,applyDesktopLab,
  });

  if (typeof module === 'object' && module.exports) module.exports = settings;
  else window.SanSiteSettings = settings;
})();
