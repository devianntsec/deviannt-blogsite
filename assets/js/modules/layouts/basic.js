// Override de themes/hugo-theme-chirpy/assets/js/modules/layouts/basic.js
// Sin modeWatcher(): el botón #mode-toggle lo maneja solo site-runtime.js (dv-mode).
import { back2top, loadTooptip } from '../components';

export function basic() {
  back2top();
  loadTooptip();
}
