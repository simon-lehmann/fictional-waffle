import { useEffect, useRef } from "react";
import { prepareWithSegments, layoutNextLine } from "@chenglou/pretext";
import type { PreparedTextWithSegments, LayoutCursor } from "@chenglou/pretext";

// Readable ASCII wave characters — clearly text, not noise
const SOURCE =
  "/{\\~ _-~=wave /{\\~ _-~=flow /{\\~ _-~=drift /{\\~ _-~=pulse /{\\~ _-~=sync /{\\~ _-~=echo /{\\~ _-~=tide /{\\~ _-~=rise ";

function generateText(length: number): string {
  let text = "";
  while (text.length < length) text += SOURCE;
  return text.slice(0, length);
}

const ROW_COUNT = 55;
const LINE_HEIGHT = 26;
const FONT_SIZE = 18;
const PHASE_SPEED = 0.01;

function computeMaxWidth(
  row: number,
  phase: number,
  viewportWidth: number,
): number {
  const base = viewportWidth * 0.45;
  const amp1 = viewportWidth * 0.22;
  const amp2 = viewportWidth * 0.09;
  return (
    base +
    amp1 * Math.sin(row * 0.16 + phase) +
    amp2 * Math.sin(row * 0.37 + phase * 1.5)
  );
}

export default function AsciiWaveBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const text = generateText(20000);
    let prepared: PreparedTextWithSegments;
    try {
      prepared = prepareWithSegments(text, `${FONT_SIZE}px monospace`);
    } catch {
      return;
    }

    // Single wave layer with per-line opacity for depth
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px";
    const els: HTMLDivElement[] = [];
    for (let i = 0; i < ROW_COUNT; i++) {
      const el = document.createElement("div");
      el.style.cssText = `white-space:nowrap;overflow:hidden;height:${LINE_HEIGHT}px;line-height:${LINE_HEIGHT}px;text-align:center;letter-spacing:0.15em`;
      wrapper.appendChild(el);
      els.push(el);
    }
    container.appendChild(wrapper);

    let phase = 0;
    let raf: number;
    const vw = () => container.offsetWidth || window.innerWidth;

    const animate = () => {
      phase += PHASE_SPEED;
      const w = vw();

      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      for (let i = 0; i < ROW_COUNT; i++) {
        const maxW = computeMaxWidth(i, phase, w);
        const line = layoutNextLine(prepared, cursor, maxW);
        if (!line) break;
        els[i].textContent = line.text;
        els[i].style.width = maxW + "px";
        // Vary opacity per row with a secondary wave for a shimmer effect
        const rowOpacity =
          0.12 + 0.08 * Math.sin(i * 0.25 + phase * 1.3);
        els[i].style.opacity = String(rowOpacity);
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
        color: "rgb(100, 116, 139)",
        fontSize: `${FONT_SIZE}px`,
        fontFamily: "'Courier New', Courier, monospace",
        pointerEvents: "none",
        zIndex: 0,
        userSelect: "none",
      }}
    />
  );
}
