window.MathJax = {
  tex: {
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)']
    ],
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]']
    ],
    tags: 'ams'
  },
  startup: {
    // MathJax mide la altura-x del texto que rodea cada fórmula UNA sola vez, al tipografiar, y escala
    // la fórmula para igualarla (chtml.matchFontHeight, activo por defecto). Con font-display: swap, si
    // en ese instante el texto sigue en la fuente de reserva, la escala sale ~2.6 % distinta y no se
    // corrige después. Por eso se espera a que estén cargadas las fuentes reales del contenido.
    pageReady: function () {
      var MAX_WAIT = 3000; // tope: si una fuente tarda o falla, las fórmulas salen igual
      var fonts = document.fonts;

      function contentFonts() {
        var selectors = ['.content p', '.content li', '.content td', '.content blockquote', '.content h2', '.content h3'];
        var bySpec = {};
        selectors.forEach(function (s) {
          var el = document.querySelector(s);
          if (!el) return;
          var cs = getComputedStyle(el);
          var spec = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          var text = (el.textContent || '').trim().slice(0, 200) || 'a';
          bySpec[spec] = (bySpec[spec] || '') + text;
        });
        return bySpec;
      }

      function fontsReady() {
        if (!fonts || !fonts.load) return Promise.resolve();
        var specs = contentFonts();
        var loads = Object.keys(specs).map(function (spec) {
          return fonts.load(spec, specs[spec]).catch(function () {});
        });
        return Promise.all(loads).then(function () { return fonts.ready; });
      }

      var timeout = new Promise(function (resolve) { setTimeout(resolve, MAX_WAIT); });
      return Promise.race([fontsReady().catch(function () {}), timeout]).then(function () {
        return MathJax.startup.defaultPageReady();
      });
    }
  }
};
