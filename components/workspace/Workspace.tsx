"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { mockManifest } from "@/core/mock-manifest";
import {
  sanitizeManifestInput,
  UIManifestSchema,
  type AssetPipeline,
  type RestoreStrategy,
  type UIElement,
  type UIManifest,
} from "@/core/manifest";

const confidenceFilters = [null, 0.9, 0.85, 0.75] as const;

const strategyLabelZh: Record<RestoreStrategy, string> = {
  asset: "提取为素材",
  code: "用代码还原",
  crop: "从原图裁剪",
  ignore: "忽略不处理",
  regenerate: "重新生成素材",
};

const strategyReasonExampleZh: Record<RestoreStrategy, string> = {
  asset: "该区域包含代码或 AI 难以稳定还原的视觉细节，建议提取为独立素材。",
  code: "该元素属于可复用的界面结构，适合用 HTML/CSS 直接还原。",
  crop: "该元素包含图片细节或品牌特征，建议从原图裁剪以保持一致。",
  ignore: "该元素偏装饰或不影响主要功能，当前阶段可以先忽略。",
  regenerate: "该元素包含复杂光影、纹理或插画，适合生成独立素材后再组合。",
};

const assetPipelineLabelZh: Record<AssetPipeline, string> = {
  "ai-chroma": "ai-chroma（AI 绿幕重绘，默认）",
  crop: "crop（原图裁剪，保留原像素）",
};

type Locale = "zh" | "en";
type CanvasMode = "annotated" | "compare";
type ConfidenceFilter = (typeof confidenceFilters)[number];
const assetPipelineOptions: AssetPipeline[] = [
  "crop",
  "ai-chroma",
];
type ResizeHandle = "nw" | "ne" | "sw" | "se";
type DragAction =
  | {
      element: UIElement;
      kind: "move";
      pointerX: number;
      pointerY: number;
    }
  | {
      element: UIElement;
      handle: ResizeHandle;
      kind: "resize";
      pointerX: number;
      pointerY: number;
    };
type DraftBBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const copy = {
  zh: {
    analysis: "分析",
    addAnnotation: "新增标注",
    assetList: "资产列表",
    assetListEmpty: "生成资产后会显示在这里。",
    bboxOutside: "bbox 越界",
    assetPipeline: "资产处理方式",
    canvas: "画布",
    canvasEmptyHelp: "上传图片或使用示例图开始解析。",
    clear: "清空",
    confidence: "置信度",
    confidenceAll: "全部",
    compare: "对照",
    deleteElement: "删除标注",
    detectedElements: "已识别元素",
    editBbox: "编辑位置",
    elements: "个元素",
    empty: "空",
    exportAssetSheet: "导出素材拼图",
    footerLoaded: "图片已载入",
    footerWaiting: "等待上传",
    generateAssets: "生成资产",
    generateUi: "生成界面",
    generated: "已生成",
    import: "导入",
    export: "导出",
    image: "图片",
    inspector: "检查器",
    layers: "图层",
    localMock: "本地示例",
    mock: "示例",
    model: "模型",
    noLayers: "暂无图层。",
    noSourceImage: "暂无源图",
    notUploaded: "未上传图片",
    parsing: "解析中...",
    parsingDetail: "正在读取图片并识别界面结构",
    pleaseUploadImage: "请上传图片",
    prompt: "提示词",
    promptPlaceholder: "描述这个素材需要如何处理，例如：保留图标形状并输出透明背景。",
    reason: "原因",
    reasonPlaceholder: "例如：该元素属于可复用的界面结构，适合用 HTML/CSS 直接还原。",
    closePreview: "关闭预览",
    previewAsset: "预览资产",
    rightClick: "右键",
    review: "待检",
    reviewNext: "下一个待检",
    selectElement: "选择元素",
    selectElementHelp: "选择一个画布标注后编辑属性。",
    selectionAndStrategy: "选择和素材",
    source: "源图",
    sourceDropHint: "上传源图开始",
    sourceImage: "源图尺寸",
    uploadImage: "上传图片",
    uploadedImage: "已上传图片",
    useSample: "使用示例图",
    visualMatch: "0.84 匹配",
    waitingForUpload: "等待上传",
    zoomIn: "放大画布",
    zoomOut: "缩小画布",
    zoomReset: "重置画布缩放",
    deleteHint: "右键图层可删除标注",
  },
  en: {
    analysis: "Analysis",
    addAnnotation: "Add annotation",
    assetList: "Assets",
    assetListEmpty: "Generated assets will appear here.",
    bboxOutside: "bbox outside",
    assetPipeline: "Asset pipeline",
    canvas: "Canvas",
    canvasEmptyHelp: "Upload an image or use the sample to start analysis.",
    clear: "Clear",
    confidence: "Confidence",
    confidenceAll: "All",
    compare: "Compare",
    deleteElement: "Delete annotation",
    detectedElements: "Detected elements",
    editBbox: "Edit position",
    elements: "elements",
    empty: "empty",
    exportAssetSheet: "Export assets",
    footerLoaded: "Image loaded",
    footerWaiting: "Waiting for upload",
    generateAssets: "Generate assets",
    generateUi: "Generate UI",
    generated: "Generated",
    import: "Import",
    export: "Export",
    image: "Image",
    inspector: "Inspector",
    layers: "Layers",
    localMock: "local mock",
    mock: "Mock",
    model: "model",
    noLayers: "No layers yet.",
    noSourceImage: "No source image",
    notUploaded: "No image uploaded",
    parsing: "Analyzing...",
    parsingDetail: "Reading the image and detecting UI structure",
    pleaseUploadImage: "Upload an image",
    prompt: "Prompt",
    promptPlaceholder: "Describe how this asset should be processed, e.g. transparent background.",
    reason: "Reason",
    reasonPlaceholder: "Example: This element can be rebuilt with reusable HTML/CSS.",
    closePreview: "Close preview",
    previewAsset: "Preview asset",
    rightClick: "Right-click",
    review: "review",
    reviewNext: "Next review",
    selectElement: "Select element",
    selectElementHelp: "Select a canvas annotation to edit its properties.",
    selectionAndStrategy: "Selection and asset",
    source: "Source",
    sourceDropHint: "Drop source to begin",
    sourceImage: "sourceImage",
    uploadImage: "Upload image",
    uploadedImage: "Uploaded image",
    useSample: "Use sample",
    visualMatch: "0.84 match",
    waitingForUpload: "Waiting for upload",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomReset: "Reset zoom",
    deleteHint: "Right-click a layer to delete",
  },
} satisfies Record<Locale, Record<string, string>>;

type AnalysisMeta = {
  elementCount?: number;
  error?: string;
  imageSize?: { height: number; width: number };
  model: string;
  outOfBoundsCount?: number;
  source: "ai" | "mock";
  sourceImageSize?: { height: number; width: number };
  warnings?: string[];
};

type CachedWorkspace = {
  analysisMeta: AnalysisMeta | null;
  fileName: string;
  image: Blob;
  manifest: UIManifest;
  savedAt: number;
};

type LayerContextMenu = {
  elementId: string;
  x: number;
  y: number;
};

type WorkspaceBundle = {
  image?: {
    dataUrl: string;
    name: string;
    type: string;
  };
  manifest: UIManifest;
  version: "workspace-bundle-1.0";
};

type AnalysisRegion = {
  file: File;
  height: number;
  originalHeight: number;
  originalWidth: number;
  originalX: number;
  originalY: number;
  width: number;
};

type SlicePlan = {
  height: number;
  reason?: string;
  width: number;
  x: number;
  y: number;
};

type GeneratedAssetItem = {
  assetSheet?: AssetSheetMeta;
  createdAt: number;
  error?: string;
  filename: string;
  id: string;
  imageUrl?: string;
  model?: string;
  originalFilename?: string;
  originalImageUrl?: string;
  parts?: GeneratedAssetPart[];
  previewLabel?: string;
  previewUrl?: string;
  status: "failed" | "generating" | "ready";
};

type AssetSheetMeta = {
  filename: string;
  height?: number;
  mimeType: string;
  sha256: string;
  size: number;
  uploadField?: string;
  width?: number;
};

type GeneratedAssetPart = {
  assetName?: string;
  filename: string;
  id: string;
  imageDataUrl?: string;
  prompt: string;
  semanticName?: string;
  source?: "ai-chroma" | "crop";
  url: string;
  verification?: {
    bboxDelta?: number;
    needsReview: boolean;
    overlayDataUrl?: string;
    score: number;
  };
};

type AssetPreview = {
  label: string;
  url: string;
};

type AssetSheetManifest = {
  assets: Array<{
    assetPipeline?: AssetPipeline;
    assetName?: string;
    cropSearchBBox?: AssetBBox;
    elementType: UIElement["type"];
    exportSize: { height: number; width: number };
    id: string;
    locatedByAi?: boolean;
    reason?: string;
    prompt: string;
    state?: UIElement["state"];
    sheetBBox: AssetBBox;
    sourceBBox: AssetBBox;
    strategy: RestoreStrategy;
    semanticName?: string;
    text?: string;
  }>;
  generatedAt: string;
  sheetSize: { height: number; width: number };
  sourceFileName: string;
  version: "asset-sheet-1.0";
};

type AssetBBox = [number, number, number, number];

type GeneratedAssetApiResult = {
  assetSheet?: AssetSheetMeta;
  error?: string;
  imageDataUrl?: string;
  imageUrl?: string;
  model: string;
  parts: Array<{
    assetName?: string;
    filename: string;
    id: string;
    imageDataUrl: string;
    prompt: string;
    semanticName?: string;
    source?: "ai-chroma" | "crop";
    verification?: {
      bboxDelta?: number;
      needsReview: boolean;
      overlayDataUrl?: string;
      score: number;
    };
  }>;
  processedSheetDataUrl?: string;
};

const cacheDbName = "aiclip";
const cacheStoreName = "workspace";
const cacheKey = "latest-upload";
const analysisImageMaxSide = 1600;
const analysisRegionCount = 1;

export function Workspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const generatedAssetUrlsRef = useRef<string[]>([]);
  const [manifest, setManifest] = useState<UIManifest | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>(
    undefined,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAssetItem[]>(
    [],
  );
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AnalysisMeta | null>(null);
  const [locale, setLocale] = useState<Locale>("zh");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("annotated");
  const [confidenceFilter, setConfidenceFilter] =
    useState<ConfidenceFilter>(null);
  const [layerContextMenu, setLayerContextMenu] =
    useState<LayerContextMenu | null>(null);
  const t = copy[locale];

  const elements = manifest?.elements ?? [];
  const filteredElements =
    confidenceFilter === null
      ? elements
      : elements.filter((element) => element.confidence < confidenceFilter);
  const selectedElement = elements.find(
    (element) => element.id === selectedElementId,
  );
  const reviewCount = elements.filter((element) => element.needsReview).length;
  const approvedCount = elements.length - reviewCount;

  useEffect(() => {
    let cancelled = false;

    async function restoreCachedUpload() {
      const cached = await readCachedWorkspace();
      if (!cached || cancelled) {
        return;
      }

      releaseObjectUrl();
      const objectUrl = URL.createObjectURL(cached.image);
      objectUrlRef.current = objectUrl;
      setFileName(cached.fileName);
      setSourcePreviewUrl(objectUrl);
      setAnalysisMeta(cached.analysisMeta);
      applyManifest(cached.manifest);
    }

    void restoreCachedUpload();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      releaseRegionPreviewUrls(generatedAssetUrlsRef.current);
      generatedAssetUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!layerContextMenu) {
      return;
    }

    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        contextMenuRef.current?.contains(event.target)
      ) {
        return;
      }

      setLayerContextMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLayerContextMenu(null);
      }
    }

    function closeOnScroll() {
      setLayerContextMenu(null);
    }

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [layerContextMenu]);

  useEffect(() => {
    function deleteSelectedOnKeyDown(event: KeyboardEvent) {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedElementId &&
        event.target &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        deleteElement(selectedElementId);
      }
    }

    window.addEventListener("keydown", deleteSelectedOnKeyDown);
    return () => {
      window.removeEventListener("keydown", deleteSelectedOnKeyDown);
    };
  }, [selectedElementId]);

  function releaseObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function applyManifest(nextManifest: UIManifest) {
    setManifest(nextManifest);
    setSelectedElementId(nextManifest.elements[0]?.id);
  }

  function parseImage(name = "示例界面.png") {
    releaseObjectUrl();
    void clearCachedWorkspace();
    setFileName(name);
    setIsParsing(true);
    setSourcePreviewUrl(null);
    setAnalysisMeta({
      elementCount: mockManifest.elements.length,
      imageSize: {
        height: mockManifest.sourceImage.height,
        width: mockManifest.sourceImage.width,
      },
      model: "local mock",
      outOfBoundsCount: 0,
      source: "mock",
      sourceImageSize: {
        height: mockManifest.sourceImage.height,
        width: mockManifest.sourceImage.width,
      },
      warnings: [],
    });
    applyManifest(mockManifest);
    setIsParsing(false);
  }

  function parseUploadedFile(file: File) {
    releaseObjectUrl();
    setFileName(file.name);
    setIsParsing(true);

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const image = new Image();
    image.onload = async () => {
      let responseMeta: AnalysisMeta | null = null;
      try {
        setSourcePreviewUrl(objectUrl);

        const analysisRegions = await createAnalysisRegions(
          file,
          image,
          analysisImageMaxSide,
          analysisRegionCount,
        );
        const formData = new FormData();
        formData.append("locale", locale);
        formData.append("originalWidth", String(image.naturalWidth));
        formData.append("originalHeight", String(image.naturalHeight));
        formData.append("sourceName", file.name);
        formData.append("regionCount", String(analysisRegions.length));
        analysisRegions.forEach((region, index) => {
          formData.append(`regionImage${index}`, region.file);
          formData.append(`regionWidth${index}`, String(region.width));
          formData.append(`regionHeight${index}`, String(region.height));
          formData.append(`regionOriginalX${index}`, String(region.originalX));
          formData.append(`regionOriginalY${index}`, String(region.originalY));
          formData.append(
            `regionOriginalWidth${index}`,
            String(region.originalWidth),
          );
          formData.append(
            `regionOriginalHeight${index}`,
            String(region.originalHeight),
          );
        });

        const response = await fetch("/api/analyze-image", {
          method: "POST",
          body: formData,
        });

        const result = (await response.json()) as {
          manifest?: UIManifest;
          meta?: AnalysisMeta;
          error?: string;
        };
        responseMeta = result.meta ?? null;

        if (!response.ok) {
          setAnalysisMeta(responseMeta);
          throw new Error(result.error ?? "Image analysis failed.");
        }

        if (!result.manifest) {
          throw new Error(result.error ?? "Image analysis failed.");
        }

        console.info("[workspace] analysis result", result.meta);
        setAnalysisMeta(responseMeta);
        applyManifest(result.manifest);
        void saveCachedWorkspace({
          analysisMeta: responseMeta,
          fileName: file.name,
          image: file,
          manifest: result.manifest,
          savedAt: Date.now(),
        });
      } catch (error) {
        console.error("[workspace] analysis failed", error);
        setAnalysisMeta({
          ...responseMeta,
          error:
            error instanceof Error ? error.message : "Image analysis failed.",
          model: responseMeta?.model ?? "unknown",
          source: responseMeta?.source ?? "ai",
        });
        releaseObjectUrl();
        setSourcePreviewUrl(null);
        setManifest(null);
        setSelectedElementId(undefined);
      } finally {
        setIsParsing(false);
      }
    };
    image.onerror = () => {
      releaseObjectUrl();
      setSourcePreviewUrl(null);
      setManifest(null);
      setSelectedElementId(undefined);
      setIsParsing(false);
    };
    image.src = objectUrl;
  }

  function resetUpload() {
    setManifest(null);
    setSelectedElementId(undefined);
    setFileName(null);
    setIsParsing(false);
    setSourcePreviewUrl(null);
    setAnalysisMeta(null);
    void clearCachedWorkspace();
    releaseObjectUrl();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function exportManifest() {
    if (!manifest) {
      return;
    }

    const bundle: WorkspaceBundle = {
      image: objectUrlRef.current
        ? {
            dataUrl: await blobToDataUrl(
              await fetch(objectUrlRef.current).then((response) => response.blob()),
            ),
            name: fileName ?? "source-image",
            type: "image/png",
          }
        : undefined,
      manifest,
      version: "workspace-bundle-1.0",
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName ?? "ui-workspace"}.workspace.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportAssetSheet() {
    const sheet = await buildCurrentAssetSheet();
    if (!sheet) {
      return;
    }

    const timestamp = Date.now();
    const baseName = stripFileExtension(fileName ?? "ui-assets");
    const pngBlob = await canvasToBlob(sheet.canvas, "image/png", 1);
    if (pngBlob) {
      downloadBlob(pngBlob, `${baseName}.asset-sheet-${timestamp}.png`);
    }

    downloadBlob(
      new Blob([JSON.stringify(toAssetPromptManifest(sheet.manifest), null, 2)], {
        type: "application/json",
      }),
      `${baseName}.asset-prompts-${timestamp}.json`,
    );
  }

  async function generateAssets() {
    const sourceImageUrl = objectUrlRef.current;
    const sheet = await buildCurrentAssetSheet();
    if (!sheet || !sourceImageUrl) {
      return;
    }

    const timestamp = Date.now();
    const baseName = stripFileExtension(fileName ?? "ui-assets");
    const requestId = `asset_run_${timestamp}`;
    const outputFilename = `${baseName}.transparent-assets-${timestamp}.png`;
    setGeneratedAssets((current) => [
      {
        createdAt: timestamp,
        filename: outputFilename,
        id: requestId,
        status: "generating",
      },
      ...current,
    ]);
    setIsGeneratingAssets(true);
    try {
      const originalBlob = await fetch(sourceImageUrl).then((response) =>
        response.blob(),
      );
      const originalImageUrl = URL.createObjectURL(originalBlob);
      const pngBlob = await canvasToBlob(sheet.canvas, "image/png", 1);
      if (!pngBlob) {
        throw new Error("Asset sheet generation failed.");
      }
      const localAssetSheetMeta: AssetSheetMeta = {
        filename: "asset-sheet.png",
        height: sheet.manifest.sheetSize.height,
        mimeType: pngBlob.type || "image/png",
        sha256: await sha256Hex(pngBlob),
        size: pngBlob.size,
        width: sheet.manifest.sheetSize.width,
      };
      const sourceSheetUrl = URL.createObjectURL(pngBlob);
      console.info("[workspace] asset sheet", {
        assetCount: sheet.manifest.assets.length,
        assetSheetPreviewUrl: sourceSheetUrl,
        sheetSize: sheet.manifest.sheetSize,
        sha256: localAssetSheetMeta.sha256,
        size: localAssetSheetMeta.size,
      });
      const aiAssetResult = await generateTransparentAssets({
        manifest: sheet.manifest,
        sheetBlob: pngBlob,
      });
      const assetFilenameById = createAssetFilenameMap(sheet.manifest.assets);
      const generatedSheetUrl =
        aiAssetResult.processedSheetDataUrl ??
        aiAssetResult.imageDataUrl ??
        aiAssetResult.imageUrl;
      const parts = aiAssetResult.parts.map((part) => {
        const blob = dataUrlToBlob(part.imageDataUrl);
        const url = URL.createObjectURL(blob);
        return {
          filename: createGeneratedPartFilename(part, assetFilenameById),
          assetName: part.assetName,
          id: part.id,
          imageDataUrl: part.imageDataUrl,
          prompt: part.prompt,
          semanticName: part.semanticName,
          source: part.source,
          verification: part.verification,
          url,
        };
      });
      const previewUrl =
        generatedSheetUrl
          ? generatedSheetUrl.startsWith("data:")
            ? URL.createObjectURL(dataUrlToBlob(generatedSheetUrl))
            : generatedSheetUrl
          : parts[0]?.url ?? sourceSheetUrl;
      const previewLabel = generatedSheetUrl
        ? `${outputFilename} · ai-chroma preview`
        : parts[0]
          ? `${parts[0].filename} · ${parts[0].source ?? "part"}`
          : `${outputFilename} · source sheet`;

      generatedAssetUrlsRef.current.push(originalImageUrl);
      generatedAssetUrlsRef.current.push(sourceSheetUrl);
      if (previewUrl !== sourceSheetUrl && previewUrl.startsWith("blob:")) {
        generatedAssetUrlsRef.current.push(previewUrl);
      }
      generatedAssetUrlsRef.current.push(...parts.map((part) => part.url));
      setGeneratedAssets((current) =>
        current.map((asset) =>
          asset.id === requestId
            ? {
                ...asset,
                assetSheet: aiAssetResult.assetSheet ?? localAssetSheetMeta,
                imageUrl: previewUrl,
                model: aiAssetResult.model,
                originalFilename: fileName ?? "source-image.png",
                originalImageUrl,
                parts,
                previewLabel,
                previewUrl,
                status: "ready",
              }
            : asset,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Asset generation failed.";
      setGeneratedAssets((current) =>
        current.map((asset) =>
          asset.id === requestId
            ? {
                ...asset,
                error: message,
                status: "failed",
              }
            : asset,
        ),
      );
      setAnalysisMeta({
        ...analysisMeta,
        error: message,
        model: analysisMeta?.model ?? "asset-generator",
        source: analysisMeta?.source ?? "ai",
      });
    } finally {
      setIsGeneratingAssets(false);
    }
  }

  async function buildCurrentAssetSheet() {
    if (!manifest || !objectUrlRef.current) {
      return null;
    }

    const assetElements = manifest.elements.filter((element) =>
      ["asset", "crop", "regenerate"].includes(element.strategy),
    );
    if (assetElements.length === 0) {
      return null;
    }

    const image = await loadImage(objectUrlRef.current);
    return createAssetSheet({
      elements: assetElements,
      image,
      sourceFileName: fileName ?? "source-image",
    });
  }

  async function importManifestFile(file: File) {
    try {
      const imported = parseWorkspaceImport(JSON.parse(await readFileText(file)));
      applyManifest(imported.manifest);
      setFileName(imported.image?.name ?? file.name);
      if (imported.image) {
        releaseObjectUrl();
        const imageBlob = dataUrlToBlob(imported.image.dataUrl);
        const objectUrl = URL.createObjectURL(imageBlob);
        objectUrlRef.current = objectUrl;
        setSourcePreviewUrl(objectUrl);
      } else {
        releaseObjectUrl();
        setSourcePreviewUrl(null);
      }
      setAnalysisMeta({
        elementCount: imported.manifest.elements.length,
        imageSize: {
          height: imported.manifest.sourceImage.height,
          width: imported.manifest.sourceImage.width,
        },
        model: "imported",
        outOfBoundsCount: 0,
        source: "mock",
        sourceImageSize: {
          height: imported.manifest.sourceImage.height,
          width: imported.manifest.sourceImage.width,
        },
        warnings: [],
      });
      if (imported.image) {
        void saveCachedWorkspace({
          analysisMeta: null,
          fileName: imported.image.name,
          image: dataUrlToBlob(imported.image.dataUrl),
          manifest: imported.manifest,
          savedAt: Date.now(),
        });
      } else {
        void updateCachedManifest(imported.manifest);
      }
    } catch (error) {
      setAnalysisMeta({
        error:
          error instanceof Error ? error.message : "Manifest import failed.",
        model: "imported",
        source: "mock",
      });
    }
  }

  function updateElement(elementId: string, patch: Partial<UIElement>) {
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const nextManifest = {
        ...current,
        elements: current.elements.map((element) =>
          element.id === elementId ? { ...element, ...patch } : element,
        ),
      };
      void updateCachedManifest(nextManifest);
      return nextManifest;
    });
  }

  function addElement(bbox: UIElement["bbox"]) {
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const existingIds = new Set(current.elements.map((element) => element.id));
      let index = current.elements.length + 1;
      let id = `manual_annotation_${index}`;
      while (existingIds.has(id)) {
        index += 1;
        id = `manual_annotation_${index}`;
      }

      const nextElement: UIElement = {
        bbox,
        confidence: 1,
        id,
        needsReview: true,
        reason: "手动新增素材标注，请补充处理提示词。",
        strategy: "asset",
        type: "decoration",
      };
      const nextManifest = {
        ...current,
        elements: [...current.elements, nextElement],
      };
      setSelectedElementId(id);
      void updateCachedManifest(nextManifest);
      return nextManifest;
    });
  }

  function deleteElement(elementId: string) {
    setLayerContextMenu(null);
    setManifest((current) => {
      if (!current) {
        return current;
      }

      const nextElements = current.elements.filter(
        (element) => element.id !== elementId,
      );
      const deletedIndex = current.elements.findIndex(
        (element) => element.id === elementId,
      );
      const nextManifest = {
        ...current,
        elements: nextElements,
      };
      const fallbackElement =
        nextElements[Math.min(deletedIndex, nextElements.length - 1)];
      setSelectedElementId(fallbackElement?.id);
      void updateCachedManifest(nextManifest);
      return nextManifest;
    });
  }

  function openLayerContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    elementId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedElementId(elementId);
    setLayerContextMenu({
      elementId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function selectNextReviewElement() {
    const reviewElements = elements.filter((element) => element.needsReview);
    if (reviewElements.length === 0) {
      return;
    }

    const currentIndex = reviewElements.findIndex(
      (element) => element.id === selectedElementId,
    );
    const nextElement =
      reviewElements[(currentIndex + 1) % reviewElements.length];
    setSelectedElementId(nextElement.id);
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#fafafa] text-[#18181b]">
      <header className="flex h-11 shrink-0 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-[13px] font-semibold tracking-tight">
            AiClip
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            aria-label="Language"
            className="flex h-7 items-center rounded bg-[#f4f4f5] p-0.5"
          >
            <button
              className={[
                "h-6 rounded px-2 text-[11px] transition",
                locale === "zh"
                  ? "bg-white text-[#18181b]"
                  : "text-[#71717a] hover:text-[#18181b]",
              ].join(" ")}
              onClick={() => setLocale("zh")}
              type="button"
            >
              中文
            </button>
            <button
              className={[
                "h-6 rounded px-2 text-[11px] transition",
                locale === "en"
                  ? "bg-white text-[#18181b]"
                  : "text-[#71717a] hover:text-[#18181b]",
              ].join(" ")}
              onClick={() => setLocale("en")}
              type="button"
            >
              EN
            </button>
          </div>
          {analysisMeta ? (
            <StatusPill active={analysisMeta.source === "ai"}>
              {analysisMeta.source === "ai" ? "AI" : t.mock}
            </StatusPill>
          ) : null}
          <button
            className="h-7 rounded px-2.5 text-[12px] text-[#3f3f46] transition hover:bg-[#e4e4e7]"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            {t.import}
          </button>
          <button
            className="h-7 rounded px-2.5 text-[12px] text-[#3f3f46] transition hover:bg-[#e4e4e7] disabled:text-[#a1a1aa]"
            disabled={!manifest}
            onClick={exportManifest}
            type="button"
          >
            {t.export}
          </button>
        </div>
        <input
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              parseUploadedFile(file);
            }
          }}
          ref={inputRef}
          type="file"
        />
        <input
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importManifestFile(file);
            }
            event.currentTarget.value = "";
          }}
          ref={importInputRef}
          type="file"
        />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px] gap-2 px-3 pb-2">
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-lg bg-white lg:flex">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-2">
            <PanelHeader
              action={
                <span className="text-[11px] text-[#71717a]">
                  {filteredElements.length}/{elements.length}
                </span>
              }
              subtitle={t.detectedElements}
              title={t.layers}
            />
            <div className="mb-2 flex flex-wrap gap-1 px-3">
              {confidenceFilters.map((filter) => (
                <button
                  className={[
                    "h-6 rounded px-2 text-[11px] transition",
                    confidenceFilter === filter
                      ? "bg-[#18181b] text-white"
                      : "bg-[#f4f4f5] text-[#52525b] hover:bg-[#eeeeef]",
                  ].join(" ")}
                  key={filter ?? "all"}
                  onClick={() => setConfidenceFilter(filter)}
                  type="button"
                >
                  {filter === null
                    ? t.confidenceAll
                    : `<${Math.round(filter * 100)}%`}
                </button>
              ))}
            </div>
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
              {filteredElements.length === 0 ? (
                <div className="px-2 py-3 text-[12px] text-[#71717a]">
                  {t.noLayers}
                </div>
              ) : null}
              <div className="grid content-start gap-0.5">
                {filteredElements.map((element) => (
                  <div
                    className={[
                      "rounded-md transition",
                      selectedElementId === element.id
                        ? "bg-[#f4f4f5] text-[#18181b]"
                        : "text-[#3f3f46] hover:bg-[#f4f4f5]",
                    ].join(" ")}
                    key={element.id}
                    onContextMenu={(event) =>
                      openLayerContextMenu(event, element.id)
                    }
                  >
                    <button
                      className="grid w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_auto_auto] items-center gap-2 px-2 py-1.5 text-left text-[12px]"
                      onClick={() => setSelectedElementId(element.id)}
                      onContextMenu={(event) =>
                        openLayerContextMenu(event, element.id)
                      }
                      type="button"
                    >
                      <span
                        className={[
                          "h-2 w-2 rounded-full",
                          getConfidenceDotClass(element.confidence),
                        ].join(" ")}
                      />
                      <span className="min-w-0 truncate">{element.id}</span>
                      <span className="text-[10px] text-[#71717a]">
                        {formatStrategyLabel(element.strategy, locale)}
                      </span>
                      <span className="text-[10px] text-[#a1a1aa]">
                        {t.rightClick}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>
        {layerContextMenu ? (
          <div
            className="fixed z-50 w-36 overflow-hidden rounded-md bg-white py-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)] ring-1 ring-black/10"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            ref={contextMenuRef}
            style={{
              left: layerContextMenu.x,
              top: layerContextMenu.y,
            }}
          >
            <button
              aria-label={`${t.deleteElement} ${layerContextMenu.elementId}`}
              className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-[12px] text-[#3f3f46] transition hover:bg-[#f4f4f5] hover:text-[#18181b]"
              onClick={() => deleteElement(layerContextMenu.elementId)}
              type="button"
            >
              <CloseIcon />
              <span>{t.deleteElement}</span>
            </button>
          </div>
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-white">
          <div className="flex h-10 shrink-0 items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-[13px] font-medium">{t.canvas}</h2>
              <span className="text-[11px] text-[#71717a]">
                {manifest ? `${elements.length} ${t.elements}` : t.sourceDropHint}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className="h-7 rounded px-2.5 text-[12px] text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                disabled={!manifest}
                onClick={resetUpload}
                type="button"
              >
                {t.clear}
              </button>
              <button
                className="h-7 rounded bg-[#18181b] px-2.5 text-[12px] font-medium text-white transition hover:bg-black disabled:bg-[#d4d4d8]"
                disabled={!manifest}
                onClick={() => {
                  /* The UI generation action is intentionally local-only for now. */
                }}
                type="button"
              >
                {t.generateUi}
              </button>
              <button
                className="h-7 rounded px-2.5 text-[12px] text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                disabled={
                  !manifest ||
                  !sourcePreviewUrl ||
                  !elements.some((element) =>
                    ["asset", "crop", "regenerate"].includes(element.strategy),
                  )
                }
                onClick={exportAssetSheet}
                type="button"
              >
                {t.exportAssetSheet}
              </button>
              <button
                className="h-7 rounded px-2.5 text-[12px] text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                disabled={
                  isGeneratingAssets ||
                  !manifest ||
                  !sourcePreviewUrl ||
                  !elements.some((element) =>
                    ["asset", "crop", "regenerate"].includes(element.strategy),
                  )
                }
                onClick={generateAssets}
                type="button"
              >
                {isGeneratingAssets ? t.parsing : t.generateAssets}
              </button>
            </div>
          </div>
          <Canvas
            canvasMode={canvasMode}
            isParsing={isParsing}
            manifest={manifest}
            onAddElement={addElement}
            onToggleCanvasMode={() =>
              setCanvasMode((mode) =>
                mode === "compare" ? "annotated" : "compare",
              )
            }
            onUploadClick={() => inputRef.current?.click()}
            onOpenElementContextMenu={openLayerContextMenu}
            onSelectElement={setSelectedElementId}
            onUpdateElement={updateElement}
            onUseSample={() => parseImage()}
            selectedElementId={selectedElementId}
            sourcePreviewUrl={sourcePreviewUrl}
            statusText={
              analysisMeta?.error
                ? analysisMeta.error
                : isParsing
                ? t.parsing
                : manifest
                  ? fileName ?? t.uploadedImage
                  : t.pleaseUploadImage
            }
            t={t}
          />
          <GeneratedAssetsPanel assets={generatedAssets} t={t} />
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-white">
          <PanelHeader
            action={
              <button
                className="h-7 rounded px-2 text-[12px] text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#a1a1aa]"
                disabled={!manifest || reviewCount === 0}
                onClick={selectNextReviewElement}
                type="button"
              >
                {t.reviewNext}
              </button>
            }
            subtitle={t.selectionAndStrategy}
            title={t.inspector}
          />
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {selectedElement ? (
              <Properties
                element={selectedElement}
                locale={locale}
                onDelete={() => deleteElement(selectedElement.id)}
                onUpdate={(patch) => updateElement(selectedElement.id, patch)}
                t={t}
              />
            ) : (
              <div className="rounded-md bg-[#f4f4f5] p-4 text-[12px] text-[#71717a]">
                {t.selectElementHelp}
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between px-4 text-[11px] text-[#71717a]">
        <span>{manifest ? t.footerLoaded : t.notUploaded}</span>
        <span>
          {manifest
            ? `${elements.length} ${t.elements} · ${reviewCount} ${t.review} · ${approvedCount} ok`
            : t.waitingForUpload}
        </span>
      </footer>
    </main>
  );
}

function AnalysisDebug({
  meta,
  t,
}: {
  meta: AnalysisMeta | null;
  t: (typeof copy)[Locale];
}) {
  if (!meta) {
    return null;
  }

  const imageSize = meta.imageSize
    ? `${meta.imageSize.width}x${meta.imageSize.height}`
    : "unknown";
  const sourceImageSize = meta.sourceImageSize
    ? `${meta.sourceImageSize.width}x${meta.sourceImageSize.height}`
    : imageSize;
  const warnings = meta.warnings?.filter(Boolean) ?? [];
  const model = meta.model === "local mock" ? t.localMock : meta.model;

  return (
    <div className="mt-3 rounded-md bg-[#fafafa] px-2.5 py-2 text-[11px] text-[#52525b]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[#18181b]">{t.analysis}</span>
        <span>{meta.source === "mock" ? t.mock : meta.source}</span>
      </div>
      <div className="mt-2 grid gap-1">
        <Info label={t.model} value={model} />
        <Info label={t.image} value={imageSize} />
        <Info label={t.sourceImage} value={sourceImageSize} />
        <Info label={t.bboxOutside} value={String(meta.outOfBoundsCount ?? 0)} />
      </div>
      {meta.error ? (
        <div className="mt-2 rounded bg-white px-2 py-1.5 text-[#a11]">
          {meta.error}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {warnings.map((warning) => (
            <div className="rounded bg-white px-2 py-1.5" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GeneratedAssetsPanel({
  assets,
  t,
}: {
  assets: GeneratedAssetItem[];
  t: (typeof copy)[Locale];
}) {
  const [preview, setPreview] = useState<AssetPreview | null>(null);

  useEffect(() => {
    if (!preview) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  return (
    <section className="shrink-0 border-t border-[#f4f4f5] px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-[#18181b]">{t.assetList}</h3>
        <span className="text-[11px] text-[#71717a]">{assets.length}</span>
      </div>
      {assets.length === 0 ? (
        <div className="rounded-md bg-[#fafafa] px-3 py-2 text-[12px] text-[#71717a]">
          {t.assetListEmpty}
        </div>
      ) : (
        <div className="grid max-h-44 gap-2 overflow-auto">
          {assets.map((asset) => (
            <div
              className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-[#fafafa] p-2 ring-1 ring-black/5"
              key={asset.id}
            >
              <button
                aria-label={
                  asset.imageUrl
                    ? `${t.previewAsset} ${asset.filename}`
                    : undefined
                }
                className="grid h-14 w-[72px] place-items-center overflow-hidden rounded bg-white transition hover:ring-2 hover:ring-[#18181b]/15 disabled:cursor-default disabled:hover:ring-0"
                disabled={!asset.imageUrl}
                onClick={() =>
                  asset.imageUrl
                    ? setPreview({
                        label: asset.previewLabel ?? asset.filename,
                        url: asset.imageUrl,
                      })
                    : undefined
                }
                type="button"
              >
                {asset.imageUrl ? (
                  <img
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    src={asset.imageUrl}
                  />
                ) : (
                  <span className="text-[11px] text-[#a1a1aa]">
                    {asset.status === "generating" ? t.parsing : "failed"}
                  </span>
                )}
              </button>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-[#18181b]">
                  {asset.filename}
                </div>
                <div className="mt-1 truncate text-[11px] text-[#71717a]">
                  {new Date(asset.createdAt).toLocaleTimeString()} ·{" "}
                  {asset.model ?? asset.status}
                </div>
                {asset.assetSheet ? (
                  <div
                    className="mt-1 truncate text-[10px] text-[#71717a]"
                    title={`sha256:${asset.assetSheet.sha256}`}
                  >
                    preview sha256:{asset.assetSheet.sha256.slice(0, 12)} ·{" "}
                    {asset.assetSheet.size} bytes
                  </div>
                ) : null}
                {asset.error ? (
                  <div className="mt-1 line-clamp-2 text-[11px] text-[#dc2626]">
                    {asset.error}
                  </div>
                ) : null}
                {asset.parts && asset.parts.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {asset.parts.map((part) => (
                      <span className="inline-flex overflow-hidden rounded bg-white text-[10px] text-[#3f3f46] ring-1 ring-black/5" key={part.id}>
                        <button
                          className="px-1.5 py-1 hover:bg-[#eeeeef]"
                          onClick={() =>
                            setPreview({
                              label: `${part.filename} · ${part.source ?? "part"} · final`,
                              url: part.url,
                            })
                          }
                          type="button"
                        >
                          {part.id}
                          {part.source ? ` · ${part.source}` : ""}
                          {part.semanticName ? ` · ${part.semanticName}` : ""}
                          {part.verification
                            ? ` · ${Math.round(part.verification.score * 100)}`
                            : ""}
                          {part.verification?.needsReview ? " · review" : ""}
                        </button>
                        {part.verification?.overlayDataUrl ? (
                          <button
                            className="border-l border-black/5 px-1.5 py-1 text-[#71717a] hover:bg-[#eeeeef]"
                            onClick={() =>
                              setPreview({
                                label: `${part.filename} verification`,
                                url: part.verification?.overlayDataUrl ?? part.url,
                              })
                            }
                            title="verification overlay"
                            type="button"
                          >
                            diff
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                className="h-7 rounded px-2 text-[12px] text-[#3f3f46] transition hover:bg-[#eeeeef] disabled:text-[#a1a1aa]"
                disabled={
                  asset.status !== "ready" ||
                  (!asset.imageUrl && (!asset.parts || asset.parts.length === 0))
                }
                onClick={() => downloadGeneratedAssetPackage(asset)}
                type="button"
              >
                下载
              </button>
            </div>
          ))}
        </div>
      )}
      {preview ? (
        <AssetPreviewDialog
          onClose={() => setPreview(null)}
          preview={preview}
          t={t}
        />
      ) : null}
    </section>
  );
}

function AssetPreviewDialog({
  onClose,
  preview,
  t,
}: {
  onClose: () => void;
  preview: AssetPreview;
  t: (typeof copy)[Locale];
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-[#111111] shadow-[0_24px_72px_rgba(0,0,0,0.36)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/10 px-3">
          <div className="min-w-0 truncate text-[13px] font-medium text-white">
            {preview.label}
          </div>
          <button
            aria-label={t.closePreview}
            className="grid h-8 w-8 place-items-center rounded text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center bg-[linear-gradient(45deg,rgba(255,255,255,0.08)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.08)_75%,transparent_75%)] bg-[length:18px_18px] p-4">
          <img
            alt=""
            className="max-h-[78vh] max-w-full object-contain"
            src={preview.url}
          />
        </div>
      </div>
    </div>
  );
}

function Canvas({
  canvasMode,
  isParsing,
  manifest,
  onAddElement,
  onToggleCanvasMode,
  onUploadClick,
  onOpenElementContextMenu,
  onSelectElement,
  onUpdateElement,
  onUseSample,
  selectedElementId,
  sourcePreviewUrl,
  statusText,
  t,
}: {
  canvasMode: CanvasMode;
  isParsing: boolean;
  manifest: UIManifest | null;
  onAddElement: (bbox: UIElement["bbox"]) => void;
  onToggleCanvasMode: () => void;
  onUploadClick: () => void;
  onOpenElementContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    elementId: string,
  ) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateElement: (elementId: string, patch: Partial<UIElement>) => void;
  onUseSample: () => void;
  selectedElementId?: string;
  sourcePreviewUrl: string | null;
  statusText: string;
  t: (typeof copy)[Locale];
}) {
  const { width, height } = manifest?.sourceImage ?? { width: 390, height: 844 };
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [draftBBox, setDraftBBox] = useState<DraftBBox | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomPercent = Math.round(zoom * 100);
  const canZoomOut = zoom > 0.5;
  const canZoomIn = zoom < 2;

  function adjustZoom(delta: number) {
    setZoom((current) => clamp(roundBBoxValue(current + delta), 0.5, 2));
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    adjustZoom(direction * 0.1);
  }

  function createPointerBBox(
    event: globalThis.PointerEvent | ReactPointerEvent<HTMLElement>,
    frame: Element,
  ) {
    const rect = frame.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * width, 0, width),
      y: clamp(((event.clientY - rect.top) / rect.height) * height, 0, height),
    };
  }

  function startAddAnnotation(event: ReactPointerEvent<HTMLElement>) {
    if (!isAddingAnnotation || canvasMode === "compare") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const frame = event.currentTarget;
    frame.setPointerCapture?.(event.pointerId);
    const start = createPointerBBox(event, frame);
    setDraftBBox({ height: 0, width: 0, x: start.x, y: start.y });

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const current = createPointerBBox(moveEvent, frame);
      setDraftBBox(normalizeDraftBBox(start.x, start.y, current.x, current.y));
    };

    const stopAdd = (upEvent: globalThis.PointerEvent) => {
      const current = createPointerBBox(upEvent, frame);
      const nextDraft = normalizeDraftBBox(start.x, start.y, current.x, current.y);
      frame.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopAdd);
      window.removeEventListener("pointercancel", stopAdd);
      setDraftBBox(null);

      if (nextDraft.width < 6 || nextDraft.height < 6) {
        return;
      }

      onAddElement([
        roundBBoxValue(nextDraft.x),
        roundBBoxValue(nextDraft.y),
        roundBBoxValue(nextDraft.width),
        roundBBoxValue(nextDraft.height),
      ]);
      setIsAddingAnnotation(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopAdd);
    window.addEventListener("pointercancel", stopAdd);
  }

  if (!manifest) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 pb-6 text-center">
        <div className="w-full max-w-[360px]">
          <div className="text-[15px] font-medium text-[#18181b]">
            {statusText}
          </div>
          <div className="mt-1.5 text-[12px] text-[#71717a]">
            {isParsing ? t.parsingDetail : t.canvasEmptyHelp}
          </div>
          {isParsing ? (
            <IndeterminateProgress className="mx-auto mt-5 h-2 w-full max-w-[300px]" />
          ) : (
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                className="h-8 rounded bg-[#18181b] px-3 text-[12px] font-medium text-white transition hover:bg-black"
                onClick={onUploadClick}
                type="button"
              >
                {t.uploadImage}
              </button>
              <button
                className="h-8 rounded bg-[#f4f4f5] px-3 text-[12px] font-medium text-[#3f3f46] transition hover:bg-[#eeeeef]"
                onClick={onUseSample}
                type="button"
              >
                {t.useSample}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const sourceFrame = (
    <CanvasFrame height={height} width={width} zoom={zoom}>
      <CanvasImage sourcePreviewUrl={sourcePreviewUrl} />
    </CanvasFrame>
  );
  const annotatedFrame = (
    <CanvasFrame
      adding={isAddingAnnotation && canvasMode !== "compare"}
      height={height}
      onPointerDownCapture={startAddAnnotation}
      width={width}
      zoom={zoom}
    >
      <CanvasImage sourcePreviewUrl={sourcePreviewUrl} />
      {manifest.elements.map((element) => (
        <ElementBox
          element={element}
          height={height}
          key={element.id}
          onOpenContextMenu={onOpenElementContextMenu}
          onSelectElement={onSelectElement}
          onUpdateElement={onUpdateElement}
          selected={selectedElementId === element.id}
          t={t}
          width={width}
        />
      ))}
      {draftBBox ? (
        <DraftElementBox draft={draftBBox} height={height} width={width} />
      ) : null}
    </CanvasFrame>
  );

  return (
    <div
      className="relative grid min-h-0 flex-1 place-items-center overflow-auto rounded-md bg-[#fbfbfc] px-6 pb-6"
      onWheel={handleWheel}
    >
      {isParsing ? (
        <div className="absolute inset-x-4 top-0 z-20">
          <IndeterminateProgress className="h-1" />
        </div>
      ) : null}
      <div className="sticky left-3 top-3 z-30 flex h-8 items-center gap-1 justify-self-start">
        <div className="pointer-events-none rounded bg-white/90 px-2 py-1 text-[11px] text-[#71717a]">
          {manifest.elements.length} {t.elements}
        </div>
        {canvasMode === "compare" ? null : (
          <button
            aria-label={t.addAnnotation}
            className={[
              "grid h-8 w-8 place-items-center rounded-md shadow-sm ring-1 ring-black/10 transition",
              isAddingAnnotation
                ? "bg-[#18181b] text-white"
                : "bg-white text-[#3f3f46] hover:bg-[#f4f4f5]",
            ].join(" ")}
            onClick={() => setIsAddingAnnotation((current) => !current)}
            title={t.addAnnotation}
            type="button"
          >
            <PlusIcon />
          </button>
        )}
      </div>
      <div
        className={[
          "group sticky right-3 top-3 z-30 -mt-7 mb-2 flex h-8 items-center overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10 justify-self-end",
          canvasMode === "compare" ? "w-14 transition-all hover:w-28 focus-within:w-28" : "",
        ].join(" ")}
      >
        <button
          aria-label={t.zoomOut}
          className={[
            "grid h-8 w-8 shrink-0 place-items-center text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#d4d4d8]",
            canvasMode === "compare"
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "",
          ].join(" ")}
          disabled={!canZoomOut}
          onClick={() => adjustZoom(-0.1)}
          title={t.zoomOut}
          type="button"
        >
          <MinusIcon />
        </button>
        <button
          aria-label={t.zoomReset}
          className={[
            "h-8 min-w-12 shrink-0 border-x border-[#eeeeef] px-2 text-[11px] font-medium text-[#3f3f46] transition hover:bg-[#f4f4f5]",
            canvasMode === "compare" ? "order-first border-x-0" : "",
          ].join(" ")}
          onClick={() => setZoom(1)}
          title={t.zoomReset}
          type="button"
        >
          {zoomPercent}%
        </button>
        <button
          aria-label={t.zoomIn}
          className={[
            "grid h-8 w-8 shrink-0 place-items-center text-[#3f3f46] transition hover:bg-[#f4f4f5] disabled:text-[#d4d4d8]",
            canvasMode === "compare"
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "",
          ].join(" ")}
          disabled={!canZoomIn}
          onClick={() => adjustZoom(0.1)}
          title={t.zoomIn}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>
      {canvasMode === "compare" ? (
        <div
          className="grid w-full grid-cols-2 items-center gap-4"
          style={{ maxWidth: `${860 * zoom}px` }}
        >
          <div className="grid justify-items-center gap-2">
            <span className="text-[11px] text-[#71717a]">{t.source}</span>
            {sourceFrame}
          </div>
          <div className="grid justify-items-center gap-2">
            <span className="text-[11px] text-[#71717a]">{t.layers}</span>
            {annotatedFrame}
          </div>
        </div>
      ) : (
        annotatedFrame
      )}
      <button
        aria-label={canvasMode === "compare" ? t.image : t.compare}
        className="sticky bottom-10 right-4 z-30 grid h-9 w-9 place-items-center rounded-md bg-[#18181b] text-white shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition hover:bg-black justify-self-end"
        onClick={onToggleCanvasMode}
        title={canvasMode === "compare" ? t.image : t.compare}
        type="button"
      >
        {canvasMode === "compare" ? <ImageModeIcon /> : <CompareModeIcon />}
      </button>
      {canvasMode === "compare" ? null : (
        <div className="pointer-events-none sticky bottom-3 right-4 z-20 justify-self-end text-[11px] text-[#71717a]">
          {t.deleteHint}
        </div>
      )}
    </div>
  );
}

function CompareModeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M12 4v16" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7.5 8.5h2M14.5 8.5h2M7.5 12h2M14.5 12h2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ImageModeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m7.5 16 3.1-3.1a1.4 1.4 0 0 1 2 0l.8.8 1.1-1.1a1.4 1.4 0 0 1 2 0L19 15.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15.5 8.5h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="m6.5 6.5 11 11M17.5 6.5l-11 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M6.5 12h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 6.5v11M6.5 12h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CanvasFrame({
  adding = false,
  children,
  height,
  onPointerDownCapture,
  width,
  zoom,
}: {
  adding?: boolean;
  children: React.ReactNode;
  height: number;
  onPointerDownCapture?: (event: ReactPointerEvent<HTMLElement>) => void;
  width: number;
  zoom: number;
}) {
  return (
    <div
      className={[
        "relative w-full rounded-[24px]",
        adding ? "cursor-crosshair" : "",
      ].join(" ")}
      data-canvas-frame="true"
      onPointerDownCapture={onPointerDownCapture}
      style={{
        aspectRatio: `${width} / ${height}`,
        maxWidth: `${390 * zoom}px`,
      }}
    >
      {children}
    </div>
  );
}

function DraftElementBox({
  draft,
  height,
  width,
}: {
  draft: DraftBBox;
  height: number;
  width: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-[6px] border border-[#0f172a] bg-emerald-400/[0.18] shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_3px_rgba(15,23,42,0.16)]"
      style={{
        height: `${(draft.height / height) * 100}%`,
        left: `${(draft.x / width) * 100}%`,
        top: `${(draft.y / height) * 100}%`,
        width: `${(draft.width / width) * 100}%`,
      }}
    />
  );
}

function CanvasImage({ sourcePreviewUrl }: { sourcePreviewUrl: string | null }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[22px]">
      {sourcePreviewUrl ? (
        <img
          alt=""
          className="h-full w-full object-contain"
          src={sourcePreviewUrl}
        />
      ) : (
        <MockPhoneUi />
      )}
    </div>
  );
}

function ElementBox({
  element,
  height,
  onOpenContextMenu,
  onSelectElement,
  onUpdateElement,
  selected,
  t,
  width,
}: {
  element: UIElement;
  height: number;
  onOpenContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    elementId: string,
  ) => void;
  onSelectElement: (elementId: string) => void;
  onUpdateElement: (elementId: string, patch: Partial<UIElement>) => void;
  selected: boolean;
  t: (typeof copy)[Locale];
  width: number;
}) {
  const [x, y, boxWidth, boxHeight] = element.bbox;
  const minSize = 8;

  function startDrag(event: ReactPointerEvent<HTMLElement>, action: DragAction) {
    event.preventDefault();
    event.stopPropagation();
    onSelectElement(element.id);

    const target = event.currentTarget;
    const frame = target.closest("[data-canvas-frame]");
    const frameRect = frame?.getBoundingClientRect();
    if (!frameRect) {
      return;
    }

    target.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const deltaX = ((moveEvent.clientX - action.pointerX) / frameRect.width) * width;
      const deltaY =
        ((moveEvent.clientY - action.pointerY) / frameRect.height) * height;

      if (action.kind === "move") {
        onUpdateElement(element.id, {
          bbox: [
            clamp(action.element.bbox[0] + deltaX, 0, width - action.element.bbox[2]),
            clamp(action.element.bbox[1] + deltaY, 0, height - action.element.bbox[3]),
            action.element.bbox[2],
            action.element.bbox[3],
          ],
        });
        return;
      }

      onUpdateElement(element.id, {
        bbox: resizeBBox(action.element.bbox, action.handle, deltaX, deltaY, {
          height,
          minSize,
          width,
        }),
      });
    };

    const stopDrag = () => {
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }

  return (
    <button
      aria-label={`${t.selectElement} ${element.id}`}
      className={[
        "group absolute z-10 cursor-move rounded-[6px] border transition-colors focus:outline-none",
        selected
          ? "border-[#0f172a] bg-emerald-400/[0.18] shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_0_0_3px_rgba(15,23,42,0.16)]"
          : "border-[#0f172a]/45 bg-emerald-400/[0.18] shadow-[0_0_0_1px_rgba(255,255,255,0.7)] hover:bg-emerald-400/[0.18]",
      ].join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        onSelectElement(element.id);
      }}
      onContextMenu={(event) => onOpenContextMenu(event, element.id)}
      onPointerDown={(event) =>
        startDrag(event, {
          element,
          kind: "move",
          pointerX: event.clientX,
          pointerY: event.clientY,
        })
      }
      style={{
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        width: `${(boxWidth / width) * 100}%`,
        height: `${(boxHeight / height) * 100}%`,
      }}
      type="button"
    >
      <span
        className={[
          "pointer-events-none absolute inset-0 rounded-[5px]",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      >
        <span className="absolute inset-0 rounded-[5px] bg-white/[0.015]" />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#0f172a]/10" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#0f172a]/10" />
      </span>
      {selected
        ? (["nw", "ne", "sw", "se"] as const).map((handle) => (
            <span
              aria-hidden="true"
              className={[
                "absolute z-20 h-2.5 w-2.5 rounded-[3px] border border-[#18181b] bg-white shadow-sm",
                getHandleClass(handle),
              ].join(" ")}
              key={handle}
              onPointerDown={(event) =>
                startDrag(event, {
                  element,
                  handle,
                  kind: "resize",
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                })
              }
            />
          ))
        : null}
    </button>
  );
}

function getHandleClass(handle: ResizeHandle) {
  const classes: Record<ResizeHandle, string> = {
    ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
    nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
    se: "-bottom-1.5 -right-1.5 cursor-nwse-resize",
    sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  };

  return classes[handle];
}

function resizeBBox(
  bbox: UIElement["bbox"],
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  bounds: { height: number; minSize: number; width: number },
): UIElement["bbox"] {
  let [x, y, boxWidth, boxHeight] = bbox;
  let left = x;
  let top = y;
  let right = x + boxWidth;
  let bottom = y + boxHeight;

  if (handle.includes("n")) {
    top = clamp(top + deltaY, 0, bottom - bounds.minSize);
  }
  if (handle.includes("s")) {
    bottom = clamp(bottom + deltaY, top + bounds.minSize, bounds.height);
  }
  if (handle.includes("w")) {
    left = clamp(left + deltaX, 0, right - bounds.minSize);
  }
  if (handle.includes("e")) {
    right = clamp(right + deltaX, left + bounds.minSize, bounds.width);
  }

  x = left;
  y = top;
  boxWidth = right - left;
  boxHeight = bottom - top;

  return [
    roundBBoxValue(x),
    roundBBoxValue(y),
    roundBBoxValue(boxWidth),
    roundBBoxValue(boxHeight),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundBBoxValue(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeDraftBBox(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): DraftBBox {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);

  return {
    height: Math.abs(endY - startY),
    width: Math.abs(endX - startX),
    x,
    y,
  };
}

function isEditableTarget(target: EventTarget) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function releaseRegionPreviewUrls(urls: string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

function Properties({
  element,
  locale,
  onDelete,
  onUpdate,
  t,
}: {
  element: UIElement;
  locale: Locale;
  onDelete: () => void;
  onUpdate: (patch: Partial<UIElement>) => void;
  t: (typeof copy)[Locale];
}) {
  const reasonValue =
    locale === "zh"
      ? element.reason || strategyReasonExampleZh[element.strategy]
      : element.reason;
  const reviewPromptMissing =
    element.needsReview && !(element.prompt && element.prompt.trim());

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-[#f4f4f5] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[#18181b]">
              {element.id}
            </div>
            <div className="mt-1 text-[11px] text-[#71717a]">
              bbox [{element.bbox.join(", ")}]
            </div>
            <div className="mt-1 text-[11px] text-[#71717a]">
              {t.exportAssetSheet}
            </div>
            {element.groupId ? (
              <div className="mt-1 text-[11px] text-[#71717a]">
                group {element.groupId}
              </div>
            ) : null}
            {element.parentId || element.repeatGroup ? (
              <div className="mt-1 text-[11px] text-[#71717a]">
                {element.parentId ? `parent ${element.parentId}` : null}
                {element.parentId && element.repeatGroup ? " · " : null}
                {element.repeatGroup ? `repeat ${element.repeatGroup}` : null}
              </div>
            ) : null}
            {element.state ? (
              <div className="mt-1 text-[11px] text-[#71717a]">
                state {formatElementState(element.state)}
              </div>
            ) : null}
          </div>
          <span
            className={[
              "rounded px-1.5 py-0.5 text-[11px]",
              element.needsReview
                ? "bg-[#e4e4e7] text-[#3f3f46]"
                : "bg-[#18181b] text-white",
            ].join(" ")}
          >
            {element.needsReview ? t.review : "ok"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#71717a]">
          <Info
            label={t.confidence}
            value={`${Math.round(element.confidence * 100)}%`}
          />
        </div>
      </div>

      <Field label={t.editBbox}>
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map((axis, index) => (
            <label className="grid gap-1" key={axis}>
              <span className="text-[10px] uppercase text-[#71717a]">
                {axis}
              </span>
              <input
                className="h-8 w-full rounded bg-[#f4f4f5] px-2 text-[12px] text-[#18181b] outline-none focus:bg-[#eeeeef]"
                min={index < 2 ? 0 : 1}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }

                  const nextBbox = [...element.bbox] as UIElement["bbox"];
                  nextBbox[index] = nextValue;
                  onUpdate({ bbox: nextBbox });
                }}
                step="1"
                type="number"
                value={Math.round(element.bbox[index])}
              />
            </label>
          ))}
        </div>
      </Field>

      <div className="rounded-md bg-[#f4f4f5] px-3 py-2 text-[12px] text-[#3f3f46]">
        {t.exportAssetSheet}
      </div>

      <Field label={t.assetPipeline}>
        <select
          className="h-8 w-full rounded bg-[#f4f4f5] px-2 text-[12px] text-[#18181b] outline-none focus:bg-[#eeeeef]"
          onChange={(event) =>
            onUpdate({ assetPipeline: event.target.value as AssetPipeline })
          }
          value={element.assetPipeline ?? "ai-chroma"}
        >
          {assetPipelineOptions.map((pipeline) => (
            <option key={pipeline} value={pipeline}>
              {formatAssetPipelineLabel(pipeline, locale)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t.prompt}>
        <textarea
          className="min-h-20 w-full resize-y rounded bg-[#f4f4f5] px-2 py-2 text-[12px] text-[#18181b] outline-none placeholder:text-[#a1a1aa] focus:bg-[#eeeeef]"
          onChange={(event) => onUpdate({ prompt: event.target.value })}
          placeholder={t.promptPlaceholder}
          value={element.prompt ?? ""}
        />
        {reviewPromptMissing ? (
          <div className="mt-1 text-[11px] text-[#dc2626]">
            {locale === "zh"
              ? "有争议的标注需要提示词。"
              : "Reviewed assets need a prompt."}
          </div>
        ) : null}
      </Field>

      <Field label={t.reason}>
        <textarea
          className="min-h-20 w-full resize-y rounded bg-[#f4f4f5] px-2 py-2 text-[12px] text-[#18181b] outline-none focus:bg-[#eeeeef]"
          onChange={(event) => onUpdate({ reason: event.target.value })}
          placeholder={t.reasonPlaceholder}
          value={reasonValue}
        />
      </Field>

      <button
        className="h-8 w-full rounded bg-[#f4f4f5] text-[12px] font-medium text-[#3f3f46] transition hover:bg-[#eeeeef]"
        onClick={onDelete}
        type="button"
      >
        {t.deleteElement}
      </button>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-medium text-[#71717a]">{label}</span>
      {children}
    </label>
  );
}

function formatStrategyLabel(strategy: RestoreStrategy, locale: Locale) {
  return locale === "zh"
    ? `${strategy}（${strategyLabelZh[strategy]}）`
    : strategy;
}

function formatAssetPipelineLabel(pipeline: AssetPipeline, locale: Locale) {
  return locale === "zh" ? assetPipelineLabelZh[pipeline] : pipeline;
}

function getConfidenceDotClass(confidence: number) {
  if (confidence < 0.85) {
    return "bg-[#dc2626]";
  }

  return "bg-[#16a34a]";
}

function formatElementState(state: UIElement["state"]) {
  if (!state) {
    return "";
  }

  return Object.entries(state)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(", ");
}

function IndeterminateProgress({ className }: { className?: string }) {
  return (
    <div
      aria-label="Loading progress"
      className={[
        "ai-progress-track rounded-full bg-[#ececef]",
        className ?? "h-1.5 w-full",
      ].join(" ")}
      data-active="true"
      role="progressbar"
    />
  );
}

function createAssetSheet({
  elements,
  image,
  sourceFileName,
}: {
  elements: UIElement[];
  image: HTMLImageElement;
  sourceFileName: string;
}) {
  const padding = 24;
  const cellGap = 20;
  const columns = Math.min(3, Math.max(1, elements.length));
  const cells = elements.map((element, index) => {
    const [sourceX, sourceY, sourceWidth, sourceHeight] = clampElementBBox(
      element.bbox,
      image.naturalWidth,
      image.naturalHeight,
    );
    return {
      element,
      id: `asset_${String(index + 1).padStart(3, "0")}`,
      sourceX,
      sourceY,
      sourceHeight,
      sourceWidth,
      thumbHeight: sourceHeight,
      thumbWidth: sourceWidth,
    };
  });
  const columnWidth =
    Math.max(...cells.map((cell) => cell.thumbWidth)) + padding * 2;
  const rowHeights = Array.from(
    { length: Math.ceil(cells.length / columns) },
    (_, rowIndex) =>
      Math.max(
        ...cells
          .slice(rowIndex * columns, rowIndex * columns + columns)
          .map((cell) => cell.thumbHeight + padding * 2),
      ),
  );
  const contentWidth = columns * columnWidth + (columns + 1) * cellGap;
  const contentHeight =
    rowHeights.reduce((sum, height) => sum + height, 0) +
    (rowHeights.length + 1) * cellGap;
  const canvas = document.createElement("canvas");
  canvas.width = roundUpToMultiple(Math.max(1, Math.ceil(contentWidth)), 16);
  canvas.height = roundUpToMultiple(Math.max(1, Math.ceil(contentHeight)), 16);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const assets = cells.map((cell, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = cellGap + column * (columnWidth + cellGap);
    const y =
      cellGap +
      rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) +
      row * cellGap;
    const imageX = Math.round(x + (columnWidth - cell.thumbWidth) / 2);
    const imageY = Math.round(y + (rowHeights[row] - cell.thumbHeight) / 2);
    context.drawImage(
      image,
      cell.sourceX,
      cell.sourceY,
      cell.sourceWidth,
      cell.sourceHeight,
      imageX,
      imageY,
      cell.thumbWidth,
      cell.thumbHeight,
    );

    return {
      exportSize: {
        height: cell.sourceHeight,
        width: cell.sourceWidth,
      },
      assetPipeline: cell.element.assetPipeline ?? "ai-chroma",
      assetName: cell.element.assetName,
      elementType: cell.element.type,
      id: cell.id,
      prompt:
        cell.element.prompt?.trim() ||
        createAssetPromptFallback(cell.element, cell.id),
      reason: cell.element.reason,
      state: cell.element.state,
      strategy: cell.element.strategy,
      semanticName: cell.element.semanticName,
      text: cell.element.text,
      cropSearchBBox: [
        Math.round(x),
        Math.round(y),
        Math.round(columnWidth),
        Math.round(rowHeights[row]),
      ] as AssetBBox,
      sheetBBox: [imageX, imageY, cell.thumbWidth, cell.thumbHeight] as [
        number,
        number,
        number,
        number,
      ],
      sourceBBox: [
        cell.sourceX,
        cell.sourceY,
        cell.sourceWidth,
        cell.sourceHeight,
      ] as AssetBBox,
    };
  });

  return {
    canvas,
    manifest: {
      assets,
      generatedAt: new Date().toISOString(),
      sheetSize: { height: canvas.height, width: canvas.width },
      sourceFileName,
      version: "asset-sheet-1.0",
    } satisfies AssetSheetManifest,
  };
}

function roundUpToMultiple(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple;
}

function auditChromaAssetSheet(
  canvas: HTMLCanvasElement,
  manifest: AssetSheetManifest,
) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return {
      dirtyBackgroundPixels: 0,
      sampledBackgroundPixels: 0,
      transparentPixels: 0,
    };
  }

  const assetPixels = new Uint8Array(canvas.width * canvas.height);
  for (const asset of manifest.assets) {
    const [x, y, width, height] = clampAssetBBox(
      asset.sheetBBox,
      canvas.width,
      canvas.height,
    );
    for (let row = y; row < y + height; row += 1) {
      assetPixels.fill(1, row * canvas.width + x, row * canvas.width + x + width);
    }
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let dirtyBackgroundPixels = 0;
  let sampledBackgroundPixels = 0;
  let transparentPixels = 0;

  for (let index = 0; index < canvas.width * canvas.height; index += 1) {
    const offset = index * 4;
    const red = imageData.data[offset];
    const green = imageData.data[offset + 1];
    const blue = imageData.data[offset + 2];
    const alpha = imageData.data[offset + 3];

    if (alpha < 255) {
      transparentPixels += 1;
    }

    if (assetPixels[index]) {
      continue;
    }

    sampledBackgroundPixels += 1;
    if (red !== 0 || green !== 255 || blue !== 0 || alpha !== 255) {
      dirtyBackgroundPixels += 1;
    }
  }

  return {
    dirtyBackgroundPixels,
    sampledBackgroundPixels,
    transparentPixels,
  };
}

function createAssetPromptFallback(element: UIElement, assetId: string) {
  return [
    `${assetId}: extract this marked visual region as a transparent PNG asset. Do not render this asset id as visible text.`,
    "Preserve visible shape, color, proportions, and details.",
    "Remove unrelated surrounding screenshot background unless it belongs to the asset.",
    element.reason ? `Context: ${element.reason}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function toAssetPromptManifest(manifest: AssetSheetManifest) {
  return {
    assets: manifest.assets.map((asset) => ({
      id: asset.id,
      prompt: asset.prompt,
      expectedBBox: asset.sheetBBox,
    })),
    version: manifest.version,
  };
}

async function locateAssetSheet({
  imageBlob,
  manifest,
}: {
  imageBlob: Blob;
  manifest: AssetSheetManifest;
}) {
  try {
    const formData = new FormData();
    formData.append(
      "image",
      new File([imageBlob], "generated-asset-sheet.png", {
        type: imageBlob.type || "image/png",
      }),
    );
    formData.append("assetManifest", JSON.stringify(toAssetPromptManifest(manifest)));
    formData.append("imageWidth", String(manifest.sheetSize.width));
    formData.append("imageHeight", String(manifest.sheetSize.height));

    const response = await fetch("/api/locate-assets", {
      body: formData,
      method: "POST",
    });
    const result = (await response.json()) as {
      assets?: Array<{ bbox: AssetBBox; id: string }>;
      error?: string;
      model?: string;
    };

    if (!response.ok || !result.assets || result.assets.length === 0) {
      console.warn("[workspace] asset location skipped", result.error);
      return manifest;
    }

    const locations = new Map(
      result.assets.map((asset) => [asset.id, asset.bbox] as const),
    );
    console.info("[workspace] asset locations", {
      count: locations.size,
      model: result.model,
    });

    return {
      ...manifest,
      assets: manifest.assets.map((asset) => {
        const bbox = locations.get(asset.id);
        return bbox
          ? {
              ...asset,
              cropSearchBBox: undefined,
              locatedByAi: true,
              sheetBBox: expandBBox(
                bbox,
                createAssetCropPadding(bbox),
                manifest.sheetSize.width,
                manifest.sheetSize.height,
              ),
            }
          : asset;
      }),
    } satisfies AssetSheetManifest;
  } catch (error) {
    console.warn("[workspace] asset location failed", error);
    return manifest;
  }
}

async function generateTransparentAssets({
  manifest,
  sheetBlob,
}: {
  manifest: AssetSheetManifest;
  sheetBlob: Blob;
}): Promise<GeneratedAssetApiResult> {
  const formData = new FormData();
  formData.append(
    "assetSheet",
    new File([sheetBlob], "asset-sheet.png", {
      type: sheetBlob.type || "image/png",
    }),
  );
  formData.append("assetManifest", JSON.stringify(manifest));
  formData.append("assetSheetWidth", String(manifest.sheetSize.width));
  formData.append("assetSheetHeight", String(manifest.sheetSize.height));

  const response = await fetch("/api/generate-assets", {
    body: formData,
    method: "POST",
  });
  const result = (await response.json()) as GeneratedAssetApiResult;

  if (!response.ok) {
    throw new Error(result.error ?? "AI asset generation failed.");
  }

  if (!Array.isArray(result.parts) || result.parts.length === 0) {
    throw new Error("AI asset generation did not return sliced transparent assets.");
  }

  return result;
}

async function sliceAssetsFromSourceImage({
  baseName,
  imageUrl,
  manifest,
  timestamp,
}: {
  baseName: string;
  imageUrl: string;
  manifest: AssetSheetManifest;
  timestamp: number;
}) {
  const image = await loadImage(imageUrl);
  const parts: GeneratedAssetPart[] = [];

  for (const asset of manifest.assets) {
    const sourceBBox = asset.sourceBBox ?? asset.sheetBBox;
    const [x, y, width, height] = clampAssetBBox(
      sourceBBox,
      image.naturalWidth,
      image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      continue;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, x, y, width, height, 0, 0, width, height);

    if (shouldRemoveSourceBackground(asset, width, height)) {
      removeEdgeSampledBackground(context, width, height);
      trimTransparentPixels(canvas, context);
    }

    const blob = await canvasToBlob(canvas, "image/png", 1);
    if (!blob) {
      continue;
    }

    parts.push({
      filename: `${baseName}.${asset.id}.${timestamp}.png`,
      id: asset.id,
      prompt: asset.prompt,
      url: URL.createObjectURL(blob),
    });
  }

  return parts;
}

async function sliceAssetSheet({
  baseName,
  manifest,
  sourceSheetUrl,
  timestamp,
}: {
  baseName: string;
  manifest: AssetSheetManifest;
  sourceSheetUrl: string;
  timestamp: number;
}) {
  const image = await loadImage(sourceSheetUrl);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext) {
    return [];
  }

  sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceContext.drawImage(image, 0, 0);
  const parts: GeneratedAssetPart[] = [];

  for (const asset of manifest.assets) {
    const expectedBBox = scaleSheetBBox(
      asset.sheetBBox,
      image.naturalWidth,
      image.naturalHeight,
      manifest,
    );
    const searchBBox = asset.cropSearchBBox
      ? scaleSheetBBox(
          asset.cropSearchBBox,
          image.naturalWidth,
          image.naturalHeight,
          manifest,
        )
      : null;
    const crop = asset.locatedByAi
      ? { bbox: expectedBBox, removeLightBackground: true }
      : findVisibleAssetBBox(
          sourceContext,
          expectedBBox,
          searchBBox,
          image.naturalWidth,
          image.naturalHeight,
        ) ?? { bbox: expectedBBox, removeLightBackground: false };
    const [x, y, width, height] = crop.bbox;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }

    context.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
    if (crop.removeLightBackground) {
      removeLightBackground(context, width, height);
    }
    const blob = await canvasToBlob(canvas, "image/png", 1);
    if (!blob) {
      continue;
    }

    parts.push({
      filename: `${baseName}.${asset.id}.${timestamp}.png`,
      id: asset.id,
      prompt: asset.prompt,
      url: URL.createObjectURL(blob),
    });
  }

  return parts;
}

function scaleSheetBBox(
  bbox: AssetBBox,
  imageWidth: number,
  imageHeight: number,
  manifest: AssetSheetManifest,
): AssetBBox {
  const scaleX = imageWidth / manifest.sheetSize.width;
  const scaleY = imageHeight / manifest.sheetSize.height;
  const left = clamp(Math.floor(bbox[0] * scaleX), 0, imageWidth - 1);
  const top = clamp(Math.floor(bbox[1] * scaleY), 0, imageHeight - 1);
  const right = clamp(Math.ceil((bbox[0] + bbox[2]) * scaleX), left + 1, imageWidth);
  const bottom = clamp(
    Math.ceil((bbox[1] + bbox[3]) * scaleY),
    top + 1,
    imageHeight,
  );

  return [left, top, right - left, bottom - top];
}

function findVisibleAssetBBox(
  context: CanvasRenderingContext2D,
  expectedBBox: AssetBBox,
  searchBBox: AssetBBox | null,
  imageWidth: number,
  imageHeight: number,
): { bbox: AssetBBox; removeLightBackground: boolean } | null {
  const [expectedX, expectedY, expectedWidth, expectedHeight] = expectedBBox;
  const [searchX, searchY, searchWidthSource, searchHeightSource] =
    searchBBox ?? expectedBBox;
  const marginX = searchBBox ? 0 : Math.max(8, Math.round(expectedWidth * 0.18));
  const marginY = searchBBox ? 0 : Math.max(8, Math.round(expectedHeight * 0.18));
  const left = clamp(searchX - marginX, 0, imageWidth - 1);
  const top = clamp(searchY - marginY, 0, imageHeight - 1);
  const right = clamp(searchX + searchWidthSource + marginX, left + 1, imageWidth);
  const bottom = clamp(
    searchY + searchHeightSource + marginY,
    top + 1,
    imageHeight,
  );
  const searchWidth = right - left;
  const searchHeight = bottom - top;
  let imageData: ImageData;
  try {
    imageData = context.getImageData(left, top, searchWidth, searchHeight);
  } catch (error) {
    console.warn("[workspace] asset alpha crop failed", error);
    return null;
  }
  const alphaThreshold = 8;
  let minAlphaX = searchWidth;
  let minAlphaY = searchHeight;
  let maxAlphaX = -1;
  let maxAlphaY = -1;
  let alphaPixels = 0;

  for (let y = 0; y < searchHeight; y += 1) {
    for (let x = 0; x < searchWidth; x += 1) {
      const alpha = imageData.data[(y * searchWidth + x) * 4 + 3];
      if (alpha <= alphaThreshold) {
        continue;
      }

      alphaPixels += 1;
      minAlphaX = Math.min(minAlphaX, x);
      minAlphaY = Math.min(minAlphaY, y);
      maxAlphaX = Math.max(maxAlphaX, x);
      maxAlphaY = Math.max(maxAlphaY, y);
    }
  }

  if (maxAlphaX < minAlphaX || maxAlphaY < minAlphaY) {
    return null;
  }

  const alphaBBox: AssetBBox = [
    left + minAlphaX,
    top + minAlphaY,
    maxAlphaX - minAlphaX + 1,
    maxAlphaY - minAlphaY + 1,
  ];
  const alphaCoverage = alphaPixels / (searchWidth * searchHeight);
  const alphaFillsSearch =
    alphaBBox[2] >= searchWidth * 0.92 && alphaBBox[3] >= searchHeight * 0.92;

  if (alphaCoverage < 0.9 || !alphaFillsSearch) {
    return { bbox: alphaBBox, removeLightBackground: false };
  }

  const visualBBox = findVisualForegroundBBox(imageData, left, top, searchWidth, searchHeight);
  if (!visualBBox) {
    return { bbox: alphaBBox, removeLightBackground: false };
  }

  return {
    bbox: expandBBox(visualBBox, 2, imageWidth, imageHeight),
    removeLightBackground: true,
  };
}

function findVisualForegroundBBox(
  imageData: ImageData,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): AssetBBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (
        !isVisualForeground(
          imageData.data[index],
          imageData.data[index + 1],
          imageData.data[index + 2],
          imageData.data[index + 3],
        )
      ) {
        continue;
      }

      foregroundPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (foregroundPixels < 4 || maxX < minX || maxY < minY) {
    return null;
  }

  return [offsetX + minX, offsetY + minY, maxX - minX + 1, maxY - minY + 1];
}

function shouldRemoveSourceBackground(
  asset: AssetSheetManifest["assets"][number],
  width: number,
  height: number,
) {
  const area = width * height;
  const prompt = asset.prompt.toLowerCase();
  const isLikelyLargePhoto =
    area > 18_000 ||
    /banner|横幅|商品|摄影|照片|photo|背景|background|map|地图/.test(prompt);

  return !isLikelyLargePhoto;
}

function removeEdgeSampledBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = context.getImageData(0, 0, width, height);
  const background = estimateEdgeBackgroundColor(imageData, width, height);
  const removable = findEdgeConnectedBackgroundMask(imageData, width, height, background);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (alpha <= 8) {
      imageData.data[index + 3] = 0;
      continue;
    }

    if (removable[index / 4]) {
      imageData.data[index + 3] = 0;
    }
  }

  softenTransparentEdges(imageData, width, height);
  context.putImageData(imageData, 0, 0);
}

function findEdgeConnectedBackgroundMask(
  imageData: ImageData,
  width: number,
  height: number,
  background: { blue: number; green: number; red: number },
) {
  const removable = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const threshold = 42;

  const enqueue = (x: number, y: number) => {
    const pixelIndex = y * width + x;
    if (visited[pixelIndex]) {
      return;
    }

    visited[pixelIndex] = 1;
    const dataIndex = pixelIndex * 4;
    const alpha = imageData.data[dataIndex + 3];
    const distance = colorDistance(
      {
        blue: imageData.data[dataIndex + 2],
        green: imageData.data[dataIndex + 1],
        red: imageData.data[dataIndex],
      },
      background,
    );

    if (alpha <= 8 || distance <= threshold) {
      removable[pixelIndex] = 1;
      queue.push(pixelIndex);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixelIndex = queue[cursor];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) {
      enqueue(x - 1, y);
    }
    if (x < width - 1) {
      enqueue(x + 1, y);
    }
    if (y > 0) {
      enqueue(x, y - 1);
    }
    if (y < height - 1) {
      enqueue(x, y + 1);
    }
  }

  return removable;
}

function softenTransparentEdges(
  imageData: ImageData,
  width: number,
  height: number,
) {
  const alpha = new Uint8ClampedArray(width * height);
  for (let index = 0; index < width * height; index += 1) {
    alpha[index] = imageData.data[index * 4 + 3];
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixelIndex = y * width + x;
      if (alpha[pixelIndex] === 0) {
        continue;
      }

      const hasTransparentNeighbor =
        alpha[pixelIndex - 1] === 0 ||
        alpha[pixelIndex + 1] === 0 ||
        alpha[pixelIndex - width] === 0 ||
        alpha[pixelIndex + width] === 0;

      if (hasTransparentNeighbor) {
        imageData.data[pixelIndex * 4 + 3] = Math.min(
          imageData.data[pixelIndex * 4 + 3],
          210,
        );
      }
    }
  }
}

function estimateEdgeBackgroundColor(
  imageData: ImageData,
  width: number,
  height: number,
) {
  const samples: Array<{ blue: number; green: number; red: number }> = [];
  const pushSample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    samples.push({
      blue: imageData.data[index + 2],
      green: imageData.data[index + 1],
      red: imageData.data[index],
    });
  };

  for (let x = 0; x < width; x += 1) {
    pushSample(x, 0);
    pushSample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushSample(0, y);
    pushSample(width - 1, y);
  }

  return {
    blue: median(samples.map((sample) => sample.blue)),
    green: median(samples.map((sample) => sample.green)),
    red: median(samples.map((sample) => sample.red)),
  };
}

function colorDistance(
  first: { blue: number; green: number; red: number },
  second: { blue: number; green: number; red: number },
) {
  const red = first.red - second.red;
  const green = first.green - second.green;
  const blue = first.blue - second.blue;

  return Math.sqrt(red * red + green * green + blue * blue);
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function trimTransparentPixels(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) {
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = imageData.data[(y * canvas.width + x) * 4 + 3];
      if (alpha <= 8) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return;
  }

  const padding = 2;
  const left = clamp(minX - padding, 0, canvas.width - 1);
  const top = clamp(minY - padding, 0, canvas.height - 1);
  const right = clamp(maxX + 1 + padding, left + 1, canvas.width);
  const bottom = clamp(maxY + 1 + padding, top + 1, canvas.height);
  const trimmedWidth = right - left;
  const trimmedHeight = bottom - top;
  const trimmedData = context.getImageData(left, top, trimmedWidth, trimmedHeight);
  canvas.width = trimmedWidth;
  canvas.height = trimmedHeight;
  const nextContext = canvas.getContext("2d");
  nextContext?.putImageData(trimmedData, 0, 0);
}

function removeLightBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = context.getImageData(0, 0, width, height);

  for (let index = 0; index < imageData.data.length; index += 4) {
    if (
      isVisualForeground(
        imageData.data[index],
        imageData.data[index + 1],
        imageData.data[index + 2],
        imageData.data[index + 3],
      )
    ) {
      continue;
    }

    imageData.data[index + 3] = 0;
  }

  context.putImageData(imageData, 0, 0);
}

function isVisualForeground(red: number, green: number, blue: number, alpha: number) {
  if (alpha <= 8) {
    return false;
  }

  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;

  return luma < 235 || maxChannel - minChannel > 18;
}

function expandBBox(
  bbox: AssetBBox,
  padding: number,
  imageWidth: number,
  imageHeight: number,
): AssetBBox {
  const left = clamp(bbox[0] - padding, 0, imageWidth - 1);
  const top = clamp(bbox[1] - padding, 0, imageHeight - 1);
  const right = clamp(bbox[0] + bbox[2] + padding, left + 1, imageWidth);
  const bottom = clamp(bbox[1] + bbox[3] + padding, top + 1, imageHeight);

  return [left, top, right - left, bottom - top];
}

function createAssetCropPadding(bbox: AssetBBox) {
  const shorterSide = Math.min(bbox[2], bbox[3]);

  return Math.max(4, Math.min(24, Math.round(shorterSide * 0.2)));
}

function clampAssetBBox(
  bbox: AssetBBox,
  imageWidth: number,
  imageHeight: number,
): AssetBBox {
  const [x, y, width, height] = bbox;
  const left = clamp(Math.floor(x), 0, imageWidth - 1);
  const top = clamp(Math.floor(y), 0, imageHeight - 1);
  const right = clamp(Math.ceil(x + width), left + 1, imageWidth);
  const bottom = clamp(Math.ceil(y + height), top + 1, imageHeight);

  return [left, top, right - left, bottom - top];
}


function clampElementBBox(
  bbox: UIElement["bbox"],
  imageWidth: number,
  imageHeight: number,
): UIElement["bbox"] {
  const [x, y, width, height] = bbox;
  const left = clamp(Math.floor(x), 0, imageWidth - 1);
  const top = clamp(Math.floor(y), 0, imageHeight - 1);
  const right = clamp(Math.ceil(x + width), left + 1, imageWidth);
  const bottom = clamp(Math.ceil(y + height), top + 1, imageHeight);

  return [left, top, right - left, bottom - top];
}

async function clearCachedWorkspace() {
  try {
    const db = await openCacheDb();
    if (!db) {
      return;
    }

    await runCacheRequest(
      db.transaction(cacheStoreName, "readwrite")
        .objectStore(cacheStoreName)
        .delete(cacheKey),
    );
    db.close();
  } catch (error) {
    console.warn("[workspace-cache] clear failed", error);
  }
}

async function readCachedWorkspace() {
  try {
    const db = await openCacheDb();
    if (!db) {
      return null;
    }

    const cached = await runCacheRequest<CachedWorkspace | undefined>(
      db.transaction(cacheStoreName, "readonly")
        .objectStore(cacheStoreName)
        .get(cacheKey),
    );
    db.close();
    return cached ?? null;
  } catch (error) {
    console.warn("[workspace-cache] restore failed", error);
    return null;
  }
}

async function saveCachedWorkspace(workspace: CachedWorkspace) {
  try {
    const db = await openCacheDb();
    if (!db) {
      return;
    }

    await runCacheRequest(
      db.transaction(cacheStoreName, "readwrite")
        .objectStore(cacheStoreName)
        .put(workspace, cacheKey),
    );
    db.close();
  } catch (error) {
    console.warn("[workspace-cache] save failed", error);
  }
}

async function updateCachedManifest(manifest: UIManifest) {
  const cached = await readCachedWorkspace();
  if (!cached) {
    return;
  }

  await saveCachedWorkspace({
    ...cached,
    manifest,
    savedAt: Date.now(),
  });
}

function readFileText(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

async function createAnalysisRegions(
  file: File,
  image: HTMLImageElement,
  maxSide: number,
  regionCount: number,
): Promise<AnalysisRegion[]> {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const count = Math.max(1, Math.round(regionCount));
  const slicePlans = await planSlices(file, image, maxSide, count);
  const regions: AnalysisRegion[] = [];

  for (const [index, plan] of slicePlans.entries()) {
    const originalX = clampNumber(Math.floor(plan.x), 0, width - 1);
    const originalY = clampNumber(Math.floor(plan.y), 0, height - 1);
    const originalRight = clampNumber(
      Math.ceil(originalX + plan.width),
      originalX + 1,
      width,
    );
    const originalBottom = clampNumber(
      Math.ceil(originalY + plan.height),
      originalY + 1,
      height,
    );
    const originalWidth = originalRight - originalX;
    const originalHeight = originalBottom - originalY;
    const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    const regionWidth = Math.max(1, Math.round(originalWidth * scale));
    const regionHeight = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = regionWidth;
    canvas.height = regionHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      continue;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      originalX,
      originalY,
      originalWidth,
      originalHeight,
      0,
      0,
      regionWidth,
      regionHeight,
    );

    const blob = await canvasToBlob(canvas, "image/png", 1);
    if (!blob) {
      continue;
    }

    regions.push({
      file: new File(
        [blob],
        `${stripFileExtension(file.name)}.region-${index + 1}.png`,
        {
          type: "image/png",
        },
      ),
      height: regionHeight,
      originalHeight,
      originalWidth,
      originalX,
      originalY,
      width: regionWidth,
    });
  }

  return regions.length > 0
    ? regions
    : [
        {
          file,
          height,
          originalHeight: height,
          originalWidth: width,
          originalX: 0,
          originalY: 0,
          width,
        },
      ];
}

async function planSlices(
  file: File,
  image: HTMLImageElement,
  maxSide: number,
  count: number,
) {
  try {
    const planningImage = await createPlanningImage(file, image, maxSide);
    const formData = new FormData();
    formData.append("image", planningImage.file);
    formData.append("width", String(planningImage.width));
    formData.append("height", String(planningImage.height));
    formData.append("count", String(count));

    const response = await fetch("/api/plan-slices", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as {
      slices?: SlicePlan[];
    };

    if (!response.ok || !Array.isArray(result.slices)) {
      return fallbackSlicePlans(image.naturalWidth, image.naturalHeight, count);
    }

    const scaleX = image.naturalWidth / planningImage.width;
    const scaleY = image.naturalHeight / planningImage.height;

    return result.slices.map((slice) => ({
      height: slice.height * scaleY,
      reason: slice.reason,
      width: slice.width * scaleX,
      x: slice.x * scaleX,
      y: slice.y * scaleY,
    }));
  } catch (error) {
    console.warn("[workspace] slice planning failed", error);
    return fallbackSlicePlans(image.naturalWidth, image.naturalHeight, count);
  }
}

async function createPlanningImage(
  file: File,
  image: HTMLImageElement,
  maxSide: number,
) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(width, height));

  if (scale >= 1) {
    return { file, height, width };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    return { file, height, width };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, "image/png", 1);
  if (!blob) {
    return { file, height, width };
  }

  return {
    file: new File([blob], `${stripFileExtension(file.name)}.slice-plan.png`, {
      type: "image/png",
    }),
    height: canvas.height,
    width: canvas.width,
  };
}

function fallbackSlicePlans(width: number, height: number, count: number) {
  const overlap = Math.min(48, Math.max(16, Math.round(height * 0.03)));
  const baseHeight = height / count;

  return Array.from({ length: count }, (_, index) => {
    const y = Math.max(0, Math.floor(index * baseHeight - overlap));
    const bottom = Math.min(
      height,
      index === count - 1 ? height : Math.ceil((index + 1) * baseHeight + overlap),
    );

    return {
      height: Math.max(1, bottom - y),
      width,
      x: 0,
      y,
    };
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "source-image";
}

function createAssetFilenameMap(assets: AssetSheetManifest["assets"]) {
  const usedNames = new Map<string, number>();
  return new Map(
    assets.map((asset) => [
      asset.id,
      createUniqueAssetFilename(asset.assetName ?? asset.id, usedNames),
    ]),
  );
}

function createGeneratedPartFilename(
  part: { filename: string; id: string },
  assetFilenameById: Map<string, string>,
) {
  return assetFilenameById.get(part.id) ?? sanitizeAssetFilename(part.filename);
}

function createUniqueAssetFilename(value: string, usedNames: Map<string, number>) {
  const base = sanitizeAssetFilenameStem(value) || "asset";
  const count = usedNames.get(base) ?? 0;
  usedNames.set(base, count + 1);
  return count === 0
    ? `${base}.png`
    : `${base}_${String(count + 1).padStart(2, "0")}.png`;
}

function sanitizeAssetFilename(fileName: string) {
  const extension = getFileExtension(fileName) || "png";
  const stem = sanitizeAssetFilenameStem(stripFileExtension(fileName));
  return `${stem || "asset"}.${extension}`;
}

function sanitizeAssetFilenameStem(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "");
}

function getFileExtension(fileName: string) {
  const match = fileName.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase();
}

function parseWorkspaceImport(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version === "workspace-bundle-1.0" &&
    "manifest" in input
  ) {
    const bundle = input as {
      image?: { dataUrl?: unknown; name?: unknown; type?: unknown };
      manifest: unknown;
    };
    const image =
      bundle.image &&
      typeof bundle.image.dataUrl === "string" &&
      typeof bundle.image.name === "string"
        ? {
            dataUrl: bundle.image.dataUrl,
            name: bundle.image.name,
            type:
              typeof bundle.image.type === "string"
                ? bundle.image.type
                : "image/png",
          }
        : undefined;

    return {
      image,
      manifest: UIManifestSchema.parse(sanitizeManifestInput(bundle.manifest)),
    };
  }

  return {
    image: undefined,
    manifest: UIManifestSchema.parse(sanitizeManifestInput(input)),
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onerror = () => reject(new Error("Image failed to load."));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  URL.revokeObjectURL(url);
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadGeneratedAssetPackage(asset: GeneratedAssetItem) {
  if (asset.status !== "ready") {
    return;
  }

  const entries: Array<{ data: Blob | string; path: string }> = [];
  const baseName = stripFileExtension(asset.filename);

  const sourcePath = createSourceImagePackagePath(asset.originalFilename);
  if (asset.originalImageUrl) {
    entries.push({
      data: await fetch(asset.originalImageUrl).then((response) => response.blob()),
      path: sourcePath,
    });
  }

  entries.push({
    data: createGeneratedAssetPromptMarkdown({ asset, sourcePath }),
    path: "prompt.md",
  });

  const parts = asset.parts ?? [];
  for (const part of parts) {
    entries.push({
      data: await getGeneratedAssetPartBlob(part),
      path: `assets/${part.filename}`,
    });
  }

  entries.push({
    data: JSON.stringify(createGeneratedAssetJson(asset), null, 2),
    path: "assets.json",
  });

  const zipBlob = await createZipBlob(entries);
  downloadBlob(zipBlob, `${baseName}.zip`);
}

export async function getGeneratedAssetPartBlob(
  part: Pick<GeneratedAssetPart, "imageDataUrl" | "url">,
  fetchBlob = async (url: string) => fetch(url).then((response) => response.blob()),
) {
  if (part.imageDataUrl) {
    return dataUrlToBlob(part.imageDataUrl);
  }

  return fetchBlob(part.url);
}

function createGeneratedAssetJson(asset: GeneratedAssetItem) {
  const sourcePath = asset.originalImageUrl
    ? createSourceImagePackagePath(asset.originalFilename)
    : undefined;

  return {
    assets: (asset.parts ?? []).map((part) => ({
      assetName: part.assetName,
      file: `assets/${part.filename}`,
      id: part.id,
      prompt:
        part.prompt ||
        "Use this PNG asset as-is. Preserve its exact proportions, shape, color, and transparent background.",
      semanticName: part.semanticName,
      source: part.source,
      verification: part.verification
        ? {
            needsReview: part.verification.needsReview,
            score: part.verification.score,
          }
        : undefined,
    })),
    note:
      "Use source.* as the original UI reference image and use each PNG in assets/ directly as a transparent visual asset. Preserve exact proportions and prefer package assets over recreating icons or illustrations.",
    previewSheet: asset.assetSheet,
    prompt: "prompt.md",
    source: sourcePath,
    version: "generated-assets-1.0",
  };
}

function createGeneratedAssetPromptMarkdown({
  asset,
  sourcePath,
}: {
  asset: GeneratedAssetItem;
  sourcePath: string;
}) {
  const assets = asset.parts ?? [];
  const assetList =
    assets.length > 0
      ? assets
          .map((part) => `- \`assets/${part.filename}\`${part.assetName ? `: ${part.assetName}` : ""}`)
          .join("\n")
      : "- `assets/`: transparent PNG assets exported from AiClip";

  return [
    "# UI Reconstruction Prompt",
    "",
    `请参考 \`${sourcePath}\` 这张 UI 原图，使用当前切图包进行 UI 还原。`,
    "",
    "要求：",
    "- 还原整体布局、层级、间距、颜色、字体风格和视觉比例。",
    "- 涉及图标、插画、装饰图、头像、Logo、商品图等素材时，优先使用切图包内 `assets/` 目录的素材。",
    "- 不要用图标库或重新绘制替代已有切图素材，除非资源包里确实没有对应素材。",
    "- 保持素材透明背景、原始比例和视觉细节。",
    "",
    "Available assets:",
    assetList,
    "",
  ].join("\n");
}

function createSourceImagePackagePath(filename?: string) {
  const extension = filename?.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ".png";
  return `source${extension}`;
}

async function createZipBlob(entries: Array<{ data: Blob | string; path: string }>) {
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBytes = encodeUtf8(entry.path);
    const payload =
      typeof entry.data === "string"
        ? encodeUtf8(entry.data)
        : new Uint8Array(await entry.data.arrayBuffer());
    const size = payload.byteLength;
    const crc = crc32(payload);

    const localHeader = new Uint8Array(30 + fileNameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, fileNameBytes.byteLength, true);
    localHeader.set(fileNameBytes, 30);
    parts.push(localHeader);
    parts.push(payload);

    const centralHeader = new Uint8Array(46 + fileNameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, fileNameBytes.byteLength, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileNameBytes, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.byteLength + size;
  }

  const centralDirectoryOffset = offset;
  for (const header of centralDirectory) {
    parts.push(header);
    offset += header.byteLength;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralDirectory.length, true);
  endView.setUint16(10, centralDirectory.length, true);
  endView.setUint32(12, offset - centralDirectoryOffset, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  parts.push(end);

  return new Blob(parts.map(toExactArrayBuffer), {
    type: "application/zip",
  });
}

function toExactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, rawData = ""] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+);base64$/)?.[1] ?? "image/png";
  const binary = atob(rawData);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

function openCacheDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(cacheDbName, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(cacheStoreName)) {
        db.createObjectStore(cacheStoreName);
      }
    };
  });
}

function runCacheRequest<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function PanelHeader({
  action,
  subtitle,
  title,
}: {
  action?: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 px-3 py-2">
      <div>
        <h2 className="text-[13px] font-medium text-[#18181b]">{title}</h2>
        <p className="text-[11px] text-[#71717a]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white p-2">
      <div>{label}</div>
      <div className="mt-1 font-medium text-[#18181b]">{value}</div>
    </div>
  );
}

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        "rounded px-1.5 py-0.5 text-[11px]",
        active
          ? "bg-[#18181b] text-white"
          : "bg-[#f4f4f5] text-[#71717a]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function MockPhoneUi() {
  return (
    <div className="absolute inset-0 bg-[#f8fafc]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_8%,rgba(250,204,21,0.14),transparent_28%)]" />
      <div className="absolute left-[22px] right-[22px] top-[42px] flex h-[52px] items-center justify-between">
        <div className="h-[42px] w-[42px] rounded-full bg-gradient-to-br from-orange-500 to-yellow-400" />
        <div className="h-9 w-9 rounded-full border border-slate-200 bg-white" />
      </div>

      <div className="absolute left-[22px] right-[22px] top-[116px] h-[170px] rounded-[18px] bg-gradient-to-br from-blue-700 via-cyan-500 to-emerald-400 shadow-lg">
        <div className="absolute left-6 top-8 h-5 w-36 rounded-full bg-white/85" />
        <div className="absolute left-6 top-[70px] h-[52px] w-56 rounded-xl bg-white/30" />
      </div>

      <div className="absolute left-[22px] top-[314px] flex gap-[9px]">
        <div className="h-8 w-[74px] rounded-full bg-slate-950" />
        <div className="h-8 w-[74px] rounded-full border border-slate-200 bg-white" />
        <div className="h-8 w-[74px] rounded-full border border-slate-200 bg-white" />
      </div>

      <MockCard top={372} />
      <MockCard top={474} />

      <div className="absolute bottom-[22px] left-[22px] right-[22px] flex h-[62px] items-center justify-around rounded-[22px] bg-slate-950">
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
        <div className="h-[30px] w-[30px] rounded-full bg-white/25" />
      </div>
    </div>
  );
}

function MockCard({ top }: { top: number }) {
  return (
    <div
      className="absolute left-[22px] right-[22px] h-[86px] rounded-[14px] border border-slate-200 bg-white"
      style={{ top }}
    >
      <div className="absolute left-4 top-[15px] h-14 w-14 rounded-xl bg-gradient-to-br from-violet-400 to-sky-400" />
      <div className="absolute left-[88px] top-5 h-3 w-44 rounded-full bg-slate-300" />
      <div className="absolute left-[88px] top-11 h-3 w-28 rounded-full bg-slate-200" />
    </div>
  );
}
