// Google Analytics 4, set up like the portfolio's (portfolio/src/lib/analytics.ts):
// one shared property (filter reports by hostname), ad features off, no
// analytics cookies for visitors in the EEA, the UK or Switzerland, and
// Google's script fetched only once the page has loaded and the browser is idle.
// Leave GA_ID empty to turn analytics off.
(() => {
  const GA_ID = 'G-LNBMSHVG6Q';
  if (!GA_ID) return;
  const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT',
    'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'];
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', { ...denied, region: CONSENT_REGIONS });
  gtag('consent', 'default', { ...denied, analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });

  const load = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  };
  addEventListener('load', () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 2000 }) : setTimeout(load, 1)));

  // A "how it's measured" panel opened. `toggle` doesn't bubble, so listen in the capture phase.
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d instanceof HTMLDetailsElement && d.classList.contains('how') && d.open) {
      gtag('event', 'how_open', { panel: d.querySelector('summary')?.textContent.trim() ?? '' });
    }
  }, true);

  // Links that leave the site: the repo, the maker's portfolio, pull requests on GitHub.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
    const destination = url.hostname.endsWith('gurn3k.com') ? 'portfolio'
      : url.pathname.startsWith('/gurn3k/') ? 'repo'
      : url.hostname === 'github.com' ? 'pull_request' : 'other';
    gtag('event', 'outbound_click', { destination, link_domain: url.hostname });
  }, true);
})();
