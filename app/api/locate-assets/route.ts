import { getServerEnv } from "@/core/env";

const DEFAULT_MODEL = "gpt-5.5";
const ASSET_LOCATION_TIMEOUT_MS = 5 * 60_000;

type LocatedAsset = {
  bbox: [number, number, number, number];
  id: string;
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

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    clear: () => clearTimeout(timeoutId),
    signal: controller.signal,
  };
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

function clampBBox(
  bbox: unknown,
  width: number,
  height: number,
): [number, number, number, number] | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }

  const [rawX, rawY, rawWidth, rawHeight] = bbox.map((value) => Number(value));
  if (
    !Number.isFinite(rawX) ||
    !Number.isFinite(rawY) ||
    !Number.isFinite(rawWidth) ||
    !Number.isFinite(rawHeight) ||
    rawWidth <= 0 ||
    rawHeight <= 0
  ) {
    return null;
  }

  const left = Math.max(0, Math.min(width - 1, Math.floor(rawX)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(rawY)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(rawX + rawWidth)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(rawY + rawHeight)));

  return [left, top, right - left, bottom - top];
}

function parseLocatedAssets(payload: unknown, width: number, height: number) {
  const rawAssets =
    payload &&
    typeof payload === "object" &&
    "assets" in payload &&
    Array.isArray((payload as { assets?: unknown }).assets)
      ? (payload as { assets: unknown[] }).assets
      : [];

  return rawAssets
    .map((asset): LocatedAsset | null => {
      if (!asset || typeof asset !== "object") {
        return null;
      }

      const id = (asset as { id?: unknown }).id;
      const bbox = clampBBox((asset as { bbox?: unknown }).bbox, width, height);
      if (typeof id !== "string" || !id || !bbox) {
        return null;
      }

      return { bbox, id };
    })
    .filter((asset): asset is LocatedAsset => Boolean(asset));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");
  const manifest = formData.get("assetManifest");
  const width = parsePositiveInteger(formData.get("imageWidth"));
  const height = parsePositiveInteger(formData.get("imageHeight"));
  const config = getAiConfig();

  if (!(image instanceof File) || typeof manifest !== "string" || !width || !height) {
    return Response.json(
      {
        error:
          "Expected image file, assetManifest JSON string, imageWidth, and imageHeight.",
      },
      { status: 400 },
    );
  }

  if (!config) {
    return Response.json({ assets: [], model: DEFAULT_MODEL, skipped: true });
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const dataUrl = `data:${image.type || "image/png"};base64,${imageBuffer.toString("base64")}`;
  const timeout = createTimeoutSignal(ASSET_LOCATION_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
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
              "You are a precise image coordinate locator. Return only valid JSON. Do not include markdown.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Locate each requested asset in the provided generated asset sheet image.",
                  `Image size is ${width}x${height} pixels. Coordinates must use this exact pixel coordinate system.`,
                  "Return JSON only with this schema: { \"assets\": [{ \"id\": string, \"bbox\": [x, y, width, height] }] }.",
                  "For each id, find the visible icon/object itself, not the full grid cell, not the checkerboard/white background, and not large surrounding empty space.",
                  "The bbox must fully contain the complete visible asset including strokes, antialiasing, badge dots, shadows, glows, and small detached parts that belong to that same asset.",
                  "Prefer a slightly loose bbox over a tight bbox. Never crop off edges. Add about 2-4 pixels of safety margin around small icons and about 4-8 pixels around larger objects.",
                  "If the image model painted a checkerboard or white background instead of real transparency, ignore that background and locate only the actual asset pixels.",
                  "Do not invent ids. Return exactly the ids from this manifest when visible.",
                  "",
                  "Asset manifest:",
                  manifest,
                ].join("\n"),
              },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.warn("[locate-assets] provider failed", {
        body: detail.slice(0, 1200),
        status: response.status,
      });
      return Response.json(
        { assets: [], error: `AI asset location failed with ${response.status}.` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return Response.json({ assets: [], model: config.model });
    }

    const assets = parseLocatedAssets(extractJsonObject(content), width, height);
    console.info("[locate-assets] located", {
      count: assets.length,
      model: config.model,
    });

    return Response.json({ assets, model: config.model });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI asset location failed.";
    console.warn("[locate-assets] failed", { error: message });
    return Response.json({ assets: [], error: message }, { status: 502 });
  } finally {
    timeout.clear();
  }
}
