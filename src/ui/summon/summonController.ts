import type { QualityLevel } from '../../domain/types';
import { TOKENS } from '../theme/tokens';
import { summonDurations, writePagePose } from './pageSummon';
import type { PagePose } from './pageSummon';
import { createMoteBuffer, moteCount, writeMotes } from './summonMotes';
import type { SummonDirection, SummonKind } from './summonTimings';

/**
 * The one animation loop of the page summon. It owns the clock (one `performance.now()` read per frame)
 * and the single 2D canvas of the motes, and writes only two strings per page and frame: `transform` and
 * `opacity`. It asks for a frame only while at least one page animates. Presentation only: nothing here
 * reads or writes the store or the ritual machine.
 */
const MAX_SLOTS = 4;
/** Pixels the canvas extends beyond the animated page rectangle. */
const MARGIN_PX = 160;
const MAX_PIXEL_RATIO = 1.5;
const SPRITE_PX = 16;

export interface SummonStartOptions {
  /** Seconds to wait before the animation clock starts (a summoned page stays hidden meanwhile). */
  delaySeconds?: number;
  /** Called once when the animation ends or is landed. Not called by `cancel`. */
  onDone?: () => void;
}

export interface SummonController {
  /** Starts animating `element` and writes its first pose at once. Restarts it if it already animates. */
  start(
    element: HTMLElement,
    kind: SummonKind,
    direction: SummonDirection,
    quality: QualityLevel,
    options?: SummonStartOptions,
  ): void;
  /** Jumps `element` to the end of its animation and calls its `onDone`. Does nothing for an idle element. */
  land(element: HTMLElement): void;
  /** Stops animating `element` and removes its inline pose, without calling `onDone`. */
  cancel(element: HTMLElement): void;
  isAnimating(): boolean;
  /** Registers the layer canvas. Without one, pages still animate and no motes are drawn. */
  attachLayer(canvas: HTMLCanvasElement): void;
  /** Lands every page, then drops the canvas, its context and the dot sprite. */
  detachLayer(): void;
}

interface Slot {
  active: boolean;
  element: HTMLElement | null;
  kind: SummonKind;
  direction: SummonDirection;
  quality: QualityLevel;
  startMs: number;
  durationSeconds: number;
  /** Page rectangle in viewport pixels, measured when the animation starts or the window is resized. */
  left: number;
  top: number;
  width: number;
  height: number;
  onDone: (() => void) | null;
}

function createSlot(): Slot {
  return {
    active: false,
    element: null,
    kind: 'full',
    direction: 'summon',
    quality: 'low',
    startMs: 0,
    durationSeconds: 0,
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    onDone: null,
  };
}

/** A 16 by 16 soft dot in the `mist` token, drawn once: three concentric discs at rising alpha. */
function createDotSprite(): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas');
  sprite.width = SPRITE_PX;
  sprite.height = SPRITE_PX;
  const context = sprite.getContext('2d');
  if (context === null) return null;
  context.fillStyle = TOKENS.color.mist;
  const center = SPRITE_PX / 2;
  const discs = [
    { radius: center, alpha: 0.25 },
    { radius: center * 0.7, alpha: 0.5 },
    { radius: center * 0.4, alpha: 1 },
  ];
  for (const disc of discs) {
    context.globalAlpha = disc.alpha;
    context.beginPath();
    context.arc(center, center, disc.radius, 0, Math.PI * 2);
    context.fill();
  }
  return sprite;
}

export function createSummonController(): SummonController {
  const slots: Slot[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) slots.push(createSlot());
  const pose: PagePose = { opacity: 1, offsetY: 0, tilt: 0, scale: 1 };
  const buffer = createMoteBuffer();
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let sprite: HTMLCanvasElement | null = null;
  let frameId = 0;
  let listening = false;
  let dirty = false;
  let originX = 0;
  let originY = 0;
  let cssWidth = 0;
  let cssHeight = 0;

  function anyActive(): boolean {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]?.active) return true;
    }
    return false;
  }

  function slotOf(element: HTMLElement): Slot | null {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot !== undefined && slot.active && slot.element === element) return slot;
    }
    return null;
  }

  /** The two per-frame style writes. */
  function applyPose(element: HTMLElement): void {
    element.style.transform = `translateY(${pose.offsetY}px) rotateX(${pose.tilt}deg) scale(${pose.scale})`;
    element.style.opacity = `${pose.opacity}`;
  }

  function clearCanvas(): void {
    if (context === null || !dirty) return;
    context.clearRect(0, 0, cssWidth, cssHeight);
    dirty = false;
  }

  function drawMotes(slot: Slot, t: number): void {
    if (context === null || sprite === null) return;
    const count = moteCount(slot.quality, false);
    const active = writeMotes(slot.direction, slot.kind, t, false, slot.width, slot.height, count, buffer);
    if (active === 0) return;
    const shiftX = slot.left - originX;
    const shiftY = slot.top - originY;
    for (let i = 0; i < count; i++) {
      const alpha = buffer.alpha[i] ?? 0;
      if (!(alpha > 0)) continue;
      const size = buffer.size[i] ?? 0;
      context.globalAlpha = alpha;
      context.drawImage(sprite, shiftX + (buffer.x[i] ?? 0) - size / 2, shiftY + (buffer.y[i] ?? 0) - size / 2, size, size);
    }
    context.globalAlpha = 1;
    dirty = true;
  }

  /** Ends a slot: a summon drops its inline pose, a dismissal keeps the invisible final pose. Then `onDone`. */
  function finish(slot: Slot): void {
    const element = slot.element;
    const done = slot.onDone;
    slot.active = false;
    slot.element = null;
    slot.onDone = null;
    if (element !== null) {
      if (slot.direction === 'summon') {
        element.style.removeProperty('transform');
        element.style.removeProperty('opacity');
      } else {
        writePagePose('dismiss', slot.kind, slot.durationSeconds, false, pose);
        applyPose(element);
      }
    }
    if (done !== null) done();
  }

  function step(slot: Slot, now: number): void {
    const t = (now - slot.startMs) / 1000;
    if (t >= slot.durationSeconds) {
      finish(slot);
      return;
    }
    const element = slot.element;
    if (element === null) return;
    writePagePose(slot.direction, slot.kind, t, false, pose);
    applyPose(element);
    drawMotes(slot, t);
  }

  function frame(): void {
    frameId = 0;
    const now = performance.now();
    clearCanvas();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot !== undefined && slot.active) step(slot, now);
    }
    if (anyActive()) frameId = requestAnimationFrame(frame);
    else settle();
  }

  /** Measures the page rectangle. `offsetY` is the vertical shift of the pose currently applied. */
  function measure(slot: Slot, element: HTMLElement, offsetY: number): void {
    const rect = element.getBoundingClientRect();
    slot.width = element.offsetWidth || rect.width;
    slot.height = element.offsetHeight || rect.height;
    slot.left = rect.left + (rect.width - slot.width) / 2;
    slot.top = rect.bottom - slot.height - offsetY;
  }

  /** Sizes and places the canvas over the union of the animated pages plus the margin. */
  function layout(): void {
    if (canvas === null || context === null) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let quality: QualityLevel = 'low';
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot === undefined || !slot.active) continue;
      quality = slot.quality;
      if (slot.left < minX) minX = slot.left;
      if (slot.top < minY) minY = slot.top;
      if (slot.left + slot.width > maxX) maxX = slot.left + slot.width;
      if (slot.top + slot.height > maxY) maxY = slot.top + slot.height;
    }
    if (minX === Infinity) return;
    originX = minX - MARGIN_PX;
    originY = minY - MARGIN_PX;
    cssWidth = maxX - minX + 2 * MARGIN_PX;
    cssHeight = maxY - minY + 2 * MARGIN_PX;
    const ratio = quality === 'low' ? 1 : Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    canvas.style.left = `${originX}px`;
    canvas.style.top = `${originY}px`;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.ceil(cssWidth * ratio);
    canvas.height = Math.ceil(cssHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    canvas.style.display = 'block';
    dirty = false;
  }

  function onResize(): void {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot !== undefined && slot.active && slot.element !== null) measure(slot, slot.element, 0);
    }
    layout();
  }

  /** Idle: no frame request, no listener, and the canvas is cleared once and hidden. */
  function settle(): void {
    if (frameId !== 0) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (listening) {
      window.removeEventListener('resize', onResize);
      listening = false;
    }
    if (context !== null && canvas !== null) {
      context.clearRect(0, 0, cssWidth, cssHeight);
      canvas.style.display = 'none';
    }
    dirty = false;
  }

  function start(
    element: HTMLElement,
    kind: SummonKind,
    direction: SummonDirection,
    quality: QualityLevel,
    options?: SummonStartOptions,
  ): void {
    const previous = slotOf(element);
    if (previous !== null) {
      previous.active = false;
      previous.element = null;
      previous.onDone = null;
    }
    let slot = slots.find((candidate) => !candidate.active);
    if (slot === undefined) {
      slot = slots[0] as Slot;
      finish(slot);
    }
    const delay = options?.delaySeconds ?? 0;
    const durations = summonDurations(kind, false);
    slot.active = true;
    slot.element = element;
    slot.kind = kind;
    slot.direction = direction;
    slot.quality = quality;
    slot.startMs = performance.now() + (delay > 0 ? delay * 1000 : 0);
    slot.durationSeconds = direction === 'summon' ? durations.inSeconds : durations.outSeconds;
    slot.onDone = options?.onDone ?? null;
    writePagePose(direction, kind, delay > 0 ? -delay : 0, false, pose);
    applyPose(element);
    measure(slot, element, pose.offsetY);
    if (!listening) {
      window.addEventListener('resize', onResize);
      listening = true;
    }
    layout();
    if (frameId === 0) frameId = requestAnimationFrame(frame);
  }

  function land(element: HTMLElement): void {
    const slot = slotOf(element);
    if (slot === null) return;
    finish(slot);
    if (!anyActive()) settle();
  }

  function cancel(element: HTMLElement): void {
    const slot = slotOf(element);
    if (slot === null) return;
    slot.active = false;
    slot.element = null;
    slot.onDone = null;
    element.style.removeProperty('transform');
    element.style.removeProperty('opacity');
    if (!anyActive()) settle();
  }

  function attachLayer(next: HTMLCanvasElement): void {
    canvas = next;
    context = next.getContext('2d');
    sprite = context === null ? null : createDotSprite();
    next.style.display = 'none';
    if (anyActive()) layout();
  }

  function detachLayer(): void {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot !== undefined && slot.active) finish(slot);
    }
    settle();
    canvas = null;
    context = null;
    sprite = null;
  }

  return {
    start,
    land,
    cancel,
    isAnimating: anyActive,
    attachLayer,
    detachLayer,
  };
}

export const summonController: SummonController = createSummonController();
