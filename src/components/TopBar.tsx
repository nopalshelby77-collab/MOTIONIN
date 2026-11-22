import {Download} from 'lucide-react';

interface TopBarProps {
  onQuickAction: (action: 'upload-svg' | 'upload-xml' | 'import-url' | 'samples') => void;
  onOpenExport: () => void;
  hasLayers: boolean;
}

export function TopBar({onQuickAction, onOpenExport, hasLayers}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#0F1218] px-5 flex items-center justify-between gap-8">
      <div className="text-[15px] font-bold tracking-tight text-white whitespace-nowrap shrink-0">
        VECTOR AM STUDIO
      </div>

      <nav
        aria-label="Navigasi import"
        className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300"
      >
        <button
          type="button"
          onClick={() => onQuickAction('upload-svg')}
          className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Upload Vector
        </button>
        <button
          type="button"
          onClick={() => onQuickAction('upload-xml')}
          className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Upload XML
        </button>
        <button
          type="button"
          onClick={() => onQuickAction('import-url')}
          className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Import URL
        </button>
        <button
          type="button"
          onClick={() => onQuickAction('samples')}
          className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Contoh Project
        </button>
      </nav>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!hasLayers}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          Export XML
        </button>
      </div>
    </header>
  );
}
