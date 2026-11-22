import {useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Combine,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Pencil,
  Search,
  Square,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react';
import type {StudioLayer} from '../types/studio';

interface LayerPanelProps {
  layers: StudioLayer[];
  selectedIds: string[];
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRename: (id: string, newName: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveOrder: (id: string, direction: 'up' | 'down') => void;
  onMergeSelected: () => void;
  onUngroup: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  path: 'Path',
  rect: 'Rect',
  circle: 'Circle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  text: 'Text',
  group: 'Group',
  raster: 'Raster',
  shape: 'Shape',
};

export function LayerPanel({
  layers,
  selectedIds,
  onSelect,
  onSelectAll,
  onClearSelection,
  onRename,
  onToggleVisible,
  onToggleLock,
  onDuplicate,
  onDelete,
  onMoveOrder,
  onMergeSelected,
  onUngroup,
}: LayerPanelProps) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Render layers top-most Z-index first (reverse of array order)
  const displayLayers = [...layers]
    .reverse()
    .filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()));

  const startRename = (layer: StudioLayer) => {
    setEditingId(layer.id);
    setDraftName(layer.name);
  };

  const commitRename = () => {
    if (editingId && draftName.trim()) {
      onRename(editingId, draftName.trim());
    }
    setEditingId(null);
  };

  const toggleGroupExpand = (id: string) => {
    setExpandedGroups((prev) => ({...prev, [id]: !prev[id]}));
  };

  const selectedCount = selectedIds.length;
  const allSelected = layers.length > 0 && selectedCount === layers.length;

  return (
    <aside className="w-full lg:w-[296px] shrink-0 bg-[#13161C] border-b lg:border-b-0 lg:border-r border-slate-800/90 flex flex-col min-h-0 max-h-[38vh] lg:max-h-none">
      <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            Layer Editor
          </h2>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular">
          {layers.length} layer
        </span>
      </div>

      <div className="p-3 border-b border-slate-800/70 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari layer..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0B0D11] border border-slate-800 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={allSelected ? onClearSelection : onSelectAll}
            disabled={layers.length === 0}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-500" />
            )}
            {allSelected ? 'Batal Pilih' : 'Pilih Semua'}
          </button>

          <button
            type="button"
            onClick={onMergeSelected}
            disabled={selectedCount < 2}
            title="Gabungkan layer terpilih menjadi satu grup"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-white bg-slate-800 hover:bg-blue-600 disabled:bg-slate-800/50 disabled:text-slate-600 rounded transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Combine className="w-3 h-3" />
            Gabung ({selectedCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto studio-scroll divide-y divide-slate-800/50">
        {displayLayers.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500">
            {layers.length === 0
              ? 'Belum ada layer. Upload SVG, gambar, atau XML untuk memulai.'
              : 'Tidak ada layer yang cocok dengan pencarian.'}
          </div>
        ) : (
          displayLayers.map((layer) => {
            const isSelected = selectedIds.includes(layer.id);
            const isEditing = editingId === layer.id;
            const arrayIndex = layers.findIndex((l) => l.id === layer.id);
            const canMoveUp = arrayIndex < layers.length - 1;
            const canMoveDown = arrayIndex > 0;
            const isGroup = layer.type === 'group' && (layer.children?.length || 0) > 0;
            const isExpanded = !!expandedGroups[layer.id];

            return (
              <div key={layer.id}>
                <div
                  onClick={(e) => onSelect(layer.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                  className={`group px-3 py-2.5 flex items-center gap-2 transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-blue-600/15 text-white'
                      : 'hover:bg-slate-800/40 text-slate-300'
                  } ${!layer.visible ? 'opacity-55' : ''}`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(layer.id, true);
                    }}
                    aria-label={`Pilih multi ${layer.name}`}
                    className="text-slate-500 hover:text-blue-400 shrink-0 cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isGroup && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupExpand(layer.id);
                      }}
                      aria-label="Toggle isi grup"
                      className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {layer.type === 'raster' && layer.rasterDataUrl ? (
                    <img
                      src={layer.rasterDataUrl}
                      alt={layer.name}
                      className="w-4 h-4 rounded-sm object-contain bg-slate-900 border border-slate-700 shrink-0"
                    />
                  ) : (
                    <span
                      className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                      style={{
                        backgroundColor:
                          layer.fill !== 'none'
                            ? layer.fill
                            : layer.stroke !== 'none'
                              ? layer.stroke
                              : '#64748B',
                      }}
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={draftName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-full px-1.5 py-0.5 text-xs bg-[#0B0D11] border border-blue-500 rounded text-white focus:outline-none"
                      />
                    ) : (
                      <div
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(layer);
                        }}
                        className="text-xs font-medium truncate"
                        title={`${layer.name} (Klik ganda untuk rename)`}
                      >
                        {layer.name}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 font-mono-tabular flex items-center gap-1.5 truncate">
                      <span>{TYPE_LABELS[layer.type] || 'Layer'}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {Math.round(layer.width)}×{Math.round(layer.height)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{Math.round(layer.opacity * 100)}%</span>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onMoveOrder(layer.id, 'up')}
                      disabled={!canMoveUp}
                      title="Naikkan urutan layer"
                      aria-label="Naikkan urutan layer"
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveOrder(layer.id, 'down')}
                      disabled={!canMoveDown}
                      title="Turunkan urutan layer"
                      aria-label="Turunkan urutan layer"
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(layer)}
                      title="Ganti nama layer"
                      aria-label="Ganti nama layer"
                      className="p-1 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {isGroup && (
                      <button
                        type="button"
                        onClick={() => onUngroup(layer.id)}
                        title="Pisahkan grup"
                        aria-label="Pisahkan grup"
                        className="p-1 text-slate-400 hover:text-blue-400 cursor-pointer"
                      >
                        <Ungroup className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleVisible(layer.id)}
                      title={layer.visible ? 'Sembunyikan layer' : 'Tampilkan layer'}
                      aria-label={layer.visible ? 'Sembunyikan layer' : 'Tampilkan layer'}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {layer.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleLock(layer.id)}
                      title={layer.locked ? 'Buka kunci layer' : 'Kunci layer'}
                      aria-label={layer.locked ? 'Buka kunci layer' : 'Kunci layer'}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {layer.locked ? (
                        <Lock className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Unlock className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicate(layer.id)}
                      title="Duplikat layer"
                      aria-label="Duplikat layer"
                      className="p-1 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(layer.id)}
                      title="Hapus layer"
                      aria-label="Hapus layer"
                      className="p-1 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {isGroup && isExpanded && layer.children && (
                  <div className="bg-[#0E1117] border-t border-slate-800/50 pl-9 pr-3 py-1.5 space-y-1">
                    {layer.children.map((child) => (
                      <div
                        key={child.id}
                        className="flex items-center justify-between text-[11px] text-slate-400 py-0.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{backgroundColor: child.fill !== 'none' ? child.fill : '#64748B'}}
                          />
                          <span className="truncate">{child.name}</span>
                        </div>
                        <span className="font-mono-tabular text-slate-500 shrink-0">
                          {TYPE_LABELS[child.type] || 'Layer'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
