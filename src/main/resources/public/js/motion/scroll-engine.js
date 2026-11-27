import { MAX_FRAME_MS, clamp, damp, easeOutExpo, normalizeWheelDelta } from "./motion-math.js";

export function canElementScroll(el, deltaY, win) {
  const { body, documentElement } = win.document;
  for (let node = el; node && node !== body && node !== documentElement; node = node.parentElement) {
    const max = node.scrollHeight - node.clientHeight;
    if (!(max > 0)) continue;
    const hasRoom = deltaY > 0 ? node.scrollTop < max : deltaY < 0 && node.scrollTop > 0;
    if (!hasRoom) continue;
    const { overflowY } = win.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return true;
  }
  return false;
}

export function createScrollEngine({ win = window, lambda = 9, isEnabled = () => true }) {
  const root = win.document.documentElement;
  const subscribers = new Set();
  let started = false;
  let frameId = null;
  let lastTime;
  let lastWritten = win.scrollY;
  let current = lastWritten;
  let target = current;
  let glide = null;

  function maxScroll() {
    return Math.max(0, root.scrollHeight - win.innerHeight);
  }

  function isHeld() {
    return root.classList.contains("motion-hold");
  }

  function reset(scrollY) {
    if (frameId !== null) win.cancelAnimationFrame(frameId);
    frameId = null;
    glide = null;
    lastWritten = current = target = scrollY;
  }

  function resync() {
    const scrollY = win.scrollY;
    // A native scroll can move the page without going through the engine.
    if (Math.abs(scrollY - lastWritten) > 1) reset(scrollY);
  }

  function interruptGlide() {
    if (glide) reset(win.scrollY);
  }

  function write(top) {
    lastWritten = top;
    win.scrollTo({ top, behavior: "instant" });
    for (const callback of subscribers) callback(win.scrollY);
  }

  function frame(now) {
    frameId = null;
    if (!isEnabled() || (!glide && isHeld())) {
      reset(win.scrollY);
      return;
    }

    const dt = now - lastTime;
    lastTime = now;
    let settled;
    if (glide) {
      glide.elapsed += Math.min(dt, MAX_FRAME_MS);
      current = glide.from + (target - glide.from) * easeOutExpo(glide.elapsed / glide.duration);
      settled = glide.elapsed >= glide.duration;
    } else {
      current = damp(current, target, lambda, dt);
      settled = Math.abs(target - current) < 0.5;
    }

    if (settled) {
      current = target;
      glide = null;
    } else {
      frameId = win.requestAnimationFrame(frame);
    }
    write(settled ? target : Math.round(current));
  }

  function requestFrame() {
    if (frameId !== null) return;
    lastTime = win.performance.now();
    frameId = win.requestAnimationFrame(frame);
  }

  function onWheel(event) {
    resync();
    interruptGlide();
    if (!isEnabled() || event.ctrlKey || event.metaKey || isHeld()) return;
    const delta = normalizeWheelDelta(event, win.innerHeight);
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || canElementScroll(event.target, delta, win)) return;

    event.preventDefault();
    target = clamp(target + delta, 0, maxScroll());
    requestFrame();
  }

  function onResize() {
    if (frameId === null) return;
    const max = maxScroll();
    current = clamp(current, 0, max);
    if (target <= max) return;
    target = max;
    if (glide) glide = { from: current, duration: glide.duration - glide.elapsed, elapsed: 0 };
  }

  const listeners = [
    ["wheel", onWheel, { passive: false }],
    ["scroll", resync],
    ["keydown", interruptGlide],
    ["pointerdown", interruptGlide],
    ["resize", onResize]
  ];

  return {
    start() {
      if (started) return;
      started = true;
      reset(win.scrollY);
      for (const [type, handler, options] of listeners) win.addEventListener(type, handler, options);
    },
    stop() {
      if (!started) return;
      started = false;
      for (const [type, handler] of listeners) win.removeEventListener(type, handler);
      reset(win.scrollY);
    },
    scrollTo(targetY, { duration }) {
      reset(win.scrollY);
      target = clamp(targetY, 0, maxScroll());
      if (!started || !isEnabled() || duration <= 0 || target === current) {
        current = target;
        write(target);
        return;
      }
      glide = { from: current, duration, elapsed: 0 };
      requestFrame();
    },
    onFrame(callback) {
      subscribers.add(callback);
      return () => { subscribers.delete(callback); };
    },
    isActive() { return frameId !== null; }
  };
}
