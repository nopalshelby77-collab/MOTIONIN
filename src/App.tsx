import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ExportModal} from './components/ExportModal';
import {LayerPanel} from './components/LayerPanel';
import {LivePreview} from './components/LivePreview';
import {RightPanel, type RightTab} from './components/RightPanel';
import {TopBar} from './components/TopBar';
import {
  parseAlightMotionXml,
  parseAmprojArchive,
} from './engine/alightMotionXml';
import {
  readFileAsDataUrl,
  separateRasterToProject,
} from './engine/rasterSeparator';
import {
  SAMPLE_ALIGHT_MOTION_XML,
  SAMPLE_VECTOR_LOGO_SVG,
} from './engine/sampleProjects';
import {separateSvgToProject} from './engine/svgSeparator';
import type {
  ImportErrorState,
  PreviewViewMode,
  RasterSeparationMode,
  SeparationMode,
  StudioLayer,
  StudioProject,
} from './types/studio';

function cloneProject(proj: StudioProject): StudioProject {
  return {
    ...proj,
    layers: proj.layers.map((l) => ({
      ...l,
      children: l.children ? l.children.map((c) => ({...c})) : undefined,
      amMeta: l.amMeta ? {...l.amMeta} : undefined,
    })),
    warnings: [...proj.warnings],
  };
}

function makeUid(prefix = 'lyr'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function App() {
  const initialProject = useMemo(() => {
    try {
      return separateSvgToProject(SAMPLE_VECTOR_LOGO_SVG, 'APEX Emblem Logo', 'deep');
    } catch {
      return {
        title: 'Untitled Project',
        width: 640,
        height: 640,
        fps: 60,
        totalTime: 5000,
        bgcolor: '#00000000',
        sourceFormat: 'svg' as const,
        layers: [],
        warnings: [],
      };
    }
  }, []);

  const [project, setProject] = useState<StudioProject>(initialProject);
  const [history, setHistory] = useState<StudioProject[]>([initialProject]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialProject.layers[0] ? [initialProject.layers[0].id] : []
  );
  const [viewMode, setViewMode] = useState<PreviewViewMode>('separated');
  const [rightTab, setRightTab] = useState<RightTab>('properties');
  const [exportOpen, setExportOpen] = useState(false);

  const [svgMode, setSvgMode] = useState<SeparationMode>('deep');
  const [rasterMode, setRasterMode] = useState<RasterSeparationMode>('objects');
  const [rasterColorCount, setRasterColorCount] = useState(4);
  const [rasterTolerance, setRasterTolerance] = useState(36);
  const [urlLoading, setUrlLoading] = useState(false);
  const [importError, setImportError] = useState<ImportErrorState | null>(null);

  const topSvgInputRef = useRef<HTMLInputElement>(null);
  const topXmlInputRef = useRef<HTMLInputElement>(null);

  const commitProjectState = useCallback(
    (next: StudioProject) => {
      setProject(next);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, cloneProject(next)].slice(-30);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    },
    [historyIndex]
  );

  const loadNewProject = useCallback((next: StudioProject) => {
    setProject(next);
    setHistory([cloneProject(next)]);
    setHistoryIndex(0);
    setSelectedIds(next.layers.length > 0 ? [next.layers[next.layers.length - 1].id] : []);
    setViewMode('separated');
    setImportError(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setProject(cloneProject(prev));
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setProject(cloneProject(next));
  }, [history, historyIndex]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      if (isTyping) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleSelectLayer = useCallback((id: string | null, multi: boolean) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((prev) => {
      if (!multi) return [id];
      return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
    });
  }, []);

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<StudioLayer>, commit = true) => {
      setProject((curr) => {
        const next: StudioProject = {
          ...curr,
          layers: curr.layers.map((l) => (l.id === id ? {...l, ...patch} : l)),
        };
        if (commit) {
          setHistory((prevH) => {
            const sliced = prevH.slice(0, historyIndex + 1);
            const updated = [...sliced, cloneProject(next)].slice(-30);
            setHistoryIndex(updated.length - 1);
            return updated;
          });
        }
        return next;
      });
    },
    [historyIndex]
  );

  const handleUpdateMultipleLayers = useCallback(
    (ids: string[], patch: Partial<StudioLayer>) => {
      const idSet = new Set(ids);
      const next: StudioProject = {
        ...project,
        layers: project.layers.map((l) => (idSet.has(l.id) ? {...l, ...patch} : l)),
      };
      commitProjectState(next);
    },
    [project, commitProjectState]
  );

  const handleDuplicateLayer = useCallback(
    (id: string) => {
      const target = project.layers.find((l) => l.id === id);
      if (!target) return;
      const copy: StudioLayer = {
        ...target,
        id: makeUid('dup'),
        name: `${target.name} (Salinan)`,
        x: Math.round((target.x + 16) * 10) / 10,
        y: Math.round((target.y + 16) * 10) / 10,
        children: target.children
          ? target.children.map((ch) => ({...ch, id: makeUid('ch')}))
          : undefined,
      };
      const idx = project.layers.findIndex((l) => l.id === id);
      const nextLayers = [...project.layers];
      nextLayers.splice(idx + 1, 0, copy);
      commitProjectState({...project, layers: nextLayers});
      setSelectedIds([copy.id]);
    },
    [project, commitProjectState]
  );

  const handleDeleteLayers = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const nextLayers = project.layers.filter((l) => !idSet.has(l.id));
      commitProjectState({...project, layers: nextLayers});
      setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    },
    [project, commitProjectState]
  );

  const handleMoveOrder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const idx = project.layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= project.layers.length) return;
      const nextLayers = [...project.layers];
      const [moved] = nextLayers.splice(idx, 1);
      nextLayers.splice(targetIdx, 0, moved);
      commitProjectState({...project, layers: nextLayers});
    },
    [project, commitProjectState]
  );

  const handleMergeSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    const idSet = new Set(selectedIds);
    const chosen = project.layers.filter((l) => idSet.has(l.id));
    if (chosen.length < 2) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const l of chosen) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + l.width);
      maxY = Math.max(maxY, l.y + l.height);
    }

    const gw = Math.max(4, maxX - minX);
    const gh = Math.max(4, maxY - minY);
    const relChildren = chosen.map((l) => ({
      ...l,
      x: Math.round((l.x - minX) * 100) / 100,
      y: Math.round((l.y - minY) * 100) / 100,
    }));

    const groupLayer: StudioLayer = {
      id: makeUid('grp'),
      name: `Grup Gabungan (${chosen.length})`,
      type: 'group',
      sourceTag: 'group',
      isVector: chosen.every((c) => c.isVector),
      visible: true,
      locked: false,
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width: Math.round(gw * 100) / 100,
      height: Math.round(gh * 100) / 100,
      origWidth: Math.round(gw * 100) / 100,
      origHeight: Math.round(gh * 100) / 100,
      rotation: 0,
      opacity: 1,
      fill: chosen[0].fill,
      stroke: 'none',
      strokeWidth: 0,
      children: relChildren,
    };

    const insertAt = project.layers.findIndex((l) => idSet.has(l.id));
    const remaining = project.layers.filter((l) => !idSet.has(l.id));
    remaining.splice(insertAt, 0, groupLayer);
    commitProjectState({...project, layers: remaining});
    setSelectedIds([groupLayer.id]);
  }, [project, selectedIds, commitProjectState]);

  const handleUngroup = useCallback(
    (id: string) => {
      const idx = project.layers.findIndex((l) => l.id === id);
      if (idx === -1) return;
      const grp = project.layers[idx];
      if (grp.type !== 'group' || !grp.children?.length) return;

      const sx = grp.origWidth > 0 ? grp.width / grp.origWidth : 1;
      const sy = grp.origHeight > 0 ? grp.height / grp.origHeight : 1;

      const expanded: StudioLayer[] = grp.children.map((ch) => ({
        ...ch,
        id: makeUid('ungrp'),
        x: Math.round((grp.x + ch.x * sx) * 100) / 100,
        y: Math.round((grp.y + ch.y * sy) * 100) / 100,
        width: Math.round(ch.width * sx * 100) / 100,
        height: Math.round(ch.height * sy * 100) / 100,
        opacity: Math.round(ch.opacity * grp.opacity * 1000) / 1000,
      }));

      const nextLayers = [...project.layers];
      nextLayers.splice(idx, 1, ...expanded);
      commitProjectState({...project, layers: nextLayers});
      setSelectedIds(expanded.map((e) => e.id));
    },
    [project, commitProjectState]
  );

  const handleUploadVectorOrImage = async (file: File) => {
    setImportError(null);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
        const text = await file.text();
        const next = separateSvgToProject(text, file.name, svgMode);
        loadNewProject(next);
        setRightTab('properties');
        return;
      }

      if (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        file.type.startsWith('image/')
      ) {
        const dataUrl = await readFileAsDataUrl(file);
        const next = await separateRasterToProject(dataUrl, file.name, {
          mode: rasterMode,
          colorCount: rasterColorCount,
          bgTolerance: rasterTolerance,
        });
        loadNewProject(next);
        setRightTab('import');
        return;
      }

      throw new Error(
        'Format file tidak didukung. Gunakan SVG, PNG, JPG/JPEG, atau WEBP.'
      );
    } catch (err) {
      setImportError({
        title: 'Gagal Memproses File Gambar / Vector',
        message:
          err instanceof Error ? err.message : 'Terjadi kesalahan saat membaca file.',
      });
      setRightTab('import');
    }
  };

  const handleUploadProjectFile = async (file: File) => {
    setImportError(null);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.amproj') || lower.endsWith('.zip')) {
        const next = await parseAmprojArchive(file);
        loadNewProject(next);
        setRightTab('properties');
        return;
      }

      const text = await file.text();
      const trimmed = text.replace(/^\uFEFF/, '').trim();
      if (trimmed.includes('<svg') && !trimmed.includes('<scene')) {
        const next = separateSvgToProject(text, file.name, svgMode);
        loadNewProject(next);
        setRightTab('properties');
        return;
      }

      const next = parseAlightMotionXml(text, file.name);
      loadNewProject(next);
      setRightTab('properties');
    } catch (err) {
      setImportError({
        title: 'Gagal Membaca File Project',
        message:
          err instanceof Error
            ? err.message
            : 'Format file project XML/AMPROJ tidak valid.',
      });
      setRightTab('import');
    }
  };

  const handleLoadXmlFromUrl = async (rawUrl: string) => {
    setImportError(null);
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      setImportError({
        title: 'URL Tidak Valid',
        message: 'Pastikan URL diawali dengan https:// atau http:// dengan format yang benar.',
        canManualFallback: true,
      });
      return;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setImportError({
        title: 'Protokol URL Tidak Didukung',
        message: 'Hanya URL http:// atau https:// yang dapat dimuat.',
        canManualFallback: true,
      });
      return;
    }

    setUrlLoading(true);
    try {
      const response = await fetch('/api/fetch-xml', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: rawUrl}),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok || typeof payload.xml !== 'string') {
        setImportError({
          title: 'Tidak Dapat Memuat XML dari URL',
          message:
            payload?.message ||
            'URL tidak dapat diakses atau diblokir oleh kebijakan server sumber (CORS/akses privat). Unduh file XML ke perangkat lalu upload secara manual.',
          canManualFallback: true,
        });
        return;
      }

      const fileName =
        parsed.pathname.split('/').filter(Boolean).pop() || 'Remote Project';
      const trimmed = payload.xml.replace(/^\uFEFF/, '').trim();

      if (trimmed.includes('<svg') && !trimmed.includes('<scene')) {
        const next = separateSvgToProject(payload.xml, fileName, svgMode);
        loadNewProject(next);
      } else {
        const next = parseAlightMotionXml(payload.xml, fileName);
        loadNewProject(next);
      }
      setRightTab('properties');
    } catch {
      setImportError({
        title: 'Koneksi Gagal atau Terblokir CORS',
        message:
          'Server tidak dapat menjangkau URL tersebut. Silakan unduh file XML secara manual lalu unggah melalui tombol di bawah.',
        canManualFallback: true,
      });
    } finally {
      setUrlLoading(false);
    }
  };

  const handleChangeSvgMode = (nextMode: SeparationMode) => {
    setSvgMode(nextMode);
    if (project.sourceFormat === 'svg' && project.originalSvg) {
      try {
        const reSeparated = separateSvgToProject(
          project.originalSvg,
          project.title,
          nextMode
        );
        loadNewProject(reSeparated);
      } catch {
        // Keep current project
      }
    }
  };

  const handleReprocessRaster = async () => {
    if (!project.originalImageUrl) return;
    try {
      const next = await separateRasterToProject(
        project.originalImageUrl,
        project.title,
        {
          mode: rasterMode,
          colorCount: rasterColorCount,
          bgTolerance: rasterTolerance,
        }
      );
      loadNewProject(next);
    } catch (err) {
      setImportError({
        title: 'Gagal Memproses Ulang Gambar',
        message: err instanceof Error ? err.message : 'Gagal memproses gambar.',
      });
    }
  };

  const handleTopAction = (
    action: 'upload-svg' | 'upload-xml' | 'import-url' | 'samples'
  ) => {
    if (action === 'upload-svg') {
      topSvgInputRef.current?.click();
    } else if (action === 'upload-xml') {
      topXmlInputRef.current?.click();
    } else {
      setRightTab('import');
    }
  };

  const selectedLayers = useMemo(
    () => project.layers.filter((l) => selectedIds.includes(l.id)),
    [project.layers, selectedIds]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0D11] text-slate-100 overflow-hidden">
      <TopBar
        onQuickAction={handleTopAction}
        onOpenExport={() => setExportOpen(true)}
        hasLayers={project.layers.length > 0}
      />

      {/* Hidden inputs for TopBar quick triggers */}
      <input
        ref={topSvgInputRef}
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadVectorOrImage(f);
          e.target.value = '';
        }}
      />
      <input
        ref={topXmlInputRef}
        type="file"
        accept=".xml,.amproj,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadProjectFile(f);
          e.target.value = '';
        }}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <LayerPanel
          layers={project.layers}
          selectedIds={selectedIds}
          onSelect={handleSelectLayer}
          onSelectAll={() => setSelectedIds(project.layers.map((l) => l.id))}
          onClearSelection={() => setSelectedIds([])}
          onRename={(id, name) => handleUpdateLayer(id, {name})}
          onToggleVisible={(id) => {
            const target = project.layers.find((l) => l.id === id);
            if (target) handleUpdateLayer(id, {visible: !target.visible});
          }}
          onToggleLock={(id) => {
            const target = project.layers.find((l) => l.id === id);
            if (target) handleUpdateLayer(id, {locked: !target.locked});
          }}
          onDuplicate={handleDuplicateLayer}
          onDelete={(id) => handleDeleteLayers([id])}
          onMoveOrder={handleMoveOrder}
          onMergeSelected={handleMergeSelected}
          onUngroup={handleUngroup}
        />

        <LivePreview
          project={project}
          selectedIds={selectedIds}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          onSelectLayer={handleSelectLayer}
          onUpdateLayerLive={handleUpdateLayer}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDismissWarnings={() => setProject((p) => ({...p, warnings: []}))}
        />

        <RightPanel
          activeTab={rightTab}
          onChangeTab={setRightTab}
          project={project}
          onUpdateProjectMeta={(patch) =>
            commitProjectState({...project, ...patch})
          }
          selectedLayers={selectedLayers}
          onUpdateLayer={handleUpdateLayer}
          onUpdateMultipleLayers={handleUpdateMultipleLayers}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayers={handleDeleteLayers}
          onMergeSelected={handleMergeSelected}
          svgMode={svgMode}
          onChangeSvgMode={handleChangeSvgMode}
          rasterMode={rasterMode}
          onChangeRasterMode={setRasterMode}
          rasterColorCount={rasterColorCount}
          onChangeRasterColorCount={setRasterColorCount}
          rasterTolerance={rasterTolerance}
          onChangeRasterTolerance={setRasterTolerance}
          onReprocessRaster={handleReprocessRaster}
          onUploadVectorOrImage={handleUploadVectorOrImage}
          onUploadProjectFile={handleUploadProjectFile}
          onLoadXmlFromUrl={handleLoadXmlFromUrl}
          urlLoading={urlLoading}
          importError={importError}
          onClearImportError={() => setImportError(null)}
          onLoadSampleSvg={() => {
            const next = separateSvgToProject(
              SAMPLE_VECTOR_LOGO_SVG,
              'APEX Emblem Logo',
              svgMode
            );
            loadNewProject(next);
            setRightTab('properties');
          }}
          onLoadSampleAmXml={() => {
            const next = parseAlightMotionXml(
              SAMPLE_ALIGHT_MOTION_XML,
              'Kinetic Crest AM'
            );
            loadNewProject(next);
            setRightTab('properties');
          }}
        />
      </div>

      {exportOpen && (
        <ExportModal project={project} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
