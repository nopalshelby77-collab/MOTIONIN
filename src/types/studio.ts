export type LayerType =
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'text'
  | 'group'
  | 'raster'
  | 'shape';

export type SourceFormat = 'svg' | 'am-xml' | 'amproj' | 'raster';

export type SeparationMode = 'deep' | 'groups';

export type RasterSeparationMode = 'objects' | 'colors';

export type PreviewViewMode = 'separated' | 'original' | 'selected';

export type CanvasBackground = 'checkerboard' | 'dark' | 'light';

export interface AlightMotionLayerMeta {
  amId?: string;
  startTime?: number;
  endTime?: number;
  shapePreset?: string;
  fillType?: string;
  blending?: string;
  hasKeyframes?: boolean;
  mediaUri?: string;
  extraAttributes?: Record<string, string>;
}

export interface StudioLayer {
  id: string;
  name: string;
  type: LayerType;
  sourceTag: string;
  isVector: boolean;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  origWidth: number;
  origHeight: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  pathData?: string;
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  rasterDataUrl?: string;
  children?: StudioLayer[];
  amMeta?: AlightMotionLayerMeta;
}

export interface StudioProject {
  title: string;
  width: number;
  height: number;
  fps: number;
  totalTime: number;
  bgcolor: string;
  sourceFormat: SourceFormat;
  originalSvg?: string;
  originalImageUrl?: string;
  originalXml?: string;
  layers: StudioLayer[];
  warnings: string[];
}

export interface ImportErrorState {
  title: string;
  message: string;
  canManualFallback?: boolean;
  details?: string;
}
