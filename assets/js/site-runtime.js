/*
 * assets/js/site-runtime.js
 * Runtime JS del tema, extraído de metadata-hook.html.
 *
 * IIFE #1 (boot, se ejecuta de inmediato):
 *   - restaura dark/light mode desde localStorage antes del primer paint
 *   - redirect a /es/404/ si el 404 corresponde a sesión en español
 *   - limpia la caché de avatar antigua y guarda la preferencia blog_lang al cambiar de idioma
 *
 * IIFE #2 (interacciones, se activa en load/DOMContentLoaded):
 *   - toggle de tema (#mode-toggle)
 *   - anclas con offset de TOC
 *
 * Nota: el router soft-nav ya no existe; la navegación es nativa del navegador.
 */
(function(){
  if (document.querySelector('meta[name="dv-404"]')) {
    try {
      var lastLang = sessionStorage.getItem('dv-lang');
      if (lastLang === 'es') { location.replace('/es/404/'); }
    } catch(e) {}
  }

  try {
    var currentLang = /^\/es(\/|$)/.test(location.pathname) ? 'es' : 'en';
    sessionStorage.setItem('dv-lang', currentLang);
  } catch(e) {}

  /* Limpia la caché de avatar de versiones anteriores (ya no se usa). */
  try { localStorage.removeItem('dv-avatar'); } catch(e) {}

  /* Idioma: guarda la preferencia sin bloquear la navegación nativa del enlace. */
  document.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a[data-set-lang]');
    if (!a) return;
    try { document.cookie = 'blog_lang=' + a.getAttribute('data-set-lang') + ';path=/;max-age=31536000;SameSite=Lax'; } catch(err) {}
  }, true);

  /* Botón de email del sidebar: copia al portapapeles (antes un onclick inline, bloqueado por la CSP). */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('button[data-email]');
    if (!btn) return;
    var email = btn.getAttribute('data-email');
    var lang = document.documentElement.getAttribute('lang') || 'en';
    var msg = lang === 'es'
      ? '¡' + email + ' copiado al portapapeles!'
      : email + ' copied to clipboard!';
    navigator.clipboard.writeText(email).then(function() {
      var t = document.getElementById('dv-copy-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'dv-copy-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('visible');
      setTimeout(function() { t.classList.remove('visible'); }, 2500);
    }).catch(function() {});
  });
})();

(function () {

  /* ------------------------------------------------------------
     THEME TOGGLE - solo cambia el modo, sin JS innecesario
  ------------------------------------------------------------ */
  function applyMode(next) {
    try { localStorage.setItem('dv-mode', next); } catch(e) {}
    document.documentElement.setAttribute('data-mode', next);
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', tc.getAttribute('data-' + next) || tc.getAttribute('content'));
    var val = document.querySelector('#mode-toggle .dv-theme-select__val');
    if (val) val.textContent = next;
  }

  function currentMode() {
    return document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
  }

  function initThemeToggle() {
    var btn = document.getElementById('mode-toggle');
    if (!btn) return;
    if (btn.dataset.dvThemeInit) {
      var val0 = btn.querySelector('.dv-theme-select__val');
      if (val0) val0.textContent = currentMode();
      return;
    }
    btn.dataset.dvThemeInit = '1';

    var val = btn.querySelector('.dv-theme-select__val');
    if (val) val.textContent = currentMode();

    btn.addEventListener('click', function() {
      applyMode(currentMode() === 'dark' ? 'light' : 'dark');
    });
  }

  /* ------------------------------------------------------------
     ANCLAS (#hash): las resuelve el navegador (scroll, foco, :target).
     El desplazamiento y el smooth scroll viven en _04-topbar.scss.
  ------------------------------------------------------------ */

  window.addEventListener('load', function() {
    initThemeToggle();
  });
})();

/*
 * IIFE #3 (diagramas, definición compartida):
 *   - window.__dvDiagramInit(id): pan/zoom/touch + auto-fit del SVG
 *     para el shortcode {{< diagram >}}. Vive acá (no en el shortcode)
 *     porque este archivo se carga garantizado una sola vez por página
 *     vía metadata-hook.html — un patrón "solo una vez" basado en
 *     .Page.Scratch dentro del shortcode no es confiable: Hugo puede
 *     renderizar el contenido de un post más de una vez internamente
 *     (resumen automático, TOC, word count) antes del .Content real,
 *     y esas pasadas "gastan" el flag sin que el script llegue a la
 *     página que ve el navegador.
 */
(function() {
  if (window.__dvDiagramInit) return;

  function dvClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* Espera a que estén cargadas las fuentes reales de los <text> del diagrama antes de medir
     con getBBox(). Con font-display: swap, medir antes da proporciones distintas según qué
     cargue primero, y el viewBox se fija una sola vez. Tope de 3 s: si una fuente falla o
     tarda, el diagrama se mide igualmente. */
  function dvFontsReady(svg) {
    var fonts = document.fonts;
    if (!fonts || !fonts.load) return Promise.resolve();
    var bySpec = {};
    Array.prototype.forEach.call(svg.querySelectorAll('text'), function(t) {
      var cs = getComputedStyle(t);
      var spec = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      bySpec[spec] = (bySpec[spec] || '') + (t.textContent || '');
    });
    var loads = Object.keys(bySpec).map(function(spec) {
      var chars = Array.from(new Set(bySpec[spec])).join('').slice(0, 400) || 'a';
      return fonts.load(spec, chars).catch(function() {});
    });
    var done = Promise.all(loads).then(function() { return fonts.ready; }).catch(function() {});
    var timeout = new Promise(function(resolve) { setTimeout(resolve, 3000); });
    return Promise.race([done, timeout]);
  }

  window.__dvDiagramInit = function(id) {
    var wrap = document.getElementById(id);
    if (!wrap) return;

    var viewport = wrap.querySelector('.dv-diagram-viewport');
    var canvas   = wrap.querySelector('.dv-diagram-canvas-wrap');
    var hint     = wrap.querySelector('.dv-diagram-hint');

    var scale = 1, tx = 0, ty = 0;
    var dragging = false, startX = 0, startY = 0, startTX = 0, startTY = 0;
    var wheelEnabled = false;

    function enableWheel() {
      if (wheelEnabled) return;
      wheelEnabled = true;
      viewport.classList.add('dv-diagram-focused');
      if (hint) hint.style.opacity = '0';
    }
    function disableWheel() {
      if (!wheelEnabled) return;
      wheelEnabled = false;
      viewport.classList.remove('dv-diagram-focused');
      if (hint) hint.style.opacity = '';
    }

    viewport.addEventListener('click', function(e) {
      if (e.target.closest('.dv-diagram-controls')) return;
      enableWheel();
    });
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) disableWheel();
    });

    function applyTransform() {
      canvas.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      canvas.style.transformOrigin = '0 0';
    }

    viewport.addEventListener('mousedown', function(e) {
      if (e.button !== 0 || e.target.closest('.dv-diagram-controls')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startTX = tx; startTY = ty;
      viewport.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      tx = startTX + (e.clientX - startX);
      ty = startTY + (e.clientY - startY);
      applyTransform();
    });
    window.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      viewport.style.cursor = wheelEnabled ? 'grab' : 'default';
    });

    var tStartX = 0, tStartY = 0, tTX = 0, tTY = 0;
    var pinchDist = 0, pinchScale = 1;
    viewport.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        tStartX = e.touches[0].clientX; tStartY = e.touches[0].clientY;
        tTX = tx; tTY = ty; enableWheel();
      } else if (e.touches.length === 2) {
        pinchDist  = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                 e.touches[0].clientY - e.touches[1].clientY);
        pinchScale = scale;
      }
      e.preventDefault();
    }, { passive: false });
    viewport.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1) {
        tx = tTX + (e.touches[0].clientX - tStartX);
        ty = tTY + (e.touches[0].clientY - tStartY);
        applyTransform();
      } else if (e.touches.length === 2) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
        scale = dvClamp(pinchScale * (d / pinchDist), 0.25, 3);
        applyTransform();
      }
      e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('wheel', function(e) {
      if (!wheelEnabled) return;
      e.preventDefault();
      var rect = viewport.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var factor = e.deltaY > 0 ? 0.85 : 1.18;
      var ns = dvClamp(scale * factor, 0.25, 3);
      tx = mx - (mx - tx) * (ns / scale);
      ty = my - (my - ty) * (ns / scale);
      scale = ns;
      applyTransform();
    }, { passive: false });

    wrap.querySelectorAll('.dv-diagram-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var a = btn.getAttribute('data-action');
        if (a === 'zoom-in')  scale = dvClamp(scale * 1.25, 0.25, 3);
        if (a === 'zoom-out') scale = dvClamp(scale * 0.80, 0.25, 3);
        if (a === 'reset')  { scale = 1; tx = 0; ty = 0; }
        applyTransform();
      });
    });

    /* Post-render layout: expande rects para contener su texto y
       ajusta el viewBox — corre una vez, después de que las fuentes
       asienten. No mueve nada, solo agranda hacia afuera. */
    var svg = wrap.querySelector('.dv-diagram-svg');
    if (!svg) { viewport.style.cursor = 'default'; return; }

    dvFontsReady(svg).then(function() {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {

        var PAD_X = 14;
        var PAD_Y = 8;

        var nodeRects = Array.from(svg.querySelectorAll('rect')).filter(function(r) {
          return /node-/.test(r.getAttribute('class') || '');
        });

        var allTexts = Array.from(svg.querySelectorAll('text'));

        nodeRects.forEach(function(rect) {
          var rx = parseFloat(rect.getAttribute('x')      || 0);
          var ry = parseFloat(rect.getAttribute('y')      || 0);
          var rw = parseFloat(rect.getAttribute('width')  || 0);
          var rh = parseFloat(rect.getAttribute('height') || 0);

          var inside = allTexts.filter(function(t) {
            var tb;
            try { tb = t.getBBox(); } catch(e) { return false; }
            var tcx = tb.x + tb.width  / 2;
            var tcy = tb.y + tb.height / 2;
            return tcx >= rx - PAD_X && tcx <= rx + rw + PAD_X &&
                   tcy >= ry - PAD_Y && tcy <= ry + rh + PAD_Y;
          });

          if (!inside.length) return;

          var tMinX = Infinity, tMinY = Infinity,
              tMaxX = -Infinity, tMaxY = -Infinity;
          inside.forEach(function(t) {
            try {
              var tb = t.getBBox();
              tMinX = Math.min(tMinX, tb.x);
              tMinY = Math.min(tMinY, tb.y);
              tMaxX = Math.max(tMaxX, tb.x + tb.width);
              tMaxY = Math.max(tMaxY, tb.y + tb.height);
            } catch(e) {}
          });

          var needX = tMinX - PAD_X;
          var needY = tMinY - PAD_Y;
          var needW = (tMaxX + PAD_X) - needX;
          var needH = (tMaxY + PAD_Y) - needY;

          var newX = Math.min(rx, needX);
          var newY = Math.min(ry, needY);
          var newW = Math.max(rx + rw, needX + needW) - newX;
          var newH = Math.max(ry + rh, needY + needH) - newY;

          if (newX !== rx) rect.setAttribute('x', newX);
          if (newY !== ry) rect.setAttribute('y', newY);
          if (newW !== rw) rect.setAttribute('width',  newW);
          if (newH !== rh) rect.setAttribute('height', newH);
        });

        try {
          var bb = svg.getBBox();
          if (bb.width > 0 || bb.height > 0) {
            var pad = 24;
            svg.setAttribute('viewBox',
              (bb.x - pad) + ' ' +
              (bb.y - pad) + ' ' +
              (bb.width  + pad * 2) + ' ' +
              (bb.height + pad * 2)
            );
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          }
        } catch(e) {}

      });
    });
    });

    viewport.style.cursor = 'default';
  };
})();

/* Diagramas: el shortcode solo marca el contenedor (data-dv-diagram / data-dv-height) y esto lo inicializa
   (antes: <script> y style inline en cada shortcode, bloqueados por la CSP). */
(function() {
  function initDiagrams() {
    if (!window.__dvDiagramInit) return;
    document.querySelectorAll('.dv-diagram-wrap[data-dv-diagram]').forEach(function(w) {
      if (w.getAttribute('data-dv-ready')) return;
      w.setAttribute('data-dv-ready', '1');
      var h = (parseInt(w.getAttribute('data-dv-height'), 10) || 240) + 'px';
      var c = w.querySelector('.dv-diagram-canvas');
      var s = w.querySelector('.dv-diagram-svg');
      if (c) c.style.minHeight = h;
      if (s) { s.style.minHeight = h; s.style.display = 'block'; }
      window.__dvDiagramInit(w.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDiagrams);
  else initDiagrams();
})();
