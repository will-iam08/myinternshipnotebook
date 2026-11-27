import { clamp, sceneProgress } from "./motion-math.js";

export function createSceneSystem({ win = window, engine, headerHeight }) {
  const scenes = new Map();
  let viewportHeight;
  let frameId = null;
  let pendingScrollY;
  let destroyed = false;

  function render(scrollY) {
    if (!Number.isFinite(scrollY)) return;
    for (const scene of scenes.values()) {
      const { wrapper, stage, top, height, update, override } = scene;
      if (wrapper.dataset.sceneActive === undefined) continue;

      let progress;
      if (wrapper.dataset.pinned === "true") {
        progress = sceneProgress(scrollY, top, height, viewportHeight);
      } else {
        scene.entered ||= scrollY + viewportHeight > top;
        progress = scene.entered ? 1 : 0;
      }
      const p = override ?? progress;
      stage.style.setProperty("--p", p.toFixed(4));
      update?.(p, stage);
    }
  }

  function scheduleRender(scrollY) {
    if (destroyed) return;
    pendingScrollY = scrollY;
    if (frameId !== null) return;
    frameId = win.requestAnimationFrame(() => {
      frameId = null;
      render(pendingScrollY);
    });
  }

  function onScroll() {
    scheduleRender(win.scrollY);
  }

  function refresh() {
    viewportHeight = win.innerHeight;
    const availableHeight = viewportHeight - headerHeight();
    for (const { wrapper, stage } of scenes.values()) {
      const pinned = String(stage.scrollHeight <= availableHeight);
      if (wrapper.dataset.pinned !== pinned) wrapper.dataset.pinned = pinned;
    }

    // Pinning can change the height and page position of other wrappers.
    const scrollY = win.scrollY;
    for (const scene of scenes.values()) {
      const { top, height } = scene.wrapper.getBoundingClientRect();
      scene.top = top + scrollY;
      scene.height = height;
    }
    scheduleRender(scrollY);
  }

  const intersectionObserver = new win.IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) target.dataset.sceneActive = "";
      else delete target.dataset.sceneActive;
    }
    onScroll();
  }, { rootMargin: "100% 0px" });
  const resizeObserver = new win.ResizeObserver(refresh);
  resizeObserver.observe(win.document.documentElement);
  // Engine frames already run inside requestAnimationFrame: render now so scenes never trail the scroll by a frame.
  const unsubscribe = engine.onFrame(scrollY => {
    if (destroyed) return;
    if (frameId !== null) { win.cancelAnimationFrame(frameId); frameId = null; }
    render(scrollY);
  });
  win.addEventListener("scroll", onScroll);
  win.addEventListener("resize", refresh);

  function setProgress(id, p) {
    const scene = scenes.get(id);
    if (!scene || (p !== undefined && !Number.isFinite(p))) return;
    scene.override = p === undefined ? undefined : clamp(p, 0, 1);
    onScroll();
  }

  return {
    register(id, wrapper, { update } = {}) {
      if (destroyed || scenes.has(id)) return;
      const stage = wrapper.querySelector("[data-scene-stage]");
      if (!stage) return;
      scenes.set(id, { wrapper, stage, update, entered: false });
      intersectionObserver.observe(wrapper);
      resizeObserver.observe(wrapper);
      refresh();
    },
    refresh,
    render,
    setProgress,
    release(id) { setProgress(id, undefined); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      win.removeEventListener("scroll", onScroll);
      win.removeEventListener("resize", refresh);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      if (frameId !== null) win.cancelAnimationFrame(frameId);
      for (const { wrapper, stage } of scenes.values()) {
        delete wrapper.dataset.sceneActive;
        delete wrapper.dataset.pinned;
        stage.style.removeProperty("--p");
      }
      scenes.clear();
    }
  };
}
