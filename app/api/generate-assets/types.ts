export type AssetPipeline = "ai-chroma" | "crop";

export type AssetSheetManifest = {
  assets?: Array<{
    assetPipeline?: AssetPipeline;
    assetName?: string;
    cropSearchBBox?: [number, number, number, number];
    elementType?: string;
    exportSize?: { height: number; width: number };
    id?: string;
    prompt?: string;
    reason?: string;
    sheetBBox?: [number, number, number, number];
    sourceBBox?: [number, number, number, number];
    state?: Record<string, unknown>;
    strategy?: string;
    semanticName?: string;
    text?: string;
  }>;
  sheetSize?: { height?: number; width?: number };
  version?: string;
};

export type GeneratedAssetPart = {
  assetName?: string;
  filename: string;
  id: string;
  imageDataUrl: string;
  prompt: string;
  semanticName?: string;
  source: AssetPipeline;
  verification?: {
    bboxDelta?: number;
    needsReview: boolean;
    overlayDataUrl?: string;
    score: number;
  };
};

export type PlannedAsset = {
  asset: NonNullable<AssetSheetManifest["assets"]>[number];
  id: string;
  pipeline: AssetPipeline;
  semanticName?: string;
};

export type AiGenerationIssue = {
  message: string;
  pipeline: "ai-chroma";
  type: "provider-error" | "empty-response";
};
