import { useEffect, useRef } from "react";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import type { PreparedTextWithSegments, LayoutCursor } from "@chenglou/pretext";

const GLYPHS = "◇ △ ○ □ ◆ ▲ ● ■ · ◦ ◎ ◉ ⬡ ⬢ ";

function generateText(length: number): string {
  let text = "";
  while (text.length < length) text += GLYPHS;
  return text.slice(0, length);
}

const ROW_COUNT = 60;
const LINE_HEIGHT = 20;
const FONT = "14px monospace";
const BASE_WIDTH = 500;
const WAVE_AMP_1 = 180;
const WAVE_FREQ_1 = 0.18;
const WAVE_AMP_2 = 80;
const WAVE_FREQ_2 = 0.31;
const PHASE_SPEED = 0.012;

function computeMaxWidth(row: number, phase: number): number {
  return (
    BASE_WIDTH +
    WAVE_AMP_1 * Math.sin(row * WAVE_FREQ_1 + phase) +
    WAVE_AMP_2 * Math.sin(row * WAVE_FREQ_2 + phase * 1.7)
  );
}

export default function AsciiWaveBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prepare text once — this is the only DOM-touching measurement.
    // After this, every layout call is pure arithmetic.
    const text = generateText(15000);
    let prepared: PreparedTextWithSegments;
    try {
      prepared = prepareWithSegments(text, FONT);
    } catch {
      return; // graceful fallback if canvas unavailable (SSR)
    }

    // Pre-create line elements for both wave layers
    const createLayer = (opacity: number) => {
      const layer = document.createElement("div");
      layer.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:${opacity}`;
      const els: HTMLDivElement[] = [];
      for (let i = 0; i < ROW_COUNT; i++) {
        const el = document.createElement("div");
        el.style.cssText = `white-space:nowrap;overflow:hidden;height:${LINE_HEIGHT}px;line-height:${LINE_HEIGHT}px;text-align:center;will-change:contents`;
        layer.appendChild(el);
        els.push(el);
      }
      container.appendChild(layer);
      return els;
    };

    const layer1 = createLayer(1);
    const layer2 = createLayer(0.5);

    let phase = 0;
    let raf: number;

    const animate = () => {
      phase += PHASE_SPEED;

      // Layer 1 — primary wave
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      for (let i = 0; i < ROW_COUNT; i++) {
        const maxW = computeMaxWidth(i, phase);
        const line = layoutNextLine(prepared, cursor, maxW);
        if (!line) break;
        layer1[i].textContent = line.text;
        layer1[i].style.width = maxW + "px";
        cursor = line.end;
      }

      // Layer 2 — secondary wave (offset phase + different amplitude)
      cursor = { segmentIndex: 0, graphemeIndex: 0 };
      for (let i = 0; i < ROW_COUNT; i++) {
        const maxW = computeMaxWidth(i, phase * 0.7 + Math.PI);
        const line = layoutNextLine(prepared, cursor, maxW);
        if (!line) break;
        layer2[i].textContent = line.text;
        layer2[i].style.width = maxW + "px";
        cursor = line.end;
      }

      raf = requestAnimationFrame(animate);
    };

    animate();

    return () => {
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
        color: "rgba(148, 163, 184, 0.07)",
        fontSize: "14px",
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: 0,
        userSelect: "none",
      }}
    />
  );
}
