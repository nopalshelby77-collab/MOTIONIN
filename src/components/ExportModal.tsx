import {useMemo, useState} from 'react';
import JSZip from 'jszip';
import {Check, Copy, Download, FileCode2, FileImage, X} from 'lucide-react';
import type {StudioProject} from '../types/studio';
import {
  exportAlightMotionXml,
  exportProjectAsSvg,
} from '../engine/alightMotionXml';

interface ExportModalProps {
  project: StudioProject;
  onClose: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportModal({project, onClose}: ExportModalProps) {
  const [title, setTitle] = useState(project.title);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [targetSize, setTargetSize] = useState<'original' | '1080x1080' | '1080x1920' | '1920x1080'>('original');
  const [copied, setCopied] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const exportProject = useMemo<StudioProject>(() => {
    const filteredLayers = includeHidden
      ? project.layers
      : project.layers.filter((l) => l.visible);

    let outW = project.width;
    let outH = project.height;
    if (targetSize === '1080x1080') {
      outW = 1080;
      outH = 1080;
    } else if (targetSize === '1080x1920') {
      outW = 1080;
      outH = 1920;
    } else if (targetSize === '1920x1080') {
      outW = 1920;
      outH = 1080;
    }

    if (outW === project.width && outH === project.height) {
      return {
        ...project,
        title: title.trim() || project.title,
        layers: filteredLayers,
      };
    }

    // Center & fit composition cleanly into chosen Alight Motion scene dimensions
    const scale = Math.min(
      (outW * 0.8) / Math.max(1, project.width),
      (outH * 0.8) / Math.max(1, project.height)
    );
    const offsetX = (outW - project.width * scale) / 2;
    const offsetY = (outH - project.height * scale) / 2;

    const scaleLayer = (l: StudioProject['layers'][number]): StudioProject['layers'][number] => ({
      ...l,
      x: l.x * scale + offsetX,
      y: l.y * scale + offsetY,
      width: l.width * scale,
      height: l.height * scale,
      strokeWidth: l.strokeWidth * scale,
      fontSize: l.fontSize ? l.fontSize * scale : undefined,
      children: l.children?.map((ch) => ({
        ...ch,
        x: ch.x * scale,
        y: ch.y * scale,
        width: ch.width * scale,
        height: ch.height * scale,
        strokeWidth: ch.strokeWidth * scale,
        fontSize: ch.fontSize ? ch.fontSize * scale : undefined,
      })),
    });

    return {
      ...project,
      title: title.trim() || project.title,
      width: outW,
      height: outH,
      layers: filteredLayers.map(scaleLayer),
    };
  }, [project, title, includeHidden, targetSize]);

  const xmlOutput = useMemo(
    () => exportAlightMotionXml(exportProject),
    [exportProject]
  );

  const safeSlug = (title.trim() || 'vector_am_project')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');

  const rasterLayers = exportProject.layers.filter(
    (l) => l.type === 'raster' && l.rasterDataUrl
  );

  const handleDownloadXml = () => {
    const blob = new Blob([xmlOutput], {type: 'application/xml;charset=utf-8'});
    downloadBlob(blob, `${safeSlug}_alight_motion.xml`);
  };

  const handleDownloadSvg = () => {
    const svg = exportProjectAsSvg(exportProject);
    const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    downloadBlob(blob, `${safeSlug}_separated.svg`);
  };

  const handleDownloadRasterZip = async () => {
    setZipBusy(true);
    try {
      const zip = new JSZip();
      zip.file(`${safeSlug}_alight_motion.xml`, xmlOutput);
      const assetsFolder = zip.folder('assets');
      for (const layer of rasterLayers) {
        if (!layer.rasterDataUrl) continue;
        const base64 = layer.rasterDataUrl.split(',')[1];
        if (base64) {
          const fileName =
            layer.amMeta?.mediaUri ||
            `${layer.name.replace(/[^a-z0-9_-]+/gi, '_')}.png`;
          assetsFolder?.file(fileName, base64, {base64: true});
        }
      }
      const content = await zip.generateAsync({type: 'blob'});
      downloadBlob(content, `${safeSlug}_am_pack.zip`);
    } finally {
      setZipBusy(false);
    }
  };

  const handleCopyXml = async () => {
    await navigator.clipboard.writeText(xmlOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#13161C] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 id="export-modal-title" className="text-base font-semibold text-white">
              Export Alight Motion XML
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {exportProject.layers.length} layer aktif · {exportProject.width}×{exportProject.height} px · {exportProject.fps} fps
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog ekspor"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto studio-scroll">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Project
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#0B0D11] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Resolusi Scene Alight Motion
              </label>
              <select
                value={targetSize}
                onChange={(e) => setTargetSize(e.target.value as typeof targetSize)}
                className="w-full px-3 py-2 text-sm bg-[#0B0D11] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="original">
                  Ukuran Asli ({project.width} × {project.height})
                </option>
                <option value="1080x1080">Square 1:1 (1080 × 1080)</option>
                <option value="1080x1920">Vertical 9:16 (1080 × 1920)</option>
                <option value="1920x1080">Landscape 16:9 (1920 × 1080)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              className="rounded border-slate-700 bg-[#0B0D11] text-blue-600 focus:ring-blue-500"
            />
            Sertakan layer yang sedang disembunyikan (hidden=&quot;true&quot;)
          </label>

          {rasterLayers.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 leading-relaxed">
              Project memiliki {rasterLayers.length} layer gambar raster. File XML tetap menyimpan posisi, ukuran, opacity, dan referensi nama file gambar. Gunakan tombol <strong>Download Paket ZIP</strong> agar file PNG hasil pemisahan ikut terunduh.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-300">
                Pratinjau Struktur XML (&lt;scene&gt;)
              </span>
              <button
                type="button"
                onClick={handleCopyXml}
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Salin XML'}
              </button>
            </div>
            <pre className="h-52 p-3 text-[11px] leading-relaxed font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-lg text-slate-300 overflow-auto studio-scroll">
              {xmlOutput}
            </pre>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-800 bg-[#0F1218] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              Download SVG
            </button>
            {rasterLayers.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadRasterZip}
                disabled={zipBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileImage className="w-3.5 h-3.5" />
                {zipBusy ? 'Menyiapkan ZIP...' : 'Download Paket ZIP'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadXml}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download XML (.xml)
          </button>
        </div>
      </div>
    </div>
  );
}
