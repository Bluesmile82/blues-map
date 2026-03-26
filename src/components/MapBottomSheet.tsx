import { useEffect, useRef, useState, useCallback } from 'react';

type SheetHeight = 'collapsed' | 'half' | 'full';

interface MapBottomSheetProps {
  height: SheetHeight;
  onHeightChange: (height: SheetHeight) => void;
  onClose: () => void;
  children: React.ReactNode;
}

// Collapsed shows just the drag handle (~48px)
const COLLAPSED_HEIGHT = 48;

export default function MapBottomSheet({ height, onHeightChange, onClose, children }: MapBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [parentH, setParentH] = useState(0);

  // Live drag state (ref to avoid re-renders mid-gesture)
  const dragRef = useRef({ startY: 0, startTop: 0, active: false });
  const [dragTop, setDragTop] = useState<number | null>(null);

  useEffect(() => {
    const el = sheetRef.current?.parentElement;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      setParentH(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Snap positions (distance from top of parent)
  const snap = useCallback((h: SheetHeight) => {
    if (!parentH) return 0;
    switch (h) {
      case 'full': return parentH * 0.1;
      case 'half': return parentH * 0.5;
      case 'collapsed': return parentH - COLLAPSED_HEIGHT;
    }
  }, [parentH]);

  const currentTop = snap(height);

  const clamp = useCallback((y: number) => {
    return Math.max(snap('full'), Math.min(snap('collapsed'), y));
  }, [snap]);

  // --- Touch handlers (only on the drag handle) ---

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault(); // prevent scroll
    dragRef.current = { startY: e.touches[0].clientY, startTop: currentTop, active: true };
  }, [currentTop]);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.active || e.touches.length !== 1) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - dragRef.current.startY;
    setDragTop(clamp(dragRef.current.startTop + dy));
  }, [clamp]);

  const onHandleTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;

    const finalTop = dragTop ?? currentTop;

    // Find nearest snap
    const points: { h: SheetHeight; y: number }[] = [
      { h: 'full', y: snap('full') },
      { h: 'half', y: snap('half') },
      { h: 'collapsed', y: snap('collapsed') },
    ];
    let best = points[0];
    for (const p of points) {
      if (Math.abs(finalTop - p.y) < Math.abs(finalTop - best.y)) best = p;
    }

    setDragTop(null);
    onHeightChange(best.h);
  }, [dragTop, currentTop, snap, onHeightChange]);

  // --- Mouse handlers (for desktop testing) ---

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      e.preventDefault();
      const dy = e.clientY - dragRef.current.startY;
      setDragTop(clamp(dragRef.current.startTop + dy));
    };
    const onMouseUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;

      setDragTop(prev => {
        const finalTop = prev ?? currentTop;
        const points: { h: SheetHeight; y: number }[] = [
          { h: 'full', y: snap('full') },
          { h: 'half', y: snap('half') },
          { h: 'collapsed', y: snap('collapsed') },
        ];
        let best = points[0];
        for (const p of points) {
          if (Math.abs(finalTop - p.y) < Math.abs(finalTop - best.y)) best = p;
        }
        onHeightChange(best.h);
        return null;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [clamp, currentTop, snap, onHeightChange]);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startTop: currentTop, active: true };
  }, [currentTop]);

  const top = dragTop ?? currentTop;
  const sheetH = parentH - top;

  return (
    <div className="absolute inset-0 pointer-events-none z-[75]">
      {/* Scrim */}
      <div
        className="absolute inset-0"
        onClick={onClose}
        style={{
          background: 'rgba(0,0,0,0.4)',
          opacity: height === 'collapsed' && dragTop === null ? 0 : Math.min(1, (parentH - top) / (parentH * 0.4)),
          pointerEvents: height === 'collapsed' && dragTop === null ? 'none' : 'auto',
          transition: dragTop !== null ? 'none' : 'opacity 0.3s',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute left-0 right-0 pointer-events-auto bg-bg border-t border-border-subtle shadow-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          top,
          height: sheetH > 0 ? sheetH : 0,
          transition: dragTop !== null ? 'none' : 'top 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drag handle — only this area is draggable */}
        <div
          ref={handleRef}
          className="flex justify-center py-4 cursor-grab active:cursor-grabbing select-none shrink-0"
          style={{ touchAction: 'none' }}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={onHandleTouchEnd}
          onMouseDown={onHandleMouseDown}
        >
          <div className="w-12 h-1.5 bg-bg3 rounded-full" />
        </div>

        {/* Close button (not when collapsed) */}
        {height !== 'collapsed' && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-lg active:bg-bg-hover transition-colors touch-manipulation z-10"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-ink3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
