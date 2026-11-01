import { useRef, useState } from "react";
import { X } from "lucide-react";

/** A small floating photo you can drag anywhere and resize from its corner. */
export function PhotoWindow({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [pos, setPos] = useState({ x: 80, y: 120 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      style={{ left: pos.x, top: pos.y, width: 260, height: 300, resize: "both", minWidth: 140, minHeight: 160 }}
    >
      <div
        className="flex cursor-move touch-none select-none items-center justify-between bg-muted px-3 py-1.5 text-sm font-semibold"
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })}
        onPointerUp={() => (drag.current = null)}
      >
        <span className="truncate">{title}</span>
        <button type="button" aria-label="Close photo" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <img src={src} alt={title} className="min-h-0 w-full flex-1 object-cover" draggable={false} />
    </div>
  );
}
