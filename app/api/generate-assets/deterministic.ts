import { isLikelySmallIcon } from "./planner";
import type { AssetSheetManifest, GeneratedAssetPart, PlannedAsset } from "./types";
import { clampBBox } from "./image-utils";

export async function generateDeterministicParts({
  imageBytes,
  manifest,
  plannedAssets,
}: {
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
  plannedAssets: PlannedAsset[];
}) {
  const parts: GeneratedAssetPart[] = [];

  for (const planned of plannedAssets) {
    if (planned.pipeline === "crop") {
      parts.push(
        await createCropPart({
          imageBytes,
          manifest,
          planned,
        }),
      );
    }
  }

  return { parts };
}

async function createCropPart({
  imageBytes,
  manifest,
  planned,
}: {
  imageBytes: Buffer;
  manifest: AssetSheetManifest;
  planned: PlannedAsset;
}): Promise<GeneratedAssetPart> {
  const sharp = (await import("sharp")).default;
  const bbox = clampBBox(
    planned.asset.sheetBBox ?? planned.asset.cropSearchBBox ?? [0, 0, 1, 1],
    Number(manifest.sheetSize?.width) || 1,
    Number(manifest.sheetSize?.height) || 1,
  );
  const [left, top, width, height] = bbox;
  const extracted = await sharp(imageBytes)
    .ensureAlpha()
    .extract({ height, left, top, width })
    .png()
    .toBuffer();
  const buffer = isLikelySmallIcon(planned.asset)
    ? await cleanReferenceIconNoise(extracted, width, height)
    : extracted;

  return {
    assetName: planned.asset.assetName,
    filename: `${planned.asset.assetName ?? planned.id}.png`,
    id: planned.id,
    imageDataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    prompt: planned.asset.prompt ?? "",
    semanticName: planned.semanticName,
    source: planned.pipeline,
    verification: {
      bboxDelta: 0,
      needsReview: false,
      score: 1,
    },
  };
}

async function cleanReferenceIconNoise(input: Buffer, width: number, height: number) {
  if (Math.max(width, height) > 120) {
    return input;
  }

  const sharp = (await import("sharp")).default;
  const raw = await sharp(input).ensureAlpha().raw().toBuffer();
  const rowDarkCounts = new Array(height).fill(0) as number[];
  const rowOpaqueCounts = new Array(height).fill(0) as number[];
  const columnDarkCounts = new Array(width).fill(0) as number[];
  const columnOpaqueCounts = new Array(width).fill(0) as number[];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = raw[offset];
      const green = raw[offset + 1];
      const blue = raw[offset + 2];
      let alpha = raw[offset + 3];
      const isChromaGreen =
        green > 220 && red < 50 && blue < 50 && green - Math.max(red, blue) > 150;
      if (isChromaGreen) {
        raw[offset + 3] = 0;
        alpha = 0;
      }
      const isOpaque = alpha > 24;
      const isNearBlack = red < 35 && green < 35 && blue < 35;

      if (isOpaque) {
        rowOpaqueCounts[y] += 1;
        columnOpaqueCounts[x] += 1;
      }
      if (isOpaque && isNearBlack) {
        rowDarkCounts[y] += 1;
        columnDarkCounts[x] += 1;
      }
    }
  }

  const rowsToClear = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    if (
      rowDarkCounts[y] >= Math.max(3, width * 0.08) &&
      rowDarkCounts[y] / Math.max(1, rowOpaqueCounts[y]) > 0.7
    ) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const row = y + dy;
        if (row >= 0 && row < height) {
          rowsToClear.add(row);
        }
      }
    }
  }

  const columnsToClear = new Set<number>();
  for (let x = 0; x < width; x += 1) {
    if (
      columnDarkCounts[x] >= Math.max(3, height * 0.08) &&
      columnDarkCounts[x] / Math.max(1, columnOpaqueCounts[x]) > 0.7
    ) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const column = x + dx;
        if (column >= 0 && column < width) {
          columnsToClear.add(column);
        }
      }
    }
  }

  if (rowsToClear.size === 0 && columnsToClear.size === 0) {
    return input;
  }

  for (const y of rowsToClear) {
    for (let x = 0; x < width; x += 1) {
      raw[(y * width + x) * 4 + 3] = 0;
    }
  }
  for (const x of columnsToClear) {
    for (let y = 0; y < height; y += 1) {
      raw[(y * width + x) * 4 + 3] = 0;
    }
  }

  return sharp(raw, { raw: { channels: 4, height, width } }).png().toBuffer();
}
