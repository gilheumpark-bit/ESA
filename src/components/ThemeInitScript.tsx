/** Runs before body paint so the persisted theme does not flash. */
const INIT = `(function(){try{var raw=localStorage.getItem('esa-settings');var theme='system';if(raw){var p=JSON.parse(raw);if(p&&typeof p.theme==='string')theme=p.theme}var dark=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark)}catch(e){}})();`;

export default function ThemeInitScript() {
  return <script id="esa-theme-init" dangerouslySetInnerHTML={{ __html: INIT }} />;
}
