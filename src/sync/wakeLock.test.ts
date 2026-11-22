import { afterEach, describe, expect, it, vi } from "vitest";

class FakeSentinel {
  released = false;
  async release() {
    this.released = true;
  }
}

function install() {
  const made: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const s = new FakeSentinel();
    made.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
  return { made, request };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).wakeLock;
  vi.resetModules();
});

describe("keeping the screen awake during video transfers", () => {
  it("holds one lock while transfers run and lets go when the last one ends", async () => {
    const { made, request } = install();
    const { keepScreenAwake } = await import("./wakeLock");
    const a = keepScreenAwake();
    const b = keepScreenAwake();
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    a();
    a(); // twice is harmless
    await flush();
    expect(made[0].released).toBe(false);
    b();
    await flush();
    expect(made[0].released).toBe(true);
  });

  it("takes the lock again when the app comes back to the screen", async () => {
    const { made, request } = install();
    const { keepScreenAwake } = await import("./wakeLock");
    const release = keepScreenAwake();
    await flush();
    made[0].released = true; // the browser drops it when the app is hidden
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(made[1].released).toBe(false);
    release();
    await flush();
    expect(made[1].released).toBe(true);
  });

  it("does nothing where the browser has no wake lock", async () => {
    const { keepScreenAwake, canKeepScreenAwake } = await import("./wakeLock");
    expect(canKeepScreenAwake()).toBe(false);
    expect(() => keepScreenAwake()()).not.toThrow();
  });
});
