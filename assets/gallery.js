(function () {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const modulo = (value, count) => ((value % count) + count) % count;
  const hash = (column, row, salt) => {
    let value = Math.imul(column ^ salt, 374761393) ^ Math.imul(row, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const stringHash = value => {
    let result = 2166136261;
    for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return result | 0;
  };

  class SanGallery {
    constructor(root, options) {
      if (!(root instanceof HTMLElement)) throw new TypeError('A galeria precisa de um elemento raiz.');
      const settings = options || {};
      this.root = root;
      this.plane = root.querySelector('#galleryPlane');
      if (!this.plane) {
        this.plane = document.createElement('div');
        this.plane.id = 'galleryPlane';
        root.append(this.plane);
      }
      this.items = Array.isArray(settings.items) ? settings.items.filter(item => item && item.src) : [];
      this.featuredProject = this.items.find(item => item.id === settings.featuredProjectId);
      this.filteredItems = this.items.slice();
      this.onOpen = typeof settings.onOpen === 'function' ? settings.onOpen : function () {};
      this.onChange = typeof settings.onChange === 'function' ? settings.onChange : function () {};
      this.category = 'all';
      this.mode = settings.initialMode === 'grid' ? 'grid' : 'free';
      this.interacted = false;
      this.paused = false;
      this.destroyed = false;
      this.frame = 0;
      this.lastFrame = 0;
      this.pointer = null;
      this.suppressClickUntil = 0;
      this.camera = { x: 0, y: 0 };
      this.target = { x: 0, y: 0 };
      this.velocity = { x: 0, y: 0 };
      this.motion = { x: 0, y: 0 };
      this.focus = { x: 0, y: 0 };
      this.cards = [];
      this.cardRecords = new WeakMap();
      this.width = 0;
      this.height = 0;
      this.pixelRatio = window.devicePixelRatio || 1;
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.originalTouchAction = root.style.touchAction;
      this.hadTabIndex = root.hasAttribute('tabindex');
      if (!this.hadTabIndex) root.tabIndex = 0;

      this.handlePointerDown = this._onPointerDown.bind(this);
      this.handlePointerMove = this._onPointerMove.bind(this);
      this.handlePointerUp = this._onPointerUp.bind(this);
      this.handlePointerCancel = this._onPointerCancel.bind(this);
      this.handleClick = this._onClick.bind(this);
      this.handleWheel = this._onWheel.bind(this);
      this.handleKeyDown = this._onKeyDown.bind(this);
      this.handleDragStart = event => event.preventDefault();
      this.handleVisibility = () => {
        if (document.hidden) this._stopFrame();
        else {
          this.lastFrame = 0;
          this._requestFrame();
        }
      };
      this.handleMotionChange = event => {
        this.reducedMotion = event.matches;
        this.velocity.x = this.velocity.y = 0;
        this.motion.x = this.motion.y = 0;
        this.camera.x = this.target.x;
        this.camera.y = this.target.y;
        this._requestFrame();
      };
      this.root.addEventListener('pointerdown', this.handlePointerDown);
      this.root.addEventListener('click', this.handleClick);
      if (this.mode === 'free') this.root.addEventListener('wheel', this.handleWheel, { passive: false });
      this.root.addEventListener('keydown', this.handleKeyDown);
      this.root.addEventListener('dragstart', this.handleDragStart);
      document.addEventListener('visibilitychange', this.handleVisibility);
      this.motionQuery.addEventListener('change', this.handleMotionChange);
      this.root.classList.toggle('is-grid', this.mode === 'grid');
      this.root.style.touchAction = this.mode === 'grid' ? 'pan-y' : 'none';
      this.resizeObserver = new ResizeObserver(() => this._layout());
      this.resizeObserver.observe(this.root);
      this._layout(true);
      queueMicrotask(() => { if (!this.destroyed) this._notify(); });
    }

    setCategory(value) {
      const next = ['all', 'brand', 'ecommerce', 'illustration'].includes(value) ? value : 'all';
      if (next === this.category || this.destroyed) return;
      this._cancelPointer();
      this.category = next;
      this.filteredItems = this.items.filter(item => next === 'all' || item.category === next);
      this.velocity.x = this.velocity.y = 0;
      this.motion.x = this.motion.y = 0;
      this.camera.x = this.camera.y = this.target.x = this.target.y = 0;
      this.focus.x = this.focus.y = 0;
      this._buildCards();
      this.root.scrollTop = 0;
      this._notify();
      this._requestFrame();
    }

    setMode(value) {
      const next = value === 'grid' ? 'grid' : 'free';
      if (next === this.mode || this.destroyed) return;
      this._cancelPointer();
      this._stopFrame();
      this.velocity.x = this.velocity.y = 0;
      this.motion.x = this.motion.y = 0;
      this.target.x = this.camera.x;
      this.target.y = this.camera.y;
      this.mode = next;
      if (next === 'grid') this.root.removeEventListener('wheel', this.handleWheel);
      else this.root.addEventListener('wheel', this.handleWheel, { passive: false });
      this.root.classList.toggle('is-grid', next === 'grid');
      this.root.style.touchAction = next === 'grid' ? 'pan-y' : 'none';
      this.root.scrollTop = 0;
      this._layout(true);
      this._notify();
    }

    setPaused(value) {
      const next = Boolean(value);
      if (next === this.paused || this.destroyed) return;
      this.paused = next;
      if (next) {
        this._cancelPointer();
        this.velocity.x = this.velocity.y = 0;
        this.motion.x = this.motion.y = 0;
        for (const card of this.cards) card.vx = card.vy = 0;
        this.target.x = this.camera.x;
        this.target.y = this.camera.y;
        this._stopFrame();
      } else {
        this.lastFrame = 0;
        this._requestFrame();
      }
    }

    getVisibleCard(id) {
      const rootRect = this.root.getBoundingClientRect();
      let result = null;
      let nearest = Infinity;
      for (const card of this.cards) {
        if (!card.item || String(card.item.id) !== String(id) || card.button.style.visibility === 'hidden') continue;
        const origin = this._cardOrigin(card);
        const { rect } = origin;
        if (rect.right <= rootRect.left || rect.left >= rootRect.right || rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) continue;
        const distance = Math.hypot(rect.left + rect.width / 2 - rootRect.left - rootRect.width / 2, rect.top + rect.height / 2 - rootRect.top - rootRect.height / 2);
        if (distance < nearest) {
          nearest = distance;
          result = origin;
        }
      }
      return result;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this._cancelPointer();
      this._stopFrame();
      this.resizeObserver.disconnect();
      this.root.removeEventListener('pointerdown', this.handlePointerDown);
      this.root.removeEventListener('click', this.handleClick);
      this.root.removeEventListener('wheel', this.handleWheel);
      this.root.removeEventListener('keydown', this.handleKeyDown);
      this.root.removeEventListener('dragstart', this.handleDragStart);
      document.removeEventListener('visibilitychange', this.handleVisibility);
      this.motionQuery.removeEventListener('change', this.handleMotionChange);
      this.root.classList.remove('is-grid', 'is-dragging');
      this.root.style.touchAction = this.originalTouchAction;
      this.root.style.removeProperty('--card-width');
      this.plane.style.removeProperty('--mobile-grid-card-width');
      this.plane.style.removeProperty('--mobile-grid-bottom-padding');
      if (!this.hadTabIndex) this.root.removeAttribute('tabindex');
      this.plane.replaceChildren();
      this.cards = [];
    }

    _notify() {
      this.onChange({ category: this.category, mode: this.mode, uniqueCount: this.filteredItems.length, interacted: this.interacted });
    }

    _markInteracted() {
      if (!this.interacted) {
        this.interacted = true;
        this._notify();
      }
    }

    _layout(force) {
      if (this.destroyed) return;
      const width = this.root.clientWidth;
      const height = this.root.clientHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      if (!width || !height) return;
      if (!force && width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
      // Mobile browser controls resize the viewport inside a screen of stable height.
      const poolHeight = width <= 768 && window.matchMedia('(pointer: coarse)').matches
        ? Math.max(height, window.screen.height)
        : height;
      const canKeepCards = !force && width <= 768 && width === this.width && pixelRatio === this.pixelRatio &&
        (this.mode === 'grid' || Math.ceil(poolHeight / this.spacingY) + 4 === this.rows);
      if (canKeepCards) {
        const offsetY = (height - this.height) / 2;
        this.height = height;
        if (this.mode === 'free') {
          this.camera.y += offsetY;
          this.target.y += offsetY;
          this.lastFrame = 0;
          this._requestFrame();
        }
        return;
      }
      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.cardWidth = width < 600 ? 200.2 : width < 1000 ? 247 : 299;
      this.cardHeight = this.cardWidth * 1340 / 1080 + 42;
      this.gapX = width < 600 ? 121.6 : 224;
      this.gapY = width < 600 ? 115.2 : 179.2;
      this.spacingX = this.cardWidth + this.gapX;
      this.spacingY = this.cardHeight + this.gapY;
      this.columns = Math.ceil(width / this.spacingX) + 4;
      this.rows = Math.ceil(poolHeight / this.spacingY) + 4;
      this.root.style.setProperty('--card-width', this.cardWidth + 'px');
      this._buildCards();
      this._measureGridGeometry();
      if (this.mode === 'free') this._render(16.667, true);
      this._requestFrame();
    }

    _measureGridGeometry() {
      this.plane.style.removeProperty('--mobile-grid-card-width');
      this.plane.style.removeProperty('--mobile-grid-bottom-padding');
      if (this.mode !== 'grid' || !window.SanResponsiveImage.isMobile()) return;

      // Keep the fitted grid stable while the browser bars or safe area resize.
      const style = getComputedStyle(this.plane);
      const [columnWidth] = style.gridTemplateColumns.split(' ');
      if (!columnWidth.endsWith('px')) return;
      const bottomPadding = style.paddingBottom;
      this.plane.style.setProperty('--mobile-grid-card-width', columnWidth);
      this.plane.style.setProperty('--mobile-grid-bottom-padding', bottomPadding);
    }

    _makeCard(item) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-card';
      const media = document.createElement('span');
      media.className = 'gallery-card-media';
      const image = document.createElement('img');
      image.draggable = false;
      image.decoding = 'async';
      image.loading = this.mode === 'grid' ? 'lazy' : 'eager';
      media.append(image);
      const caption = document.createElement('span');
      caption.className = 'gallery-card-caption';
      caption.setAttribute('aria-hidden', 'true');
      const category = document.createElement('span');
      category.className = 'card-category';
      const title = document.createElement('span');
      title.className = 'card-title';
      caption.append(category, title);
      button.append(media, caption);
      const card = { button, media, image, category, title, item: null, source: null, requestedSource: null, column: null, row: null, x: 0, y: 0, vx: 0, vy: 0, width: this.cardWidth, height: this.cardHeight, scale: 1, imageVersion: 0, rotation: 0, visible: false };
      this.cardRecords.set(button, card);
      if (item) {
        this._setCardItem(card, item);
        const itemSeed = stringHash(item.id || item.src);
        card.scale = 1;
        button.style.width = '100%';
        button.style.setProperty('--card-intro-delay', Math.round(hash(itemSeed, 0, 1123) * 900) + 'ms');
      }
      return card;
    }

    _setCardItem(card, item) {
      card.item = item;
      card.button.dataset.id = String(item.id);
      card.button.dataset.category = item.category || '';
      card.button.setAttribute('aria-label', 'Ampliar ' + (item.title || item.categoryLabel || 'projeto'));
      const source = window.SanResponsiveImage.select(item);
      card.source = source.src;
      if (this.mode === 'grid') this._loadCardImage(card, source.src);
      card.image.alt = source.alt || item.title || 'Imagem do projeto';
      card.image.width = source.width || 1080;
      card.image.height = source.height || 1340;
      // Keep the crop inside the available source pixels on dense screens.
      card.image.style.maxWidth = source.width ? source.width / this.pixelRatio + 'px' : '';
      card.image.style.maxHeight = source.height ? source.height / this.pixelRatio + 'px' : '';
      card.category.textContent = item.categoryLabel || item.category || '';
      card.title.textContent = item.title || '';
    }

    _loadCardImage(card, source) {
      const image = card.image;
      card.requestedSource = source;
      if (this.mode === 'grid') {
        image.src = source;
        return;
      }
      const version = ++card.imageVersion;
      let decoding = false;
      card.button.style.opacity = '0';
      const reveal = async () => {
        if (decoding) return;
        decoding = true;
        if (typeof image.decode === 'function') {
          try { await image.decode(); } catch (_) { /* Keep a loaded image usable if decoding is unavailable. */ }
        }
        if (this.destroyed || version !== card.imageVersion) return;
        card.button.style.removeProperty('opacity');
        image.onload = image.onerror = null;
      };
      image.onload = reveal;
      image.onerror = () => {
        if (this.destroyed || version !== card.imageVersion) return;
        card.button.style.removeProperty('opacity');
        image.onload = image.onerror = null;
      };
      image.src = source;
      if (image.complete && image.naturalWidth) reveal();
    }

    _buildCards() {
      this.cards = [];
      this.cardRecords = new WeakMap();
      const fragment = document.createDocumentFragment();
      const gridItems = this.mode === 'grid' ? this.filteredItems.slice() : null;
      const featuredIndex = gridItems?.indexOf(this.featuredProject) ?? -1;
      if (featuredIndex > 0) gridItems.unshift(...gridItems.splice(featuredIndex, 1));
      const count = !this.filteredItems.length ? 0 : this.mode === 'grid' ? this.filteredItems.length : this.columns * this.rows;
      for (let index = 0; index < count; index++) {
        const card = this._makeCard(gridItems?.[index] || null);
        if (this.mode === 'free') {
          card.button.style.visibility = 'hidden';
          card.button.tabIndex = -1;
        }
        this.cards.push(card);
        fragment.append(card.button);
      }
      this.plane.replaceChildren(fragment);
      this.root.classList.toggle('is-empty', count === 0);
      const emptyMessage = this.root.querySelector('#galleryEmpty');
      if (emptyMessage) {
        emptyMessage.hidden = count > 0;
        emptyMessage.textContent = this.items.length ? 'Nenhum projeto nesta categoria.' : 'Nenhum projeto adicionado ainda.';
      }
    }

    _requestFrame() {
      if (this.frame || this.paused || this.destroyed || document.hidden || this.mode !== 'free') return;
      this.frame = requestAnimationFrame(time => this._tick(time));
    }

    _stopFrame() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.lastFrame = 0;
    }

    _tick(time) {
      this.frame = 0;
      if (this.paused || this.destroyed || document.hidden || this.mode !== 'free') return;
      const delta = this.lastFrame ? clamp(time - this.lastFrame, 1, 48) : 16.667;
      this.lastFrame = time;
      let moving = false;
      if (!this.pointer && !this.reducedMotion) {
        const decay = Math.exp(-delta / 360);
        this.target.x += this.velocity.x * delta;
        this.target.y += this.velocity.y * delta;
        this.velocity.x *= decay;
        this.velocity.y *= decay;
        if (Math.abs(this.velocity.x) < 0.006) this.velocity.x = 0;
        if (Math.abs(this.velocity.y) < 0.006) this.velocity.y = 0;
        moving = Boolean(this.velocity.x || this.velocity.y);
      }
      const previousX = this.camera.x;
      const previousY = this.camera.y;
      const follow = this.reducedMotion ? 1 : 1 - Math.exp(-delta / (this.pointer ? 18 : 50));
      this.camera.x += (this.target.x - this.camera.x) * follow;
      this.camera.y += (this.target.y - this.camera.y) * follow;
      if (Math.abs(this.target.x - this.camera.x) < 0.02) this.camera.x = this.target.x;
      if (Math.abs(this.target.y - this.camera.y) < 0.02) this.camera.y = this.target.y;
      const motionFollow = this.reducedMotion ? 1 : 1 - Math.exp(-delta / 65);
      const motionX = this.reducedMotion ? 0 : clamp((this.camera.x - previousX) / delta, -4, 4);
      const motionY = this.reducedMotion ? 0 : clamp((this.camera.y - previousY) / delta, -4, 4);
      this.motion.x += (motionX - this.motion.x) * motionFollow;
      this.motion.y += (motionY - this.motion.y) * motionFollow;
      if (Math.abs(this.motion.x) < 0.003) this.motion.x = 0;
      if (Math.abs(this.motion.y) < 0.003) this.motion.y = 0;
      moving = Boolean(this.motion.x || this.motion.y) || moving;
      moving = this.camera.x !== this.target.x || this.camera.y !== this.target.y || moving;
      moving = this._render(delta, false) || moving;
      if (moving) this._requestFrame();
      else this.lastFrame = 0;
    }

    _render(delta, immediate) {
      if (!this.cards.length || !this.columns || this.mode !== 'free') return false;
      let moving = false;
      const mobile = this.width <= 768;
      const preloadX = this.spacingX / 2;
      const preloadY = this.spacingY / 2;
      const startColumn = Math.floor(this.camera.x / this.spacingX) - Math.floor(this.columns / 2);
      const startRow = Math.floor(this.camera.y / this.spacingY) - Math.floor(this.rows / 2);
      for (let row = startRow; row < startRow + this.rows; row++) {
        for (let column = startColumn; column < startColumn + this.columns; column++) {
          const card = this.cards[modulo(row, this.rows) * this.columns + modulo(column, this.columns)];
          if (!card) continue;
          const seed = hash(column, row, 157);
          // Alternating columns form a staggered brick pattern without permanent random offsets.
          const worldX = column * this.spacingX;
          const worldY = (row + (modulo(column, 2) ? 0.5 : 0)) * this.spacingY;
          const fresh = card.column !== column || card.row !== row;
          if (fresh) {
            card.column = column;
            card.row = row;
            const sizeVariation = hash(column, row, 811);
            const featuredInitial = mobile && column === 0 && row === 0;
            card.scale = featuredInitial ? 1.4 : sizeVariation > 0.75 ? 1.2 : !mobile && sizeVariation < 0.3 ? 0.8 : 1;
            card.width = this.cardWidth * card.scale;
            card.height = card.width * 1340 / 1080 + 42;
            card.button.style.width = card.width + 'px';
            card.button.style.setProperty('--card-intro-delay', Math.round(hash(column, row, 1123) * 900) + 'ms');
            // A diagonal cadence spreads the test images without an obvious repeated row.
            const imageIndex = modulo(column + row * 4 + Math.floor(row / 3), this.filteredItems.length);
            const featured = column === 0 && row === 0 && this.filteredItems.includes(this.featuredProject);
            this._setCardItem(card, featured ? this.featuredProject : this.filteredItems[imageIndex]);
          }
          const x = worldX - this.camera.x + this.width / 2 - card.width / 2;
          const y = worldY - this.camera.y + this.height / 2 - card.height / 2;
          const previousX = card.x;
          const previousY = card.y;
          const distance = Math.hypot(worldX - this.focus.x, worldY - this.focus.y);
          const distanceFactor = clamp(distance / Math.max(this.width, this.height, this.spacingX * 1.5), 0, 1);
          const angularFrequency = 1 / (22 + distanceFactor * 90);
          const damping = 0.79;
          if (fresh || immediate || this.reducedMotion) {
            card.x = x;
            card.y = y;
            card.vx = card.vy = 0;
          } else {
            // Substeps keep the damped spring stable on low-refresh and temporarily busy devices.
            const steps = Math.ceil(delta / 8);
            const step = delta / steps;
            for (let index = 0; index < steps; index++) {
              card.vx += ((x - card.x) * angularFrequency * angularFrequency - 2 * damping * angularFrequency * card.vx) * step;
              card.vy += ((y - card.y) * angularFrequency * angularFrequency - 2 * damping * angularFrequency * card.vy) * step;
              card.x += card.vx * step;
              card.y += card.vy * step;
            }
          }
          // Bound the trailing displacement so fast, reversing gestures keep neighboring cards apart.
          card.x = clamp(card.x, x - this.gapX * 0.3, x + this.gapX * 0.3);
          card.y = clamp(card.y, y - this.gapY * 0.3, y + this.gapY * 0.3);
          if (Math.abs(card.x - x) < 0.025 && Math.abs(card.vx) < 0.002) {
            card.x = x;
            card.vx = 0;
          }
          if (Math.abs(card.y - y) < 0.025 && Math.abs(card.vy) < 0.002) {
            card.y = y;
            card.vy = 0;
          }
          const speedX = fresh || immediate ? 0 : (card.x - previousX) / delta;
          const speedY = fresh || immediate ? 0 : (card.y - previousY) / delta;
          const resting = card.x === x && card.y === y && !card.vx && !card.vy && this.camera.x === this.target.x && this.camera.y === this.target.y;
          const desiredRotation = this.reducedMotion || immediate || resting ? 0 : clamp((speedX * 1.05 - speedY * (seed - 0.5) * 1.4) * (1.25 - distanceFactor * 0.4), -3.4, 3.4);
          card.rotation += (desiredRotation - card.rotation) * (immediate || this.reducedMotion ? 1 : 1 - Math.exp(-delta / (110 + seed * 55)));
          if (Math.abs(card.rotation - desiredRotation) < 0.008) card.rotation = desiredRotation;
          moving = card.x !== x || card.y !== y || Boolean(card.vx || card.vy) || card.rotation !== desiredRotation || moving;
          const visible = card.x < this.width + 24 && card.x + card.width > -24 && card.y < this.height + 24 && card.y + card.height > -24;
          // Recycled cells can sit far outside the viewport. Fetch only nearby artwork.
          if (card.requestedSource !== card.source &&
              card.x < this.width + preloadX && card.x + card.width > -preloadX &&
              card.y < this.height + preloadY && card.y + card.height > -preloadY) {
            card.image.fetchPriority = visible ? 'high' : 'low';
            this._loadCardImage(card, card.source);
          } else if (visible && !card.visible) card.image.fetchPriority = 'high';
          if (fresh || visible !== card.visible) {
            card.visible = visible;
            card.button.style.visibility = visible ? 'visible' : 'hidden';
            card.button.tabIndex = visible ? 0 : -1;
          }
          if (visible) card.button.style.transform = 'translate3d(' + card.x.toFixed(2) + 'px,' + card.y.toFixed(2) + 'px,0) rotate(' + card.rotation.toFixed(3) + 'deg)';
        }
      }
      return moving;
    }

    _onPointerDown(event) {
      if (this.mode !== 'free' || this.paused || this.pointer || !event.isPrimary || event.button !== 0) return;
      if (event.target.closest('a, input, textarea, select, [data-no-drag]')) return;
      this.velocity.x = this.velocity.y = 0;
      this._setFocus(event.clientX, event.clientY);
      this.pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, time: event.timeStamp, dragging: false };
      window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerCancel);
    }

    _onPointerMove(event) {
      const pointer = this.pointer;
      if (!pointer || event.pointerId !== pointer.id) return;
      if (!pointer.dragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
      if (!pointer.dragging) {
        pointer.dragging = true;
        this.root.classList.add('is-dragging');
        this.root.setPointerCapture(event.pointerId);
        this._markInteracted();
      }
      event.preventDefault();
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const elapsed = clamp(event.timeStamp - pointer.time, 8, 64);
      this.target.x -= dx;
      this.target.y -= dy;
      if (!this.reducedMotion) {
        this.velocity.x = this.velocity.x * 0.5 + clamp(-dx / elapsed, -3.2, 3.2) * 0.5;
        this.velocity.y = this.velocity.y * 0.5 + clamp(-dy / elapsed, -3.2, 3.2) * 0.5;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.time = event.timeStamp;
      this._requestFrame();
    }

    _onPointerUp(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      const dragged = this.pointer.dragging;
      if (dragged) this.suppressClickUntil = performance.now() + 250;
      if (!dragged || event.timeStamp - this.pointer.time > 90 || this.reducedMotion) this.velocity.x = this.velocity.y = 0;
      this._cancelPointer();
      this._requestFrame();
    }

    _onPointerCancel(event) {
      if (!this.pointer || event.pointerId !== this.pointer.id) return;
      this.velocity.x = this.velocity.y = 0;
      this._cancelPointer();
      this._requestFrame();
    }

    _cancelPointer() {
      const pointer = this.pointer;
      this.pointer = null;
      this.root.classList.remove('is-dragging');
      if (pointer && this.root.hasPointerCapture(pointer.id)) this.root.releasePointerCapture(pointer.id);
      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerCancel);
    }

    _onClick(event) {
      const button = event.target.closest('.gallery-card');
      if (!button || !this.plane.contains(button) || this.paused) return;
      if (event.detail !== 0 && performance.now() < this.suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const card = this.cardRecords.get(button);
      if (!card || !card.item) return;
      this._markInteracted();
      this.onOpen(card.item, this._cardOrigin(card));
    }

    _cardOrigin(card) {
      const { button, image, media } = card;
      const inset = image.offsetWidth < media.offsetWidth || image.offsetHeight < media.offsetHeight;
      return { button, image, media, rect: image.getBoundingClientRect(), radius: inset ? 0 : undefined };
    }

    _onWheel(event) {
      if (this.mode !== 'free' || this.paused || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      this._setFocus(event.clientX, event.clientY);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
      this.target.x += event.deltaX * unit;
      this.target.y += event.deltaY * unit;
      this.velocity.x = this.velocity.y = 0;
      this._markInteracted();
      this._requestFrame();
    }

    _onKeyDown(event) {
      if (event.target !== this.root || this.mode !== 'free' || this.paused) return;
      const distance = this.cardWidth * (event.shiftKey ? 2 : 0.8);
      this.focus.x = this.camera.x;
      this.focus.y = this.camera.y;
      const offsets = { ArrowLeft: [-distance, 0], ArrowRight: [distance, 0], ArrowUp: [0, -distance], ArrowDown: [0, distance] };
      if (offsets[event.key]) {
        event.preventDefault();
        this.target.x += offsets[event.key][0];
        this.target.y += offsets[event.key][1];
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.target.x = this.target.y = 0;
      } else return;
      this.velocity.x = this.velocity.y = 0;
      this._markInteracted();
      this._requestFrame();
    }

    _setFocus(clientX, clientY) {
      const rect = this.root.getBoundingClientRect();
      this.focus.x = this.target.x + clientX - rect.left - this.width / 2;
      this.focus.y = this.target.y + clientY - rect.top - this.height / 2;
    }
  }

  window.SanGallery = SanGallery;
})();
