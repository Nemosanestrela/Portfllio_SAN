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

  const settings = Object.freeze({
    defaults, underlines, limits, fonts, fontLimits, fontIdPattern, fontUploadPath, parseFontLink, fontFamily,
  });

  if (typeof module === 'object' && module.exports) module.exports = settings;
  else window.SanSiteSettings = settings;
})();
