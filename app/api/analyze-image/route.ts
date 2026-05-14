import { normalizeManifest } from "@/core/classify";
import { getServerEnv } from "@/core/env";
import { sanitizeManifestInput, UIManifestSchema } from "@/core/manifest";
import type { UIElement, UIManifest } from "@/core/manifest";
import sharp from "sharp";

const DEFAULT_MODEL = "gpt-5.5";
const AI_ANALYSIS_TIMEOUT_MS = 5 * 60_000;

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

type AnalysisLocale = "en" | "zh";
type AnalysisRegion = {
  height: number;
  image: File;
  originalHeight: number;
  originalWidth: number;
  originalX: number;
  originalY: number;
  width: number;
};

function getAiConfig() {
  const baseUrl = getServerEnv("BASEURL") ?? getServerEnv("AI_BASE_URL");
  const apiKey = getServerEnv("APIKEY") ?? getServerEnv("AI_API_KEY");
  const model = getServerEnv("AI_MODEL") ?? DEFAULT_MODEL;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    model,
  };
}

function getModelWarnings(model: string) {
  if (/gpt-?image/i.test(model)) {
    return [
      `${model} looks like an image generation model. Use a vision-capable chat/reasoning model for screenshot analysis.`,
    ];
  }

  return [];
}

function extractJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not include a JSON object.");
  }

  return JSON.parse(raw.slice(start, end + 1));
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

  if (status === 524 || /timeout occurred/i.test(text)) {
    return "AI provider timed out while analyzing the image. Try again, use a smaller image, or switch to a faster vision model.";
  }

  if (status === 429) {
    return "AI provider rate limit was reached. Please wait a moment and try again.";
  }

  if (status >= 500) {
    return `AI provider returned ${status}. Please try again or switch provider/model.`;
  }

  return [
    `AI analysis failed with ${status}.`,
    text ? `Provider response: ${text.slice(0, 180)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function inspectManifest(manifest: UIManifest, width: number, height: number) {
  const warnings: string[] = [];
  const sourceWidth = manifest.sourceImage.width;
  const sourceHeight = manifest.sourceImage.height;

  if (sourceWidth !== width || sourceHeight !== height) {
    warnings.push(
      `AI returned sourceImage ${sourceWidth}x${sourceHeight}, but upload is ${width}x${height}. Rendering uses upload pixels.`,
    );
  }

  const outOfBoundsElements = manifest.elements.filter((element) => {
    const [x, y, boxWidth, boxHeight] = element.bbox;
    return (
      x < 0 ||
      y < 0 ||
      boxWidth <= 0 ||
      boxHeight <= 0 ||
      x + boxWidth > width ||
      y + boxHeight > height
    );
  });

  if (outOfBoundsElements.length > 0) {
    warnings.push(
      `${outOfBoundsElements.length} bbox values are outside the uploaded image bounds.`,
    );
  }

  return {
    outOfBoundsCount: outOfBoundsElements.length,
    warnings,
  };
}

function normalizeManifestSource({
  height,
  manifest,
  sourceName,
  width,
}: {
  height: number;
  manifest: UIManifest;
  sourceName: string;
  width: number;
}): UIManifest {
  return {
    ...manifest,
    sourceImage: {
      height,
      path: `upload://${sourceName}`,
      width,
    },
  };
}

function normalizeManifestGeometry({
  boundsHeight,
  boundsWidth,
  height,
  manifest,
  offsetX = 0,
  offsetY = 0,
  width,
}: {
  boundsHeight?: number;
  boundsWidth?: number;
  height: number;
  manifest: UIManifest;
  offsetX?: number;
  offsetY?: number;
  width: number;
}): UIManifest {
  const clampWidth = boundsWidth ?? width;
  const clampHeight = boundsHeight ?? height;
  const sourceWidth = manifest.sourceImage.width || width;
  const sourceHeight = manifest.sourceImage.height || height;
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;

  return {
    ...manifest,
    elements: manifest.elements.map((element) => {
      const [rawX, rawY, rawWidth, rawHeight] = element.bbox;
      const scaledX = rawX * scaleX;
      const scaledY = rawY * scaleY;
      const scaledWidth = rawWidth * scaleX;
      const scaledHeight = rawHeight * scaleY;
      return {
        ...element,
        bbox: clampBBox(
          [
            scaledX + offsetX,
            scaledY + offsetY,
            scaledWidth,
            scaledHeight,
          ],
          clampWidth,
          clampHeight,
        ),
      };
    }),
  };
}

type ImagePixels = {
  channels: number;
  data: Buffer;
  height: number;
  width: number;
};

async function readImagePixels(image: File, width: number, height: number) {
  const buffer = Buffer.from(await image.arrayBuffer());
  const source = sharp(buffer).ensureAlpha();
  const metadata = await source.metadata();

  if (metadata.width !== width || metadata.height !== height) {
    return null;
  }

  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  return {
    channels: info.channels,
    data,
    height: info.height,
    width: info.width,
  } satisfies ImagePixels;
}

async function refineManifestBBoxesWithPixels({
  height,
  image,
  manifest,
  width,
}: {
  height: number;
  image: File;
  manifest: UIManifest;
  width: number;
}) {
  const pixels = await readImagePixels(image, width, height);
  if (!pixels) {
    return manifest;
  }

  return {
    ...manifest,
    elements: manifest.elements.map((element) => {
      if (!shouldRefinePixelBBox(element)) {
        return element;
      }

      return {
        ...element,
        bbox: refineBBoxFromVisiblePixels(element.bbox, pixels) ?? element.bbox,
      };
    }),
  };
}

function shouldRefinePixelBBox(element: UIElement) {
  return element.type === "icon" || element.type === "illustration" || element.type === "decoration";
}

function refineBBoxFromVisiblePixels(
  bbox: UIElement["bbox"],
  pixels: ImagePixels,
): UIElement["bbox"] | null {
  const rough = clampBBox(bbox, pixels.width, pixels.height);
  const [x, y, boxWidth, boxHeight] = rough;
  const shorterSide = Math.min(boxWidth, boxHeight);
  const searchPadding = Math.max(6, Math.round(shorterSide * 0.45));
  const searchLeft = clamp(x - searchPadding, 0, pixels.width - 1);
  const searchTop = clamp(y - searchPadding, 0, pixels.height - 1);
  const searchRight = clamp(x + boxWidth + searchPadding, searchLeft + 1, pixels.width);
  const searchBottom = clamp(y + boxHeight + searchPadding, searchTop + 1, pixels.height);
  const background = estimateBackgroundColor(
    pixels,
    searchLeft,
    searchTop,
    searchRight,
    searchBottom,
    rough,
  );
  const threshold = estimateForegroundThreshold(
    pixels,
    searchLeft,
    searchTop,
    searchRight,
    searchBottom,
    rough,
    background,
  );
  const components = findForegroundComponents({
    background,
    pixels,
    searchBottom,
    searchLeft,
    searchRight,
    searchTop,
    threshold,
  });
  const selected = components.filter((component) => {
    if (component.area < 2) {
      return false;
    }

    return bboxIntersects(component.bbox, rough);
  });

  if (selected.length === 0) {
    return null;
  }

  const refined = unionBBoxes(selected.map((component) => component.bbox));
  const roughArea = rough[2] * rough[3];
  const refinedArea = refined[2] * refined[3];

  if (refinedArea <= 0 || refinedArea > roughArea * 3.2) {
    return null;
  }

  return refined;
}

function estimateBackgroundColor(
  pixels: ImagePixels,
  left: number,
  top: number,
  right: number,
  bottom: number,
  rough: UIElement["bbox"],
) {
  const samples: number[][] = [];

  forEachSampledPixel(left, top, right, bottom, (x, y) => {
    if (pointInsideBBox(x, y, rough)) {
      return;
    }
    samples.push(readPixel(pixels, x, y));
  });

  if (samples.length === 0) {
    samples.push(readPixel(pixels, left, top));
  }

  return [0, 1, 2, 3].map((channel) =>
    median(samples.map((sample) => sample[channel] ?? 255)),
  );
}

function estimateForegroundThreshold(
  pixels: ImagePixels,
  left: number,
  top: number,
  right: number,
  bottom: number,
  rough: UIElement["bbox"],
  background: number[],
) {
  const distances: number[] = [];

  forEachSampledPixel(left, top, right, bottom, (x, y) => {
    if (!pointInsideBBox(x, y, rough)) {
      distances.push(colorDistance(readPixel(pixels, x, y), background));
    }
  });

  distances.sort((a, b) => a - b);
  const noise = distances[Math.floor(distances.length * 0.9)] ?? 0;
  return Math.max(16, Math.min(42, noise + 10));
}

function findForegroundComponents({
  background,
  pixels,
  searchBottom,
  searchLeft,
  searchRight,
  searchTop,
  threshold,
}: {
  background: number[];
  pixels: ImagePixels;
  searchBottom: number;
  searchLeft: number;
  searchRight: number;
  searchTop: number;
  threshold: number;
}) {
  const searchWidth = searchRight - searchLeft;
  const searchHeight = searchBottom - searchTop;
  const visited = new Uint8Array(searchWidth * searchHeight);
  const components: Array<{ area: number; bbox: UIElement["bbox"] }> = [];

  function localIndex(x: number, y: number) {
    return (y - searchTop) * searchWidth + (x - searchLeft);
  }

  for (let startY = searchTop; startY < searchBottom; startY += 1) {
    for (let startX = searchLeft; startX < searchRight; startX += 1) {
      const startIndex = localIndex(startX, startY);
      if (visited[startIndex] || !isForegroundPixel(pixels, startX, startY, background, threshold)) {
        visited[startIndex] = 1;
        continue;
      }

      const queue: Array<[number, number]> = [[startX, startY]];
      visited[startIndex] = 1;
      let minX = startX;
      let minY = startY;
      let maxX = startX;
      let maxY = startY;
      let area = 0;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [x, y] = queue[cursor];
        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        for (const [nextX, nextY] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const) {
          if (
            nextX < searchLeft ||
            nextX >= searchRight ||
            nextY < searchTop ||
            nextY >= searchBottom
          ) {
            continue;
          }

          const nextIndex = localIndex(nextX, nextY);
          if (visited[nextIndex]) {
            continue;
          }
          visited[nextIndex] = 1;

          if (isForegroundPixel(pixels, nextX, nextY, background, threshold)) {
            queue.push([nextX, nextY]);
          }
        }
      }

      components.push({
        area,
        bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1],
      });
    }
  }

  return components;
}

function isForegroundPixel(
  pixels: ImagePixels,
  x: number,
  y: number,
  background: number[],
  threshold: number,
) {
  const pixel = readPixel(pixels, x, y);
  if (pixel[3] < 16) {
    return false;
  }
  return colorDistance(pixel, background) >= threshold;
}

function readPixel(pixels: ImagePixels, x: number, y: number) {
  const index = (y * pixels.width + x) * pixels.channels;
  return [
    pixels.data[index] ?? 0,
    pixels.data[index + 1] ?? 0,
    pixels.data[index + 2] ?? 0,
    pixels.data[index + 3] ?? 255,
  ];
}

function colorDistance(a: number[], b: number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function forEachSampledPixel(
  left: number,
  top: number,
  right: number,
  bottom: number,
  callback: (x: number, y: number) => void,
) {
  const step = Math.max(1, Math.floor(Math.max(right - left, bottom - top) / 80));
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      callback(x, y);
    }
  }
}

function pointInsideBBox(x: number, y: number, bbox: UIElement["bbox"]) {
  return x >= bbox[0] && y >= bbox[1] && x < bbox[0] + bbox[2] && y < bbox[1] + bbox[3];
}

function bboxIntersects(a: UIElement["bbox"], b: UIElement["bbox"]) {
  return (
    a[0] < b[0] + b[2] &&
    a[0] + a[2] > b[0] &&
    a[1] < b[1] + b[3] &&
    a[1] + a[3] > b[1]
  );
}

function unionBBoxes(boxes: UIElement["bbox"][]): UIElement["bbox"] {
  const left = Math.min(...boxes.map((bbox) => bbox[0]));
  const top = Math.min(...boxes.map((bbox) => bbox[1]));
  const right = Math.max(...boxes.map((bbox) => bbox[0] + bbox[2]));
  const bottom = Math.max(...boxes.map((bbox) => bbox[1] + bbox[3]));
  return [left, top, right - left, bottom - top];
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function clampBBox(
  bbox: UIElement["bbox"],
  imageWidth: number,
  imageHeight: number,
): UIElement["bbox"] {
  const [x, y, boxWidth, boxHeight] = bbox;
  const left = clamp(Math.floor(x), 0, imageWidth - 1);
  const top = clamp(Math.floor(y), 0, imageHeight - 1);
  const right = clamp(Math.ceil(x + boxWidth), left + 1, imageWidth);
  const bottom = clamp(Math.ceil(y + boxHeight), top + 1, imageHeight);

  return [left, top, right - left, bottom - top];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mergeRegionManifests({
  height,
  manifests,
  sourceName,
  width,
}: {
  height: number;
  manifests: UIManifest[];
  sourceName: string;
  width: number;
}): UIManifest {
  const [firstManifest] = manifests;
  const elements = dedupeElements(
    manifests.flatMap((manifest, regionIndex) =>
      manifest.elements.map((element, elementIndex) => ({
        ...element,
        id: `${element.id || `element_${elementIndex + 1}`}_r${regionIndex + 1}`,
      })),
    ),
  );

  return {
    elements,
    sourceImage: {
      height,
      path: `upload://${sourceName}`,
      width,
    },
    theme: firstManifest?.theme ?? {
      colors: [],
      fontStyle: "system",
      radius: [],
    },
    version: "1.0",
  };
}

function dedupeElements(elements: UIElement[]) {
  const result: UIElement[] = [];

  for (const element of elements) {
    const duplicateIndex = result.findIndex(
      (existing) =>
        existing.type === element.type &&
        existing.strategy === element.strategy &&
        bboxIoU(existing.bbox, element.bbox) > 0.72,
    );

    if (duplicateIndex === -1) {
      result.push(element);
      continue;
    }

    if (element.confidence > result[duplicateIndex].confidence) {
      result[duplicateIndex] = element;
    }
  }

  return result;
}

function bboxIoU(a: UIElement["bbox"], b: UIElement["bbox"]) {
  const left = Math.max(a[0], b[0]);
  const top = Math.max(a[1], b[1]);
  const right = Math.min(a[0] + a[2], b[0] + b[2]);
  const bottom = Math.min(a[1] + a[3], b[1] + b[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a[2] * a[3] + b[2] * b[3] - intersection;

  return union > 0 ? intersection / union : 0;
}

function readAnalysisRegions(formData: FormData): AnalysisRegion[] {
  const regionCount = Number(formData.get("regionCount") ?? 0);
  const regions: AnalysisRegion[] = [];

  for (let index = 0; index < regionCount; index += 1) {
    const image = formData.get(`regionImage${index}`);
    const width = Number(formData.get(`regionWidth${index}`));
    const height = Number(formData.get(`regionHeight${index}`));
    const originalX = Number(formData.get(`regionOriginalX${index}`));
    const originalY = Number(formData.get(`regionOriginalY${index}`));
    const originalWidth = Number(formData.get(`regionOriginalWidth${index}`));
    const originalHeight = Number(formData.get(`regionOriginalHeight${index}`));

    if (
      image instanceof File &&
      [width, height, originalX, originalY, originalWidth, originalHeight].every(
        Number.isFinite,
      ) &&
      width > 0 &&
      height > 0 &&
      originalWidth > 0 &&
      originalHeight > 0
    ) {
      regions.push({
        height,
        image,
        originalHeight,
        originalWidth,
        originalX,
        originalY,
        width,
      });
    }
  }

  return regions;
}

async function analyzeImageWithAi({
  height,
  image,
  locale,
  mode = "region",
  regionIndex,
  regionTotal,
  width,
}: {
  height: number;
  image: File;
  locale: AnalysisLocale;
  mode?: "region";
  regionIndex?: number;
  regionTotal?: number;
  width: number;
}): Promise<UIManifest | null> {
  const config = getAiConfig();

  if (!config) {
    return null;
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const dataUrl = `data:${image.type || "image/png"};base64,${imageBuffer.toString("base64")}`;

  const timeout = createTimeoutSignal(AI_ANALYSIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        response_format: { type: "json_object" },
        messages: [
        {
          role: "system",
          content:
            "You are a strict UI icon and illustration locator. Return only valid JSON matching the requested manifest schema. Do not include markdown.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                mode === "region"
                  ? `Find only icons, illustrations, logos, avatars, and decorative pictorial assets in region ${regionIndex ?? 1} of ${regionTotal ?? 1}. Return a UIManifest JSON object for this region only.`
                  : "Find only icons, illustrations, logos, avatars, and decorative pictorial assets in this UI screenshot. Return a UIManifest JSON object.",
                "Schema requirements:",
                '- version must be "1.0".',
                `- sourceImage must be { "width": ${width}, "height": ${height}, "path": "upload://${image.name}" }.`,
                "- theme.colors is an array of hex colors.",
                "- theme.fontStyle is a short string.",
                "- theme.radius is an array of numbers.",
                "- elements is an array of pictorial asset candidates only.",
                "- Each element needs id, type, bbox [x,y,width,height], strategy, confidence, reason, and needsReview.",
                "- bbox format is [left, top, width, height], not [left, top, right, bottom]. For example, an asset spanning x=20..39 and y=10..29 must be [20,10,20,20].",
                '- type should reflect the visual asset: "icon" for simple functional UI icons, "image" for product/banner/photo content, "avatar" for user photos, "logo" for brand marks, "illustration" for drawn scenes, "background" for background art, and "decoration" only for other visual effects.',
                '- Optional element fields: assetPipeline, assetName, semanticName, prompt, and assetPath.',
                '- assetPipeline must be either "ai-chroma" or "crop". Default to "ai-chroma" for icons, illustrations, decorations, and uncertain assets. Use "crop" only for assets that must preserve original pixels exactly, such as product/banner/photo/avatar/logo/brand/content images or screenshots.',
                '- assetName should be a short lowercase snake_case filename stem, unique within elements, using role and location when useful, such as nav_home_active, nav_category, nav_cart, nav_message, nav_profile, search_icon, banner_main, product_card_01, brand_logo. Do not include file extensions.',
                '- semanticName is optional diagnostic metadata only; it does not choose a generation mode.',
                "- strategy must always be asset.",
                "Coordinate contract:",
                "- bbox coordinates must use ONLY this provided image's pixel coordinate system.",
                "- (0,0) is the top-left corner of the image attached in this request.",
                "- Do not use coordinates from the original full screenshot or from any surrounding page.",
                "- For cropped regions, if an icon appears 20px from the top of this provided crop, y must be 20 even if the crop came from the bottom of the original screenshot.",
                "- Any bbox that uses full-screenshot coordinates is invalid.",
                "- bbox values must be integers and stay inside the uploaded image bounds.",
                "- Before returning, verify every bbox by mentally checking: left + width <= image width and top + height <= image height.",
                "- bbox must cover the complete visible asset boundary in this provided image, with a tiny safety margin so anti-aliased corners and edge pixels are not clipped.",
                "- For icons and small illustrations, leave about 1-3 pixels of breathing room around the visible glyph when possible; for larger illustrations, leave at most 2% of the shorter side. Keep this margin minimal and inside image bounds.",
                "- Do not include surrounding empty padding, tab cells, button backgrounds, card backgrounds, neighboring text labels, guide lines, separators, or unrelated UI surfaces unless they are intentionally part of the asset.",
                "- For simple functional icons, bbox must wrap only the icon glyph/strokes/fill, not the label below it and not the navigation item cell.",
                "- For text+icon buttons or tab items, output the icon bbox only unless the entire button has a complex non-CSS visual treatment that must be extracted.",
                "- Include anti-aliased edge pixels and visible shadow/glow only when they belong to the asset itself.",
                "- If exact edges are uncertain, prefer a boundary that includes all edge pixels instead of cropping any corner, but never expand to a full padded container.",
                "- For crop/regenerate/image/avatar/logo/map/illustration/background assets, bbox must include the complete asset itself so later cropping does not cut off edges, but still exclude unrelated surrounding UI.",
                "- Because this is a cropped region, enumerate every visible icon and illustration inside the region. Do not impose a top-N limit.",
                "- Do not output plain text labels, button captions, search bars, input boxes, tab cells, bottom navigation containers, product cards, generic cards, list rows, price tags, progress bars, rating badges, verification badges, simple dividers, flat buttons, or CSS-rebuildable layout containers.",
                "- Do not mark product photos as icons or illustrations unless the user photo/avatar/logo itself is the intended asset.",
                "- Do not mark whole cards or banners when only a smaller icon or illustration inside should be boxed.",
                "- Ignore only invisible layout guesses, repeated noise, simple separators, and text-only marks.",
                `- User interface language is ${locale === "zh" ? "Chinese" : "English"}.`,
                "",
                "Detection rules:",
                "- Return only visible pictorial assets that a human would outline with a red rectangle when asked to box icons and illustrations.",
                "- Include functional icons, service icons, nav icons, toolbar icons, badges that are mostly icon glyphs, logos, avatars, heart/paw/location/star/shield/camera/headset symbols, and drawn illustration characters/scenes.",
                '- Simple functional icons should be type="icon", strategy="asset", assetPipeline="ai-chroma".',
                '- Complex, branded, or unusual icons should also default to assetPipeline="ai-chroma" unless exact original pixels must be preserved.',
                "- Large drawn hero art or decorative scenes should be type=\"illustration\" and assetPipeline=\"crop\" or \"ai-chroma\".",
                "- Do not regenerate identity or content images such as avatars, user photos, logos, real screenshots, maps, QR codes, or brand marks. Use strategy=asset for these.",
                "- Normal text, product cards, ecommerce product photos, prices, and CSS-rebuildable UI controls are handled later; do not include them in elements.",
                "",
                "Coverage rules:",
                "- Detect every visible functional icon, including icons inside buttons, tabs, toolbars, cards, map controls, list rows, and badges.",
                "- For repeated icon sets, create one element per visible icon instead of one representative icon.",
                "- For a text+icon button, output only the icon as an asset element unless the entire button has a complex visual that should be extracted.",
                "- Include small pictorial decorations such as heart stickers, paw symbols, pet drawings, status icons, and carousel dots only when they are visible graphic assets.",
                "- Ignore tiny accidental noise and purely textual marks.",
                "",
                "Reasoning output rules:",
                locale === "zh"
                  ? "- reason must be written in Simplified Chinese and should briefly explain why this region needs to be extracted as an asset."
                  : "- reason must be written in English and should briefly explain why this region needs to be extracted as an asset.",
                locale === "zh"
                  ? "- If needsReview=true or confidence is below 0.85, prompt is required. The prompt must describe how an image model should process this asset, including transparent background, preserved shape, colors, style, and whether visible text should be kept."
                  : "- If needsReview=true or confidence is below 0.85, prompt is required. The prompt must describe how an image model should process this asset, including transparent background, preserved shape, colors, style, and whether visible text should be kept.",
                "- If confidence is below 0.85, set needsReview=true and include prompt.",
              ].join("\n"),
            },
            {
              type: "image_url",
              image_url: { detail: "high", url: dataUrl },
            },
          ],
        },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `AI analysis timed out after ${Math.round(AI_ANALYSIS_TIMEOUT_MS / 1000)} seconds. Try again, use a smaller image, or switch to a faster vision model.`,
      );
    }

    throw error;
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(summarizeProviderError(response.status, detail));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI analysis response was empty.");
  }

  return UIManifestSchema.parse(sanitizeManifestInput(extractJsonObject(content)));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawLocale = formData.get("locale");
  const locale: AnalysisLocale = rawLocale === "zh" ? "zh" : "en";
  const regions = readAnalysisRegions(formData);
  const originalWidth = Number(formData.get("originalWidth"));
  const originalHeight = Number(formData.get("originalHeight"));
  const sourceNameValue = formData.get("sourceName");
  const sourceName =
    typeof sourceNameValue === "string" && sourceNameValue.trim()
      ? sourceNameValue
      : "source-image";

  if (
    regions.length === 0 ||
    !Number.isFinite(originalWidth) ||
    !Number.isFinite(originalHeight)
  ) {
    return Response.json(
      { error: "Expected at least one analysis region and original image size." },
      { status: 400 },
    );
  }

  if (originalWidth <= 0 || originalHeight <= 0) {
    return Response.json(
      { error: "Image width and height must be positive." },
      { status: 400 },
    );
  }

  try {
    const regionResults = await Promise.all(
      regions.map(async (region, index) => {
        try {
          const aiManifest = await analyzeImageWithAi({
            height: region.height,
            image: region.image,
            locale,
            regionIndex: index + 1,
            regionTotal: regions.length,
            width: region.width,
          });

          if (!aiManifest) {
            return null;
          }

          const inspection = inspectManifest(
            aiManifest,
            region.width,
            region.height,
          );
          const normalizedRegionManifest = normalizeManifest(
            normalizeManifestSource({
              height: region.height,
              manifest: aiManifest,
              sourceName: region.image.name,
              width: region.width,
            }),
          );
          const refinedRegionManifest = await refineManifestBBoxesWithPixels({
            height: region.height,
            image: region.image,
            manifest: normalizedRegionManifest,
            width: region.width,
          });
          const manifest = normalizeManifestGeometry({
            boundsHeight: originalHeight,
            boundsWidth: originalWidth,
            height: region.originalHeight,
            manifest: refinedRegionManifest,
            offsetX: region.originalX,
            offsetY: region.originalY,
            width: region.originalWidth,
          });

          return {
            inspection,
            manifest,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "region analysis failed";
          console.warn("[analyze-image] region analysis failed", {
            error: message,
            region: index + 1,
          });
          return {
            error: `Region ${index + 1} failed: ${message}`,
          };
        }
      }),
    );

    const completedRegionResults = regionResults.filter(
      (
        result,
      ): result is {
        inspection: ReturnType<typeof inspectManifest>;
        manifest: UIManifest;
      } => Boolean(result && "manifest" in result),
    );
    const failedRegionWarnings = regionResults
      .filter(
        (result): result is { error: string } =>
          Boolean(result && "error" in result),
      )
      .map((result) => result.error);
    const regionManifests = completedRegionResults.map(
      (result) => result.manifest,
    );
    const outOfBoundsCount = completedRegionResults.reduce(
      (sum, result) => sum + result.inspection.outOfBoundsCount,
      0,
    );
    const warnings = completedRegionResults.flatMap(
      (result) => result.inspection.warnings,
    );
    const aiConfig = getAiConfig();

    if (regionManifests.length > 0) {
      const normalizedManifest = mergeRegionManifests({
        height: originalHeight,
        manifests: regionManifests,
        sourceName,
        width: originalWidth,
      });
      const meta: AnalysisMeta = {
        elementCount: normalizedManifest.elements.length,
        imageSize: { height: originalHeight, width: originalWidth },
        model: getAiConfig()?.model ?? DEFAULT_MODEL,
        outOfBoundsCount,
        source: "ai",
        sourceImageSize: {
          height: originalHeight,
          width: originalWidth,
        },
        warnings: [
          ...getModelWarnings(getAiConfig()?.model ?? DEFAULT_MODEL),
          `Analyzed ${regions.length} vertical regions; bbox values were merged back to original ${originalWidth}x${originalHeight}.`,
          ...warnings,
          ...failedRegionWarnings,
        ].filter(Boolean) as string[],
      };

      console.info("[analyze-image] AI analysis succeeded", meta);
      return Response.json({ manifest: normalizedManifest, meta });
    }

    if (aiConfig) {
      const message = [
        "AI image analysis failed for all regions.",
        failedRegionWarnings.length > 0
          ? failedRegionWarnings.join(" ")
          : "No region returned a valid manifest.",
      ].join(" ");

      console.error("[analyze-image] AI analysis failed", {
        error: message,
        failedRegions: failedRegionWarnings.length,
      });

      return Response.json(
        {
          error: message,
          meta: {
            error: message,
            imageSize: { height: originalHeight, width: originalWidth },
            model: aiConfig.model,
            source: "ai",
            sourceImageSize: { height: originalHeight, width: originalWidth },
            warnings: [
              ...getModelWarnings(aiConfig.model),
              ...failedRegionWarnings,
            ],
          } satisfies AnalysisMeta,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI analysis failed.";
    console.error("[analyze-image] AI analysis failed", { error: message });

    return Response.json(
      {
        error: message,
        meta: {
          error: message,
          imageSize: { height: originalHeight, width: originalWidth },
          model: getAiConfig()?.model ?? DEFAULT_MODEL,
          source: "ai",
          warnings: getModelWarnings(getAiConfig()?.model ?? DEFAULT_MODEL),
        } satisfies AnalysisMeta,
      },
      { status: 502 },
    );
  }

  const message =
    "AI image analysis is not configured. Set BASEURL and APIKEY, or use the sample image for local mock data.";

  console.error("[analyze-image] AI analysis not configured");
  return Response.json(
    {
      error: message,
      meta: {
        error: message,
        imageSize: { height: originalHeight, width: originalWidth },
        model: DEFAULT_MODEL,
        source: "ai",
        sourceImageSize: { height: originalHeight, width: originalWidth },
        warnings: [],
      } satisfies AnalysisMeta,
    },
    { status: 400 },
  );
}
