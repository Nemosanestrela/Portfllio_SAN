/* Conteúdo do painel local, com a versão original do HTML como alternativa. */
(() => {
  'use strict';

  const { defaults, underlines, limits, fonts, fontLimits, fontIdPattern, fontUploadPath, parseFontLink, fontFamily } = window.SanSiteSettings;
  const categoryLabels = { brand: 'Brand', ecommerce: 'E-commerce', illustration: 'Ilustração' };
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
  const previewToken = new URLSearchParams(window.location.search).get('preview') || '';
  const isDraftPreview = isLocal && window.parent !== window && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(previewToken);
  let loadedRevision = null;
  let queuedRevision = null;
  let ready = false;
  let reloading = false;

  function localImageSource(value) {
    if (typeof value !== 'string' || !value.trim() || /[\\\u0000-\u001f]/.test(value)) throw new TypeError('Imagem inválida.');
    const source = value.trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) throw new TypeError('A imagem precisa pertencer ao projeto.');
    const resolved = new URL(source, document.baseURI);
    if (resolved.origin !== window.location.origin || !/\.(?:avif|gif|jpe?g|png|webp|svg)$/i.test(resolved.pathname)) {
      throw new TypeError('Formato de imagem inválido.');
    }
    return source;
  }

  function plainText(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  function dimension(value, fallback) {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  }

  function optionalMobileImage(value) {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'mobile')) {
      throw new TypeError('Versão mobile da imagem inválida.');
    }
    return {
      mobile: {
        src: localImageSource(value.src),
        alt: plainText(value.alt),
        width: dimension(value.width, 1080),
        height: dimension(value.height, 1340),
      },
    };
  }

  function safeSocialLink(value, fallback) {
    const source = plainText(value, fallback).trim();
    if (source.length > limits.socialUrl || /[\s\\]/.test(source) || !/^https?:\/\//i.test(source)) return '';
    try {
      const url = new URL(source);
      return url.hostname && !url.username && !url.password ? source : '';
    } catch {
      return '';
    }
  }

  function normalizeSite(value, ids) {
    const choice = (key, allowed) => allowed.includes(value[key]) ? value[key] : defaults[key];
    const color = (key) => typeof value[key] === 'string' && /^#[a-f0-9]{6}$/i.test(value[key]) ? value[key] : defaults[key];
    const toggle = (key) => typeof value[key] === 'boolean' ? value[key] : defaults[key];
    const fontLibrary = normalizeFontLibrary(value.fontLibrary);
    const fontChoices = [...fonts, ...fontLibrary.map((font) => font.id)];
    return {
      accent: color('accent'),
      bodyColor: color('bodyColor'),
      chromeColor: color('chromeColor'),
      contactColor: color('contactColor'),
      marqueeColor: color('marqueeColor'),
      chromeFont: choice('chromeFont', fontChoices),
      bodyFont: choice('bodyFont', fontChoices),
      contactFont: choice('contactFont', fontChoices),
      marqueeFont: choice('marqueeFont', fontChoices),
      fontLibrary,
      headerBlur: toggle('headerBlur'),
      headerFade: toggle('headerFade'),
      footerBlur: toggle('footerBlur'),
      footerFade: toggle('footerFade'),
      intro: choice('intro', ['smooth', 'swarm', 'none']),
      textSpeed: choice('textSpeed', ['fast', 'normal', 'slow']),
      galleryMode: choice('galleryMode', ['free', 'grid']),
      featuredProjectId: ids.has(value.featuredProjectId) ? value.featuredProjectId : null,
      contactTitle: plainText(value.contactTitle).trim().slice(0, limits.contactTitle) || defaults.contactTitle,
      instagram: safeSocialLink(value.instagram, defaults.instagram),
      behance: safeSocialLink(value.behance, defaults.behance),
      footerSignature: plainText(value.footerSignature, defaults.footerSignature).trim().slice(0, limits.footerSignature),
    };
  }

  function normalizeFontLibrary(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.slice(0, fontLimits.count).flatMap((entry) => {
      if (!entry || typeof entry.id !== 'string' || !fontIdPattern.test(entry.id) || seen.has(entry.id)) return [];
      const name = plainText(entry.name).trim().slice(0, fontLimits.name);
      const source = entry.kind === 'upload' && typeof entry.src === 'string' && fontUploadPath.test(entry.src)
        ? { kind: 'upload', src: entry.src }
        : parseFontLink(entry.src);
      if (!name || !source || source.kind !== entry.kind) return [];
      seen.add(entry.id);
      return [{ id: entry.id, name, ...source }];
    });
  }

  function loadGoogleFont(src) {
    return new Promise((resolve) => {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = src;
      const complete = (loaded) => {
        window.clearTimeout(timer);
        stylesheet.onload = stylesheet.onerror = null;
        if (!loaded) stylesheet.remove();
        resolve();
      };
      const timer = window.setTimeout(() => complete(false), 1600);
      stylesheet.onload = () => complete(true);
      stylesheet.onerror = () => complete(false);
      document.head.append(stylesheet);
    });
  }

  function registerSelectedFonts(site) {
    if (!site) return Promise.resolve();
    const selected = new Set([site.chromeFont, site.bodyFont, site.contactFont, site.marqueeFont]);
    const stylesheets = new Set();
    for (const font of site.fontLibrary) {
      if (!selected.has(font.id)) continue;
      if (font.kind === 'google') {
        stylesheets.add(font.src);
      } else if (typeof FontFace === 'function' && document.fonts) {
        const face = new FontFace(fontFamily(font.id, site.fontLibrary), `url(${JSON.stringify(font.src)})`, { weight: '100 900', display: 'swap' });
        document.fonts.add(face);
      }
    }
    return Promise.all(Array.from(stylesheets, loadGoogleFont));
  }

  function normalizeContent(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.projects) || !value.about || !value.about.photo) {
      throw new TypeError('Arquivo de conteúdo inválido.');
    }
    const ids = new Set();
    const projects = value.projects.map((item) => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Object.hasOwn(categoryLabels, item.category)) {
        throw new TypeError('Projeto inválido.');
      }
      ids.add(item.id);
      const title = plainText(item.title);
      if (Object.hasOwn(item, 'images') && (!Array.isArray(item.images) || item.images.length > 30)) {
        throw new TypeError('Imagens do projeto inválidas.');
      }
      return {
        id: item.id,
        src: localImageSource(item.src),
        category: item.category,
        categoryLabel: plainText(item.categoryLabel, categoryLabels[item.category]),
        title,
        alt: plainText(item.alt, title),
        hidden: item.hidden === true,
        width: dimension(item.width, 1080),
        height: dimension(item.height, 1340),
        ...optionalMobileImage(item.mobile),
        images: (item.images || []).map((image) => {
          if (!image || typeof image !== 'object') throw new TypeError('Imagem do projeto inválida.');
          return {
            src: localImageSource(image.src),
            alt: plainText(image.alt),
            width: dimension(image.width, 1080),
            height: dimension(image.height, 1340),
            ...optionalMobileImage(image.mobile),
          };
        }),
      };
    });
    return {
      version: 1,
      revision: plainText(value.revision),
      projects,
      ...(value.site && typeof value.site === 'object' && !Array.isArray(value.site) ? { site: normalizeSite(value.site, ids) } : {}),
      about: {
        firstText: plainText(value.about.firstText),
        lastText: plainText(value.about.lastText),
        firstName: plainText(value.about.firstName, 'RAFAEL'),
        lastName: plainText(value.about.lastName, 'SAN'),
        firstUnderline: plainText(value.about.firstUnderline, underlines.firstUnderline).slice(0, limits.underline),
        lastUnderline: plainText(value.about.lastUnderline, underlines.lastUnderline).slice(0, limits.underline),
        photo: {
          src: localImageSource(value.about.photo.src),
          alt: plainText(value.about.photo.alt),
          width: dimension(value.about.photo.width, 1932),
          height: dimension(value.about.photo.height, 1179),
        },
      },
    };
  }

  function paragraphNodes(text) {
    const fragment = document.createDocumentFragment();
    for (const paragraph of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
      const element = document.createElement('p');
      const bold = /\*\*([\s\S]+?)\*\*/g;
      let offset = 0;
      let match;
      while ((match = bold.exec(paragraph))) {
        element.append(document.createTextNode(paragraph.slice(offset, match.index)));
        const strong = document.createElement('strong');
        strong.textContent = match[1];
        element.append(strong);
        offset = bold.lastIndex;
      }
      element.append(document.createTextNode(paragraph.slice(offset)));
      fragment.append(element);
    }
    return fragment;
  }

  function replaceCopy(selector, text) {
    const block = document.querySelector(selector);
    if (!block) return;
    // Keep the existing contact link and any controls attached to the block.
    const controls = Array.from(block.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'P');
    block.replaceChildren(paragraphNodes(text), ...controls);
  }

  async function applyContent(content) {
    window.SAN_PROJECTS = content.projects.filter((project) => !project.hidden);
    window.SAN_CONTENT = content;
    window.SAN_CONTENT_REVISION = content.revision;
    replaceCopy('.about-copy-first', content.about.firstText);
    replaceCopy('.about-copy-last', content.about.lastText);
    document.querySelectorAll('.about-marquee-group').forEach((group) => {
      const firstName = group.querySelector('span.about-marquee-word');
      const lastName = group.querySelector('strong.about-marquee-word');
      const image = group.querySelector('.about-hover-photo img');
      if (firstName) firstName.textContent = content.about.firstName;
      if (lastName) lastName.textContent = content.about.lastName;
      if (image) {
        image.src = content.about.photo.src;
        image.alt = content.about.photo.alt;
        image.width = content.about.photo.width;
        image.height = content.about.photo.height;
      }
    });
    const fullName = `${content.about.firstName} ${content.about.lastName}`.trim();
    const aboutTitle = document.getElementById('aboutTitle');
    const marquee = document.getElementById('aboutMarquee');
    if (aboutTitle && fullName) aboutTitle.textContent = fullName;
    if (marquee && fullName) marquee.setAttribute('aria-label', `Mostrar ou ocultar o retrato de ${fullName}`);
    await registerSelectedFonts(content.site);
  }

  function receiveSavedRevision(revision) {
    if (typeof revision !== 'string' || !revision || revision === loadedRevision || reloading) return;
    if (!ready) {
      queuedRevision = revision;
      return;
    }
    reloading = true;
    // Reload keeps the current section hash and reinitializes the gallery safely.
    window.location.reload();
  }

  // Remote visitors use the saved static JSON; live refresh belongs to the local panel.
  if (isLocal && !isDraftPreview) {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel('san-content');
      channel.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'saved') receiveSavedRevision(event.data.revision);
      });
      window.addEventListener('pagehide', () => channel.close(), { once: true });
    }
    window.addEventListener('storage', (event) => {
      if (event.key === 'san-content-revision') receiveSavedRevision(event.newValue);
    });
  }

  window.sanContentReady = (async () => {
    if (isDraftPreview) {
      try {
        const snapshot = window.sessionStorage.getItem(`san-preview:${previewToken}`);
        const content = normalizeContent(JSON.parse(snapshot));
        await applyContent(content);
        window.parent.postMessage({ type: 'san-preview-result', token: previewToken, ok: true }, window.location.origin);
        return content;
      } catch (error) {
        window.parent.postMessage({ type: 'san-preview-result', token: previewToken, ok: false }, window.location.origin);
        console.warn('A prévia do rascunho não pôde ser carregada.', error);
        return null;
      }
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(new URL('assets/content.json', document.baseURI), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Conteúdo indisponível (${response.status}).`);
      const content = normalizeContent(await response.json());
      await applyContent(content);
      loadedRevision = content.revision;
      return content;
    } catch (error) {
      console.warn('O conteúdo editável não foi carregado. A versão original do portfólio será usada.', error);
      return null;
    } finally {
      window.clearTimeout(timeout);
      ready = true;
      if (queuedRevision) receiveSavedRevision(queuedRevision);
    }
  })();
})();
