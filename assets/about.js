(() => {
  'use strict';

  function initAboutMarquee() {
    const panel = document.getElementById('aboutPanel');
    const marquee = document.getElementById('aboutMarquee');
    if (!panel || !marquee || window.sanAboutMarquee) return;

    const track = marquee.querySelector('.about-marquee-track');
    const groups = track ? Array.from(track.querySelectorAll('.about-marquee-group')) : [];
    if (!groups.length) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileLayout = window.matchMedia('(max-width: 768px)');
    const slots = new Map(groups.map((group) => [group, group.querySelector('.about-hover-photo')]));
    if (Array.from(slots.values()).some((slot) => !slot)) return;
    const portraitSource = slots.get(groups[0]).querySelector('img');
    if (!portraitSource) return;
    const portrait = portraitSource.cloneNode();
    if (!portrait.alt.trim()) {
      const name = document.getElementById('aboutTitle')?.textContent.trim();
      portrait.alt = name ? `Retrato de ${name}` : 'Retrato';
    }
    portrait.className = 'about-mobile-portrait';
    portrait.setAttribute('aria-hidden', 'true');
    marquee.after(portrait);

    let loopWidth = 0;
    let offset = 0;
    let speed = 0;
    let frame = 0;
    let lastTime = 0;
    let activeGroup = null;
    let closing = false;
    let pointerInside = false;
    let keyboardOpen = false;
    let touchOpen = false;
    let suppressHover = false;
    let lastPointerType = 'mouse';
    let active = false;
    let settledFrames = 0;
    let destroyed = false;

    const wrap = (value) => loopWidth ? ((value % loopWidth) + loopWidth) % loopWidth : 0;
    const setTransform = () => { track.style.transform = `translate3d(${(-offset).toFixed(3)}px,0,0)`; };

    function isVisible() {
      if (document.hidden || panel.hidden || panel.inert || marquee.inert ||
          panel.getAttribute('aria-hidden') === 'true' || document.body.classList.contains('menu-is-open')) return false;
      const rect = marquee.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > Math.max(0, panelRect.top) &&
        rect.top < Math.min(window.innerHeight, panelRect.bottom) && rect.right > 0 && rect.left < window.innerWidth;
    }

    function schedule() {
      if (!destroyed && active && !frame) frame = requestAnimationFrame(animate);
    }

    function updateMetrics() {
      if (destroyed) return;
      const width = groups[0].getBoundingClientRect().width - slots.get(groups[0]).getBoundingClientRect().width;
      if (width <= 0) return;
      if (loopWidth && !activeGroup) offset = offset / loopWidth * width;
      loopWidth = width;
      if (!activeGroup) offset = wrap(offset);
      settledFrames = 0;
      setTransform();
      schedule();
    }

    function centeredGroup() {
      const center = marquee.getBoundingClientRect().left + marquee.clientWidth / 2;
      return groups.reduce((nearest, group) => {
        const rect = group.getBoundingClientRect();
        const distance = Math.abs((rect.left + rect.right) / 2 - center);
        return !nearest || distance < nearest.distance ? { group, distance } : nearest;
      }, null).group;
    }

    function setOpen(open, group) {
      if (mobileLayout.matches) return;
      if (open && !active) return;
      if (open) {
        if (!activeGroup) activeGroup = group || centeredGroup();
        activeGroup.classList.add('is-active');
        closing = false;
        speed = 0;
      } else if (activeGroup) {
        activeGroup.classList.remove('is-active');
        closing = true;
      }
      settledFrames = 0;
      marquee.classList.toggle('is-open', open);
      marquee.setAttribute('aria-expanded', String(open));
      schedule();
    }

    function updateInteraction(group) {
      setOpen(pointerInside || keyboardOpen || touchOpen, group);
    }

    function resetInteraction() {
      pointerInside = false;
      keyboardOpen = false;
      touchOpen = false;
      suppressHover = false;
      groups.forEach((group) => group.classList.remove('is-active'));
      activeGroup = null;
      closing = false;
      speed = 0;
      settledFrames = 0;
      marquee.classList.remove('is-open');
      if (mobileLayout.matches) marquee.removeAttribute('aria-expanded');
      else marquee.setAttribute('aria-expanded', 'false');
      offset = wrap(offset);
      setTransform();
    }

    function updatePortrait(visible) {
      if (!mobileLayout.matches || panel.hidden || panel.getAttribute('aria-hidden') === 'true' || panel.scrollTop <= 1) {
        portrait.classList.remove('is-visible');
        portrait.setAttribute('aria-hidden', 'true');
        return;
      }
      if (!visible || !portrait.complete || !portrait.naturalWidth || portrait.classList.contains('is-visible')) return;
      const rect = marquee.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const midpoint = (Math.max(0, panelRect.top) + Math.min(window.innerHeight, panelRect.bottom)) / 2;
      if (rect.top + rect.height / 2 > midpoint) return;
      portrait.classList.add('is-visible');
      portrait.removeAttribute('aria-hidden');
    }

    function updateVisibility() {
      if (destroyed) return;
      const visible = isVisible();
      updatePortrait(visible);
      if (visible === active) return;
      active = visible;
      lastTime = 0;
      if (active) {
        updateMetrics();
        schedule();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        resetInteraction();
        marquee.dataset.loopState = 'paused';
      }
    }

    function animate(time) {
      frame = 0;
      if (!active || destroyed) return;
      const elapsed = lastTime ? Math.min(64, time - lastTime) : 0;
      lastTime = time;
      const reduced = motionPreference.matches;

      if (activeGroup) {
        const slot = slots.get(activeGroup);
        const slotRect = slot.getBoundingClientRect();
        const marqueeRect = marquee.getBoundingClientRect();
        const target = offset + slotRect.left + slotRect.width / 2 - marqueeRect.left - marquee.clientWidth / 2;
        const difference = target - offset;
        offset = reduced ? target : offset + difference * (1 - Math.exp(-elapsed / 140));
        const settled = Math.abs(difference) < 0.15;
        settledFrames = settled ? settledFrames + 1 : 0;
        speed = 0;

        if (closing && slotRect.width < 0.5 && settledFrames > 2) {
          activeGroup = null;
          closing = false;
          offset = wrap(offset);
          settledFrames = 0;
        }
      } else if (!reduced && loopWidth) {
        const targetSpeed = loopWidth / 28;
        speed += (targetSpeed - speed) * (1 - Math.exp(-elapsed / 360));
        offset = wrap(offset + speed * elapsed / 1000);
      } else speed = 0;

      setTransform();
      marquee.dataset.loopState = activeGroup || reduced ? 'paused' : 'running';
      if (closing || (activeGroup && settledFrames < 8) || (!activeGroup && !reduced)) schedule();
      else lastTime = 0;
    }

    function onPointerOver(event) {
      const word = event.target.closest('.about-marquee-word');
      if (event.pointerType === 'touch' || !word || pointerInside || suppressHover) return;
      pointerInside = true;
      updateInteraction(word.closest('.about-marquee-group'));
    }

    function onPointerLeave() {
      pointerInside = false;
      suppressHover = false;
      updateInteraction();
    }

    function onPointerDown(event) { lastPointerType = event.pointerType; }

    function onClick(event) {
      if (event.detail === 0) keyboardOpen = !keyboardOpen;
      else if (lastPointerType === 'touch' || lastPointerType === 'pen') touchOpen = !touchOpen;
      updateInteraction();
    }

    function onBlur() {
      keyboardOpen = false;
      touchOpen = false;
      updateInteraction();
    }

    function onDocumentPointerDown(event) {
      if (!marquee.contains(event.target) && (touchOpen || keyboardOpen)) {
        touchOpen = false;
        keyboardOpen = false;
        updateInteraction();
      }
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape' || !active || marquee.getAttribute('aria-expanded') !== 'true') return;
      event.preventDefault();
      event.stopPropagation();
      suppressHover = true;
      pointerInside = false;
      keyboardOpen = false;
      touchOpen = false;
      setOpen(false);
    }

    function onResize() {
      updateVisibility();
      updateMetrics();
    }

    function onLayoutChange() {
      resetInteraction();
      if (mobileLayout.matches) {
        marquee.tabIndex = -1;
        marquee.setAttribute('aria-hidden', 'true');
      } else {
        marquee.removeAttribute('tabindex');
        marquee.removeAttribute('aria-hidden');
      }
      onResize();
    }

    function onMotionChange() {
      speed = 0;
      lastTime = 0;
      settledFrames = 0;
      schedule();
    }

    marquee.addEventListener('pointerover', onPointerOver);
    marquee.addEventListener('pointerleave', onPointerLeave);
    marquee.addEventListener('pointerdown', onPointerDown);
    marquee.addEventListener('click', onClick);
    marquee.addEventListener('blur', onBlur);
    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('resize', onResize);
    panel.addEventListener('scroll', updateVisibility, { passive: true });
    motionPreference.addEventListener('change', onMotionChange);
    mobileLayout.addEventListener('change', onLayoutChange);
    portrait.addEventListener('load', updateVisibility);

    const mutationObserver = new MutationObserver(updateVisibility);
    mutationObserver.observe(panel, { attributes: true, attributeFilter: ['hidden', 'inert', 'class', 'aria-hidden'] });
    mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const intersectionObserver = new IntersectionObserver(updateVisibility, { root: panel, threshold: [0, 0.01] });
    intersectionObserver.observe(marquee);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(marquee);

    if (document.fonts) document.fonts.ready.then(() => { if (!destroyed) onResize(); });

    window.sanAboutMarquee = {
      open: () => { keyboardOpen = true; setOpen(true); },
      close: () => { pointerInside = false; keyboardOpen = false; touchOpen = false; setOpen(false); },
      refresh: onResize,
      getState: () => ({ active, open: marquee.getAttribute('aria-expanded') === 'true', closing,
        reducedMotion: motionPreference.matches, offset, loopWidth, speed, frame }),
      destroy() {
        destroyed = true;
        cancelAnimationFrame(frame);
        mutationObserver.disconnect();
        intersectionObserver.disconnect();
        resizeObserver.disconnect();
        marquee.removeEventListener('pointerover', onPointerOver);
        marquee.removeEventListener('pointerleave', onPointerLeave);
        marquee.removeEventListener('pointerdown', onPointerDown);
        marquee.removeEventListener('click', onClick);
        marquee.removeEventListener('blur', onBlur);
        document.removeEventListener('pointerdown', onDocumentPointerDown);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('visibilitychange', updateVisibility);
        window.removeEventListener('resize', onResize);
        panel.removeEventListener('scroll', updateVisibility);
        motionPreference.removeEventListener('change', onMotionChange);
        mobileLayout.removeEventListener('change', onLayoutChange);
        portrait.removeEventListener('load', updateVisibility);
        portrait.remove();
        resetInteraction();
        marquee.removeAttribute('tabindex');
        marquee.removeAttribute('aria-hidden');
        marquee.setAttribute('aria-expanded', 'false');
        track.style.removeProperty('transform');
        delete window.sanAboutMarquee;
      }
    };

    onLayoutChange();
  }

  function getPhraseRange(paragraph, phrase, ignoreCase = false) {
    const text = paragraph.textContent;
    let start = ignoreCase ? -1 : text.indexOf(phrase);
    let end = start + phrase.length;
    if (start < 0) {
      const words = phrase.trim().split(/\s+/);
      const pattern = words.map((word) => word.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')).join('\\s+');
      const match = new RegExp(pattern, ignoreCase ? 'i' : '').exec(text);
      if (!match || !match[0]) return null;
      start = match.index;
      end = start + match[0].length;
    }
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const next = offset + node.length;
      if (start >= offset && start < next) range.setStart(node, start - offset);
      if (end <= next) {
        range.setEnd(node, end - offset);
        return range;
      }
      offset = next;
    }
    return null;
  }

  function drawPhraseUnderline(paragraph, range, animated, isContactHeading) {
    const origin = paragraph.getBoundingClientRect();
    const style = getComputedStyle(paragraph);
    const lineHeight = parseFloat(style.lineHeight);
    let fontBoxHeight;
    let inkOffset;
    if (isContactHeading) {
      const context = document.createElement('canvas').getContext('2d');
      if (context) {
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = context.measureText(range.toString());
        const gap = Math.max(3, Math.round(parseFloat(style.fontSize) * 0.06));
        fontBoxHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
        inkOffset = metrics.actualBoundingBoxDescent - metrics.fontBoundingBoxDescent + gap;
      }
    }
    const rows = new Map();
    for (const rect of range.getClientRects()) {
      if (!rect.width) continue;
      const row = Math.floor((rect.top + rect.height / 2 - origin.top) / lineHeight);
      const segment = rows.get(row);
      // Text ranges include the font's full descent, even when the phrase uses none of it.
      const hasMatchingMetrics = Number.isFinite(inkOffset) && Math.abs(rect.height - fontBoxHeight) < 2;
      const bottom = rect.bottom + (hasMatchingMetrics ? inkOffset : 1);
      rows.set(row, {
        left: Math.min(segment?.left ?? rect.left, rect.left),
        right: Math.max(segment?.right ?? rect.right, rect.right),
        bottom: Math.max(segment?.bottom ?? bottom, bottom),
      });
    }

    const segments = Array.from(rows.entries()).sort(([a], [b]) => a - b).map(([, segment]) => segment);
    const totalWidth = segments.reduce((width, segment) => width + segment.right - segment.left, 0);
    let delay = isContactHeading ? 240 : 0;
    for (const { left, right, bottom } of segments) {
      const width = right - left;
      const duration = 1050 * width / totalWidth;
      const stroke = document.createElement('span');
      stroke.className = 'about-underline';
      stroke.classList.toggle('is-drawing', animated);
      stroke.setAttribute('aria-hidden', 'true');
      Object.assign(stroke.style, {
        left: `${left - origin.left}px`,
        top: `${bottom - origin.top}px`,
        width: `${width}px`,
      });
      stroke.style.setProperty('--underline-delay', `${delay}ms`);
      stroke.style.setProperty('--underline-duration', `${duration}ms`);
      paragraph.append(stroke);
      delay += duration;
    }
    return delay;
  }

  function initCopyReveal({ panelId, selector, family, controller, revealScale, phrases = [] }) {
    const panel = document.getElementById(panelId);
    if (!panel || window[controller]) return;
    const blocks = Array.from(panel.querySelectorAll(selector));
    if (!blocks.length) return;
    const firstBlock = blocks[0];
    const roles = panel.querySelector('.about-roles');
    const rolesBelowLastBlock = roles && window.matchMedia('(max-width: 768px)');
    panel.style.setProperty('--copy-reveal-duration', Math.round(700 * revealScale) + 'ms');

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fontName = CSS.escape(family);
    const fontSamples = [[`400 1em ${fontName}`, blocks.map((block) => block.textContent).join(' ')]];
    const bold = blocks.flatMap((block) => Array.from(block.querySelectorAll('strong'), (node) => node.textContent)).join(' ');
    if (bold) fontSamples.push([`700 1em ${fontName}`, bold]);
    const faces = Array.from(document.fonts || []).filter((face) => face.family.replace(/^["']|["']$/g, '') === family);
    let selectedFontReady = faces.every((face) => face.status === 'loaded');
    const fontsReady = () => selectedFontReady;
    let waitingForFont = !fontsReady();
    let fontTimer = 0;
    let visitOpen = false;
    let hasScrolled = false;
    let lastScrollTop = panel.scrollTop;
    let firstRevealFrame = 0;
    let destroyed = false;
    let nextMaskId = 0;
    let rolesTimer = 0;
    const lineReveals = new Map();
    const rolesReadyTimes = new Map();
    const svgElement = (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag);

    const isVisitOpen = () => !panel.hidden && panel.getAttribute('aria-hidden') !== 'true' &&
      panel.classList.contains('is-open');
    const canReveal = () => visitOpen && !panel.inert && !document.hidden &&
      !document.body.classList.contains('menu-is-open');

    function syncRoles() {
      if (!roles || !visitOpen || roles.classList.contains('is-roles-visible')) return;
      clearTimeout(rolesTimer);
      const source = rolesBelowLastBlock.matches ? blocks.at(-1) : firstBlock;
      const readyAt = rolesReadyTimes.get(source);
      if (readyAt === undefined) return;
      if (!motionPreference.matches) {
        const remaining = readyAt - performance.now();
        if (remaining > 0) {
          rolesTimer = setTimeout(syncRoles, Math.ceil(remaining));
          return;
        }
        if (rolesBelowLastBlock.matches) {
          const bounds = roles.getBoundingClientRect();
          if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
        }
      }
      roles.classList.add('is-roles-visible');
    }

    function drawUnderline(block, animated) {
      if (!visitOpen || !block.classList.contains('is-copy-visible')) return;
      const phrase = phrases[blocks.indexOf(block)];
      block.querySelectorAll('.about-underline').forEach((stroke) => stroke.remove());
      let underlineDuration = 0;
      if (phrase) {
        const isContactHeading = block.matches('.contact-title');
        const textElements = isContactHeading ? [block] : block.querySelectorAll('p');
        for (const paragraph of textElements) {
          const range = getPhraseRange(paragraph, phrase, isContactHeading);
          if (!range) continue;
          underlineDuration = drawPhraseUnderline(paragraph, range, animated, isContactHeading);
          break;
        }
      }
      if (roles && (animated || !rolesReadyTimes.has(block))) {
        const delay = animated ? underlineDuration + 260 : 260;
        rolesReadyTimes.set(block, performance.now() + delay);
      }
      syncRoles();
    }

    function refreshUnderlines() {
      blocks.filter((block) => !lineReveals.has(block)).forEach((block) => drawUnderline(block, false));
    }

    function animateLines(block) {
      if (typeof block.animate !== 'function' || !CSS.supports('mask-image', 'url("#about-line-mask")')) return;

      const textElements = block.matches('h2') ? [block] : Array.from(block.querySelectorAll('p'));
      const groups = textElements.flatMap((element) => {
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
        // Each block of text uses a uniform line-height, including bold text.
        const lines = Math.round(element.getBoundingClientRect().height / lineHeight);
        return lines > 0 ? [{ element, lines }] : [];
      });
      const lineCount = groups.reduce((count, entry) => count + entry.lines, 0);
      if (lineCount < 2) return;

      const svg = svgElement('svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      const defs = svgElement('defs');
      svg.append(defs);
      block.after(svg);

      // Animate the masks so the original text can keep its natural wrapping and selection.
      const stagger = Math.min(105, 720 / (lineCount - 1)) * revealScale;
      const animations = [];
      for (const { element, lines } of groups) {
        const mask = svgElement('mask');
        mask.id = `${panel.id}-copy-mask-${++nextMaskId}`;
        mask.setAttribute('maskContentUnits', 'objectBoundingBox');
        defs.append(mask);
        element.style.maskImage = `url("#${mask.id}")`;
        for (let line = 0; line < lines; line++) {
          const band = svgElement('rect');
          band.setAttribute('y', line / lines);
          band.setAttribute('width', '1');
          band.setAttribute('height', 1 / lines);
          band.setAttribute('fill', '#fff');
          mask.append(band);
          animations.push(band.animate([{ opacity: 0 }, { opacity: 1 }], {
            delay: animations.length * stagger,
            duration: Math.round(740 * revealScale),
            easing: 'ease-out',
            fill: 'both',
          }));
        }
      }

      const cleanup = () => {
        if (lineReveals.get(block) !== cleanup) return;
        lineReveals.delete(block);
        groups.forEach(({ element }) => element.style.removeProperty('mask-image'));
        animations.forEach((animation) => animation.cancel());
        svg.remove();
      };
      lineReveals.set(block, cleanup);
      return Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
        if (lineReveals.get(block) !== cleanup) return false;
        cleanup();
        return true;
      });
    }

    function clearLineReveals() {
      lineReveals.forEach((cleanup) => cleanup());
    }

    function reveal(block) {
      if (block.classList.contains('is-copy-visible')) return;
      const reduced = motionPreference.matches;
      const lineReveal = !reduced && fontsReady() ? animateLines(block) : null;
      block.classList.add('is-copy-visible');
      if (!phrases.length) return;
      if (lineReveal) {
        lineReveal.then((completed) => { if (completed) drawUnderline(block, true); });
      } else if (!reduced) {
        const fade = block.getAnimations?.().find((animation) => animation.transitionProperty === 'opacity');
        if (fade) fade.finished.then(() => drawUnderline(block, true), () => {});
        else drawUnderline(block, true);
      } else drawUnderline(block, false);
    }

    function resetVisit() {
      cancelAnimationFrame(firstRevealFrame);
      firstRevealFrame = 0;
      clearTimeout(rolesTimer);
      rolesReadyTimes.clear();
      roles?.classList.remove('is-roles-visible');
      clearLineReveals();
      hasScrolled = false;
      lastScrollTop = panel.scrollTop;
      blocks.forEach((block) => {
        block.classList.remove('is-copy-visible');
        block.querySelectorAll('.about-underline').forEach((stroke) => stroke.remove());
      });
    }

    function scheduleFirstReveal() {
      if (!firstBlock || firstRevealFrame || firstBlock.classList.contains('is-copy-visible') || !canReveal()) return;
      // Commit the hidden starting style before the entrance class changes.
      void firstBlock.offsetWidth;
      firstRevealFrame = requestAnimationFrame(() => {
        firstRevealFrame = 0;
        if (!destroyed && canReveal()) reveal(firstBlock);
      });
    }

    function revealVisibleCopies() {
      if (destroyed) return;
      if (motionPreference.matches) {
        blocks.forEach(reveal);
        return;
      }
      if (waitingForFont) return;
      scheduleFirstReveal();
      if (!hasScrolled || !canReveal()) return;
      const panelRect = panel.getBoundingClientRect();
      const top = Math.max(0, panelRect.top);
      const bottom = Math.min(window.innerHeight, panelRect.bottom);
      const entryLine = top + (bottom - top) * 0.88;
      blocks.forEach((block) => {
        if (block === firstBlock || block.classList.contains('is-copy-visible')) return;
        const rect = block.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > top && rect.top < entryLine) reveal(block);
      });
    }

    function syncVisit() {
      if (destroyed) return;
      const open = isVisitOpen();
      if (open !== visitOpen) {
        visitOpen = open;
        resetVisit();
      }
      revealVisibleCopies();
    }

    function onScroll() {
      const nextScrollTop = panel.scrollTop;
      const moved = Math.abs(nextScrollTop - lastScrollTop) > 0.5;
      lastScrollTop = nextScrollTop;
      if (moved && canReveal()) hasScrolled = true;
      revealVisibleCopies();
    }

    function onFocus(event) {
      // The heading itself receives programmatic focus on entry to Contact.
      const focusedBlock = blocks.find((block) => block !== event.target && block.contains(event.target));
      if (!focusedBlock) return;
      lineReveals.get(focusedBlock)?.();
      focusedBlock.classList.add('is-copy-visible');
      if (!focusedBlock.querySelector('.about-underline')) drawUnderline(focusedBlock, false);
    }

    function onResize() {
      clearLineReveals();
      revealVisibleCopies();
      refreshUnderlines();
    }

    function onMotionChange() {
      clearLineReveals();
      revealVisibleCopies();
      refreshUnderlines();
    }

    // The CSS enhancement is enabled only after a controller can reveal the copy.
    panel.classList.add('has-copy-reveal');
    panel.addEventListener('scroll', onScroll, { passive: true });
    panel.addEventListener('focusin', onFocus);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', revealVisibleCopies);
    motionPreference.addEventListener('change', onMotionChange);

    const mutationObserver = new MutationObserver(syncVisit);
    mutationObserver.observe(panel, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'inert'] });
    mutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const intersectionObserver = new IntersectionObserver(() => {
      revealVisibleCopies();
      syncRoles();
    }, { root: panel, threshold: [0, 0.01, 1] });
    blocks.forEach((block) => intersectionObserver.observe(block));
    if (roles) intersectionObserver.observe(roles);

    window[controller] = {
      refresh: syncVisit,
      getState: () => ({ visitOpen, hasScrolled,
        visibleCount: blocks.filter((block) => block.classList.contains('is-copy-visible')).length }),
      destroy() {
        destroyed = true;
        clearTimeout(fontTimer);
        resetVisit();
        mutationObserver.disconnect();
        intersectionObserver.disconnect();
        panel.removeEventListener('scroll', onScroll);
        panel.removeEventListener('focusin', onFocus);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', revealVisibleCopies);
        motionPreference.removeEventListener('change', onMotionChange);
        panel.classList.remove('has-copy-reveal');
        panel.style.removeProperty('--copy-reveal-duration');
        delete window[controller];
      }
    };

    if (waitingForFont) {
      const finishFontWait = () => {
        clearTimeout(fontTimer);
        if (!waitingForFont || destroyed) return;
        waitingForFont = false;
        revealVisibleCopies();
      };
      fontTimer = setTimeout(finishFontWait, 1200);
      Promise.all(fontSamples.map(([font, sample]) => document.fonts.load(font, sample))).then(() => {
        selectedFontReady = true;
        finishFontWait();
        if (!destroyed) refreshUnderlines();
      }, finishFontWait);
    }
    syncVisit();
    onFocus({ target: document.activeElement });
  }

  function initialize() {
    initAboutMarquee();
    const { site, about } = window.SAN_CONTENT || {};
    const siteSettings = window.SanSiteSettings;
    const speed = site?.textSpeed || siteSettings?.defaults.textSpeed;
    const revealScale = speed === 'fast' ? .75 : speed === 'slow' ? 1.35 : 1;
    const underlines = siteSettings?.underlines;
    initCopyReveal({
      panelId: 'aboutPanel',
      selector: '.about-copy-first, .about-copy-last',
      family: siteSettings?.fontFamily?.(site?.bodyFont, site?.fontLibrary) || 'Inter',
      controller: 'sanAboutCopyReveal',
      revealScale,
      phrases: [
        about?.firstUnderline ?? underlines?.firstUnderline,
        about?.lastUnderline ?? underlines?.lastUnderline,
      ],
    });
    initCopyReveal({
      panelId: 'contactPanel',
      selector: '.contact-title',
      family: siteSettings?.fontFamily?.(site?.contactFont, site?.fontLibrary) || 'Anton',
      controller: 'sanContactTitleReveal',
      revealScale,
      phrases: ['me manda um oi'],
    });
  }

  const start = () => Promise.resolve(window.sanContentReady).then(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
