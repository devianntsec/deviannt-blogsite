/*
 * assets/js/site-runtime.js
 * Runtime JS del tema, extraído de metadata-hook.html.
 *
 * IIFE #1 (boot, se ejecuta de inmediato):
 *   - restaura dark/light mode desde localStorage antes del primer paint
 *   - redirect a /es/404/ si el 404 corresponde a sesión en español
 *   - cachea el avatar en localStorage (evita refetch en cada carga)
 *   - reload si sessionStorage marcó dv-needs-reload
 *
 * IIFE #2 (interacciones, se activa en load/DOMContentLoaded):
 *   - animación del título (dv-title-name)
 *   - toggle de tema (#mode-toggle)
 *   - soft-navigation tipo SPA (fetch + swap de #main-wrapper) + popstate
 *   - guard de TOC visible + guard del <link> de syntax highlighting
 *
 * Nota: esto es más que "avatar/dark-mode/404" — el archivo original
 * traía además todo el router soft-nav y la animación de título en el
 * mismo <script> gigante; se conservó junto porque ambas IIFEs comparten
 * funciones (reformatDatesDelayed, ensureTocVisible, initTitle) y romperlas
 * en más archivos requeriría exponerlas en window. Si se quiere separar
 * aún más, ese es el corte natural.
 */
(function(){
  try {
    var saved = localStorage.getItem('dv-mode');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(saved);
      document.documentElement.setAttribute('data-mode', saved);
    } else {
      document.documentElement.setAttribute('data-mode', 'dark');
    }
  } catch(e) {}

  if (window.__dv404) {
    try {
      var lastLang = sessionStorage.getItem('dv-lang');
      if (lastLang === 'es') { location.replace('/es/404/'); }
    } catch(e) {}
  }

  try {
    var currentLang = /^\/es(\/|$)/.test(location.pathname) ? 'es' : 'en';
    sessionStorage.setItem('dv-lang', currentLang);
  } catch(e) {}

  try {
    var needsReload = sessionStorage.getItem('dv-needs-reload');
    if (needsReload) {
      sessionStorage.removeItem('dv-needs-reload');
      location.reload();
    }
  } catch(e) {}

  try {
    var cachedAvatar = localStorage.getItem('dv-avatar');
    if (cachedAvatar) {
      document.addEventListener('DOMContentLoaded', function() {
        var img = document.querySelector('#avatar img[data-avatar-src]');
        if (img) img.src = cachedAvatar;
      });
    }
  } catch(e) {}

  document.addEventListener('DOMContentLoaded', function() {
    var siteTitle = document.querySelector('#sidebar .site-title');
    if (siteTitle) siteTitle.style.display = 'none';

    var img = document.querySelector('#avatar img[data-avatar-src]');
    if (!img) return;
    try { if (localStorage.getItem('dv-avatar')) return; } catch(e) {}

    var realSrc = img.getAttribute('data-avatar-src');
    img.src = realSrc;
    fetch(realSrc)
      .then(function(res) { return res.blob(); })
      .then(function(blob) {
        var reader = new FileReader();
        reader.onloadend = function() {
          var dataUrl = reader.result;
          try { localStorage.setItem('dv-avatar', dataUrl); } catch(e) {}
          img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
      })
      .catch(function() {});
  });
})();

(function () {

  var __dvSyntaxBaseHref = (function() {
    var el = document.getElementById('dv-syntax-css');
    if (el) return (el.getAttribute('href') || '').split('?')[0];
    var found = '';
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(l) {
      var h = l.getAttribute('href') || '';
      if (h.includes('syntax')) found = h.split('?')[0];
    });
    return found;
  })();

  function dvGuardSyntaxCSS() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
      if (link.id === 'dv-syntax-css') return;
      var href = link.getAttribute('href') || '';
      if (href.includes('syntax')) {
        link.parentNode.removeChild(link);
      }
    });
    if (__dvSyntaxBaseHref && !document.getElementById('dv-syntax-css')) {
      var restored = document.createElement('link');
      restored.rel  = 'stylesheet';
      restored.id   = 'dv-syntax-css';
      restored.href = __dvSyntaxBaseHref;
      document.head.appendChild(restored);
    }
  }

  var __dvHomeJsRef  = [null];
  var __dvThemeJsRef = [null];

  function dvRunBundle(cacheRef, path) {
    if (cacheRef[0] !== null) {
      try { (new Function(cacheRef[0]))(); } catch(e) {}
      return;
    }
    fetch(path)
      .then(function(r) { return r.text(); })
      .then(function(code) {
        cacheRef[0] = code;
        try { (new Function(cacheRef[0]))(); } catch(e) {}
      })
      .catch(function() {});
  }

  function reformatDates() {
    dvRunBundle(__dvHomeJsRef,  '/js/home.js');
    dvRunBundle(__dvThemeJsRef, '/js/modules/theme.js');
  }

  function reformatDatesDelayed() {
    reformatDates();
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { reformatDates(); });
    });
    setTimeout(reformatDates, 500);
  }

  var __tocObserver = null;

  function ensureTocVisible() {
    var toc = document.getElementById('toc-wrapper');
    if (!toc) return;
    toc.classList.remove('invisible');
    toc.style.setProperty('visibility', 'visible', 'important');
    toc.style.setProperty('opacity',    '1',        'important');
    if (__tocObserver) { __tocObserver.disconnect(); __tocObserver = null; }
    __tocObserver = new MutationObserver(function() {
      toc.classList.remove('invisible');
      toc.style.setProperty('visibility', 'visible', 'important');
      toc.style.setProperty('opacity',    '1',       'important');
    });
    __tocObserver.observe(toc, {
      attributes:      true,
      attributeFilter: ['style', 'class']
    });
  }

  window.addEventListener('load', function() {
    ensureTocVisible();
    setTimeout(ensureTocVisible, 600);
  });

  /* ------------------------------------------------------------
     TITLE ANIMATION
  ------------------------------------------------------------ */
  var NAV_PATTERNS = [
    /^\/$/, /^\/en\/$/, /^\/es\/$/,
    /^\/about/, /^\/archives/, /^\/categories/,
    /^\/tags/, /^\/404/
  ];

  function isPostPath(path) {
    return !NAV_PATTERNS.some(function(re) { return re.test(path); });
  }

  function getMetrics() {
    var wrap = document.querySelector('.dv-title-name');
    if (!wrap) return null;
    var wRect = wrap.getBoundingClientRect();
    var WP = wRect.width + 10;
    var H  = wRect.height;
    return {
      WP:     WP,
      barEnd: (WP - 4)  + 'px',
      dotEnd: (WP - 14) + 'px',
      hlH:    (H - 10)  + 'px',
      barR:   wrap.querySelector('.dv-bar-r'),
      dotBr:  wrap.querySelector('.dv-dot-br'),
      hl:     wrap.querySelector('.dv-highlight'),
      base:   wrap.querySelector('.dv-base'),
    };
  }

  function getTitleColors() {
    var isLight = document.documentElement.classList.contains('light') ||
                  document.documentElement.getAttribute('data-mode') === 'light';
    return isLight
      ? { base: 'rgba(37,99,235,0.18)', hl: 'rgba(37,99,235,0.38)' }
      : { base: 'rgba(59,130,246,0.35)', hl: 'rgba(59,130,246,0.55)' };
  }

  function applyFinalState() {
    var m = getMetrics();
    if (!m || !m.barR) return;
    var colors = getTitleColors();

    m.base.removeAttribute('style');
    m.hl.removeAttribute('style');
    m.barR.removeAttribute('style');
    m.dotBr.removeAttribute('style');

    m.base.style.setProperty('background',      colors.base, 'important');
    m.base.style.setProperty('position',        'absolute',  'important');
    m.base.style.setProperty('left',            '0',         'important');
    m.base.style.setProperty('top',             '2px',       'important');
    m.base.style.setProperty('bottom',          '2px',       'important');
    m.base.style.setProperty('z-index',         '0',         'important');
    m.base.style.setProperty('opacity',         '1',         'important');
    m.base.style.setProperty('pointer-events',  'none',      'important');
    m.base.style.setProperty('width',           m.WP + 'px', 'important');

    m.barR.style.setProperty('left',       m.barEnd,          'important');
    m.dotBr.style.setProperty('left',      m.dotEnd,          'important');
    m.dotBr.style.setProperty('transform', 'translateX(50%)', 'important');
    m.barR.style.setProperty('visibility',  'visible',        'important');
    m.dotBr.style.setProperty('visibility', 'visible',        'important');
  }

  function runAnimate() {
    var m = getMetrics();
    if (!m || !m.barR) return;
    var colors = getTitleColors();

    m.base.removeAttribute('style');
    m.hl.removeAttribute('style');
    m.barR.removeAttribute('style');
    m.dotBr.removeAttribute('style');

    m.barR.style.left = '0px';
    m.dotBr.style.left = '0px';
    m.dotBr.style.transform = 'translateX(50%)';
    m.barR.style.visibility = 'visible';
    m.dotBr.style.visibility = 'visible';

    m.barR.style.transition = 'left 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.1s';
    m.dotBr.style.transition = 'left 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.1s';

    m.base.style.cssText = 'position:absolute!important;left:0!important;top:2px!important;' +
      'width:0!important;height:' + m.hlH + 'px!important;' +
      'background:' + colors.base + '!important;z-index:0!important;' +
      'opacity:1;pointer-events:none!important;' +
      'transition:width 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s!important';

    m.hl.style.cssText = 'position:absolute!important;left:0!important;top:2px!important;' +
      'width:0!important;height:' + m.hlH + 'px!important;' +
      'background:' + colors.hl + '!important;z-index:1!important;' +
      'pointer-events:none!important;' +
      'transition:width 0.7s cubic-bezier(0.4,0,0.2,1) 0.1s!important';

    void m.hl.offsetWidth;
    void m.base.offsetWidth;

    requestAnimationFrame(function() {
      m.hl.style.width = m.WP + 'px';
      m.base.style.width = m.WP + 'px';
      m.barR.style.left = m.barEnd;
      m.dotBr.style.left = m.dotEnd;
    });
  }

  function initTitle(animate) {
    if (animate) {
      runAnimate();
    } else {
      applyFinalState();
    }
  }

  /* ------------------------------------------------------------
     THEME TOGGLE - solo cambia el modo, sin JS innecesario
  ------------------------------------------------------------ */
  function applyMode(next) {
    try { localStorage.setItem('dv-mode', next); } catch(e) {}
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(next);
    document.documentElement.setAttribute('data-mode', next);
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

    /*
     * El tema Chirpy trae su propio listener nativo (Theme.flip(), vía
     * mode-toggle.js) que se engancha a este mismo botón durante la carga
     * (commons.js con defer, corre antes que este script porque este
     * bloque se dispara recién en window.load). Si dejamos ambos, cada
     * click dispara los dos sistemas y se pisan entre sí — el de Chirpy
     * limpia el atributo data-mode, el nuestro lo vuelve a fijar, y según
     * el orden de ejecución el resultado visual queda inconsistente hasta
     * el próximo reload (que sí respeta la preferencia guardada).
     *
     * Clonamos el botón para descartar cualquier listener ya adjunto
     * (clonar un nodo NO copia sus event listeners) y enganchamos el
     * nuestro sobre el clon limpio, dejando un solo dueño del toggle.
     */
    var clean = btn.cloneNode(true);
    btn.parentNode.replaceChild(clean, btn);
    btn = clean;

    var val = btn.querySelector('.dv-theme-select__val');
    if (val) val.textContent = currentMode();

    btn.addEventListener('click', function() {
      applyMode(currentMode() === 'dark' ? 'light' : 'dark');
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { initTitle(false); });
      });
    });
  }

  /* ------------------------------------------------------------
     SOFT NAVIGATION
  ------------------------------------------------------------ */
  function resolveLanguageUrl(langLink, callback) {
    var langUrl      = langLink.getAttribute('data-lang-url')      || '';
    var langFallback = langLink.getAttribute('data-lang-fallback') || '';
    var currentPath  = location.pathname;

    if (langUrl) {
      try {
        var langUrlPath = new URL(langUrl, location.origin).pathname;
        var isHomePath = /^\/(es|en)?\/?$/.test(langUrlPath);
        if (!isHomePath) {
          fetch(langUrl, { method: 'HEAD', redirect: 'follow' })
            .then(function(res) {
              callback(res.ok ? langUrl : langFallback);
            })
            .catch(function() { callback(langFallback); });
          return;
        }
      } catch(e) {}
    }

    var currentLang = /^\/es(\/|$)/.test(currentPath) ? 'es' : 'en';
    var otherLang   = currentLang === 'es' ? 'en' : 'es';

    var slugPath = currentPath;
    slugPath = slugPath.replace(/^\/(es|en)\//, '/');
    slugPath = slugPath.replace(/\/$/, '');
    slugPath = slugPath.replace(/^\//, '');

    if (!slugPath) { callback(langFallback); return; }

    var candidatePath = otherLang === 'es'
      ? '/es/' + slugPath + '/'
      : '/'    + slugPath + '/';

    var candidateUrl = location.origin + candidatePath;

    fetch(candidateUrl, { method: 'HEAD', redirect: 'follow' })
      .then(function(res) {
        callback(res.ok ? candidateUrl : langFallback);
      })
      .catch(function() { callback(langFallback); });
  }

  var parser     = new DOMParser();
  var navigating = false;

  function isSameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; }
    catch(e) { return false; }
  }

  function shouldAnimate(targetPath) {
    var homePatterns = [/^\/$/, /^\/en\/$/, /^\/es\/$/];
    if (homePatterns.some(function(re) { return re.test(targetPath); })) {
      return true;
    }
    return isPostPath(targetPath);
  }

  function softNavigate(url, isPopState, forceAnimate) {
    if (navigating) return;
    navigating = true;
    var targetPath = new URL(url, location.href).pathname;
    try {
      var lang = /^\/es(\/|$)/.test(targetPath) ? 'es' : 'en';
      sessionStorage.setItem('dv-lang', lang);
    } catch(e) {}
    var targetIsPost = isPostPath(targetPath);
    if (targetIsPost) {
      try { sessionStorage.setItem('dv-needs-reload', '1'); } catch(e) {}
    }
    var main = document.getElementById('main-wrapper');
    if (main) main.classList.add('dv-transitioning');
    fetch(url)
      .then(function(res) { return res.text(); })
      .then(function(html) {
        var doc     = parser.parseFromString(html, 'text/html');
        var newMain = doc.getElementById('main-wrapper');
        var curMain = document.getElementById('main-wrapper');
        document.title = doc.title;
        if (newMain && curMain) curMain.innerHTML = newMain.innerHTML;
        if (!isPopState) history.pushState({dvSoft: true}, doc.title, url);
        document.querySelectorAll('#sidebar .nav-item').forEach(function(li) {
          li.classList.remove('active');
          var a = li.querySelector('a.nav-link');
          if (a) a.classList.remove('active');
        });
        document.querySelectorAll('#sidebar .nav-item a.nav-link').forEach(function(a) {
          var href = a.getAttribute('href');
          if (href && location.pathname === href) {
            a.classList.add('active');
            if (a.closest('.nav-item')) a.closest('.nav-item').classList.add('active');
          }
        });
        var curMain2 = document.getElementById('main-wrapper');
        if (curMain2) {
          curMain2.classList.remove('dv-transitioning');
          // A11y: mueve el foco al contenido nuevo (el link clickeado ya no
          // representa lo que hay en pantalla) y anuncia el título nuevo
          // para lectores de pantalla, ya que esto no es un load real.
          curMain2.setAttribute('tabindex', '-1');
          curMain2.focus({ preventScroll: true });
        }
        var announcer = document.getElementById('dv-route-announcer');
        if (announcer) announcer.textContent = doc.title;
        document.querySelectorAll('script[data-dv-injected]').forEach(function(s) {
          s.parentNode && s.parentNode.removeChild(s);
        });
        if (targetIsPost) {
          location.reload();
          return;
        }
        if (newMain) {
          var scripts = Array.from(newMain.querySelectorAll('script'));
          var externalScripts = scripts.filter(function(s) { return !!s.src; });
          var inlineScripts   = scripts.filter(function(s) { return !s.src && s.textContent.trim(); });
          externalScripts.forEach(function(oldScript) {
            var already = document.querySelector('script[src="' + oldScript.src + '"]');
            if (already) return;
            var s = document.createElement('script');
            s.src = oldScript.src;
            s.setAttribute('data-dv-injected', '1');
            document.body.appendChild(s);
          });
          requestAnimationFrame(function() {
            inlineScripts.forEach(function(oldScript) {
              try {
                (new Function(oldScript.textContent))();
              } catch(e) {
                if (e instanceof SyntaxError && /redeclaration|already been declared/i.test(e.message)) return;
                console.warn('[dv soft-nav] script error:', e.message);
              }
            });
          });
        }
        reformatDatesDelayed();
        var animate = (forceAnimate === true) ? true : shouldAnimate(targetPath);
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            initTitle(animate);
            setTimeout(ensureTocVisible, 500);
          });
        });
        window.scrollTo(0, 0);
        navigating = false;
      })
      .catch(function() {
        navigating = false;
        location.href = url;
      });
  }

  function scrollToAnchor(hash) {
    var id = decodeURIComponent(hash.replace(/^#/, ''));
    var target = document.getElementById(id);
    if (!target) {
      target = document.querySelector('[id="' + id.replace(/"/g, '\\"') + '"]');
    }
    if (!target) return false;

    var offset = 0;
    var tocBar = document.getElementById('toc-bar');
    if (tocBar && !tocBar.classList.contains('invisible')) {
      var tocBarStyle = window.getComputedStyle(tocBar);
      if (tocBarStyle.position === 'sticky' || tocBarStyle.position === 'fixed') {
        offset = tocBar.getBoundingClientRect().height || 0;
      }
    }

    var top = target.getBoundingClientRect().top + window.pageYOffset - offset - 8;
    window.scrollTo({ top: top, behavior: 'smooth' });
    history.pushState(null, '', hash);
    return true;
  }

  document.addEventListener('click', function(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;
    var a = e.target.closest('a');
    if (!a) return;
    if (a.getAttribute('data-hard-nav') === 'true') {
      e.preventDefault();
      if (a.getAttribute('data-lang-url')) {
        resolveLanguageUrl(a, function(url) { location.href = url; });
      } else {
        location.href = a.getAttribute('href');
      }
      return;
    }
    var href = a.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#')) {
      e.preventDefault();
      scrollToAnchor(href);
      return;
    }

    if (href.startsWith('mailto:') ||
        href.startsWith('tel:')    ||
        a.target === '_blank'      ||
        a.hasAttribute('download')) return;

    var fullUrl;
    try {
      if (href.startsWith('http://') || href.startsWith('https://')) {
        fullUrl = new URL(href);
      } else {
        fullUrl = new URL(href, location.origin);
      }
    } catch(e) { return; }

    if (fullUrl.origin !== location.origin) return;

    var normalizeP = function(p) {
      return decodeURIComponent(p).replace(/\/$/, '').toLowerCase();
    };
    if (fullUrl.hash && normalizeP(fullUrl.pathname) === normalizeP(location.pathname)) {
      e.preventDefault();
      scrollToAnchor(fullUrl.hash);
      return;
    }

    if (fullUrl.pathname + fullUrl.search === location.pathname + location.search) return;
    if (!isSameOrigin(fullUrl.href)) return;

    var targetPath = fullUrl.pathname;
    var isLangSwitch = !!a.getAttribute('data-lang-url');
    if (isLangSwitch) return;

    var curLang = /^\/es(\/|$)/.test(location.pathname) ? 'es' : 'en';
    var tgtLang = /^\/es(\/|$)/.test(targetPath) ? 'es' : 'en';
    if (curLang === 'es' && tgtLang === 'en' && a.closest('#sidebar')) {
      var correctedPath = '/es' + (targetPath.startsWith('/') ? targetPath : '/' + targetPath);
      try {
        var correctedUrl = new URL(correctedPath, location.origin);
        fullUrl = correctedUrl;
        targetPath = correctedPath;
      } catch(e) {}
    }

    var isSidebarHome = !!a.closest('.site-title-deviannt') ||
                        !!a.closest('#sidebar .site-title') ||
                        (a.closest('#sidebar') && (targetPath === '/' || /^\/(en|es)\/$/.test(targetPath)));
    var isNavItem = !!a.closest('#sidebar .nav-item') && !isSidebarHome;
    var forceAnimate = isSidebarHome ? true : undefined;
    if (isNavItem && !isSidebarHome) forceAnimate = false;
    e.preventDefault();
    softNavigate(fullUrl.href, false, forceAnimate);
  });

  window.addEventListener('popstate', function() {
    softNavigate(location.href, true);
  });

  window.addEventListener('load', function() {
    reformatDatesDelayed();
    dvGuardSyntaxCSS();
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        var animate = isPostPath(location.pathname) ||
                      /^\/$|^\/en\/$|^\/es\/$/.test(location.pathname);
        initTitle(animate);
        initThemeToggle();
        setTimeout(ensureTocVisible, 600);
      });
    });
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

    viewport.style.cursor = 'default';
  };
})();