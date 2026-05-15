import { getServerEnv } from "@/core/env";
import {
  assetSearchText,
  countPlannedPipelines,
  filterManifestForPipeline,
  planAssetPipelines,
} from "./planner";
import {
  generateDeterministicParts,
} from "./deterministic";
import type {
  AiGenerationIssue,
  AssetSheetManifest,
  GeneratedAssetPart,
  PlannedAsset,
} from "./types";

const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const ASSET_GENERATION_TIMEOUT_MS = 5 * 60_000;
const DEBUG_ASSET_SHEET_DIR = "tmp/generate-assets-debug";
const ASSET_SHEET_UPLOAD_FIELD = "image";
const CHROMA_SCRIPT_PATH = "scripts/process_chroma_icons.py";
const MIN_AI_SHEET_SIDE = 1024;

function getImageConfig() {
  const baseUrl = getServerEnv("IMAGE_BASEURL") ?? getServerEnv("IMAGE_BASE_URL");
  const apiKey = getServerEnv("IMAGE_APIKEY") ?? getServerEnv("IMAGE_API_KEY");
  const model =
    getServerEnv("GPT_IMAGE_MODEL") ??
    getServerEnv("IMAGE_EDIT_MODEL") ??
    getServerEnv("IMAGE_MODEL") ??
    getServerEnv("AI_IMAGE_MODEL");

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: `${baseUrl.replace(/\/$/, "")}/images/edits`,
    model: normalizeGptImageModel(model),
  };
}

function normalizeGptImageModel(model?: string) {
  if (!model) {
    return DEFAULT_IMAGE_MODEL;
  }

  return model;
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    clear: () => clearTimeout(timeoutId),
    signal: controller.signal,
  };
}

function summarizeProviderError(status: number, body: string) {
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return {
    message: [
      `AI asset generation failed with ${status}.`,
      text ? `Provider response: ${text.slice(0, 500)}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    providerBody: text.slice(0, 1200),
    providerStatus: status,
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const sheet = formData.get("assetSheet");
  const manifest = formData.get("assetManifest");
  const assetSheetWidth = formData.get("assetSheetWidth");
  const assetSheetHeight = formData.get("assetSheetHeight");

  if (!(sheet instanceof File) || typeof manifest !== "string") {
    return Response.json(
      { error: "Expected assetSheet file and assetManifest JSON string." },
      { status: 400 },
    );
  }
  const parsedManifest = parseAssetSheetManifest(manifest);

  const normalizedSheet = await normalizeAssetSheetFile(sheet);
  const requestedSize = parseAssetSheetSize(assetSheetWidth, assetSheetHeight);
  if (!requestedSize) {
    return Response.json(
      {
        error:
          "Expected positive assetSheetWidth and assetSheetHeight values divisible by 16.",
      },
      { status: 400 },
    );
  }
  const assetSheetMeta = await createAssetSheetMeta(normalizedSheet, requestedSize);
  const debugAssetSheetPath = await saveDebugAssetSheet(normalizedSheet, assetSheetMeta);
  const plannedAssets = planAssetPipelines(parsedManifest);
  const hasAiChroma = plannedAssets.some((asset) => asset.pipeline === "ai-chroma");
  const config = hasAiChroma ? getImageConfig() : null;

  if (hasAiChroma && !config) {
    return Response.json(
      {
        error:
          "Missing image generation API configuration for ai-chroma assets. Set IMAGE_BASEURL and IMAGE_APIKEY, or change those assets to crop.",
      },
      { status: 400 },
    );
  }

  const aiManifest = filterManifestForPipeline(parsedManifest, plannedAssets, "ai-chroma");
  const prompt = buildAssetGenerationPrompt(aiManifest);

  console.info("[generate-assets] plan", {
    assetSheet: assetSheetMeta,
    counts: countPlannedPipelines(plannedAssets),
    debugAssetSheetPath,
    endpoint: config?.endpoint,
    model: config?.model ?? "deterministic",
    prompt,
    size: requestedSize.size,
  });

  return generateAssetPipelineResult({
    assetSheetMeta,
    config,
    imageBytes: Buffer.from(await normalizedSheet.arrayBuffer()),
    manifest: parsedManifest,
    plannedAssets,
  });
}

function buildAssetGenerationPrompt(manifest: AssetSheetManifest) {
  const assetCount = manifest.assets?.length ?? 0;
  const assetRequests = (manifest.assets ?? [])
    .map((asset, index) => {
      const id = asset.id ?? `asset_${String(index + 1).padStart(3, "0")}`;
      const prompt = asset.prompt?.trim();
      return prompt ? `${id}: ${prompt}` : id;
    })
    .slice(0, 40);

  return [
    "Use case: background-extraction",
    "Asset type: UI asset sprite sheet for a mobile HTML app",
    [
      "Primary request: Use the provided sprite sheet only as a visual reference. Generate a clean chroma-key version of the same sheet: same canvas size, same asset count, same positions, same scale, with every non-asset pixel painted exact #00ff00.",
      assetCount > 0 ? `The sheet contains ${assetCount} asset region(s).` : null,
      assetRequests.length > 0
        ? `Asset requests in reading order: ${assetRequests.join(" | ")}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    "Style/medium: preserve the original UI asset style exactly; crisp icon/image edges; do not redraw into a different style.",
    "Composition/framing: keep the same canvas size, layout, reading order, asset count, cell/region positions, proportions, scale, and orientation as the input image. Preserve the original empty margins around each asset and around the whole sheet. Do not move, crop, resize, re-center, rearrange, stretch, expand, or add assets.",
    "Color palette: preserve all original foreground colors, text colors, gradients, strokes, shadows, highlights, glows, and details inside each asset.",
    "Scene/backdrop: output a perfectly flat solid #00ff00 chroma-key green background, even if the reference image has transparency, white, gray, black, or any other background.",
    "Chroma redraw rule: redraw only the asset strokes, filled foreground shapes, text, and real image content. Any enclosed hollow area inside an outline icon may stay #00ff00 if it matches the background. Do not fill icon holes with white, gray, black, shadows, or antialias haze.",
    "Edge requirement: asset edges must be cleanly separated from #00ff00. Repaint dirty white/gray/black edge residue, halos, labels, guide lines, screenshot residue, and card/tile backgrounds around the asset into exact #00ff00.",
    "Important: a white or gray square/card behind an icon is background, not part of the asset. Remove/repaint that square/card to #00ff00 while preserving only the icon strokes, glyph, text, image, or actual foreground shape.",
    "Constraints: background and hollow icon interiors may use one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, antialias haze, or lighting variation. Do not use #00ff00 inside solid foreground strokes or filled shapes. Do not output transparent alpha. No labels, no watermark, no explanatory text, no borders, no grid lines.",
  ].join("\n");
}

async function generateAssetPipelineResult({
  assetSheetMeta,
  config,
  imageBytes,
  manifest,
  plannedAssets,
}: {
  assetSheetMeta: Awaited<ReturnType<typeof createAssetSheetMeta>>;
  config: NonNullable<ReturnType<typeof getImageConfig>> | null;
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
  plannedAssets: PlannedAsset[];
}) {
  const deterministic = await generateDeterministicParts({
    imageBytes,
    manifest,
    plannedAssets,
  });
  const aiPlannedAssets = plannedAssets.filter((asset) => asset.pipeline === "ai-chroma");
  let aiProcessed = emptyProcessedSheet();

  if (aiPlannedAssets.length > 0 && config) {
    try {
      aiProcessed = await generateAiChromaPartsInBatches({
        config,
        imageBytes,
        manifest,
        plannedAssets: aiPlannedAssets,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI asset generation failed.";
      console.warn("[generate-assets] ai-chroma skipped", {
        assetCount: aiPlannedAssets.length,
        message,
      });
      return Response.json(
        {
          error: message,
          issue: {
            message,
            pipeline: "ai-chroma",
            type: "provider-error",
          } satisfies AiGenerationIssue,
        },
        { status: 502 },
      );
    }
  }

  const parts = [...deterministic.parts, ...aiProcessed.parts];
  const aiChromaParts = parts.filter((part) => part.source === "ai-chroma");
  const processedSheetDataUrl =
    aiChromaParts.length > 0
      ? await createProcessedSheetFromParts({
          manifest,
          parts: aiChromaParts,
        })
      : undefined;

  return Response.json({
    assetSheet: assetSheetMeta,
    imageDataUrl: aiProcessed.imageDataUrl,
    imageUrl: aiProcessed.imageUrl,
    model: config?.model ?? "deterministic",
    parts,
    processedSheetDataUrl,
  });
}

function parseAssetSheetManifest(value: string): AssetSheetManifest {
  try {
    const parsed = JSON.parse(value) as AssetSheetManifest;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

async function generateAiChromaPartsInBatches({
  config,
  imageBytes,
  manifest,
  plannedAssets,
}: {
  config: NonNullable<ReturnType<typeof getImageConfig>>;
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
  plannedAssets: PlannedAsset[];
}) {
  const parts: GeneratedAssetPart[] = [];
  const imageDataUrls: string[] = [];
  const imageUrls: string[] = [];

  for (const batch of createAiChromaBatches(plannedAssets)) {
    const reference = await createBatchAssetReferenceSheet({
      batch,
      imageBytes,
      manifest,
    });
    const prompt = buildBatchAssetGenerationPrompt(batch, reference);
    const upstream = new FormData();
    upstream.append("model", config.model);
    upstream.append("prompt", prompt);
    upstream.append("size", reference.size);
    appendAssetSheet(upstream, reference.file);

    const payload = await postImageEdit(config, upstream);
    const first = payload.data?.[0];

    if (first?.b64_json) {
      const imageDataUrl = `data:image/png;base64,${first.b64_json}`;
      imageDataUrls.push(imageDataUrl);
      const processed = await processGeneratedAssetSheet({
        imageBytes: Buffer.from(first.b64_json, "base64"),
        manifest: reference.manifest,
      });
      parts.push(...processed.parts);
      continue;
    }

    if (first?.url) {
      imageUrls.push(first.url);
      const processed = await processGeneratedAssetSheetFromUrl({
        imageUrl: first.url,
        manifest: reference.manifest,
      });
      parts.push(...processed.parts);
      continue;
    }

    throw new Error("AI asset generation response did not include an image.");
  }

  return {
    imageDataUrl: imageDataUrls[0],
    imageUrl: imageUrls[0],
    parts,
    processedSheetDataUrl: undefined,
  };
}

function createAiChromaBatches(plannedAssets: PlannedAsset[]) {
  const groups = new Map<string, PlannedAsset[]>();
  for (const asset of plannedAssets) {
    const type = String(asset.asset.elementType ?? "asset").toLowerCase();
    const bbox = asset.asset.sheetBBox ?? asset.asset.cropSearchBBox;
    const maxSide = bbox ? Math.max(bbox[2], bbox[3]) : 0;
    const sizeClass = maxSide <= 96 ? "small" : maxSide <= 220 ? "medium" : "large";
    const key = `${type}:${sizeClass}`;
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }

  return Array.from(groups.values()).flatMap((group) => chunkArray(group, 6));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function createBatchAssetReferenceSheet({
  batch,
  imageBytes,
  manifest,
}: {
  batch: PlannedAsset[];
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
}) {
  const sharp = (await import("sharp")).default;
  const sourceWidth = Number(manifest.sheetSize?.width) || 1;
  const sourceHeight = Number(manifest.sheetSize?.height) || 1;
  const padding = 24;
  const gap = 16;
  const cells = batch.map((planned) => {
    const [left, top, width, height] = clampBBox(
      planned.asset.sheetBBox ?? planned.asset.cropSearchBBox ?? [0, 0, 1, 1],
      sourceWidth,
      sourceHeight,
    );
    return { height, left, planned, top, width };
  });
  const columns = Math.min(3, Math.max(1, cells.length));
  const columnWidth = Math.max(...cells.map((cell) => cell.width)) + padding * 2;
  const rows = Math.ceil(cells.length / columns);
  const rowHeights = Array.from({ length: rows }, (_, rowIndex) =>
    Math.max(
      ...cells
        .slice(rowIndex * columns, rowIndex * columns + columns)
        .map((cell) => cell.height + padding * 2),
    ),
  );
  const baseCanvasWidth = roundUpToMultiple(columns * columnWidth + (columns + 1) * gap, 16);
  const baseCanvasHeight = roundUpToMultiple(
    rowHeights.reduce((sum, height) => sum + height, 0) + (rows + 1) * gap,
    16,
  );
  const outputScale = Math.max(
    1,
    MIN_AI_SHEET_SIDE / Math.min(baseCanvasWidth, baseCanvasHeight),
  );
  const canvasWidth = roundUpToMultiple(Math.round(baseCanvasWidth * outputScale), 16);
  const canvasHeight = roundUpToMultiple(Math.round(baseCanvasHeight * outputScale), 16);
  const composites = await Promise.all(
    cells.map(async (cell, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const cellLeft = gap + column * (columnWidth + gap);
      const cellTop =
        gap + rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) + row * gap;
      const assetLeft = Math.round(cellLeft + (columnWidth - cell.width) / 2);
      const assetTop = Math.round(cellTop + (rowHeights[row] - cell.height) / 2);
      const crop = await sharp(imageBytes)
        .ensureAlpha()
        .extract({ height: cell.height, left: cell.left, top: cell.top, width: cell.width })
        .png()
        .toBuffer();

      return {
        asset: {
          ...cell.planned.asset,
          cropSearchBBox: scaleBBoxForOutput(
            [Math.round(cellLeft), Math.round(cellTop), columnWidth, rowHeights[row]],
            outputScale,
          ) as [
            number,
            number,
            number,
            number,
          ],
          id: cell.planned.id,
          semanticName: cell.planned.semanticName,
          sheetBBox: scaleBBoxForOutput(
            [assetLeft, assetTop, cell.width, cell.height],
            outputScale,
          ) as [
            number,
            number,
            number,
            number,
          ],
        },
        input:
          outputScale === 1
            ? crop
            : await sharp(crop)
                .resize({
                  height: Math.max(1, Math.round(cell.height * outputScale)),
                  width: Math.max(1, Math.round(cell.width * outputScale)),
                })
                .png()
                .toBuffer(),
        left: Math.round(assetLeft * outputScale),
        top: Math.round(assetTop * outputScale),
      };
    }),
  );
  const sheetBuffer = await sharp({
    create: {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      channels: 4,
      height: canvasHeight,
      width: canvasWidth,
    },
  })
    .composite(composites.map(({ input, left, top }) => ({ input, left, top })))
    .png()
    .toBuffer();
  const file = new File([toExactArrayBuffer(sheetBuffer)], `ai-chroma-batch.reference.png`, {
    type: "image/png",
  });

  return {
    file,
    manifest: {
      assets: composites.map((composite) => composite.asset),
      sheetSize: {
        height: canvasHeight,
        width: canvasWidth,
      },
      version: manifest.version,
    } satisfies AssetSheetManifest,
    size: `${canvasWidth}x${canvasHeight}`,
  };
}

function buildBatchAssetGenerationPrompt(
  batch: PlannedAsset[],
  reference: { manifest: AssetSheetManifest },
) {
  const columns = Math.min(3, Math.max(1, batch.length));
  const rows = Math.ceil(batch.length / columns);
  const requests = batch
    .map((planned, index) => {
      const prompt = planned.asset.prompt?.trim();
      return `${index + 1}. ${planned.id}${prompt ? `: ${prompt}` : ""}`;
    })
    .join(" | ");
  return [
    "Use case: batched chroma redraw",
    `Asset count: exactly ${batch.length}.`,
    `Grid: ${columns} columns by ${rows} rows. Keep the same reading order and one asset per cell.`,
    `Primary request: Redraw these reference assets as a clean green-screen batch. Requests: ${requests}.`,
    `Output must keep the same canvas size as the input image (${reference.manifest.sheetSize?.width}x${reference.manifest.sheetSize?.height}) and keep each asset centered at the same scale inside its cell.`,
    "Paint every non-asset pixel exact #00ff00. Do not leave transparency, white, gray, black, shadows, labels, guide lines, or borders in the background.",
    "For outline icons, hollow interior areas may be exact #00ff00. Preserve only the visible strokes and filled foreground shapes.",
    "Cleanly redraw the asset edges so there is no white/gray/black fringe or screenshot residue.",
    "Do not add text, labels, watermarks, frames, grid lines, or extra assets.",
  ].join("\n");
}

function roundUpToMultiple(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple;
}

function scaleBBoxForOutput(
  bbox: [number, number, number, number],
  scale: number,
): [number, number, number, number] {
  return [
    Math.round(bbox[0] * scale),
    Math.round(bbox[1] * scale),
    Math.max(1, Math.round(bbox[2] * scale)),
    Math.max(1, Math.round(bbox[3] * scale)),
  ];
}

function toExactArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function clampBBox(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): { 0: number; 1: number; 2: number; 3: number; length: 4 } & [
  number,
  number,
  number,
  number,
] {
  const [x, y, width, height] = bbox;
  const left = Math.max(0, Math.min(Math.floor(x), imageWidth - 1));
  const top = Math.max(0, Math.min(Math.floor(y), imageHeight - 1));
  const right = Math.max(left + 1, Math.min(Math.ceil(x + width), imageWidth));
  const bottom = Math.max(top + 1, Math.min(Math.ceil(y + height), imageHeight));
  return [left, top, right - left, bottom - top] as [
    number,
    number,
    number,
    number,
  ];
}

async function processGeneratedAssetSheetFromUrl({
  imageUrl,
  manifest,
}: {
  imageUrl: string;
  manifest: AssetSheetManifest;
}) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn("[generate-assets] failed to fetch generated image", {
        imageUrl,
        status: response.status,
      });
      return emptyProcessedSheet();
    }

    return processGeneratedAssetSheet({
      imageBytes: Buffer.from(await response.arrayBuffer()),
      manifest,
    });
  } catch (error) {
    console.warn("[generate-assets] failed to process generated image url", error);
    return emptyProcessedSheet();
  }
}

async function processGeneratedAssetSheet({
  imageBytes,
  manifest,
}: {
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
}) {
  if (!hasProcessableAssetBBoxes(manifest)) {
    return emptyProcessedSheet();
  }

  try {
    const [{ mkdtemp, readFile, readdir, rm, writeFile }, { tmpdir }, path, child] =
      await Promise.all([
        import("node:fs/promises"),
        import("node:os"),
        import("node:path"),
        import("node:child_process"),
      ]);
    const tmpRoot = await mkdtemp(path.join(tmpdir(), "ui-assets-"));
    const inputPath = path.join(tmpRoot, "generated-sheet.png");
    const manifestPath = path.join(tmpRoot, "asset-manifest.json");
    const outDir = path.join(tmpRoot, "parts");

    try {
      await writeFile(inputPath, imageBytes);
      await writeFile(manifestPath, JSON.stringify(manifest));
      await execFileAsync(child.execFile, "python3", [
        path.resolve(CHROMA_SCRIPT_PATH),
        "--input",
        inputPath,
        "--out-dir",
        outDir,
        "--manifest",
        manifestPath,
        "--key",
        "green",
        "--padding",
        "0.08",
        "--tolerance",
        "92",
        "--softness",
        "42",
        "--spill-threshold",
        "24",
        "--edge-background-tolerance",
        "28",
        "--neutral-tolerance",
        "28",
        "--isolated-light-luma",
        "245",
        "--icon-halo-luma",
        "240",
        "--icon-halo-chroma",
        "18",
      ]);

      const outputManifest = JSON.parse(
        await readFile(path.join(outDir, "manifest.json"), "utf8"),
      ) as {
        assets?: Array<{
          cellBox?: [number, number, number, number];
          file: string;
          name: string;
        }>;
      };
      const files = await readdir(outDir);
      const pngFiles = new Set(files.filter((file) => file.endsWith(".png")));
      const parts = await Promise.all(
        (outputManifest.assets ?? [])
          .filter((asset) => pngFiles.has(asset.file))
          .map(async (asset) => {
            const bytes = await readFile(path.join(outDir, asset.file));
            const sourceAsset = manifest.assets?.find(
              (candidate) => candidate.id === asset.name,
            );
            const filename = `${sourceAsset?.assetName ?? asset.name}.png`;
            const imageDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
            const quality = await inspectPartImageQuality(imageDataUrl);
            return {
              assetName: sourceAsset?.assetName,
              filename,
              id: asset.name,
              imageDataUrl,
              prompt: sourceAsset?.prompt ?? "",
              semanticName: sourceAsset?.semanticName,
              source: "ai-chroma" as const,
              verification: {
                bboxDelta: 0,
                needsReview: quality.isProbablyBlackBlock || quality.isTooSparse,
                score: quality.isProbablyBlackBlock || quality.isTooSparse ? 0.2 : 0.75,
              },
            };
          }),
      );
      const processedSheetDataUrl = await createProcessedSheetDataUrl({
        assets: outputManifest.assets ?? [],
        manifest,
        outDir,
        path,
        readFile,
      });

      return {
        imageDataUrl: undefined,
        imageUrl: undefined,
        parts,
        processedSheetDataUrl,
      };
    } finally {
      await rm(tmpRoot, { force: true, recursive: true });
    }
  } catch (error) {
    console.warn("[generate-assets] chroma post-processing failed", error);
    return emptyProcessedSheet();
  }
}

function emptyProcessedSheet() {
  return {
    imageDataUrl: undefined as string | undefined,
    imageUrl: undefined as string | undefined,
    parts: [] as GeneratedAssetPart[],
    processedSheetDataUrl: undefined as string | undefined,
  };
}

async function createProcessedSheetDataUrl({
  assets,
  manifest,
  outDir,
  path,
  readFile,
}: {
  assets: Array<{
    cellBox?: [number, number, number, number];
    file: string;
    name: string;
  }>;
  manifest: AssetSheetManifest;
  outDir: string;
  path: typeof import("node:path");
  readFile: typeof import("node:fs/promises").readFile;
}) {
  const width = Math.max(1, Math.round(Number(manifest.sheetSize?.width) || 1));
  const height = Math.max(1, Math.round(Number(manifest.sheetSize?.height) || 1));
  const sharp = (await import("sharp")).default;
  const composites = [];

  for (const asset of assets) {
    if (!asset.cellBox) {
      continue;
    }
    const [left, top, right, bottom] = asset.cellBox;
    const cellWidth = Math.max(1, Math.round(right - left));
    const cellHeight = Math.max(1, Math.round(bottom - top));
    const input = await readFile(path.join(outDir, asset.file));
    const metadata = await sharp(input).metadata();
    const assetWidth = metadata.width ?? cellWidth;
    const assetHeight = metadata.height ?? cellHeight;

    composites.push({
      input,
      left: Math.round(left + (cellWidth - assetWidth) / 2),
      top: Math.round(top + (cellHeight - assetHeight) / 2),
    });
  }

  const buffer = await sharp({
    create: {
      background: { alpha: 1, b: 0, g: 255, r: 0 },
      channels: 4,
      height,
      width,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function inspectPartImageQuality(imageDataUrl: string) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(dataUrlToBuffer(imageDataUrl))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = Math.max(1, info.width * info.height);
  let opaque = 0;
  let darkOpaque = 0;
  let coloredOpaque = 0;

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];

    if (alpha <= 24) {
      continue;
    }

    opaque += 1;
    if (red < 35 && green < 35 && blue < 35) {
      darkOpaque += 1;
    }
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 12) {
      coloredOpaque += 1;
    }
  }

  return {
    darkOpaqueRatio: darkOpaque / Math.max(1, opaque),
    isProbablyBlackBlock:
      opaque / total > 0.72 &&
      darkOpaque / Math.max(1, opaque) > 0.82 &&
      coloredOpaque / Math.max(1, opaque) < 0.08,
    isTooSparse: opaque / total < 0.01,
    opaqueRatio: opaque / total,
  };
}

async function createProcessedSheetFromParts({
  manifest,
  parts,
}: {
  manifest: AssetSheetManifest;
  parts: GeneratedAssetPart[];
}) {
  const width = Math.max(1, Math.round(Number(manifest.sheetSize?.width) || 1));
  const height = Math.max(1, Math.round(Number(manifest.sheetSize?.height) || 1));
  const sharp = (await import("sharp")).default;
  const assetById = new Map(
    (manifest.assets ?? []).map((asset, index) => [
      asset.id ?? `asset_${String(index + 1).padStart(3, "0")}`,
      asset,
    ]),
  );
  const composites = [];

  for (const part of parts) {
    const asset = assetById.get(part.id);
    const bbox = asset?.sheetBBox ?? asset?.cropSearchBBox;
    if (!bbox) {
      continue;
    }
    const quality = await inspectPartImageQuality(part.imageDataUrl);
    if (quality.isProbablyBlackBlock || quality.isTooSparse) {
      console.warn("[generate-assets] skipped low-quality part in sheet preview", {
        darkOpaqueRatio: Number(quality.darkOpaqueRatio.toFixed(3)),
        id: part.id,
        opaqueRatio: Number(quality.opaqueRatio.toFixed(3)),
        source: part.source,
      });
      continue;
    }
    const [left, top, boxWidth, boxHeight] = clampBBox(bbox, width, height);
    const input = dataUrlToBuffer(part.imageDataUrl);
    const fitted = await sharp(input)
      .resize({
        fit: "contain",
        height: boxHeight,
        width: boxWidth,
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const metadata = await sharp(fitted).metadata();
    const assetWidth = metadata.width ?? boxWidth;
    const assetHeight = metadata.height ?? boxHeight;
    composites.push({
      input: fitted,
      left: Math.round(left + (boxWidth - assetWidth) / 2),
      top: Math.round(top + (boxHeight - assetHeight) / 2),
    });
  }

  const buffer = await sharp({
    create: {
      background: { alpha: 1, b: 0, g: 255, r: 0 },
      channels: 4,
      height,
      width,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function dataUrlToBuffer(dataUrl: string) {
  const [, payload = ""] = dataUrl.split(",");
  return Buffer.from(payload, "base64");
}

function hasProcessableAssetBBoxes(manifest: AssetSheetManifest) {
  return Boolean(
    manifest.assets?.some((asset) => asset.cropSearchBBox ?? asset.sheetBBox),
  );
}

function execFileAsync(
  execFile: typeof import("node:child_process").execFile,
  file: string,
  args: string[],
) {
  return new Promise<void>((resolve, reject) => {
    execFile(file, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            [
              error.message,
              stdout ? `stdout: ${stdout}` : null,
              stderr ? `stderr: ${stderr}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
        return;
      }
      resolve();
    });
  });
}

async function postImageEdit(
  config: NonNullable<ReturnType<typeof getImageConfig>>,
  body: FormData,
) {
  const timeout = createTimeoutSignal(ASSET_GENERATION_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      const providerError = summarizeProviderError(response.status, detail);
      console.error("[generate-assets] provider failed", {
        endpoint: config.endpoint,
        model: config.model,
        providerBody: providerError.providerBody,
        providerStatus: providerError.providerStatus,
      });
      throw new Error(providerError.message);
    }

    return (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI asset generation timed out.");
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

async function saveDebugAssetSheet(
  sheet: File,
  meta: Awaited<ReturnType<typeof createAssetSheetMeta>>,
) {
  if (typeof process === "undefined") {
    return undefined;
  }

  try {
    const [{ mkdir, writeFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const debugDir = path.resolve(DEBUG_ASSET_SHEET_DIR);
    const outputPath = path.join(
      debugDir,
      `asset-sheet-${meta.sha256.slice(0, 12)}.png`,
    );
    await mkdir(debugDir, { recursive: true });
    await writeFile(outputPath, Buffer.from(await sheet.arrayBuffer()));
    return outputPath;
  } catch (error) {
    console.warn("[generate-assets] failed to save debug asset sheet", error);
    return undefined;
  }
}

async function normalizeAssetSheetFile(sheet: File) {
  const bytes = await sheet.arrayBuffer();
  return new File([bytes.slice(0)], "asset-sheet.png", {
    type: sheet.type || "image/png",
  });
}

function parseAssetSheetSize(
  widthValue: FormDataEntryValue | null,
  heightValue: FormDataEntryValue | null,
) {
  const width = parsePositiveInteger(widthValue);
  const height = parsePositiveInteger(heightValue);

  if (!width || !height) {
    return null;
  }

  if (width % 16 !== 0 || height % 16 !== 0) {
    return null;
  }

  return {
    height,
    size: `${width}x${height}`,
    width,
  };
}

function parsePositiveInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function createAssetSheetMeta(
  sheet: File,
  dimensions: { height: number; width: number },
) {
  return {
    filename: sheet.name,
    height: dimensions.height,
    mimeType: sheet.type || "application/octet-stream",
    sha256: await sha256Hex(sheet),
    size: sheet.size,
    uploadField: ASSET_SHEET_UPLOAD_FIELD,
    width: dimensions.width,
  };
}

function appendAssetSheet(formData: FormData, sheet: File) {
  formData.append(ASSET_SHEET_UPLOAD_FIELD, sheet, sheet.name);
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
