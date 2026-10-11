/**
 * Update month/day to locale datetime
 *
 * Requirement: <https://github.com/iamkun/dayjs>
 */

/* A tool for locale datetime */
class LocaleHelper {
  static get attrTimestamp() {
    return 'data-ts';
  }

  static get attrDateFormat() {
    return 'data-df';
  }

  static get locale() {
    return document.documentElement.getAttribute('lang').substring(0, 2);
  }

  static getTimestamp(elem) {
    return Number(elem.getAttribute(this.attrTimestamp)); // unix timestamp
  }

  static getDateFormat(elem) {
    return elem.getAttribute(this.attrDateFormat);
  }
}

export function initLocaleDatetime() {
  dayjs.locale(LocaleHelper.locale);
  dayjs.extend(window.dayjs_plugin_localizedFormat);
  // Formatea en UTC: la fecha de Hugo es medianoche UTC, así no cambia según la zona del visitante
  dayjs.extend(window.dayjs_plugin_utc);

  document
    .querySelectorAll(`[${LocaleHelper.attrTimestamp}]`)
    .forEach((elem) => {
      const date = dayjs.unix(LocaleHelper.getTimestamp(elem)).utc();
      const text = date.format(LocaleHelper.getDateFormat(elem));
      elem.textContent = text;
      elem.removeAttribute(LocaleHelper.attrTimestamp);
      elem.removeAttribute(LocaleHelper.attrDateFormat);

      // setup tooltips
      if (
        elem.hasAttribute('data-bs-toggle') &&
        elem.getAttribute('data-bs-toggle') === 'tooltip'
      ) {
        // see: https://day.js.org/docs/en/display/format#list-of-localized-formats
        const tooltipText = date.format('llll');
        elem.setAttribute('data-bs-title', tooltipText);
      }
    });
}