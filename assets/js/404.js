  (function () {
    // Detect language: URL path first, then browser preference
    var path = window.location.pathname;
    var lang = 'en';

    if (path.startsWith('/es/') || path === '/es') {
      lang = 'es';
    } else {
      var nav = navigator.language || navigator.userLanguage || '';
      if (nav.toLowerCase().startsWith('es')) lang = 'es';
    }

    document.documentElement.setAttribute('lang', lang);

    // Show elements for the detected language
    document.querySelectorAll('[data-lang]').forEach(function (el) {
      if (el.getAttribute('data-lang') === lang) {
        el.classList.add('active');
      }
    });
  })();
