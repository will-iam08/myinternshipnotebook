// Wires the scroll engine, scroll scenes, reveals and depth layers into the welcome page.
// Everything here is progressive enhancement: without it the page is a normal static layout.
import { clamp } from "./motion-math.js";
import { createScrollEngine } from "./scroll-engine.js";
import { createSceneSystem } from "./scenes.js";
import { SCENE_UPDATES } from "./scene-updates.js";

const MAX_DEPTH_TRAVEL = 60;
const HEADER_SCROLLED_AT = 24;

/** Wraps each word of an element's text in a mask so headlines can rise word by word. */
function splitWords(element) {
  let index = 0;
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) { walk(child); continue; }
      if (child.nodeType !== 3 || !child.textContent.trim()) continue;
      const fragment = child.ownerDocument.createDocumentFragment();
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { fragment.append(part); continue; }
        const mask = child.ownerDocument.createElement("span");
        mask.className = "reveal-word";
        const word = child.ownerDocument.createElement("span");
        word.style.setProperty("--i", String(index++));
        word.textContent = part;
        mask.append(word);
        fragment.append(mask);
      }
      child.replaceWith(fragment);
    }
  };
  walk(element);
}

export function initLandingMotion({ shell, win = window }) {
  const doc = win.document;
  const root = doc.documentElement;
  const reducedQuery = win.matchMedia("(prefers-reduced-motion: reduce)");
  const fineQuery = win.matchMedia("(pointer: fine) and (hover: hover)");
  const header = shell.querySelector(".landing-header");
  const hero = shell.querySelector(".landing-hero");
  const success = shell.querySelector("#signup-success");

  const reduced = () => reducedQuery.matches;
  const engineEnabled = () => !reduced() && fineQuery.matches && !shell.hidden;
  const headerHeight = () => header?.offsetHeight || 0;

  const engine = createScrollEngine({ win, isEnabled: engineEnabled });
  let scenes = null;
  let revealObserver = null;
  let depthLayers = [];
  let heroHeight = 1;
  let frameId = null;
  const cleanups = [];

  function measure() {
    shell.style.setProperty("--landing-header-h", `${headerHeight()}px`);
    heroHeight = Math.max(1, hero?.offsetHeight || 1);
    const scrollY = win.scrollY;
    // Geometry is cached here so the per-frame work never reads layout.
    depthLayers = [...shell.querySelectorAll("[data-depth]")].map(element => {
      element.style.removeProperty("--depth-y");
      const rect = element.getBoundingClientRect();
      return { element, depth: Number(element.dataset.depth) || 1, center: rect.top + scrollY + rect.height / 2 };
    });
    paint(scrollY);
  }

  function paint(scrollY) {
    header?.classList.toggle("landing-header-scrolled", scrollY > HEADER_SCROLLED_AT);
    if (reduced()) return;
    shell.style.setProperty("--hero-p", clamp(scrollY / heroHeight, 0, 1).toFixed(4));
    const viewportCenter = scrollY + win.innerHeight / 2;
    for (const layer of depthLayers) {
      const offset = clamp((viewportCenter - layer.center) * (1 - layer.depth), -MAX_DEPTH_TRAVEL, MAX_DEPTH_TRAVEL);
      layer.element.style.setProperty("--depth-y", `${offset.toFixed(1)}px`);
    }
  }

  function onScroll() {
    if (frameId !== null) return;
    frameId = win.requestAnimationFrame(() => {
      frameId = null;
      paint(win.scrollY);
    });
  }

  function syncClasses() {
    root.classList.toggle("motion-engine", engineEnabled());
    shell.classList.toggle("motion-ready", !reduced() && !shell.hidden);
    root.classList.toggle("motion-hold", Boolean(success && !success.hidden));
  }

  function startScenes() {
    if (reduced() || scenes) return;
    scenes = createSceneSystem({ win, engine, headerHeight });
    for (const wrapper of shell.querySelectorAll("[data-scene]")) {
      scenes.register(wrapper.dataset.scene, wrapper, { update: SCENE_UPDATES[wrapper.dataset.scene] });
    }
  }

  function startReveals() {
    if (reduced() || revealObserver) return;
    for (const element of shell.querySelectorAll('[data-reveal="words"]:not([data-split])')) {
      splitWords(element);
      element.dataset.split = "";
    }
    revealObserver = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.15 });
    for (const element of shell.querySelectorAll("[data-reveal]:not(.is-revealed)")) revealObserver.observe(element);
  }

  function stopMotionLayers() {
    scenes?.destroy();
    scenes = null;
    revealObserver?.disconnect();
    revealObserver = null;
    for (const element of shell.querySelectorAll("[data-reveal]")) element.classList.add("is-revealed");
    for (const { element } of depthLayers) element.style.removeProperty("--depth-y");
    shell.style.removeProperty("--hero-p");
  }

  function onPreferenceChange() {
    syncClasses();
    if (reduced()) stopMotionLayers();
    else { startScenes(); startReveals(); }
    measure();
  }

  const resizeObserver = new win.ResizeObserver(measure);
  resizeObserver.observe(doc.documentElement);
  if (header) resizeObserver.observe(header);
  win.addEventListener("scroll", onScroll, { passive: true });
  reducedQuery.addEventListener("change", onPreferenceChange);
  fineQuery.addEventListener("change", onPreferenceChange);
  cleanups.push(() => {
    resizeObserver.disconnect();
    win.removeEventListener("scroll", onScroll);
    reducedQuery.removeEventListener("change", onPreferenceChange);
    fineQuery.removeEventListener("change", onPreferenceChange);
  });
  if (success) {
    const successObserver = new win.MutationObserver(syncClasses);
    successObserver.observe(success, { attributes: true, attributeFilter: ["hidden"] });
    cleanups.push(() => successObserver.disconnect());
  }

  engine.start();
  syncClasses();
  startScenes();
  startReveals();
  measure();

  // Deterministic hooks for screenshots and browser tests.
  win.__motion = {
    setProgress: (id, p) => scenes?.setProgress(id, p),
    release: id => scenes?.release(id),
    settle: () => new Promise(resolve => {
      let quiet = 0;
      const check = () => {
        quiet = engine.isActive() ? 0 : quiet + 1;
        if (quiet >= 2) resolve();
        else win.requestAnimationFrame(check);
      };
      win.requestAnimationFrame(check);
    })
  };

  return {
    engineEnabled,
    scrollTo: (targetY, options) => engine.scrollTo(targetY, options),
    destroy() {
      engine.stop();
      stopMotionLayers();
      for (const cleanup of cleanups) cleanup();
      if (frameId !== null) win.cancelAnimationFrame(frameId);
      root.classList.remove("motion-engine", "motion-hold");
      shell.classList.remove("motion-ready");
      header?.classList.remove("landing-header-scrolled");
      delete win.__motion;
    }
  };
}
