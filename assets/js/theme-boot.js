/* Arranque del tema (síncrono, en <head>, antes del primer paint). ÚNICO dueño del modo:
   <html data-mode="light|dark"> + localStorage('dv-mode'). Por defecto: dark.
   Los colores de <meta name="theme-color"> viven en head.html (data-dark / data-light). */
(function () {
  var d = document.documentElement, m = 'dark';
  try {
    if (localStorage.getItem('dv-mode') === 'light') m = 'light';
    sessionStorage.removeItem('mode'); /* valor heredado del tema Chirpy: ya no se usa */
  } catch (e) {}
  d.setAttribute('data-mode', m);
  var t = document.querySelector('meta[name="theme-color"]');
  if (t) t.setAttribute('content', t.getAttribute('data-' + m) || t.getAttribute('content'));
})();
