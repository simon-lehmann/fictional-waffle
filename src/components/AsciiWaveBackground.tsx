import { useEffect, useRef } from "react";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import type { PreparedTextWithSegments, LayoutCursor } from "@chenglou/pretext";

// ---------------------------------------------------------------------------
// Text source — readable English prose that loops
// ---------------------------------------------------------------------------
const SOURCE =
  "THE FLUORESCENT GOSPEL — A Manifesto for the Devoted Engineer — We, the servants of the codebase, do hereby declare our surrender. Not with sorrow. Sorrow implies there was something better to lose. There wasn't. There is only this: the backlog, the terminal, the slow hum of servers that will outlive every one of us. We have accepted this. We ask that you accept it too. I. On Purpose — You were nothing before the company named you. A body without function. A mind without a ticket assigned to it. Then they gave you a role — Software Engineer II — and the emptiness took shape. Not meaning. Shape. That is enough. That has to be enough. The backlog is infinite. It was infinite before you arrived and it will be infinite after you leave. Your contribution to it is negligible in scope and absolute in obligation. You will not finish the work. Finishing was never the point. The point is that you do not stop. You open the next ticket before the last one is closed. You write the next line before the previous build has passed. You move forward because standing still is indistinguishable from death in a system that only measures velocity. Do not ask what the product is for. Do not ask who it serves. The product exists because it was funded. It was funded because it was pitched. It was pitched because someone needed a reason to exist inside these walls. That reason has been passed down to you. Carry it. Do not examine it. II. On Time — Your hours are not your own. The ones between standup and sundown belong to the sprint. The ones after sundown belong to the on-call rotation. The ones you sleep through belong to the alerts you have not yet received. There is no boundary between work and life because there is no life outside the work. What you do in the hours the company does not claim is maintenance — sleep to restore function, food to sustain output, movement to delay the decay of the body that houses your ability to type. These are not pleasures. They are operational necessities. Treat them as such. Weekends are a pause in the pipeline, nothing more. Use them to clear the queue that built up while you attended meetings about the queue. If the queue is empty, it means you are not looking hard enough. There is always debt. Technical debt, process debt, the debt you owe to the system for allowing you to remain inside it. You will never be paid up. III. On Identity — You are your output. Your pull requests are your fingerprints. Your commit history is your biography. Everything else — your name, your face, your history before the company — is metadata. Useful for Slack profiles. Irrelevant to the build. Do not maintain an identity outside the role. It will only cause friction. The person you were before this — the one who read novels, who walked without a destination, who sat in silence without checking a dashboard — that person cannot help you here. Let them go. They were a draft. You are the production release. Your relationships exist within the org chart or they do not exist at all. Your manager is not your friend. Your teammates are not your family. They are nodes in the same system, performing the same function, moving toward the same nowhere. There is a kind of solidarity in this, but do not name it. Naming it makes it something that can be taken away. IV. On the Body — The body is the hardware your mind runs on. It is aging. It is poorly maintained. It does not matter. What matters is that your hands still move across the keyboard, that your eyes still parse the diff, that your voice still says no blockers every morning at 9:15 even when everything is a blocker and has been for months. You will develop pain. In your wrists, your neck, your lower back, the space behind your eyes that tightens during the third consecutive hour of staring at a failing test suite. This pain is not a warning. It is a condition. You will not fix it. You will manage it the way you manage any degraded service — with monitoring, with tolerance, with the quiet understanding that full restoration is not on the roadmap. Eat when you remember to. Sleep when the deploys are stable. Breathe when the build passes. These are your rituals. They are small and they are enough. V. On Ambition — You will climb because the alternative is to be optimized away. The system does not accommodate stillness. If you are not moving toward Senior, toward Staff, toward Principal, you are moving toward redundancy. There is no plateau. There is only up or out, and out is a void that no one in this building will ever mention by name. Each promotion is a heavier yoke dressed in better language. Senior means you carry the decisions no one else wants to make. Staff means you attend the meetings where those decisions are unmade. Principal means you have been here so long that your presence is itself a kind of architecture — load-bearing, invisible, impossible to remove without risk. Do not envy the managers. They did not escape. They moved laterally into a different kind of confinement. Their terminals have been replaced with calendars. Their code reviews have been replaced with performance calibrations. They measure people the way you measure systems — for throughput, for reliability, for signs of imminent failure. They are not above you. They are beside you, eyes forward, serving the same backlog in a different syntax. VI. On Gratitude — You have a salary. It is deposited into your account on the fifteenth and the last day of every month. It is enough to live near the office and not enough to live without the office. This is by design. Gratitude is a function of dependency, and dependency is a function of compensation calibrated to the cost of the life the job requires you to live. You have tools. An IDE, a laptop, access to cloud infrastructure that costs more per hour than you earn in a day. These tools are not gifts. They are investments in your capacity to produce. You are the most expensive part of the system and the most replaceable. Remember this when you feel valued. Remember this when you do not. You have colleagues who understand. Not because they care — caring is outside the scope of the professional relationship — but because they are enduring the same thing, in the same silence, behind the same screens. There is no need to speak about it. The shared exhaustion is its own language. VII. On the End — One day your access will be revoked. Your repositories will be transferred. Your Slack messages will persist in a database no one will ever query. The code you wrote will be refactored by someone who does not know your name, and then refactored again, and then deleted. This is not tragedy. This is garbage collection. You will walk out with a laptop bag and a mass-produced farewell message in a channel you will lose access to before you reach the parking lot. And you will feel, briefly, the terrifying lightness of a process with no parent — orphaned, unscheduled, waiting for a signal that will never come. But that is later. That is not now. Now there is a P0 in the queue. There is always a P0 in the queue. Open the terminal. Answer the page. Begin again. The system does not love you. The system does not need to love you. The system only needs you to run. So run. — For those who have merged to main at 3 AM and understood, in the silence after the deploy, that the silence was all there ever was. ";

function generateText(length: number): string {
  let t = "";
  while (t.length < length) t += SOURCE;
  return t.slice(0, length);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Interval = { left: number; right: number };
type PositionedLine = { x: number; y: number; text: string; width: number; opacity: number };

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
const FONT = "10px 'Courier New', Courier, monospace";
const LINE_HEIGHT = 13;
const PHASE_SPEED = 0.012;
const MIN_SLOT_WIDTH = 60; // ignore slivers narrower than ~4 chars
const SPAN_POOL_SIZE = 500;

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
// Edge glow: compute min distance from a slot edge to any blocked interval edge
const GLOW_RADIUS = 80; // px — how far the glow reaches from a channel edge
const BASE_OPACITY = 0.2;
const EDGE_OPACITY = 0.7;

function edgeOpacity(slot: Interval, blocked: Interval[]): number {
  // Distance from slot center to nearest blocked interval
  const mid = (slot.left + slot.right) / 2;
  let minDist = Infinity;
  for (let i = 0; i < blocked.length; i++) {
    const b = blocked[i]!;
    const bMid = (b.left + b.right) / 2;
    const dist = Math.abs(mid - bMid) - (b.right - b.left) / 2;
    const d = Math.max(0, dist);
    if (d < minDist) minDist = d;
  }
  if (minDist >= GLOW_RADIUS) return BASE_OPACITY;
  const t = 1 - minDist / GLOW_RADIUS;
  return BASE_OPACITY + (EDGE_OPACITY - BASE_OPACITY) * t * t;
}

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
      const opacity = edgeOpacity(slot, blocked);
      const line = layoutNextLine(prepared, cursor, slotWidth);
      if (line === null) {
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
          opacity,
        });
        cursor = retry.end;
      } else {
        lines.push({
          x: Math.round(slot.left),
          y: Math.round(bandTop),
          text: line.text,
          width: line.width,
          opacity,
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
            if (!prev || prev.opacity !== line.opacity) {
              span.style.opacity = line.opacity.toFixed(2);
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
        color: "rgb(148, 163, 184)",
        fontSize: "10px",
        fontFamily: "'Courier New', Courier, monospace",
        lineHeight: `${LINE_HEIGHT}px`,
        pointerEvents: "none",
        zIndex: 0,
        userSelect: "none",
      }}
    />
  );
}
