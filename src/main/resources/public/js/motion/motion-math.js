export const MAX_FRAME_MS = 64;
export const LINE_HEIGHT_PX = 16;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function range(p, start, end) {
  if (p <= start) return 0;
  if (p >= end) return 1;
  const length = end - start;
  // Subtracting decimal boundaries can round an exact midpoint away from 0.5.
  if (p === start + length / 2) return 0.5;
  return (p - start) / length;
}

export function dampFactor(lambda, dtMs) {
  // A frame stall should not consume the whole glide in one step.
  return 1 - Math.exp(-lambda * Math.min(dtMs, MAX_FRAME_MS) / 1000);
}

export function damp(current, target, lambda, dtMs) {
  return current + (target - current) * dampFactor(lambda, dtMs);
}

export function normalizeWheelDelta({ deltaMode, deltaY }, viewportHeight) {
  if (deltaMode === 1) return deltaY * LINE_HEIGHT_PX;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}

export function easeOutExpo(t) {
  t = clamp(t, 0, 1);
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

export function sceneProgress(scrollY, start, length, viewportHeight) {
  return clamp((scrollY - start) / Math.max(1, length - viewportHeight), 0, 1);
}
