import {useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  Combine,
  Copy,
  Download,
  FileCode2,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  RefreshCw,
  Sliders,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import type {
  ImportErrorState,
  RasterSeparationMode,
  SeparationMode,
  StudioLayer,
  StudioProject,
} from '../types/studio';
import {
  exportAlightMotionXml,
  exportProjectAsSvg,
} from '../engine/alightMotionXml';
import {isValidHexInput} from '../engine/colorUtils';

export type RightTab = 'properties' | 'import' | 'xml';

interface RightPanelProps {
  activeTab: RightTab;
  onChangeTab: (tab: RightTab) => void;
  project: StudioProject;
  onUpdateProjectMeta: (patch: Partial<StudioProject>) => void;
  selectedLayers: StudioLayer[];
  onUpdateLayer: (id: string, patch: Partial<StudioLayer>, commit?: boolean) => void;
  onUpdateMultipleLayers: (ids: string[], patch: Partial<StudioLayer>) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayers: (ids: string[]) => void;
  onMergeSelected: () => void;
  // Import handlers
  svgMode: SeparationMode;
  onChangeSvgMode: (mode: SeparationMode) => void;
  rasterMode: RasterSeparationMode;
  onChangeRasterMode: (mode: RasterSeparationMode) => void;
  rasterColorCount: number;
  onChangeRasterColorCount: (n: number) => void;
  rasterTolerance: number;
  onChangeRasterTolerance: (n: number) => void;
  onReprocessRaster: () => void;
  onUploadVectorOrImage: (file: File) => void;
  onUploadProjectFile: (file: File) => void;
  onLoadXmlFromUrl: (url: string) => Promise<void>;
  urlLoading: boolean;
  importError: ImportErrorState | null;
  onClearImportError: () => void;
  onLoadSampleSvg: () => void;
  onLoadSampleAmXml: () => void;
}

export function RightPanel({
  activeTab,
  onChangeTab,
  project,
  onUpdateProjectMeta,
  selectedLayers,
  onUpdateLayer,
  onUpdateMultipleLayers,
  onDuplicateLayer,
  onDeleteLayers,
  onMergeSelected,
  svgMode,
  onChangeSvgMode,
  rasterMode,
  onChangeRasterMode,
  rasterColorCount,
  onChangeRasterColorCount,
  rasterTolerance,
  onChangeRasterTolerance,
  onReprocessRaster,
  onUploadVectorOrImage,
  onUploadProjectFile,
  onLoadXmlFromUrl,
  urlLoading,
  importError,
  onClearImportError,
  onLoadSampleSvg,
  onLoadSampleAmXml,
}: RightPanelProps) {
  const vectorFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  const [xmlUrl, setXmlUrl] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [copiedXml, setCopiedXml] = useState(false);

  const single = selectedLayers.length === 1 ? selectedLayers[0] : null;
  const multi = selectedLayers.length > 1;

  const xmlPreview = useMemo(() => {
    if (activeTab !== 'xml') return '';
    return exportAlightMotionXml(project);
  }, [activeTab, project]);

  const handleSizeChange = (axis: 'width' | 'height', value: number) => {
    if (!single || !Number.isFinite(value)) return;
    const clamped = Math.max(4, value);
    if (lockAspect && single.width > 0 && single.height > 0) {
      const ratio = single.width / single.height;
      if (axis === 'width') {
        onUpdateLayer(single.id, {
          width: Math.round(clamped * 10) / 10,
          height: Math.round((clamped / ratio) * 10) / 10,
        });
      } else {
        onUpdateLayer(single.id, {
          height: Math.round(clamped * 10) / 10,
          width: Math.round(clamped * ratio * 10) / 10,
        });
      }
    } else {
      onUpdateLayer(single.id, {[axis]: Math.round(clamped * 10) / 10});
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xmlUrl.trim()) return;
    await onLoadXmlFromUrl(xmlUrl.trim());
  };

  const handleCopyXml = async () => {
    const xml = exportAlightMotionXml(project);
    await navigator.clipboard.writeText(xml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 1800);
  };

  const handleDownloadXml = () => {
    const xml = exportAlightMotionXml(project);
    const blob = new Blob([xml], {type: 'application/xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}_am.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadSvg = () => {
    const svg = exportProjectAsSvg(project);
    const blob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}_separated.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <aside className="w-full lg:w-[330px] shrink-0 bg-[#13161C] border-t lg:border-t-0 lg:border-l border-slate-800/90 flex flex-col min-h-0 max-h-[44vh] lg:max-h-none">
      {/* Panel Tabs */}
      <div className="p-2 border-b border-slate-800/80 bg-[#0F1218]">
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeTab('properties')}
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'properties'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Properti
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('import')}
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'import'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Import
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('xml')}
            className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === 'xml'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            XML Output
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
        {activeTab === 'properties' && (
          <>
            {single ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">
                      {single.isVector ? 'Elemen Vector' : 'Area Gambar Raster (Bukan Vector)'} · &lt;{single.sourceTag}&gt;
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLayer(single.id, {locked: !single.locked})
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                    >
                      {single.locked ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-400" />
                          Terkunci
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" />
                          Bebas
                        </>
                      )}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={single.name}
                    onChange={(e) => onUpdateLayer(single.id, {name: e.target.value})}
                    aria-label="Nama Layer"
                    className="w-full px-3 py-2 text-sm font-medium bg-[#0B0D11] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Transform */}
                <div className="pt-4 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-200">
                      Posisi &amp; Ukuran
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLockAspect((v) => !v)}
                      className={`inline-flex items-center gap-1 text-[11px] cursor-pointer ${
                        lockAspect ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Link2 className="w-3 h-3" />
                      {lockAspect ? 'Rasio Terkunci' : 'Rasio Bebas'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Posisi X
                      </label>
                      <input
                        type="number"
                        step="1"
                        disabled={single.locked}
                        value={Math.round(single.x * 10) / 10}
                        onChange={(e) =>
                          onUpdateLayer(single.id, {
                            x: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Posisi Y
                      </label>
                      <input
                        type="number"
                        step="1"
                        disabled={single.locked}
                        value={Math.round(single.y * 10) / 10}
                        onChange={(e) =>
                          onUpdateLayer(single.id, {
                            y: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Lebar (W)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="4"
                        disabled={single.locked}
                        value={Math.round(single.width * 10) / 10}
                        onChange={(e) =>
                          handleSizeChange('width', Number(e.target.value))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Tinggi (H)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="4"
                        disabled={single.locked}
                        value={Math.round(single.height * 10) / 10}
                        onChange={(e) =>
                          handleSizeChange('height', Number(e.target.value))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-400">Rotasi</label>
                      <span className="text-[11px] font-mono-tabular text-slate-300">
                        {Math.round(single.rotation)}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      disabled={single.locked}
                      value={single.rotation}
                      onChange={(e) =>
                        onUpdateLayer(single.id, {rotation: Number(e.target.value)})
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Color & Opacity */}
                <div className="pt-4 border-t border-slate-800/80 space-y-3.5">
                  <h3 className="text-xs font-semibold text-slate-200">
                    Warna &amp; Transparansi
                  </h3>

                  {single.isVector && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-slate-400">
                            Warna Fill
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateLayer(single.id, {
                                fill: single.fill === 'none' ? '#3B82F6' : 'none',
                              })
                            }
                            className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            {single.fill === 'none' ? 'Aktifkan Fill' : 'Tanpa Fill'}
                          </button>
                        </div>
                        {single.fill !== 'none' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={isValidHexInput(single.fill) ? single.fill : '#3B82F6'}
                              onChange={(e) =>
                                onUpdateLayer(single.id, {
                                  fill: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-9 h-8 p-0.5 bg-[#0B0D11] border border-slate-800 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={single.fill}
                              onChange={(e) =>
                                onUpdateLayer(single.id, {fill: e.target.value})
                              }
                              className="flex-1 px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-slate-400">
                            Garis Tepi (Stroke)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateLayer(single.id, {
                                stroke: single.stroke === 'none' ? '#FFFFFF' : 'none',
                                strokeWidth: single.stroke === 'none' ? 2 : 0,
                              })
                            }
                            className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            {single.stroke === 'none' ? 'Tambah Stroke' : 'Hapus Stroke'}
                          </button>
                        </div>
                        {single.stroke !== 'none' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={isValidHexInput(single.stroke) ? single.stroke : '#FFFFFF'}
                              onChange={(e) =>
                                onUpdateLayer(single.id, {
                                  stroke: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-9 h-8 p-0.5 bg-[#0B0D11] border border-slate-800 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={single.stroke}
                              onChange={(e) =>
                                onUpdateLayer(single.id, {stroke: e.target.value})
                              }
                              className="flex-1 px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={single.strokeWidth}
                              onChange={(e) =>
                                onUpdateLayer(single.id, {
                                  strokeWidth: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              title="Ketebalan Stroke"
                              className="w-16 px-2 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-400">Opacity</label>
                      <span className="text-[11px] font-mono-tabular text-slate-300">
                        {Math.round(single.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={single.opacity}
                      onChange={(e) =>
                        onUpdateLayer(single.id, {opacity: Number(e.target.value)})
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Text Content Controls */}
                {single.type === 'text' && (
                  <div className="pt-4 border-t border-slate-800/80 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-200">
                      Properti Teks
                    </h3>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Isi Teks
                      </label>
                      <input
                        type="text"
                        value={single.textContent || ''}
                        onChange={(e) =>
                          onUpdateLayer(single.id, {textContent: e.target.value})
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Ukuran Font
                        </label>
                        <input
                          type="number"
                          min="8"
                          max="400"
                          value={Math.round(single.fontSize || 24)}
                          onChange={(e) =>
                            onUpdateLayer(single.id, {
                              fontSize: Math.max(8, Number(e.target.value) || 24),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Perataan
                        </label>
                        <select
                          value={single.textAlign || 'left'}
                          onChange={(e) =>
                            onUpdateLayer(single.id, {
                              textAlign: e.target.value as 'left' | 'center' | 'right',
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="left">Kiri</option>
                          <option value="center">Tengah</option>
                          <option value="right">Kanan</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onDuplicateLayer(single.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplikat
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLayers([single.id])}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              </div>
            ) : multi ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {selectedLayers.length} Layer Terpilih
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Edit warna, opacity, atau gabungkan menjadi satu grup.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Ubah Warna Fill Semua Terpilih
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value="#3B82F6"
                        onChange={(e) =>
                          onUpdateMultipleLayers(
                            selectedLayers.map((l) => l.id),
                            {fill: e.target.value.toUpperCase()}
                          )
                        }
                        className="w-9 h-8 p-0.5 bg-[#0B0D11] border border-slate-800 rounded cursor-pointer"
                      />
                      <span className="text-xs text-slate-400">
                        Pilih warna untuk diterapkan ke seluruh layer terpilih
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Atur Opacity Serentak
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      defaultValue="1"
                      onChange={(e) =>
                        onUpdateMultipleLayers(
                          selectedLayers.map((l) => l.id),
                          {opacity: Number(e.target.value)}
                        )
                      }
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <button
                    type="button"
                    onClick={onMergeSelected}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
                  >
                    <Combine className="w-3.5 h-3.5" />
                    Gabungkan {selectedLayers.length} Layer Jadi Grup
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLayers(selectedLayers.map((l) => l.id))}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Layer Terpilih
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <Sliders className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-semibold">Pengaturan Canvas Project</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pilih salah satu layer di kanvas atau panel kiri untuk mengedit warna, posisi, ukuran, atau opacity.
                </p>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Judul Project
                    </label>
                    <input
                      type="text"
                      value={project.title}
                      onChange={(e) => onUpdateProjectMeta({title: e.target.value})}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Lebar Kanvas
                      </label>
                      <input
                        type="number"
                        min="64"
                        value={project.width}
                        onChange={(e) =>
                          onUpdateProjectMeta({
                            width: Math.max(64, Number(e.target.value) || 64),
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Tinggi Kanvas
                      </label>
                      <input
                        type="number"
                        min="64"
                        value={project.height}
                        onChange={(e) =>
                          onUpdateProjectMeta({
                            height: Math.max(64, Number(e.target.value) || 64),
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        FPS Scene
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={project.fps}
                        onChange={(e) =>
                          onUpdateProjectMeta({
                            fps: Math.max(1, Number(e.target.value) || 60),
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Durasi (ms)
                      </label>
                      <input
                        type="number"
                        min="500"
                        step="500"
                        value={project.totalTime}
                        onChange={(e) =>
                          onUpdateProjectMeta({
                            totalTime: Math.max(500, Number(e.target.value) || 5000),
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'import' && (
          <div className="space-y-5">
            {importError && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-red-200">
                      {importError.title}
                    </p>
                    <p className="text-[11px] text-red-200/85 mt-1 leading-relaxed">
                      {importError.message}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {importError.canManualFallback && (
                    <button
                      type="button"
                      onClick={() => projectFileInputRef.current?.click()}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-white bg-red-600 hover:bg-red-500 rounded transition-colors cursor-pointer"
                    >
                      Upload Manual File XML
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClearImportError}
                    className="px-2.5 py-1.5 text-[11px] text-red-200 hover:text-white cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}

            {/* A. Upload Vector & Gambar */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  A. Upload Vector &amp; Gambar
                </h3>
                <span className="text-[11px] text-slate-500 font-mono-tabular">
                  SVG · PNG · JPG · WEBP
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D11] border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => onChangeSvgMode('deep')}
                  className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                    svgMode === 'deep'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pisah Semua Objek
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSvgMode('groups')}
                  className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                    svgMode === 'groups'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Pertahankan Grup
                </button>
              </div>

              <input
                ref={vectorFileInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadVectorOrImage(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => vectorFileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) onUploadVectorOrImage(f);
                }}
                className="w-full p-4 border border-dashed border-slate-700 hover:border-blue-500 bg-[#0B0D11]/70 hover:bg-blue-500/5 rounded-lg text-center transition-colors cursor-pointer group"
              >
                <ImageIcon className="w-5 h-5 text-slate-400 group-hover:text-blue-400 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-200">
                  Pilih atau Seret File Logo
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  SVG dipisah jadi layer vector · PNG/JPG dipisah per area gambar
                </p>
              </button>

              {project.sourceFormat === 'raster' && (
                <div className="p-3 bg-[#0B0D11] border border-slate-800 rounded-lg space-y-2.5">
                  <div className="text-[11px] font-medium text-slate-300">
                    Pengaturan Pemisahan Gambar Raster
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#13161C] border border-slate-800 rounded">
                    <button
                      type="button"
                      onClick={() => onChangeRasterMode('objects')}
                      className={`py-1 text-[11px] rounded cursor-pointer ${
                        rasterMode === 'objects'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Area Objek
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeRasterMode('colors')}
                      className={`py-1 text-[11px] rounded cursor-pointer ${
                        rasterMode === 'colors'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Klaster Warna
                    </button>
                  </div>

                  {rasterMode === 'colors' ? (
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Jumlah Klaster Warna</span>
                        <span className="font-mono-tabular text-slate-200">
                          {rasterColorCount} warna
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="8"
                        value={rasterColorCount}
                        onChange={(e) =>
                          onChangeRasterColorCount(Number(e.target.value))
                        }
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Toleransi Latar Belakang</span>
                        <span className="font-mono-tabular text-slate-200">
                          {rasterTolerance}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={rasterTolerance}
                        onChange={(e) =>
                          onChangeRasterTolerance(Number(e.target.value))
                        }
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onReprocessRaster}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Proses Ulang Pemisahan Gambar
                  </button>
                </div>
              )}
            </section>

            {/* B. Upload Project */}
            <section className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  B. Upload Project Alight Motion
                </h3>
                <span className="text-[11px] text-slate-500 font-mono-tabular">
                  XML · AMPROJ
                </span>
              </div>

              <input
                ref={projectFileInputRef}
                type="file"
                accept=".xml,.amproj,application/xml,text/xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadProjectFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => projectFileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) onUploadProjectFile(f);
                }}
                className="w-full p-4 border border-dashed border-slate-700 hover:border-blue-500 bg-[#0B0D11]/70 hover:bg-blue-500/5 rounded-lg text-center transition-colors cursor-pointer group"
              >
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-400 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-200">
                  Upload File .XML atau .AMPROJ
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Membaca &lt;scene&gt;, &lt;shape&gt;, &lt;text&gt;, &lt;media&gt;, &amp; &lt;embedScene&gt;
                </p>
              </button>
            </section>

            {/* C. Import melalui URL */}
            <section className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-200">
                  C. Import melalui URL XML
                </h3>
              </div>

              <form onSubmit={handleUrlSubmit} className="space-y-2">
                <input
                  type="url"
                  value={xmlUrl}
                  onChange={(e) => setXmlUrl(e.target.value)}
                  placeholder="https://contoh.com/project.xml"
                  className="w-full px-3 py-2 text-xs bg-[#0B0D11] border border-slate-800 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={urlLoading || !xmlUrl.trim()}
                  className="w-full py-2 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {urlLoading ? 'Memuat & Memvalidasi XML...' : 'Load XML'}
                </button>
              </form>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pengambilan URL diproses melalui proxy server untuk menangani pembatasan CORS dan memvalidasi format XML secara aman.
              </p>
            </section>

            {/* Quick Samples */}
            <section className="pt-4 border-t border-slate-800/80 space-y-2">
              <h3 className="text-xs font-semibold text-slate-200">
                Uji Coba Cepat
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onLoadSampleSvg}
                  className="px-2.5 py-2 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Contoh Logo SVG
                </button>
                <button
                  type="button"
                  onClick={onLoadSampleAmXml}
                  className="px-2.5 py-2 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Contoh AM XML
                </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'xml' && (
          <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Alight Motion XML Live
              </span>
              <button
                type="button"
                onClick={handleCopyXml}
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                {copiedXml ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedXml ? 'Tersalin' : 'Salin'}
              </button>
            </div>

            <pre className="flex-1 min-h-[280px] p-3 text-[11px] leading-relaxed font-mono-tabular bg-[#0B0D11] border border-slate-800 rounded-lg text-slate-300 overflow-auto studio-scroll">
              {xmlPreview}
            </pre>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadXml}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh .XML
              </button>
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Unduh .SVG
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
