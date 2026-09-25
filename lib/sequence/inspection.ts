"use client";

export type InspectionState = {
  active: boolean;
  zoom: number;
  targetZoom: number;
  zoomVelocity: number;
  focusX: number;
  focusY: number;
  targetFocusX: number;
  targetFocusY: number;
  focusVelocityX: number;
  focusVelocityY: number;
  maxZoom: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM_CAP = 12;
const INITIAL: InspectionState = {
  active: false,
  zoom: 1,
  targetZoom: 1,
  zoomVelocity: 0,
  focusX: 0.5,
  focusY: 0.5,
  targetFocusX: 0.5,
  targetFocusY: 0.5,
  focusVelocityX: 0,
  focusVelocityY: 0,
  maxZoom: 1,
};

let state: InspectionState = { ...INITIAL };
const listeners = new Set<() => void>();

export const inspectionSnapshot = () => state;
export const subscribeInspection = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function publish(next: InspectionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

export function setInspectionMaxZoom(value: number) {
  const maxZoom = clamp(value, MIN_ZOOM, MAX_ZOOM_CAP);
  if (Math.abs(maxZoom - state.maxZoom) < 0.005) return;
  publish({
    ...state,
    maxZoom,
    zoom: Math.min(state.zoom, maxZoom),
    targetZoom: Math.min(state.targetZoom, maxZoom),
  });
}

export function setInspectionState(next: Partial<InspectionState>) {
  publish({ ...state, ...next });
}

export function resetInspection() {
  publish({ ...INITIAL, maxZoom: state.maxZoom });
}

export function wheelZoomTarget(
  current: number,
  deltaY: number,
  maxZoom: number,
) {
  // Trackpads send many tiny deltas while mouse wheels send sparse large ones.
  // Exponential scaling keeps both continuous without letting one event teleport
  // the camera across the product.
  const bounded = clamp(deltaY, -180, 180);
  return clamp(current * Math.exp(-bounded * 0.00082), MIN_ZOOM, maxZoom);
}

export function advanceSpring(
  value: number,
  velocity: number,
  target: number,
  elapsedMs: number,
  omega: number,
) {
  const dt = clamp(elapsedMs, 0, 100) / 1000;
  if (!dt) return { value, velocity };
  const displacement = value - target;
  const decay = Math.exp(-omega * dt);
  const spring = (velocity + omega * displacement) * dt;
  return {
    value: target + (displacement + spring) * decay,
    velocity: (velocity - omega * spring) * decay,
  };
}

export function normalizedFocus(
  clientX: number,
  clientY: number,
  rect: DOMRect,
) {
  return {
    x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
  };
}
