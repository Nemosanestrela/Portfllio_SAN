/* Cada imagem pode ter uma versão mobile; a original é usada como alternativa. */
(() => {
  'use strict';
  const mobile = window.matchMedia('(max-width: 768px)');
  function select(item) {
    if (!item || !mobile.matches || !item.mobile?.src) return item || {};
    return {
      src: item.mobile.src,
      width: item.mobile.width || item.width,
      height: item.mobile.height || item.height,
      alt: item.mobile.alt || item.alt || '',
    };
  }
  window.SanResponsiveImage = Object.freeze({ select, isMobile: () => mobile.matches });
})();
