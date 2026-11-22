import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  Maximize2,
  Redo2,
  RotateCcw,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  CanvasBackground,
  PreviewViewMode,
  StudioLayer,
  StudioProject,
} from '../types/studio';

interface LivePreviewProps {
  project: StudioProject;
  selectedIds: string[];
  viewMode: PreviewViewMode;
  onChangeViewMode: (mode: PreviewViewMode) => void;
  onSelectLayer: (id: string | null, multi: boolean) => void;
  onUpdateLayerLive: (id: string, patch: Partial<StudioLayer>, commit?: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDismissWarnings: () => void;
}

type DragState =
  | {
      kind: 'pan';
      startX: number;
      startY: number;
      origPanX: number;
      origPanY: number;
    }
  | {
      kind: 'move';
      layerId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: 'resize';
      layerId: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    };

function renderLayerSvgNode(
  layer: StudioLayer,
  isInteractive: boolean,
  onPointerDownLayer?: (e: React.PointerEvent, layer: StudioLayer) => void
): React.ReactNode {
  if (!layer.visible) return null;

  const cx = layer.width / 2;
  const cy = layer.height / 2;
  const tf = `translate(${layer.x}, ${layer.y}) rotate(${layer.rotation}, ${cx}, ${cy})`;

  if (layer.type === 'group' && layer.children) {
    const sx = layer.origWidth > 0 ? layer.width / layer.origWidth : 1;
    const sy = layer.origHeight > 0 ? layer.height / layer.origHeight : 1;
    return (
      <g
        key={layer.id}
        transform={`${tf} scale(${sx}, ${sy})`}
        opacity={layer.opacity}
        onPointerDown={
          isInteractive && onPointerDownLayer
            ? (e) => onPointerDownLayer(e, layer)
            : undefined
        }
        style={{cursor: isInteractive ? (layer.locked ? 'not-allowed' : 'move') : 'default'}}
      >
        <rect
          x={0}
          y={0}
          width={layer.origWidth}
          height={layer.origHeight}
          fill="transparent"
        />
        {layer.children.map((ch) => renderLayerSvgNode(ch, false))}
      </g>
    );
  }

  if (layer.type === 'text') {
    const fs = layer.fontSize || 24;
    const anchor =
      layer.textAlign === 'center'
        ? 'middle'
        : layer.textAlign === 'right'
          ? 'end'
          : 'start';
    const textX =
      layer.textAlign === 'center'
        ? layer.width / 2
        : layer.textAlign === 'right'
          ? layer.width
          : 0;
    return (
      <g
        key={layer.id}
        transform={tf}
        opacity={layer.opacity}
        onPointerDown={
          isInteractive && onPointerDownLayer
            ? (e) => onPointerDownLayer(e, layer)
            : undefined
        }
        style={{cursor: isInteractive ? (layer.locked ? 'not-allowed' : 'move') : 'default'}}
      >
        <rect x={0} y={0} width={layer.width} height={layer.height} fill="transparent" />
        <text
          x={textX}
          y={fs * 0.88}
          textAnchor={anchor}
          fontFamily={layer.fontFamily || 'Plus Jakarta Sans, sans-serif'}
          fontSize={fs}
          fontWeight={600}
          fill={layer.fill === 'none' ? '#FFFFFF' : layer.fill}
          stroke={layer.stroke !== 'none' && layer.strokeWidth > 0 ? layer.stroke : 'none'}
          strokeWidth={layer.strokeWidth}
        >
          {layer.textContent || layer.name}
        </text>
      </g>
    );
  }

  if (layer.type === 'raster') {
    return (
      <g
        key={layer.id}
        transform={tf}
        opacity={layer.opacity}
        onPointerDown={
          isInteractive && onPointerDownLayer
            ? (e) => onPointerDownLayer(e, layer)
            : undefined
        }
        style={{cursor: isInteractive ? (layer.locked ? 'not-allowed' : 'move') : 'default'}}
      >
        {layer.rasterDataUrl ? (
          <image
            href={layer.rasterDataUrl}
            x={0}
            y={0}
            width={layer.width}
            height={layer.height}
            preserveAspectRatio="none"
          />
        ) : (
          <g>
            <rect
              x={0}
              y={0}
              width={layer.width}
              height={layer.height}
              fill="#1E293B"
              stroke="#475569"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            <text
              x={layer.width / 2}
              y={layer.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94A3B8"
              fontSize={Math.max(12, Math.min(18, layer.width / 10))}
            >
              {layer.name}
            </text>
          </g>
        )}
      </g>
    );
  }

  const sx = layer.origWidth > 0 ? layer.width / layer.origWidth : 1;
  const sy = layer.origHeight > 0 ? layer.height / layer.origHeight : 1;
  return (
    <g
      key={layer.id}
      transform={`${tf} scale(${sx}, ${sy})`}
      opacity={layer.opacity}
      onPointerDown={
        isInteractive && onPointerDownLayer
          ? (e) => onPointerDownLayer(e, layer)
          : undefined
      }
      style={{cursor: isInteractive ? (layer.locked ? 'not-allowed' : 'move') : 'default'}}
    >
      <path
        d={layer.pathData || ''}
        fill={layer.fill}
        stroke={layer.stroke !== 'none' && layer.strokeWidth > 0 ? layer.stroke : 'none'}
        strokeWidth={layer.strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

export function LivePreview({
  project,
  selectedIds,
  viewMode,
  onChangeViewMode,
  onSelectLayer,
  onUpdateLayerLive,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDismissWarnings,
}: LivePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.75);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [bgMode, setBgMode] = useState<CanvasBackground>('checkerboard');
  const [dragState, setDragState] = useState<DragState | null>(null);

  const fitZoom = () => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 72;
    const scaleX = (rect.width - pad) / Math.max(1, project.width);
    const scaleY = (rect.height - pad) / Math.max(1, project.height);
    const fitted = Math.max(0.15, Math.min(2.5, Math.min(scaleX, scaleY)));
    setZoom(Math.round(fitted * 100) / 100);
    setPan({x: 0, y: 0});
  };

  useEffect(() => {
    fitZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.width, project.height, project.title]);

  const handleResetPreview = () => {
    onChangeViewMode('separated');
    fitZoom();
  };

  const originalSvgUrl = useMemo(() => {
    if (!project.originalSvg) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(project.originalSvg)}`;
  }, [project.originalSvg]);

  const layersToRender = useMemo(() => {
    if (viewMode === 'selected') {
      if (selectedIds.length === 0) return [];
      return project.layers.filter((l) => selectedIds.includes(l.id));
    }
    return project.layers;
  }, [project.layers, viewMode, selectedIds]);

  const singleSelectedLayer =
    selectedIds.length === 1
      ? project.layers.find((l) => l.id === selectedIds[0]) || null
      : null;

  const handleLayerPointerDown = (e: React.PointerEvent, layer: StudioLayer) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    onSelectLayer(layer.id, multi);
    if (layer.locked || multi) return;
    setDragState({
      kind: 'move',
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
    });
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    layer: StudioLayer,
    handle: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    if (layer.locked) return;
    setDragState({
      kind: 'resize',
      layerId: layer.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: layer.x,
      origY: layer.y,
      origW: layer.width,
      origH: layer.height,
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) {
      onSelectLayer(null, false);
    }
    setDragState({
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const dxScreen = e.clientX - dragState.startX;
      const dyScreen = e.clientY - dragState.startY;

      if (dragState.kind === 'pan') {
        setPan({
          x: dragState.origPanX + dxScreen,
          y: dragState.origPanY + dyScreen,
        });
        return;
      }

      const dx = dxScreen / zoom;
      const dy = dyScreen / zoom;

      if (dragState.kind === 'move') {
        onUpdateLayerLive(
          dragState.layerId,
          {
            x: Math.round((dragState.origX + dx) * 10) / 10,
            y: Math.round((dragState.origY + dy) * 10) / 10,
          },
          false
        );
        return;
      }

      if (dragState.kind === 'resize') {
        let newX = dragState.origX;
        let newY = dragState.origY;
        let newW = dragState.origW;
        let newH = dragState.origH;

        if (dragState.handle.includes('e')) {
          newW = Math.max(8, dragState.origW + dx);
        }
        if (dragState.handle.includes('s')) {
          newH = Math.max(8, dragState.origH + dy);
        }
        if (dragState.handle.includes('w')) {
          const w = Math.max(8, dragState.origW - dx);
          newX = dragState.origX + (dragState.origW - w);
          newW = w;
        }
        if (dragState.handle.includes('n')) {
          const h = Math.max(8, dragState.origH - dy);
          newY = dragState.origY + (dragState.origH - h);
          newH = h;
        }

        onUpdateLayerLive(
          dragState.layerId,
          {
            x: Math.round(newX * 10) / 10,
            y: Math.round(newY * 10) / 10,
            width: Math.round(newW * 10) / 10,
            height: Math.round(newH * 10) / 10,
          },
          false
        );
      }
    };

    const handleUp = () => {
      if (dragState.kind === 'move' || dragState.kind === 'resize') {
        onUpdateLayerLive(dragState.layerId, {}, true);
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, zoom, onUpdateLayerLive]);

  const bgClass =
    bgMode === 'checkerboard'
      ? 'checkerboard-canvas'
      : bgMode === 'dark'
        ? 'bg-[#090B0F]'
        : 'bg-slate-100';

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0B0D11]">
      {/* Workspace Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800/90 bg-[#101319] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#0B0D11] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeViewMode('separated')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'separated'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Hasil Pemisahan
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('original')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'original'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Logo Asli
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('selected')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              viewMode === 'selected'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Layer Terpilih
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border border-slate-800 rounded-lg bg-[#0B0D11] p-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 border border-slate-800 rounded-lg bg-[#0B0D11] px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.1, Math.round((z - 0.15) * 100) / 100))}
              title="Zoom Out"
              aria-label="Zoom Out"
              className="p-1 text-slate-300 hover:text-white cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-12 text-center text-xs font-mono-tabular text-slate-200">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.15) * 100) / 100))}
              title="Zoom In"
              aria-label="Zoom In"
              className="p-1 text-slate-300 hover:text-white cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={fitZoom}
              title="Sesuaikan Layar"
              aria-label="Sesuaikan Layar"
              className="p-1 text-slate-300 hover:text-white cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetPreview}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#0B0D11] border border-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Preview
          </button>

          <div className="hidden xl:flex items-center gap-1 p-0.5 bg-[#0B0D11] border border-slate-800 rounded-lg text-[11px]">
            {(['checkerboard', 'dark', 'light'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBgMode(mode)}
                className={`px-2 py-1 rounded capitalize transition-colors cursor-pointer ${
                  bgMode === mode
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'checkerboard' ? 'Transparan' : mode === 'dark' ? 'Gelap' : 'Terang'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Format Notice / Warning Bar */}
      {project.warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/25 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{project.warnings[0]}</span>
          </div>
          <button
            type="button"
            onClick={onDismissWarnings}
            aria-label="Tutup pemberitahuan"
            className="text-amber-300 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Canvas */}
      <div
        ref={viewportRef}
        onPointerDown={handleCanvasPointerDown}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom((z) => Math.max(0.1, Math.min(4, Math.round((z + delta) * 100) / 100)));
          }
        }}
        className={`flex-1 relative overflow-hidden flex items-center justify-center select-none ${
          dragState?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: project.width,
            height: project.height,
          }}
          className={`relative shrink-0 shadow-2xl ring-1 ring-slate-700/80 ${bgClass}`}
        >
          {viewMode === 'original' ? (
            originalSvgUrl ? (
              <img
                src={originalSvgUrl}
                alt={project.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : project.originalImageUrl ? (
              <img
                src={project.originalImageUrl}
                alt={project.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950/70">
                <p className="text-sm font-medium text-slate-200">
                  Sumber Asli Berupa Project XML Alight Motion
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Beralih ke tab Hasil Pemisahan untuk melihat dan mengedit langsung seluruh layer XML pada kanvas.
                </p>
              </div>
            )
          ) : viewMode === 'selected' && selectedIds.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center p-8 text-center">
              <p className="text-xs text-slate-400 bg-slate-950/80 px-4 py-2 rounded-lg border border-slate-800">
                Pilih satu atau beberapa layer di panel kiri untuk mempratinjau layer secara terpisah.
              </p>
            </div>
          ) : (
            <svg
              width={project.width}
              height={project.height}
              viewBox={`0 0 ${project.width} ${project.height}`}
              className="w-full h-full overflow-visible"
            >
              {layersToRender.map((layer) =>
                renderLayerSvgNode(layer, true, handleLayerPointerDown)
              )}
            </svg>
          )}

          {/* Selection Overlay & Resize Handles */}
          {viewMode !== 'original' &&
            project.layers
              .filter((l) => l.visible && selectedIds.includes(l.id))
              .map((layer) => {
                const isSingle = singleSelectedLayer?.id === layer.id;
                return (
                  <div
                    key={`sel_${layer.id}`}
                    style={{
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      transform: `rotate(${layer.rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                    className={`absolute pointer-events-none ${
                      layer.locked
                        ? 'border border-dashed border-amber-400'
                        : 'border border-blue-500'
                    }`}
                  >
                    {isSingle && !layer.locked && (
                      <>
                        {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => {
                          const posClass =
                            handle === 'nw'
                              ? '-left-1.5 -top-1.5 cursor-nwse-resize'
                              : handle === 'ne'
                                ? '-right-1.5 -top-1.5 cursor-nesw-resize'
                                : handle === 'sw'
                                  ? '-left-1.5 -bottom-1.5 cursor-nesw-resize'
                                  : '-right-1.5 -bottom-1.5 cursor-nwse-resize';
                          return (
                            <div
                              key={handle}
                              onPointerDown={(e) =>
                                handleResizePointerDown(e, layer, handle)
                              }
                              style={{transform: `scale(${1 / zoom})`}}
                              className={`pointer-events-auto absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-[2px] ${posClass}`}
                            />
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
        </div>

        {/* Clean Canvas Info Strip */}
        <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] font-mono-tabular text-slate-400 bg-[#0B0D11]/85 px-2.5 py-1 rounded border border-slate-800/80">
          {project.title} · {project.width}×{project.height} ·{' '}
          {project.sourceFormat.toUpperCase()}
        </div>
      </div>
    </main>
  );
}
