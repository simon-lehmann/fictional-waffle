import { useEffect, useRef } from "react";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import type { PreparedTextWithSegments, LayoutCursor } from "@chenglou/pretext";

// ---------------------------------------------------------------------------
// Text source — readable English prose that loops
// ---------------------------------------------------------------------------
const SOURCE =
  "wave after wave the tide rolls in and the current drifts along the shore where light meets water and the horizon bends into the distance echoing pulses of rhythm flowing endlessly forward through layers of motion rising and falling like breath ";

function generateText(length: number): string {
  let t = "";
  while (t.length < length) t += SOURCE;
  return t.slice(0, length);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Interval = { left: number; right: number };
type PositionedLine = { x: number; y: number; text: string; width: number };

type WaveObstacle = {
  baseX: number; // fraction of viewport width (0–1)
  amplitude: number; // fraction of viewport width
  frequency: number; // vertical frequency
  halfWidth: number; // px — half-thickness of the blocked band
  speed: number; // phase speed (negative = opposite direction)
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FONT = "24px 'Courier New', Courier, monospace";
const LINE_HEIGHT = 30;
const PHASE_SPEED = 0.012;
const MIN_SLOT_WIDTH = 60; // ignore slivers narrower than ~4 chars
const SPAN_POOL_SIZE = 250;

const WAVES: WaveObstacle[] = [
  { baseX: 0.33, amplitude: 0.08, frequency: 0.007, halfWidth: 45, speed: 0.4 },
  { baseX: 0.67, amplitude: 0.06, frequency: 0.011, halfWidth: 35, speed: -0.3 },
];

// ---------------------------------------------------------------------------
// Wave geometry — compute blocked interval for one wave at a line band
// ---------------------------------------------------------------------------
function waveIntervalForBand(
  wave: WaveObstacle,
  bandTop: number,
  bandBottom: number,
  vw: number,
  phase: number,
): Interval | null {
  const cx = wave.baseX * vw;
  const amp = wave.amplitude * vw;
  const p = phase * wave.speed;

  // Sample the sine across the band to get the x-envelope
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = bandTop; y <= bandBottom; y += 2) {
    const x = cx + amp * Math.sin(wave.frequency * y + p);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const left = minX - wave.halfWidth;
  const right = maxX + wave.halfWidth;
  if (right < 0 || left > vw) return null;
  return { left, right };
}

// ---------------------------------------------------------------------------
// Carve text line slots — ported from pretext's wrap-geometry.ts
// Given one allowed interval and a set of blocked intervals, return the
// remaining usable slots (discarding slivers).
// ---------------------------------------------------------------------------
function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots: Interval[] = [base];
  for (let bi = 0; bi < blocked.length; bi++) {
    const b = blocked[bi]!;
    const next: Interval[] = [];
    for (let si = 0; si < slots.length; si++) {
      const s = slots[si]!;
      if (b.right <= s.left || b.left >= s.right) {
        next.push(s);
        continue;
      }
      if (b.left > s.left) next.push({ left: s.left, right: b.left });
      if (b.right < s.right) next.push({ left: b.right, right: s.right });
    }
    slots = next;
  }
  return slots.filter((s) => s.right - s.left >= MIN_SLOT_WIDTH);
}

// ---------------------------------------------------------------------------
// Compute full layout — pure function, no DOM
// ---------------------------------------------------------------------------
function computeLayout(
  prepared: PreparedTextWithSegments,
  waves: WaveObstacle[],
  phase: number,
  vw: number,
  vh: number,
): PositionedLine[] {
  const lines: PositionedLine[] = [];
  const rowCount = Math.ceil(vh / LINE_HEIGHT) + 1;
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let textExhausted = false;

  for (let row = 0; row < rowCount && !textExhausted; row++) {
    const bandTop = row * LINE_HEIGHT;
    const bandBottom = bandTop + LINE_HEIGHT;

    // Collect blocked intervals from all wave obstacles
    const blocked: Interval[] = [];
    for (let wi = 0; wi < waves.length; wi++) {
      const interval = waveIntervalForBand(waves[wi]!, bandTop, bandBottom, vw, phase);
      if (interval !== null) blocked.push(interval);
    }

    // Carve available slots
    const slots = carveTextLineSlots({ left: 0, right: vw }, blocked);
    if (slots.length === 0) continue;

    // Sort slots left-to-right and lay out text into each
    slots.sort((a, b) => a.left - b.left);
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      const slotWidth = slot.right - slot.left;
      const line = layoutNextLine(prepared, cursor, slotWidth);
      if (line === null) {
        // Wrap around to start of text
        cursor = { segmentIndex: 0, graphemeIndex: 0 };
        const retry = layoutNextLine(prepared, cursor, slotWidth);
        if (retry === null) {
          textExhausted = true;
          break;
        }
        lines.push({
          x: Math.round(slot.left),
          y: Math.round(bandTop),
          text: retry.text,
          width: retry.width,
        });
        cursor = retry.end;
      } else {
        lines.push({
          x: Math.round(slot.left),
          y: Math.round(bandTop),
          text: line.text,
          width: line.width,
        });
        cursor = line.end;
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AsciiWaveBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let raf: number;
    let cancelled = false;

    // Wait for fonts then start
    document.fonts.ready.then(() => {
      if (cancelled) return;

      const text = generateText(40000);
      let prepared: PreparedTextWithSegments;
      try {
        prepared = prepareWithSegments(text, FONT);
      } catch {
        return;
      }

      // Span pool — absolutely positioned, reused across frames
      const pool: HTMLSpanElement[] = [];
      for (let i = 0; i < SPAN_POOL_SIZE; i++) {
        const span = document.createElement("span");
        span.style.cssText =
          "position:absolute;white-space:nowrap;display:none;will-change:transform";
        container.appendChild(span);
        pool.push(span);
      }

      let prevLines: PositionedLine[] = [];
      let phase = 0;

      const animate = () => {
        phase += PHASE_SPEED;
        const vw = container.offsetWidth || window.innerWidth;
        const vh = container.offsetHeight || window.innerHeight;

        const lines = computeLayout(prepared, WAVES, phase, vw, vh);

        // Diff and update DOM — only write what changed
        for (let i = 0; i < pool.length; i++) {
          const span = pool[i]!;
          if (i < lines.length) {
            const line = lines[i]!;
            const prev = prevLines[i];
            const changed =
              !prev ||
              prev.text !== line.text ||
              prev.x !== line.x ||
              prev.y !== line.y;
            if (changed) {
              span.textContent = line.text;
              span.style.transform = `translate(${line.x}px,${line.y}px)`;
            }
            if (!prev) span.style.display = "";
          } else if (i < prevLines.length) {
            span.style.display = "none";
          }
        }

        prevLines = lines;
        raf = requestAnimationFrame(animate);
      };

      animate();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        color: "rgba(148, 163, 184, 0.35)",
        fontSize: "24px",
        fontFamily: "'Courier New', Courier, monospace",
        lineHeight: `${LINE_HEIGHT}px`,
        pointerEvents: "none",
        zIndex: 0,
        userSelect: "none",
      }}
    />
  );
}
