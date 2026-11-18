import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

export interface CustomImageViewerProps {
  src: string;
  alt: string;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export const CustomImageViewer: React.FC<CustomImageViewerProps> = ({
  src,
  alt,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when image source changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  }, [src]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(4, Number((prev * 1.25).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(0.5, Number((prev / 1.25).toFixed(2)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(4, Number((prev * 1.15).toFixed(2))));
    } else {
      setZoom((prev) => {
        const next = Math.max(0.5, Number((prev / 1.15).toFixed(2)));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialPanRef.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: initialPanRef.current.x + dx,
      y: initialPanRef.current.y + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      data-testid="custom-image-viewer"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '280px',
        maxHeight: '75vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '75vh',
          objectFit: 'contain',
          borderRadius: '6px',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: isDragging ? 'none' : 'transform 0.12s ease-out',
          pointerEvents: 'none',
        }}
      />

      {/* Floating Zoom & Navigation Controls Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          backgroundColor: 'rgba(15, 23, 42, 0.82)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.4)',
          zIndex: 10,
        }}
      >
        {onPrevious && (
          <>
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous image"
              title="Previous image (Left Arrow)"
              className="btn-ghost"
              style={{
                padding: '4px',
                color: '#ffffff',
                opacity: hasPrevious ? 1 : 0.35,
                cursor: hasPrevious ? 'pointer' : 'not-allowed',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />
          </>
        )}

        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          aria-label="Zoom out"
          title="Zoom Out (-)"
          className="btn-ghost"
          style={{ padding: '4px', color: '#ffffff' }}
        >
          <ZoomOut size={15} />
        </button>

        <button
          type="button"
          onClick={handleResetZoom}
          title="Click to Reset Zoom (100%)"
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '2px 8px',
            cursor: 'pointer',
            minWidth: '48px',
            textAlign: 'center',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= 4}
          aria-label="Zoom in"
          title="Zoom In (+)"
          className="btn-ghost"
          style={{ padding: '4px', color: '#ffffff' }}
        >
          <ZoomIn size={15} />
        </button>

        {zoom !== 1 && (
          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset zoom"
            title="Fit to Window"
            className="btn-ghost"
            style={{ padding: '4px', color: '#ffffff', borderLeft: '1px solid rgba(255, 255, 255, 0.2)' }}
          >
            <RotateCcw size={13} />
          </button>
        )}

        {onNext && (
          <>
            <div style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next image"
              title="Next image (Right Arrow)"
              className="btn-ghost"
              style={{
                padding: '4px',
                color: '#ffffff',
                opacity: hasNext ? 1 : 0.35,
                cursor: hasNext ? 'pointer' : 'not-allowed',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
