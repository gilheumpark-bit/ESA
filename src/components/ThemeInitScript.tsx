'use client';

import Script from 'next/script';

/** Matches useSettings STORAGE_KEY + default theme */
const INIT = `
(function(){
  try {
    var raw = localStorage.getItem('esa-settings');
    var theme = 'system';
    if (raw) {
      var p = JSON.parse(raw);
      if (p && typeof p.theme === 'string') theme = p.theme;
    }
    var dark = false;
    if (theme === 'dark') dark = true;
    else if (theme === 'light') dark = false;
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var el = document.documentElement;
    if (dark) el.classList.add('dark'); else el.classList.remove('dark');
  } catch (e) {}
})();
`;

export default function ThemeInitScript() {
  return (
    <Script id="esa-theme-init" strategy="beforeInteractive">
      {INIT}
    </Script>
  );
}
