/**
 * Formatea fechas <time data-ts data-df> en el idioma de la página.
 * Sustituye a dayjs: cero KB de JS externo.
 * Las fechas de Hugo son medianoche UTC; se formatean en UTC.
 */

const FORMATS = {
  'll':         { year: 'numeric', month: 'short', day: 'numeric' },
  'llll':       { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' },
  'DD/MM/YYYY': { year: 'numeric', month: '2-digit', day: '2-digit' },
  'MMM':        { month: 'short' },
  'DD':         { day: '2-digit' },
  'MM':         { month: '2-digit' },
  'YYYY':       { year: 'numeric' },
};

function localeOf() {
  return (document.documentElement.getAttribute('lang') || 'en').substring(0, 2);
}

function formatDate(unixSeconds, dfKey, locale) {
  const date = new Date(unixSeconds * 1000);
  const opts = FORMATS[dfKey] || FORMATS['ll'];
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(date);
}

export function initLocaleDatetime() {
  const locale = localeOf();

  document.querySelectorAll('[data-ts]').forEach((elem) => {
    const ts = Number(elem.getAttribute('data-ts'));
    const df = elem.getAttribute('data-df') || 'll';

    elem.textContent = formatDate(ts, df, locale);
    elem.removeAttribute('data-ts');
    elem.removeAttribute('data-df');

    if (elem.getAttribute('data-bs-toggle') === 'tooltip') {
      elem.setAttribute('data-bs-title', formatDate(ts, 'llll', locale));
    }
  });
}
