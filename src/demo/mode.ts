// Demo mode: visitors from Creative Universe try YOUrigin on example data that
// lives only in their own browser.
//
// It is the real app, opened with `?demo` in the address
// (https://kashka-25.github.io/YOUrigin/?demo). In demo mode:
//  - the library is a separate database ('yourigin-demo'): the real one is never opened;
//  - sync, change tracking, Showcase, portfolio publishing, edit notes and the
//    Claude connection are switched off, so nothing is written to any server;
//  - a "Demo · example data" bar is on every screen, with Reset and a way back.
//
// Decided once, when the app loads, from the address. Pure apart from reading it.

export const DEMO_DB_NAME = 'yourigin-demo';

function readDemo(): boolean {
  try {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}

/** True for the whole visit when the app was opened with ?demo. */
export const DEMO = readDemo();

/** A plain message for anything that would reach a server. */
export const DEMO_OFFLINE_MESSAGE = 'Not available in the demo: nothing here is sent anywhere.';

/**
 * Who may enter the demo. Cassidy decided on 9 Nov 2026 that it is open to anyone:
 * no entry key. If that ever changes, a gate would check the key here and show a
 * form on the demo welcome screen when this returns false.
 */
export function demoAccessAllowed(): boolean {
  return true;
}

/** Where "Back to Creative Universe" goes. */
const DEFAULT_BACK = import.meta.env.VITE_CREATIVE_UNIVERSE_URL || 'https://kashka-25.github.io/creative-universe/';

/** Only these hosts may be named in ?back=…, so the button can't be pointed at an unknown site. */
const BACK_HOSTS = ['kashka-25.github.io', 'localhost', '127.0.0.1'];

export function demoBackUrl(search = typeof window !== 'undefined' ? window.location.search : ''): string {
  const back = new URLSearchParams(search).get('back');
  if (back) {
    try {
      const u = new URL(back);
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if ((u.protocol === 'https:' || (local && u.protocol === 'http:')) && BACK_HOSTS.includes(u.hostname)) return u.href;
    } catch {
      /* not an address */
    }
  }
  return DEFAULT_BACK;
}

/** YOUrigin is in beta: visitors who want in, or want to hear when it's published, write here. */
export const BETA_EMAIL = 'YourOwnUniverse.life@gmail.com';
export const BETA_MAILTO = `mailto:${BETA_EMAIL}?subject=${encodeURIComponent('YOUrigin beta')}`;
