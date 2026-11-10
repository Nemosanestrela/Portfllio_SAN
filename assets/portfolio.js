/* SAN — navegação, painéis e visualização das imagens. */
(() => {
  'use strict';

  const initialize = () => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const body = document.body;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const header = $('#siteHeader');
    const footer = $('#siteFooter');
    const galleryRoot = $('#galleryViewport');
    const tools = $$('.gallery-tools');
    const filterDisclosure = $('#filterDisclosure');
    const filterToggle = $('#filterToggle');
    const filterOptions = $('#filterOptions');
    const mobileNav = $('#mobileNav');
    const burger = $('#burgerBtn');
    const aboutPanel = $('#aboutPanel');
    const contactPanel = $('#contactPanel');
    const panels = [aboutPanel, contactPanel].filter(Boolean);
    const navLinks = $$('[data-view]');
    const projects = Array.isArray(window.SAN_PROJECTS) ? window.SAN_PROJECTS : [];
    const site = window.SAN_CONTENT?.site;
    const siteSettings = window.SanSiteSettings;
    const settings = site || siteSettings?.defaults || {};
    const familyFor = (key, fallback) => siteSettings?.fontFamily?.(settings[key], settings.fontLibrary) || fallback;
    const bodyFamily = familyFor('bodyFont', 'Inter');
    const introMode = new URLSearchParams(location.search).get('intro') === 'swarm' ? 'swarm' : settings.intro;
    const panelClosures = new Map();
    const state = { view: null, category: 'all', mode: settings.galleryMode === 'grid' ? 'grid' : 'free', menuOpen: false, filtersOpen: false, interacted: false };
    let gallery = null;
    let resizeFrame = 0;
    let panelFocusFrame = 0;
    const intro = { complete: false, token: 0, firstFrame: 0, secondFrame: 0, decodeTimer: 0, hintTimer: 0, chromeTimer: 0, finishDecodeWait: null, finishHintWait: null };
    const swarmPreview = introMode === 'swarm';
    let visitedProjects = false;
    let stopSwarm = null;

    const root = document.documentElement;
    const isColor = (color) => /^#[a-f\d]{6}$/i.test(color);
    const luminance = (color) => {
      const [red, green, blue] = color.slice(1).match(/../g).map((pair) => {
        const channel = parseInt(pair, 16) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * red + .7152 * green + .0722 * blue;
    };
    if (site) {
      const colors = {
        '--body-color': site.bodyColor,
        '--chrome-color': site.chromeColor?.toLowerCase() === '#ffffff' ? null : site.chromeColor,
        '--contact-color': site.contactColor,
        '--marquee-color': site.marqueeColor,
        '--accent': site.accent,
      };
      for (const [property, value] of Object.entries(colors)) {
        if (isColor(value)) root.style.setProperty(property, value);
      }
      if (isColor(site.accent)) root.style.setProperty('--accent-ink', luminance(site.accent) > .179 ? '#000' : '#fff');
      const fonts = {
        '--body-font': bodyFamily,
        '--chrome-font': familyFor('chromeFont', 'Anton'),
        '--contact-font': familyFor('contactFont', 'Anton'),
        '--marquee-font': familyFor('marqueeFont', 'Inter'),
      };
      for (const [property, family] of Object.entries(fonts)) {
        root.style.setProperty(property, CSS.escape(family));
      }
      root.classList.toggle('no-header-blur', site.headerBlur === false);
      root.classList.toggle('no-header-fade', site.headerFade === false);
      root.classList.toggle('no-footer-blur', site.footerBlur === false);
      root.classList.toggle('no-footer-fade', site.footerFade === false);
    }
    if (introMode === 'none') body.classList.add('has-instant-intro');
    const contactTitle = $('#contactTitle');
    if (contactTitle && typeof site?.contactTitle === 'string') contactTitle.textContent = site.contactTitle;
    const footerSignature = $('#footerSignature');
    if (footerSignature && typeof site?.footerSignature === 'string') footerSignature.textContent = site.footerSignature;
    $$('[data-social-link]').forEach((link) => {
      const url = site?.[link.dataset.socialLink];
      if (typeof url !== 'string') return;
      if (/^https?:\/\//i.test(url)) {
        link.href = url;
        link.removeAttribute('data-placeholder');
      } else {
        link.hidden = true;
      }
    });

    const viewer = $('#imageViewer');
    const viewerStage = $('#viewerStage');
    const viewerProject = $('#viewerProject');
    const viewerProjectImages = $('#viewerProjectImages');
    const viewerImage = $('#viewerImage');
    const viewerInfo = $('#viewerInfo');
    const viewerDescription = $('#viewerDescription');
    const viewerDescriptionDisclosure = $('#viewerDescriptionDisclosure');
    const viewerDescriptionToggle = $('#viewerDescriptionToggle');
    const viewerDescriptionPanel = $('#viewerDescriptionPanel');
    const viewerBottom = $('.viewer-bottom', viewer);
    const viewerClose = $('#viewerClose');
    const viewerTitle = $('#viewerTitle');
    const viewerCategory = $('#viewerCategory');
    let viewerDescriptionHideTimer = 0;
    const imageForViewport = window.SanResponsiveImage.select;
    const viewerTiming = { open: 500, detailsOut: 160, close: 400 };
    viewer.style.setProperty('--viewer-cover-duration', `${viewerTiming.open}ms`);
    viewer.style.setProperty('--viewer-details-out-duration', `${viewerTiming.detailsOut}ms`);
    viewer.style.setProperty('--viewer-return-duration', `${viewerTiming.close}ms`);
    // Keep the description attached to its fixed toggle while the album scrolls.
    if (viewerDescriptionDisclosure && viewerDescriptionPanel) {
      viewerDescriptionDisclosure.append(viewerDescriptionPanel);
      viewerDescriptionPanel.hidden = true;
    }
    const lightbox = {
      open: false,
      closing: false,
      descriptionOpen: false,
      item: null,
      layoutWidth: 0,
      layoutPixelRatio: 1,
      token: 0,
      animation: null,
      returnFocus: null,
      sourceImage: null,
      sourceVisibility: '',
      origin: null,
      mobile: window.SanResponsiveImage.isMobile(),
    };

    const focusable = (root) => $$('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter((element) => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
    const focusWithoutScroll = (element) => {
      if (element && typeof element.focus === 'function' && element.isConnected && !element.closest('[hidden], [inert]')) {
        element.focus({ preventScroll: true });
      }
    };
    const setInert = (element, value) => {
      if (element) element.inert = value;
    };

    function syncGalleryAvailability() {
      const covered = state.view !== 'projects' || lightbox.open || state.menuOpen;
      const returningToGallery = lightbox.closing && state.view === 'projects' && !state.menuOpen;
      if (covered && state.filtersOpen) setFiltersOpen(false);
      setInert(galleryRoot, covered);
      tools.forEach((element) => {
        element.hidden = covered && !returningToGallery;
        element.inert = covered;
      });
      if (gallery) gallery.setPaused(covered || document.hidden);
      panels.forEach((panel) => {
        panel.inert = !panel.classList.contains('is-open') || state.menuOpen || lightbox.open;
      });
      setInert(header, lightbox.open);
      setInert(footer, lightbox.open || state.menuOpen);
    }

    function setFiltersOpen(open, { restoreFocus = false, focusActive = false } = {}) {
      if (!filterDisclosure || !filterToggle || !filterOptions) return;
      state.filtersOpen = Boolean(open && state.view === 'projects' && !state.menuOpen && !lightbox.open);
      filterDisclosure.classList.toggle('is-open', state.filtersOpen);
      filterToggle.setAttribute('aria-expanded', String(state.filtersOpen));
      const active = $('[data-filter][aria-pressed="true"]', filterOptions);
      const categoryLabel = active ? active.textContent.trim() : 'Todos';
      filterToggle.setAttribute('aria-label', state.filtersOpen ? 'Fechar filtros' : `Filtrar projetos: ${categoryLabel}`);
      filterOptions.inert = !state.filtersOpen;
      filterOptions.setAttribute('aria-hidden', String(!state.filtersOpen));
      if (state.filtersOpen && focusActive) focusWithoutScroll(active || $('[data-filter]', filterOptions));
      else if (!state.filtersOpen && restoreFocus) focusWithoutScroll(filterToggle);
    }

    function setMobileMenu(open, restoreFocus = false) {
      setFiltersOpen(false);
      state.menuOpen = Boolean(open && !lightbox.open);
      if (mobileNav) {
        mobileNav.classList.toggle('open', state.menuOpen);
        mobileNav.inert = !state.menuOpen;
        mobileNav.setAttribute('aria-hidden', String(!state.menuOpen));
      }
      if (burger) {
        burger.classList.toggle('open', state.menuOpen);
        burger.setAttribute('aria-expanded', String(state.menuOpen));
        burger.setAttribute('aria-label', state.menuOpen ? 'Fechar menu' : 'Abrir menu');
      }
      if (header) header.classList.toggle('is-menu-open', state.menuOpen);
      body.classList.toggle('menu-is-open', state.menuOpen);
      syncGalleryAvailability();
      if (restoreFocus && !state.menuOpen) focusWithoutScroll(burger);
    }

    function cancelPanelClosure(panel) {
      const cancel = panelClosures.get(panel);
      if (cancel) cancel();
    }

    function setPanelVisible(panel, visible) {
      if (!panel) return;
      cancelPanelClosure(panel);
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      panel.style.pointerEvents = visible ? '' : 'none';
      if (visible) {
        panel.hidden = false;
        // Flush the hidden state before starting the entrance transition.
        void panel.offsetWidth;
        panel.classList.add('is-open');
        return;
      }
      panel.classList.remove('is-open');
      if (panel.hidden || reducedMotion.matches) {
        panel.hidden = true;
        return;
      }
      let timer;
      const cancel = () => {
        clearTimeout(timer);
        panel.removeEventListener('transitionend', complete);
        panelClosures.delete(panel);
      };
      const complete = (event) => {
        if (event && (event.target !== panel || !['opacity', 'transform'].includes(event.propertyName))) return;
        cancel();
        if (!panel.classList.contains('is-open')) panel.hidden = true;
      };
      panelClosures.set(panel, cancel);
      panel.addEventListener('transitionend', complete);
      timer = setTimeout(complete, 700);
    }

    function applyView(view, { focus = false } = {}) {
      if (!['projects', 'about', 'contact'].includes(view)) view = 'projects';
      if (view !== 'projects') {
        stopSwarm?.();
        completePageIntro();
      }
      setMobileMenu(false);
      if (lightbox.open) closeViewer({ immediate: true, restoreFocus: false });
      state.view = view;
      body.dataset.view = view;
      body.classList.toggle('panel-is-open', view !== 'projects');
      setPanelVisible(aboutPanel, view === 'about');
      setPanelVisible(contactPanel, view === 'contact');
      navLinks.forEach((link) => {
        if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      syncGalleryAvailability();
      const panel = view === 'about' ? aboutPanel : view === 'contact' ? contactPanel : null;
      if (view === 'projects' && !visitedProjects) {
        visitedProjects = true;
        if (swarmPreview && intro.complete && !reducedMotion.matches) startGallerySwarm();
      }
      cancelAnimationFrame(panelFocusFrame);
      if (focus) {
        panelFocusFrame = requestAnimationFrame(() => {
          if (view !== state.view) return;
          const target = panel ? ($('[data-panel-focus], h1, h2', panel) || panel) : galleryRoot;
          if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          focusWithoutScroll(target);
        });
      }
      if (view === 'contact') requestAnimationFrame(resizeMessage);
    }

    const viewFromHash = () => {
      const hash = window.location.hash.toLowerCase();
      return hash === '#eu' ? 'about' : hash === '#contato' ? 'contact' : 'projects';
    };
    function navigateTo(view, { replace = false, focus = true } = {}) {
      const hash = view === 'about' ? '#eu' : view === 'contact' ? '#contato' : '#projetos';
      if (location.hash !== hash) {
        history[replace ? 'replaceState' : 'pushState']({ sanView: view }, '', hash);
      }
      applyView(view, { focus });
    }

    navLinks.forEach((link) => link.addEventListener('click', (event) => {
      if (event.button && event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateTo(link.dataset.view);
    }));
    $$('[data-close-panel]').forEach((button) => button.addEventListener('click', () => navigateTo('projects')));
    if (burger) burger.addEventListener('click', () => setMobileMenu(!state.menuOpen));
    if (filterToggle) {
      filterToggle.addEventListener('click', () => setFiltersOpen(!state.filtersOpen));
      filterToggle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault();
        setFiltersOpen(true, { focusActive: true });
      });
    }
    document.addEventListener('click', (event) => {
      if (!state.filtersOpen || filterDisclosure.contains(event.target)) return;
      const restoreFocus = filterOptions.contains(document.activeElement);
      setFiltersOpen(false, { restoreFocus });
    });
    $$('[data-placeholder]').forEach((link) => link.addEventListener('click', (event) => event.preventDefault()));
    const onHistory = () => {
      const view = viewFromHash();
      if (view !== state.view || state.menuOpen || lightbox.open) applyView(view);
    };
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);

    function updateGalleryHint() {
      const hint = $('#galleryHint');
      if (!hint) return;
      const text = state.mode === 'free' ? 'Arraste para explorar · clique para ampliar' : 'Role para explorar · clique para ampliar';
      const label = $('#galleryHintText', hint);
      if (label) {
        if (label.textContent !== text) label.textContent = text;
      } else {
        // Preserve the directional SVG even while the HTML is being refreshed.
        const textNode = Array.from(hint.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (textNode) textNode.textContent = text;
      }
      hint.classList.toggle('is-hidden', intro.complete);
    }
    function onGalleryChange(payload = {}) {
      if (payload.interacted) state.interacted = true;
      updateGalleryHint();
    }
    $$('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      const category = button.dataset.filter;
      if (!['all', 'brand', 'ecommerce', 'illustration'].includes(category)) return;
      if (category !== state.category) {
        state.category = category;
        $$('[data-filter]').forEach((other) => other.setAttribute('aria-pressed', String(other.dataset.filter === category)));
        if (gallery) gallery.setCategory(category);
      }
      setFiltersOpen(false, { restoreFocus: true });
    }));
    $$('[data-gallery-mode]').forEach((button) => button.addEventListener('click', () => {
      const mode = button.dataset.galleryMode;
      if (!['free', 'grid'].includes(mode) || mode === state.mode) return;
      state.mode = mode;
      $$('[data-gallery-mode]').forEach((other) => other.setAttribute('aria-pressed', String(other.dataset.galleryMode === mode)));
      if (gallery) gallery.setMode(mode);
      updateGalleryHint();
    }));

    function resolveGalleryItem(candidate) {
      if (candidate && candidate.item) candidate = candidate.item;
      if (candidate && typeof candidate === 'object' && candidate.src) return candidate;
      return projects.find((item) => String(item.id) === String(candidate)) || null;
    }
    function getCard(item) {
      if (!gallery || !item || typeof gallery.getVisibleCard !== 'function') return null;
      return gallery.getVisibleCard(item.id);
    }
    function cardIsVisible(card) {
      if (!card || !card.rect) return false;
      const rect = card.rect;
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    }
    function currentOrigin() {
      const origin = lightbox.origin;
      if (origin && origin.image && origin.image.isConnected) {
        const source = origin.radius === 0 ? origin.image : origin.media || origin.image;
        const refreshed = { ...origin, rect: source.getBoundingClientRect() };
        if (cardIsVisible(refreshed)) return refreshed;
      }
      return getCard(lightbox.item);
    }
    function restoreSource() {
      if (lightbox.sourceImage && lightbox.sourceImage.isConnected) {
        lightbox.sourceImage.style.visibility = lightbox.sourceVisibility;
      }
      lightbox.sourceImage = null;
      lightbox.sourceVisibility = '';
    }
    function concealSource(card) {
      restoreSource();
      if (card && card.image) {
        lightbox.sourceImage = card.image;
        lightbox.sourceVisibility = card.image.style.visibility;
        card.image.style.visibility = 'hidden';
      }
    }
    function imageDimensions(item = lightbox.item) {
      const image = imageForViewport(item);
      const width = Number(image.width) || viewerImage.naturalWidth || 1080;
      const height = Number(image.height) || viewerImage.naturalHeight || 1340;
      return { width, height };
    }
    function syncViewerMetadata() {
      if (!viewerInfo || !viewerProject || !viewerStage) return;
      if (document.documentElement.clientWidth <= 768) viewerProject.prepend(viewerInfo);
      else viewerStage.after(viewerInfo);
    }
    function layoutViewerDescription() {
      if (!viewerDescriptionPanel || !lightbox.descriptionOpen) return;
      const button = viewerDescriptionToggle.getBoundingClientRect();
      const disclosure = viewerDescriptionDisclosure.getBoundingClientRect();
      const close = viewerClose.getBoundingClientRect();
      const small = document.documentElement.clientWidth <= 768;
      const gap = small ? 12 : 16;
      const safeTop = Math.max(24, close.bottom + 24);
      const controlsTop = viewerBottom.getBoundingClientRect().top;
      const availableHeight = Math.max(0, controlsTop - 24 - safeTop);
      viewerDescriptionPanel.style.maxHeight = `${Math.max(60, availableHeight)}px`;
      const height = viewerDescriptionPanel.offsetHeight;
      const viewportTop = Math.max(safeTop, Math.min(button.top + button.height / 2 - height / 2, controlsTop - 24 - height));
      viewerDescriptionPanel.style.right = `calc(100% + ${gap}px)`;
      viewerDescriptionPanel.style.top = `${viewportTop - disclosure.top}px`;
    }
    function fittedRect() {
      syncViewerMetadata();
      const { width, height } = imageDimensions();
      const viewportWidth = document.documentElement.clientWidth;
      const stacked = viewportWidth <= 768;
      const margin = stacked ? 24 : Math.min(96, Math.max(40, viewportWidth * .04));
      const gap = stacked ? 28 : Math.min(80, Math.max(48, viewportWidth * .035));
      const infoWidth = stacked ? viewportWidth - margin * 2 : Math.min(260, Math.max(160, viewportWidth * .16));
      viewer.style.setProperty('--viewer-info-left', `${margin}px`);
      viewer.style.setProperty('--viewer-info-width', `${infoWidth}px`);
      const topInset = Math.max(margin, viewerClose.getBoundingClientRect().bottom + 24);
      viewer.style.setProperty('--viewer-info-top', `${topInset}px`);
      const infoHeight = viewerInfo ? viewerInfo.getBoundingClientRect().height : 0;
      const imageTopLimit = topInset + (stacked ? infoHeight + gap : 0);
      const controlsTop = viewerBottom ? viewerBottom.getBoundingClientRect().top : innerHeight - margin - 36;
      const verticalGap = stacked ? 28 : 24;
      const bottomInset = Math.max(margin, innerHeight - controlsTop + verticalGap);
      const availableWidth = Math.max(1, viewportWidth - 2 * (margin + (stacked ? 0 : infoWidth + gap)));
      // One source pixel should never be stretched across multiple screen pixels.
      const nativeScale = 1 / (window.devicePixelRatio || 1);
      lightbox.layoutWidth = viewportWidth;
      lightbox.layoutPixelRatio = window.devicePixelRatio || 1;
      viewer.style.setProperty('--viewer-project-width', `${availableWidth}px`);
      viewer.style.setProperty('--viewer-project-bottom', `${bottomInset + 24}px`);
      viewer.style.setProperty('--viewer-native-scale', nativeScale);
      // Fit the cover inside a stable frame with space for the viewer chrome.
      const frameTop = stacked ? imageTopLimit : Math.max(imageTopLimit, bottomInset);
      const availableHeight = Math.max(1, innerHeight - frameTop - (stacked ? bottomInset : frameTop));
      const scale = Math.min(availableWidth / width, availableHeight / height, nativeScale);
      const fittedWidth = width * scale;
      const fittedHeight = height * scale;
      const left = (viewportWidth - fittedWidth) / 2;
      const top = frameTop + (availableHeight - fittedHeight) / 2;
      const imageGap = Math.min(24, Math.max(16, innerHeight * .02));
      const nextImage = lightbox.item?.images?.[0] ? imageForViewport(lightbox.item.images[0]) : null;
      let previewHeight = Math.min(156, Math.max(104, innerHeight * .16));
      if (nextImage) {
        const nextWidth = Number(nextImage.width) || 1080;
        const nextHeight = Number(nextImage.height) || 1340;
        const nextScale = Math.min(availableWidth / nextWidth, nativeScale);
        previewHeight = Math.min(previewHeight, nextHeight * nextScale * .4);
      }
      viewer.style.setProperty('--viewer-extra-top', `${Math.max(top + fittedHeight + imageGap, innerHeight - previewHeight)}px`);
      const anchor = top + fittedHeight / 2;
      viewer.style.setProperty('--viewer-description-anchor', `${anchor}px`);
      layoutViewerDescription();
      return { left, top, width: fittedWidth, height: fittedHeight };
    }
    function frameStyles(rect, radius = 12) {
      return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${radius}px` };
    }
    function cancelImageAnimation() {
      if (lightbox.animation) lightbox.animation.cancel();
      lightbox.animation = null;
    }
    function resetStage({ preserveScroll = false } = {}) {
      if (!viewerStage || !viewerImage) return;
      if (!preserveScroll) {
        viewerStage.scrollTop = 0;
        viewerStage.scrollLeft = 0;
      }
      Object.assign(viewerImage.style, { position: 'absolute', display: 'block', margin: '0', maxWidth: 'none', maxHeight: 'none', objectFit: 'cover', pointerEvents: 'auto', opacity: '1', filter: 'brightness(1)' });
    }
    function animateImage(from, to, duration = viewerTiming.open) {
      cancelImageAnimation();
      Object.assign(viewerImage.style, to);
      if (reducedMotion.matches || typeof viewerImage.animate !== 'function') return Promise.resolve();
      const animation = viewerImage.animate([from, to], { duration, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both' });
      lightbox.animation = animation;
      return animation.finished.catch(() => {}).then(() => {
        if (lightbox.animation === animation) {
          lightbox.animation = null;
          animation.cancel();
        }
      });
    }
    function setViewerDescriptionOpen(open, { restoreFocus = false } = {}) {
      if (!viewerDescriptionDisclosure || !viewerDescriptionToggle || !viewerDescriptionPanel) return;
      lightbox.descriptionOpen = Boolean(open && lightbox.open && !lightbox.closing && !viewerDescriptionDisclosure.hidden);
      viewerDescriptionDisclosure.classList.toggle('is-open', lightbox.descriptionOpen);
      viewerDescriptionToggle.setAttribute('aria-expanded', String(lightbox.descriptionOpen));
      viewerDescriptionToggle.setAttribute('aria-label', lightbox.descriptionOpen ? 'Fechar descrição do projeto' : 'Abrir descrição do projeto');
      viewerDescriptionPanel.inert = !lightbox.descriptionOpen;
      viewerDescriptionPanel.setAttribute('aria-hidden', String(!lightbox.descriptionOpen));
      clearTimeout(viewerDescriptionHideTimer);
      if (lightbox.descriptionOpen) {
        viewerDescriptionPanel.hidden = false;
        void viewerDescriptionPanel.offsetWidth;
      } else if (reducedMotion.matches) viewerDescriptionPanel.hidden = true;
      else viewerDescriptionHideTimer = setTimeout(() => { if (!lightbox.descriptionOpen) viewerDescriptionPanel.hidden = true; }, 280);
      viewerDescriptionPanel.classList.toggle('is-open', lightbox.descriptionOpen);
      viewerDescriptionPanel.tabIndex = lightbox.descriptionOpen ? 0 : -1;
      layoutViewerDescription();
      if (lightbox.descriptionOpen) viewer.setAttribute('aria-describedby', 'viewerDescription');
      else viewer.removeAttribute('aria-describedby');
      if (restoreFocus && !lightbox.descriptionOpen) focusWithoutScroll(viewerDescriptionToggle);
    }

    function updateViewerLabels() {
      const item = lightbox.item;
      if (viewerTitle) viewerTitle.textContent = item.title || 'Projeto SAN';
      if (viewerCategory) viewerCategory.textContent = item.categoryLabel || '';
      if (viewerDescription) {
        const hadDescriptionFocus = viewerDescriptionDisclosure && (viewerDescriptionDisclosure.contains(document.activeElement) || viewerDescriptionPanel.contains(document.activeElement));
        setViewerDescriptionOpen(false);
        const description = typeof item.alt === 'string' ? item.alt.trim() : '';
        viewerDescription.textContent = description;
        if (viewerDescriptionDisclosure) viewerDescriptionDisclosure.hidden = !description;
        if (viewerDescriptionPanel) viewerDescriptionPanel.scrollTop = 0;
        if (hadDescriptionFocus) focusWithoutScroll(description ? viewerDescriptionToggle : viewerClose);
      }
    }
    function renderProjectImages(item) {
      if (!viewerProjectImages) return;
      const images = Array.isArray(item.images) ? item.images : [];
      const fragment = document.createDocumentFragment();
      images.forEach((image, index) => {
        if (!image || !image.src) return;
        const source = imageForViewport(image);
        const figure = document.createElement('figure');
        figure.className = 'viewer-project-photo';
        const photo = document.createElement('img');
        photo.src = source.src;
        photo.alt = source.alt || `${item.title || 'Projeto'} — imagem ${index + 2}`;
        photo.width = source.width || 1080;
        photo.height = source.height || 1340;
        photo.style.maxWidth = `calc(${photo.width}px * var(--viewer-native-scale, 1))`;
        photo.style.marginInline = 'auto';
        photo.loading = 'lazy';
        photo.decoding = 'async';
        photo.draggable = false;
        const error = document.createElement('p');
        error.className = 'viewer-photo-error';
        error.textContent = 'Não foi possível carregar esta imagem.';
        photo.addEventListener('error', () => figure.classList.add('is-broken'), { once: true });
        figure.append(photo, error);
        fragment.append(figure);
      });
      const hasImages = fragment.childElementCount > 0;
      viewerProjectImages.replaceChildren(fragment);
      viewerProjectImages.hidden = !hasImages;
      viewer.classList.toggle('has-project-images', hasImages);
    }
    function setViewerImage(item) {
      const source = imageForViewport(item);
      viewerImage.alt = source.alt || item.title || 'Projeto de Rafael San';
      viewerImage.src = source.src;
      viewerImage.width = source.width || 1080;
      viewerImage.height = source.height || 1340;
      viewerImage.draggable = false;
      lightbox.item = item;
      lightbox.mobile = window.SanResponsiveImage.isMobile();
      renderProjectImages(item);
      resetStage();
      updateViewerLabels();
    }

    function openViewer(candidate, origin) {
      const item = resolveGalleryItem(candidate);
      if (!item || !viewer || !viewerImage || state.view !== 'projects' || state.menuOpen) return;
      ++lightbox.token;
      const token = lightbox.token;
      cancelImageAnimation();
      viewer.classList.remove('is-closing', 'is-open');
      restoreSource();
      lightbox.returnFocus = document.activeElement;
      lightbox.open = true;
      lightbox.closing = false;
      lightbox.origin = origin && origin.rect ? origin : getCard(item);
      setMobileMenu(false);
      viewer.hidden = false;
      viewer.inert = false;
      viewer.setAttribute('aria-hidden', 'false');
      body.classList.add('lightbox-is-open');
      setViewerImage(item);
      const destination = frameStyles(fittedRect());
      const card = lightbox.origin;
      const from = cardIsVisible(card) ? { ...frameStyles(card.rect, card.radius ?? 24), filter: getComputedStyle(card.image).filter, opacity: '1', transform: 'none' } : { ...destination, filter: 'brightness(1)', opacity: '0', transform: 'scale(.97)' };
      concealSource(card);
      syncGalleryAvailability();
      void viewer.offsetWidth;
      viewer.classList.add('is-open');
      animateImage(from, { ...destination, opacity: '1', transform: 'none', filter: 'brightness(1)' });
      requestAnimationFrame(() => {
        if (lightbox.open && !lightbox.closing && token === lightbox.token) focusWithoutScroll(viewerClose);
      });
      // Cached images have dimensions immediately; an uncached image can refine the fit once decoded.
      const displayedImage = imageForViewport(item);
      if (!displayedImage.width || !displayedImage.height) {
        const onLoad = () => {
          if (token !== lightbox.token || !lightbox.open || lightbox.closing) return;
          const rect = viewerImage.getBoundingClientRect();
          animateImage(frameStyles(rect), frameStyles(fittedRect()), 300);
        };
        if (viewerImage.complete && viewerImage.naturalWidth) onLoad();
        else viewerImage.addEventListener('load', onLoad, { once: true });
      }
    }

    function finishViewerClose(restoreFocus) {
      setViewerDescriptionOpen(false);
      cancelImageAnimation();
      restoreSource();
      viewer.hidden = true;
      viewer.inert = true;
      viewer.classList.remove('is-open', 'is-closing');
      viewer.setAttribute('aria-hidden', 'true');
      lightbox.open = false;
      lightbox.closing = false;
      body.classList.remove('lightbox-is-open');
      resetStage();
      syncGalleryAvailability();
      if (restoreFocus) {
        const card = currentOrigin();
        const target = card && card.button || lightbox.returnFocus;
        if (target && target.isConnected && !target.closest('[hidden], [inert]')) focusWithoutScroll(target);
        else focusWithoutScroll(galleryRoot);
      }
    }
    function closeViewer({ immediate = false, restoreFocus = true } = {}) {
      if (!lightbox.open || !viewer) return;
      if (lightbox.closing) {
        if (immediate) { ++lightbox.token; finishViewerClose(restoreFocus); }
        return;
      }
      setViewerDescriptionOpen(false);
      const token = ++lightbox.token;
      lightbox.closing = true;
      const current = viewerImage.getBoundingClientRect();
      const currentFilter = getComputedStyle(viewerImage).filter;
      const currentRadius = parseFloat(getComputedStyle(viewerImage).borderTopLeftRadius);
      cancelImageAnimation();
      if (immediate || reducedMotion.matches) {
        finishViewerClose(restoreFocus);
        return;
      }
      syncGalleryAvailability();
      viewer.classList.add('is-closing');
      // Hold the cover in place while the extra images leave first.
      const scrollTop = viewerStage.scrollTop;
      Object.assign(viewerImage.style, frameStyles({ left: current.left, top: current.top + scrollTop, width: current.width, height: current.height }, currentRadius), { opacity: '1', transform: 'none', filter: currentFilter });
      const returnToGallery = () => {
        if (token !== lightbox.token || !lightbox.closing) return;
        if (scrollTop > 1) {
          // Fade in place instead of jumping back to the cover at the top of the album.
          restoreSource();
          const animation = viewer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: viewerTiming.close, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'both' });
          lightbox.animation = animation;
          animation.finished.catch(() => {}).then(() => {
            if (token === lightbox.token && lightbox.closing) finishViewerClose(restoreFocus);
          });
          return;
        }
        viewer.classList.remove('is-open');
        resetStage();
        const card = currentOrigin();
        const target = cardIsVisible(card) ? { ...frameStyles(card.rect, card.radius ?? 24), filter: getComputedStyle(card.image).filter, opacity: '1', transform: 'none' } : { ...frameStyles(current), filter: currentFilter, opacity: '0', transform: 'scale(.97)' };
        concealSource(card);
        animateImage({ ...frameStyles(current, currentRadius), filter: currentFilter, opacity: '1', transform: 'none' }, target, viewerTiming.close).then(() => {
          if (token === lightbox.token && lightbox.closing) finishViewerClose(restoreFocus);
        });
      };
      if (viewerProjectImages && !viewerProjectImages.hidden) setTimeout(returnToGallery, viewerTiming.detailsOut);
      else returnToGallery();
    }
    if (viewerDescriptionToggle) viewerDescriptionToggle.addEventListener('click', () => setViewerDescriptionOpen(!lightbox.descriptionOpen));
    if (viewerImage) viewerImage.addEventListener('click', () => {
      if (lightbox.descriptionOpen) setViewerDescriptionOpen(false, { restoreFocus: true });
    });
    if (viewerClose) viewerClose.addEventListener('click', () => closeViewer());
    const closeViewerBackground = () => {
      if (lightbox.descriptionOpen) setViewerDescriptionOpen(false, { restoreFocus: true });
      else closeViewer();
    };
    const backdrop = $('#viewerBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeViewerBackground);
    if (viewerStage) {
      let backgroundPress = null;
      viewerStage.addEventListener('pointerdown', (event) => {
        backgroundPress = event.target === viewerStage ? { x: event.clientX, y: event.clientY } : null;
      }, { passive: true });
      viewerStage.addEventListener('click', (event) => {
        const press = backgroundPress;
        backgroundPress = null;
        if (event.target === viewerStage) {
          // A drag that crosses the image and backdrop can also dispatch a click on the stage.
          if (event.detail === 0 || (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 10)) closeViewerBackground();
        } else if (lightbox.descriptionOpen && event.target.closest('.viewer-project-photo')) setViewerDescriptionOpen(false, { restoreFocus: true });
      });
    }

    document.addEventListener('keydown', (event) => {
      if (state.filtersOpen && event.key === 'Escape') {
        event.preventDefault();
        setFiltersOpen(false, { restoreFocus: true });
        return;
      }
      if (lightbox.open) {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (lightbox.descriptionOpen) setViewerDescriptionOpen(false, { restoreFocus: true });
          else closeViewer();
        } else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
          if (!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
            event.preventDefault();
            const scrollTarget = lightbox.descriptionOpen && viewerDescriptionPanel.contains(document.activeElement) ? viewerDescriptionPanel : viewerStage;
            const amount = event.key.startsWith('Page') ? scrollTarget.clientHeight * .8 : 64;
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? scrollTarget.scrollHeight : scrollTarget.scrollTop + (['ArrowUp', 'PageUp'].includes(event.key) ? -amount : amount);
            scrollTarget.scrollTo({ top: target, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
          }
        } else if (event.key === 'Tab') {
          const elements = focusable(viewer);
          if (!elements.length) {
            event.preventDefault();
            focusWithoutScroll(viewer);
            return;
          }
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (event.shiftKey && (document.activeElement === first || !viewer.contains(document.activeElement))) {
            event.preventDefault();
            focusWithoutScroll(last);
          } else if (!event.shiftKey && (document.activeElement === last || !viewer.contains(document.activeElement))) {
            event.preventDefault();
            focusWithoutScroll(first);
          }
        }
        return;
      }
      if (event.key === 'Escape') {
        if (state.menuOpen) {
          event.preventDefault();
          setMobileMenu(false, true);
        } else if (state.view !== 'projects') {
          event.preventDefault();
          navigateTo('projects');
        }
      } else if (event.key === 'Tab' && state.menuOpen && mobileNav) {
        const elements = [burger, ...focusable(mobileNav)].filter(Boolean);
        const index = elements.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault();
          focusWithoutScroll(elements[elements.length - 1]);
        } else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) {
          event.preventDefault();
          focusWithoutScroll(elements[0]);
        }
      }
    });
    document.addEventListener('focusin', (event) => {
      if (lightbox.open && !lightbox.closing && viewer && !viewer.contains(event.target)) {
        focusWithoutScroll(viewerClose);
      } else if (state.menuOpen && event.target !== burger && mobileNav && !mobileNav.contains(event.target)) {
        focusWithoutScroll(burger);
      }
    });

    const message = $('#cMessage');
    function resizeMessage() {
      if (!message || !message.getClientRects().length) return;
      const style = getComputedStyle(message);
      const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      message.style.height = 'auto';
      message.style.height = `${Math.max(48, message.scrollHeight + borders)}px`;
    }
    if (message) {
      message.style.resize = 'none';
      message.style.overflow = 'hidden';
      message.addEventListener('input', resizeMessage);
      if (document.fonts) document.fonts.ready.then(resizeMessage);
    }
    const contactForm = $('#contactForm');
    if (contactForm) {
      contactForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const status = $('#contactSuccess');
        if (status) {
          status.textContent = 'O envio pelo formulário ainda não está disponível.';
          status.hidden = false;
          status.setAttribute('role', 'status');
          status.setAttribute('aria-live', 'polite');
          status.classList.add('is-visible');
        }
      });
      contactForm.addEventListener('reset', () => requestAnimationFrame(resizeMessage));
    }

    const cursor = $('#cursor');
    if (cursor) {
      document.addEventListener('pointermove', (event) => {
        if (!finePointer.matches || event.pointerType === 'touch') return;
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
        cursor.classList.add('is-visible');
        const target = event.target instanceof Element ? event.target.closest('a, button, [role="button"]') : null;
        cursor.classList.toggle('active', Boolean(target && !target.disabled && !target.closest('[inert]')));
      }, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('is-visible', 'active'));
      window.addEventListener('blur', () => cursor.classList.remove('is-visible', 'active'));
      finePointer.addEventListener('change', () => cursor.classList.remove('is-visible', 'active'));
    }

    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (innerWidth > 768 && state.menuOpen) setMobileMenu(false);
        resizeMessage();
        if (!lightbox.open) return;
        if (!lightbox.closing) {
          const mobile = window.SanResponsiveImage.isMobile();
          const sameMobileAlbum = mobile && lightbox.mobile && lightbox.item?.images?.length &&
            lightbox.layoutWidth === document.documentElement.clientWidth &&
            lightbox.layoutPixelRatio === (window.devicePixelRatio || 1);
          // Browser bars change the height during a swipe. Keep album content anchored.
          if (sameMobileAlbum) {
            layoutViewerDescription();
            return;
          }
          ++lightbox.token;
          cancelImageAnimation();
          if (mobile !== lightbox.mobile) {
            lightbox.mobile = mobile;
            const source = imageForViewport(lightbox.item);
            viewerImage.src = source.src;
            viewerImage.alt = source.alt || lightbox.item.title || 'Projeto de Rafael San';
            viewerImage.width = source.width || 1080;
            viewerImage.height = source.height || 1340;
            renderProjectImages(lightbox.item);
          }
          resetStage({ preserveScroll: true });
          Object.assign(viewerImage.style, frameStyles(fittedRect()));
        }
      });
    }, { passive: true });
    document.addEventListener('visibilitychange', syncGalleryAvailability);

    function isOnScreen(rect) {
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    }

    function visibleGalleryCards() {
      if (!galleryRoot) return [];
      return $$('.gallery-card', galleryRoot).flatMap((card) => {
        if (card.style.visibility === 'hidden') return [];
        const media = $('.gallery-card-media', card);
        const rect = media.getBoundingClientRect();
        return isOnScreen(rect) ? [{ media, rect, caption: $('.gallery-card-caption', card) }] : [];
      });
    }

    function startGallerySwarm(onFinish) {
      if (typeof body.animate !== 'function') return false;
      const distanceToCenter = ({ rect }) => Math.hypot(rect.left + rect.width / 2 - innerWidth / 2, rect.top + rect.height / 2 - innerHeight / 2);
      const targets = visibleGalleryCards().sort((a, b) => distanceToCenter(a) - distanceToCenter(b));
      if (!targets.length) return false;
      const layer = document.createElement('div');
      layer.className = 'swarm-intro';
      layer.setAttribute('aria-hidden', 'true');
      body.append(layer);
      body.classList.add('is-swarm-intro');
      const animations = [];
      const colors = ['#a49aff', '#87dfbf', '#ff9fc8'];
      const cursorCount = Math.min(targets.length, innerWidth <= 768 ? 2 : colors.length);
      const step = Math.min(1050, 3000 / Math.ceil(targets.length / cursorCount));
      const easing = 'cubic-bezier(.28,.66,.32,1)';
      const point = (x, y) => `translate(${x}px,${y}px)`;
      let finish = 0;

      for (let lane = 0; lane < cursorCount; lane++) {
        const laneTargets = targets.filter((_, index) => index % cursorCount === lane);
        const laneDelay = lane * 210;
        const duration = laneTargets.length * step + 640;
        const cursor = document.createElement('span');
        cursor.className = 'swarm-cursor';
        cursor.style.color = colors[lane];
        cursor.innerHTML = '<svg viewBox="0 0 24 28" fill="currentColor" aria-hidden="true"><path d="M2 2 22 17l-9-.4L9 25Z" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
        layer.append(cursor);
        const first = laneTargets[0].rect;
        const frames = [{ offset: 0, opacity: 0, transform: point(Math.max(8, first.left + 50 - lane * 24), Math.max(12, first.top + 72)), easing }];

        laneTargets.forEach(({ media, rect, caption }, index) => {
          const start = index * step;
          const arrive = start + step * .44;
          const draw = step * .56;
          const left = Math.max(6, rect.left);
          const top = Math.max(6, rect.top);
          const right = Math.min(innerWidth - 6, rect.right);
          const bottom = Math.min(innerHeight - 6, rect.bottom);
          const frame = document.createElement('span');
          frame.className = 'swarm-frame';
          Object.assign(frame.style, {
            left: `${left}px`, top: `${top}px`, width: `${Math.max(1, right - left)}px`,
            height: `${Math.max(1, bottom - top)}px`, color: colors[lane],
          });
          layer.prepend(frame);

          frames.push(
            { offset: arrive / duration, opacity: 1, transform: point(left, top), easing },
            { offset: (start + step) / duration, opacity: 1, transform: point(right, bottom), easing },
          );
          animations.push(frame.animate([
            { opacity: 0, transform: 'scale(.04)', offset: 0, easing },
            { opacity: .82, transform: 'scale(1)', offset: draw / (draw + 410), easing },
            { opacity: 0, transform: 'scale(1)' },
          ], { delay: laneDelay + arrive, duration: draw + 410, fill: 'both' }));

          const reveal = laneDelay + start + step * .83;
          animations.push(
            media.animate([
              { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
              { opacity: 1, clipPath: 'inset(0)' },
            ], { delay: reveal, duration: 610, easing, fill: 'both' }),
            caption.animate([
              { opacity: 0, transform: 'translateY(7px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ], { delay: reveal + 190, duration: 420, easing, fill: 'both' }),
          );
        });

        const last = laneTargets[laneTargets.length - 1].rect;
        frames.push({ offset: 1, opacity: 0, transform: point(Math.min(innerWidth - 6, last.right) + 14, Math.min(innerHeight - 6, last.bottom) + 16) });
        animations.push(cursor.animate(frames, { delay: laneDelay, duration, fill: 'both' }));
        finish = Math.max(finish, laneDelay + duration);
      }

      const complete = () => {
        stopSwarm?.();
        onFinish?.();
      };
      const onKeyDown = (event) => {
        if (['Tab', 'Enter', ' ', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) || event.key.startsWith('Arrow')) complete();
      };
      const onMotionChange = (event) => {
        if (event.matches) complete();
      };
      const timer = setTimeout(complete, finish);
      document.addEventListener('pointerdown', complete, { capture: true, passive: true });
      document.addEventListener('wheel', complete, { capture: true, passive: true });
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('resize', complete, { passive: true });
      reducedMotion.addEventListener('change', onMotionChange);
      stopSwarm = () => {
        clearTimeout(timer);
        animations.forEach((animation) => animation.cancel());
        layer.remove();
        body.classList.remove('is-swarm-intro');
        document.removeEventListener('pointerdown', complete, true);
        document.removeEventListener('wheel', complete, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', complete);
        reducedMotion.removeEventListener('change', onMotionChange);
        stopSwarm = null;
      };
      return true;
    }

    function completePageIntro() {
      if (intro.complete) return;
      intro.complete = true;
      ++intro.token;
      cancelAnimationFrame(intro.firstFrame);
      cancelAnimationFrame(intro.secondFrame);
      if (intro.finishDecodeWait) intro.finishDecodeWait();
      if (intro.finishHintWait) intro.finishHintWait();
      clearTimeout(intro.decodeTimer);
      clearTimeout(intro.hintTimer);
      clearTimeout(intro.chromeTimer);
      stopSwarm?.();
      document.removeEventListener('click', onIntroInteraction, true);
      document.removeEventListener('keydown', onIntroKeyDown, true);
      document.removeEventListener('pointerdown', onIntroInteraction, true);
      document.removeEventListener('wheel', onIntroInteraction, true);
      window.removeEventListener('resize', onIntroInteraction);
      reducedMotion.removeEventListener('change', onIntroMotionChange);
      body.classList.add('is-gallery-ready', 'is-ready');
      updateGalleryHint();
    }

    function onIntroInteraction() {
      completePageIntro();
    }

    function onIntroKeyDown(event) {
      if (['Tab', 'Enter', ' ', 'Escape'].includes(event.key)) completePageIntro();
      else if (swarmPreview && (event.key.startsWith('Arrow') || event.key === 'Home')) completePageIntro();
    }

    function onIntroMotionChange(event) {
      if (event.matches) completePageIntro();
    }

    function decodeVisibleGalleryImages() {
      if (!galleryRoot) return Promise.resolve();
      const seen = new Set();
      const images = visibleGalleryCards().map(({ media }) => $('img', media)).filter((image) => {
        if (seen.has(image.currentSrc || image.src)) return false;
        seen.add(image.currentSrc || image.src);
        return true;
      });
      const decoding = Promise.allSettled(images.map((image) => typeof image.decode === 'function' ? image.decode() : Promise.resolve()));
      const timeout = new Promise((resolve) => {
        intro.finishDecodeWait = () => {
          clearTimeout(intro.decodeTimer);
          intro.decodeTimer = 0;
          intro.finishDecodeWait = null;
          resolve();
        };
        intro.decodeTimer = setTimeout(intro.finishDecodeWait, 1000);
      });
      return Promise.race([decoding, timeout]).then(() => {
        if (intro.finishDecodeWait) intro.finishDecodeWait();
      });
    }

    function waitForHintLeadIn() {
      const hint = $('#galleryHint');
      if (!hint) return Promise.resolve();
      return new Promise((resolve) => {
        intro.finishHintWait = () => {
          clearTimeout(intro.hintTimer);
          intro.hintTimer = 0;
          intro.finishHintWait = null;
          resolve();
        };
        const showHint = (useFallback = false) => {
          if (!intro.finishHintWait || hint.classList.contains('is-visible')) return;
          clearTimeout(intro.hintTimer);
          hint.classList.toggle('uses-fallback-font', useFallback);
          hint.classList.add('is-visible');
          intro.hintTimer = setTimeout(intro.finishHintWait, 650);
        };
        const font = `700 1em ${CSS.escape(bodyFamily)}`;
        const sample = hint.textContent;
        const faces = Array.from(document.fonts || []).filter((face) => face.family.replace(/^["']|["']$/g, '') === bodyFamily);
        if (faces.every((face) => face.status === 'loaded')) showHint();
        else {
          const showFallback = () => showHint(true);
          intro.hintTimer = setTimeout(showFallback, 400);
          document.fonts.load(font, sample).then(() => showHint(), showFallback);
        }
      });
    }

    function startPageIntro() {
      if (intro.complete) return;
      if (introMode === 'none' || reducedMotion.matches || state.view !== 'projects' || !projects.length) {
        completePageIntro();
        return;
      }
      const token = ++intro.token;
      document.addEventListener('click', onIntroInteraction, true);
      document.addEventListener('keydown', onIntroKeyDown, true);
      if (swarmPreview) {
        document.addEventListener('pointerdown', onIntroInteraction, { capture: true, passive: true });
        document.addEventListener('wheel', onIntroInteraction, { capture: true, passive: true });
        window.addEventListener('resize', onIntroInteraction, { passive: true });
      }
      reducedMotion.addEventListener('change', onIntroMotionChange);
      intro.firstFrame = requestAnimationFrame(() => {
        intro.firstFrame = 0;
        intro.secondFrame = requestAnimationFrame(async () => {
          intro.secondFrame = 0;
          // Give the centered instruction a brief lead-in while images decode in parallel.
          await Promise.all([decodeVisibleGalleryImages(), waitForHintLeadIn()]);
          if (intro.complete || token !== intro.token) return;
          const playing = swarmPreview && startGallerySwarm(completePageIntro);
          body.classList.add('is-gallery-ready');
          // Let the gallery finish revealing before the header and footer enter.
          if (!playing) intro.chromeTimer = setTimeout(completePageIntro, 2200);
        });
      });
    }

    if (galleryRoot && typeof window.SanGallery === 'function') {
      gallery = new window.SanGallery(galleryRoot, {
        items: projects,
        initialMode: state.mode,
        featuredProjectId: settings.featuredProjectId,
        onOpen: openViewer,
        onChange: onGalleryChange,
      });
      window.sanGallery = gallery;
    }
    $$('[data-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === state.category)));
    $$('[data-gallery-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.galleryMode === state.mode)));
    if (viewer) {
      viewer.hidden = true;
      viewer.inert = true;
      viewer.setAttribute('aria-hidden', 'true');
    }
    applyView(viewFromHash());
    updateGalleryHint();
    startPageIntro();
  };

  const start = () => Promise.resolve(window.sanContentReady).then(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
