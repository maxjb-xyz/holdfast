"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FONTS = [
  ["Geist", "/fonts/Geist.woff2"],
  ["Geist Mono", "/fonts/GeistMono.woff2"],
  ["Geist Serif", "/fonts/GeistSerif.woff2"],
] as const;

async function fontFaceCss(): Promise<string> {
  const faces = await Promise.all(
    FONTS.map(async ([family, url]) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');font-weight:100 900}`;
    }),
  );
  return faces.join("");
}

/** Draws the card's SVG to a canvas, with its fonts embedded, and downloads a PNG. */
async function savePng(svgId: string, fileName: string): Promise<void> {
  const svg = document.getElementById(svgId);
  if (!svg) throw new Error("Card not found");
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const [, , w, h] = (clone.getAttribute("viewBox") ?? "0 0 360 450")
    .split(" ")
    .map(Number);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = await fontFaceCss();
  clone.insertBefore(style, clone.firstChild);
  const source = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not make the image");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function ShareActions({
  svgId,
  fileName,
  sharePath,
}: {
  svgId: string;
  fileName: string;
  sharePath: string;
}) {
  const [note, setNote] = useState("");
  const say = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2500);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() =>
            savePng(svgId, fileName).then(
              () => say("Image saved"),
              () => say("Could not save the image"),
            )
          }
          className="flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-rule bg-transparent text-sm font-semibold text-text transition-colors hover:border-grey"
        >
          Save image
        </button>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              .writeText(new URL(sharePath, window.location.origin).toString())
              .then(
                () => say("Link copied"),
                () => say("Could not copy the link"),
              )
          }
          className="flex min-h-12 cursor-pointer items-center justify-center rounded-full border-0 bg-text text-sm font-semibold text-bg transition-colors hover:bg-white"
        >
          Copy link
        </button>
      </div>
      <span
        role="status"
        aria-live="polite"
        className="min-h-4 text-center text-xs text-dim"
      >
        {note}
      </span>
    </div>
  );
}

/** Lets the arrow keys move between Wrapped cards. */
export function KeyNav({
  prev,
  next,
}: {
  prev: string | null;
  next: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && next) router.push(next);
      if (event.key === "ArrowLeft" && prev) router.push(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);
  return null;
}
