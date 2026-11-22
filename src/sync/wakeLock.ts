// Keeps the screen on while a video is moving between devices.
//
// Browsers pause a web app once its screen turns off or it goes to the
// background, so a long upload from the phone would stop part-way. A screen wake
// lock stops the screen dimming while the transfer runs. Browsers drop the lock
// when the app is hidden, so it is taken again when the app comes back.
// Where wake locks aren't supported, nothing happens.

interface Sentinel {
  release(): Promise<void>;
  released?: boolean;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<Sentinel>;
}

function api(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

let holders = 0;
let sentinel: Sentinel | null = null;
let listening = false;
let asking: Promise<void> | null = null;

function acquire(): Promise<void> {
  asking ??= (async () => {
    const wl = api();
    if (!wl || holders === 0 || (sentinel && !sentinel.released)) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
      const got = await wl.request('screen');
      if (holders === 0) await got.release();
      else sentinel = got;
    } catch {
      /* refused (battery saver, not visible): the transfer still runs */
    }
  })().finally(() => {
    asking = null;
  });
  return asking;
}

function onVisible() {
  if (document.visibilityState === 'visible') void acquire();
}

/** Keeps the screen awake until the returned function is called. Nested holds share one lock. */
export function keepScreenAwake(): () => void {
  holders++;
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
    listening = true;
  }
  void acquire();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders--;
    if (holders > 0) return;
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) void s.release().catch(() => undefined);
  };
}

/** Whether this browser can keep the screen awake. */
export function canKeepScreenAwake(): boolean {
  return !!api();
}
