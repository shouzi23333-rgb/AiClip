import { getServerEnv } from "@/core/env";

const DEFAULT_MODEL = "gpt-5.5";
const SLICE_PLANNING_TIMEOUT_MS = 90_000;

type SlicePlan = {
  height: number;
  reason?: string;
  width: number;
  x: number;
  y: number;
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

function fallbackSlices(width: number, height: number, count: number) {
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
      reason: "fallback vertical slice",
      width,
      x: 0,
      y,
    };
  });
}

function normalizeSlices(input: unknown, width: number, height: number) {
  const rawSlices =
    typeof input === "object" &&
    input !== null &&
    "slices" in input &&
    Array.isArray(input.slices)
      ? input.slices
      : [];

  const slices = rawSlices
    .map((slice): SlicePlan | null => {
      if (typeof slice !== "object" || slice === null) {
        return null;
      }

      const record = slice as Record<string, unknown>;
      const x = clamp(Math.floor(Number(record.x ?? 0)), 0, width - 1);
      const y = clamp(Math.floor(Number(record.y ?? 0)), 0, height - 1);
      const right = clamp(Math.ceil(x + Number(record.width ?? width)), x + 1, width);
      const bottom = clamp(
        Math.ceil(y + Number(record.height ?? height)),
        y + 1,
        height,
      );

      return {
        height: bottom - y,
        reason:
          typeof record.reason === "string" ? record.reason.slice(0, 160) : undefined,
        width: right - x,
        x,
        y,
      };
    })
    .filter((slice): slice is SlicePlan => slice !== null);

  if (slices.length === 0 || !coversFullHeight(slices, height)) {
    return null;
  }

  return slices;
}

function coversFullHeight(slices: SlicePlan[], height: number) {
  const sorted = [...slices].sort((a, b) => a.y - b.y);
  let coveredUntil = 0;
  const gapTolerance = Math.max(2, Math.round(height * 0.01));

  for (const slice of sorted) {
    if (slice.y > coveredUntil + gapTolerance) {
      return false;
    }
    coveredUntil = Math.max(coveredUntil, slice.y + slice.height);
  }

  return coveredUntil >= height - gapTolerance;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function planSlicesWithAi({
  count,
  height,
  image,
  width,
}: {
  count: number;
  height: number;
  image: File;
  width: number;
}) {
  const config = getAiConfig();
  if (!config) {
    return null;
  }

  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const dataUrl = `data:${image.type || "image/jpeg"};base64,${imageBuffer.toString("base64")}`;
  const timeout = createTimeoutSignal(SLICE_PLANNING_TIMEOUT_MS);

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
              "You are a UI screenshot slicing planner. Return only valid JSON. Do not identify UI elements.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Plan image slices for later detailed UI element recognition.",
                  `Image size is ${width}x${height}. Return about ${count} slices.`,
                  'Return JSON: {"slices":[{"x":0,"y":0,"width":number,"height":number,"reason":"short reason"}]}.',
                  "Rules:",
                  "- Prefer slicing along natural UI section boundaries: nav bars, search areas, cards, map panels, lists, tab bars, modals, and large content groups.",
                  "- Preserve context continuity. Include overlap around boundaries so labels, cards, maps, and controls are not cut off.",
                  "- Do not cut through a major card, map, image, modal, bottom tab bar, or visually connected group when a nearby whitespace boundary exists.",
                  "- Vertical slices are preferred for mobile screenshots, but use a shorter/taller region when the structure clearly asks for it.",
                  "- Slices may overlap. Keep every slice inside image bounds.",
                  "- Cover the full image from top to bottom. Avoid tiny slices unless a fixed nav/tab region needs isolation.",
                  "- Do not enumerate elements. Only decide slicing regions.",
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
      return null;
    }

    throw error;
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return normalizeSlices(extractJsonObject(content), width, height);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  const count = clamp(Math.round(Number(formData.get("count") ?? 3)), 1, 8);

  if (
    !(image instanceof File) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return Response.json(
      { error: "Expected image, width, height, and count." },
      { status: 400 },
    );
  }

  try {
    const planned = await planSlicesWithAi({ count, height, image, width });
    return Response.json({
      source: planned ? "ai" : "fallback",
      slices: planned ?? fallbackSlices(width, height, count),
    });
  } catch (error) {
    console.warn("[plan-slices] AI planning failed", error);
    return Response.json({
      source: "fallback",
      slices: fallbackSlices(width, height, count),
    });
  }
}
