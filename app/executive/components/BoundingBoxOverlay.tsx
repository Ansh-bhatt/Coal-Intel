"use client";

import { useEffect, useRef } from "react";
import { usePortalStore } from "@/store/portalStore";

interface BoundingBoxOverlayProps {
  /** Rendered PDF canvas size in CSS pixels. */
  width: number;
  height: number;
  /** pdfjs render scale — PDF points → CSS px multiplier. */
  scale: number;
}

/**
 * High-contrast canvas overlay engine drawing a translucent,
 * glowing rectangle over the active citation's bounding coordinates.
 */
export default function BoundingBoxOverlay({
  width,
  height,
  scale,
}: BoundingBoxOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeCitation = usePortalStore((s) => s.activeCitation);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!activeCitation) return;

    const { x1, y1, x2, y2 } = activeCitation.boundingBox;
    const rx = x1 * scale;
    const ry = y1 * scale;
    const rw = (x2 - x1) * scale;
    const rh = (y2 - y1) * scale;

    // Translucent fill + cyan glow (matches citation tag treatment).
    ctx.save();
    ctx.shadowColor = "rgba(6, 182, 212, 0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(6, 182, 212, 0.20)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();

    ctx.strokeStyle = "rgb(6, 182, 212)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // Corner brackets for a crisp editorial "selected region" look.
    const c = 10;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry + c);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + c, ry);
    ctx.moveTo(rx + rw - c, ry);
    ctx.lineTo(rx + rw, ry);
    ctx.lineTo(rx + rw, ry + c);
    ctx.moveTo(rx + rw, ry + rh - c);
    ctx.lineTo(rx + rw, ry + rh);
    ctx.lineTo(rx + rw - c, ry + rh);
    ctx.moveTo(rx + c, ry + rh);
    ctx.lineTo(rx, ry + rh);
    ctx.lineTo(rx, ry + rh - c);
    ctx.stroke();
  }, [activeCitation, width, height, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-label="Citation bounding box overlay"
    />
  );
}
