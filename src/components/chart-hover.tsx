"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { nearestStop, type HoverStop } from "@/lib/chart";

type Active = {
  stop: HoverStop;
  /** Pointer height inside the wrapper, in CSS pixels. */
  top: number;
  touch: boolean;
  scale: number;
  boxHeight: number;
};

const BG = "#08090A";

/**
 * Wraps a server-drawn SVG chart and adds a crosshair, a dot on each line and
 * a small readout that follow the pointer. The chart itself stays plain SVG:
 * this only draws on top, in the same viewBox, and never blocks its links.
 *
 * Hovering anything marked `data-series` quiets every `data-line` but its own.
 */
export function ChartHover({
  width,
  height,
  plot,
  stops,
  children,
}: {
  width: number;
  height: number;
  /** The part of the viewBox that answers to the pointer. */
  plot: { x0: number; x1: number; y0: number; y1: number };
  stops: HoverStop[];
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [tipWidth, setTipWidth] = useState(150);

  // Names vary in length, so the readout is measured before it is placed.
  useLayoutEffect(() => {
    const w = tipBox.current?.offsetWidth;
    if (w && Math.abs(w - tipWidth) > 0.5) setTipWidth(w);
  }, [active, tipWidth]);

  const focus = useCallback((key: string | null) => {
    box.current?.querySelectorAll<SVGElement>("[data-line]").forEach((el) => {
      el.style.opacity = key && el.dataset.line !== key ? "0.32" : "";
    });
  }, []);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = rect.width / width;
    const vx = (e.clientX - rect.left) / scale;
    const vy = (e.clientY - rect.top) / scale;
    const touch = e.pointerType === "touch";
    const inside =
      vx >= plot.x0 - 6 &&
      vx <= plot.x1 + 6 &&
      (touch || (vy >= plot.y0 && vy <= plot.y1));
    const stop = inside ? nearestStop(stops, vx) : null;
    if (!stop || stop.items.length === 0) {
      setActive(null);
      return;
    }
    setActive((prev) =>
      prev &&
      prev.stop === stop &&
      Math.abs(prev.top - (e.clientY - rect.top)) < 2
        ? prev
        : {
            stop,
            top: e.clientY - rect.top,
            touch,
            scale,
            boxHeight: rect.height,
          },
    );
  };

  const over = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as Element).closest<SVGElement>("[data-series]");
    focus(target?.dataset.series ?? null);
  };

  const clear = () => {
    setActive(null);
    focus(null);
  };

  // The readout sits beside the crosshair, on whichever side has room, and
  // never leaves the chart's own width.
  let tip: React.CSSProperties | null = null;
  if (active) {
    const px = active.stop.x * active.scale;
    const boxWidth = width * active.scale;
    const flip =
      active.stop.x > plot.x0 + (plot.x1 - plot.x0) * 0.58 ||
      px + 14 + tipWidth > boxWidth;
    const left = Math.min(
      Math.max(0, flip ? px - 14 - tipWidth : px + 14),
      Math.max(0, boxWidth - tipWidth),
    );
    const tall = 34 + active.stop.items.length * 20;
    const top = active.touch
      ? plot.y0 * active.scale - 6
      : Math.min(
          Math.max(active.top, tall / 2),
          Math.max(tall / 2, active.boxHeight - tall / 2),
        );
    tip = {
      left,
      top,
      transform: `translateY(${active.touch ? "-100%" : "-50%"})`,
    };
  }

  return (
    <div
      ref={box}
      className="chart-hover relative"
      onPointerMove={move}
      onPointerDown={move}
      onPointerOver={over}
      onPointerLeave={clear}
      onPointerCancel={clear}
    >
      {children}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ overflow: "visible" }}
      >
        {active && (
          <>
            <path
              d={`M${active.stop.x.toFixed(1)} ${plot.y0} V${plot.y1}`}
              stroke="#8E929B"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {active.stop.items.map((item) => (
              <circle
                key={item.key}
                cx={active.stop.x}
                cy={item.y}
                r={(item.you ? 4.5 : 3.5) / active.scale}
                fill={item.color}
                stroke={BG}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        )}
      </svg>
      {active && tip && (
        <div
          ref={tipBox}
          role="status"
          className="chart-tip pointer-events-none absolute z-20 min-w-[132px] rounded-lg border border-rule bg-raised px-3 py-2 whitespace-nowrap"
          style={tip}
        >
          <div className="pb-1 font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
            {active.stop.title}
          </div>
          {active.stop.items.map((item) => (
            <div
              key={item.key}
              className={`flex items-baseline justify-between gap-5 leading-5 ${
                item.you ? "text-you" : "text-text"
              }`}
            >
              <span className="text-[12.5px]">{item.name}</span>
              <span className="font-mono text-xs">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
