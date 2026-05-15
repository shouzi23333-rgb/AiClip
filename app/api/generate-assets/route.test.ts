// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/generate-assets", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("generates crop parts without calling the image model", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";
    process.env.IMAGE_MODEL = "gpt-image-2";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const inputBytes = tinyPngBytes();

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(inputBytes, cropOnlyManifest()),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.assetSheet).toEqual({
      filename: "asset-sheet.png",
      height: 16,
      mimeType: "image/png",
      sha256: await sha256Hex(new Blob([toArrayBuffer(inputBytes)])),
      size: inputBytes.byteLength,
      uploadField: "image",
      width: 16,
    });
    expect(result.model).toBe("deterministic");
    expect(result.parts).toHaveLength(1);
    expect(result.parts.map((part: { source: string }) => part.source)).toEqual([
      "crop",
    ]);
    expect(result.processedSheetDataUrl).toBeUndefined();
  });

  it("keeps explicit gpt image model overrides for ai-chroma assets", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";
    process.env.GPT_IMAGE_MODEL = "gpt-image-2-vip";

    let model = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      model = String((init?.body as FormData).get("model"));
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from(tinyPngBytes()).toString("base64"),
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await solidPngBytes(160, 160), regenerateManifest(), {
          height: 160,
          width: 160,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(model).toBe("gpt-image-2-vip");
    expect(result.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.model).toBe("gpt-image-2-vip");
  });

  it("keeps IMAGE_MODEL gpt-image-2 for ai-chroma assets", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";
    process.env.IMAGE_MODEL = "gpt-image-2";

    let model = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      model = String((init?.body as FormData).get("model"));
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from(tinyPngBytes()).toString("base64"),
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await solidPngBytes(160, 160), regenerateManifest(), {
          height: 160,
          width: 160,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(model).toBe("gpt-image-2");
    expect(result.model).toBe("gpt-image-2");
  });

  it("does not silently return crop parts when ai-chroma provider fails", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        headers: { "content-type": "application/json" },
        status: 429,
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await solidPngBytes(160, 160), regenerateManifest(), {
          height: 160,
          width: 160,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(result.error).toContain("AI asset generation failed with 429");
    expect(result.parts).toBeUndefined();
  });

  it("cleans chroma background and edge black guide lines from small icon crops", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await noisyIconPngBytes(), noisyIconManifest()),
        method: "POST",
      }),
    );
    const result = await response.json();
    const part = result.parts[0];
    const bytes = Buffer.from(part.imageDataUrl.split(",")[1], "base64");
    const { default: sharp } = await import("sharp");
    const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();

    expect(response.ok).toBe(true);
    expect(part.source).toBe("crop");
    expect(raw[(1 * 16 + 8) * 4 + 3]).toBe(0);
    expect(raw[(8 * 16 + 1) * 4 + 3]).toBe(0);
    expect(raw[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(0);
  });

  it("treats legacy svg-icon assets as ai-chroma instead of svg rendering", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";

    let prompt = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      prompt = String((init?.body as FormData).get("prompt"));
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from(await solidPngBytes(1024, 1024)).toString("base64"),
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await solidPngBytes(32, 32), mapIconManifest(), {
          height: 32,
          width: 32,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();
    const part = result.parts[0];

    expect(response.ok).toBe(true);
    expect(prompt).toContain("asset_map");
    expect(part.source).toBe("ai-chroma");
    expect(part.assetName).toBe("nav_map");
    expect(part.semanticName).toBe("location");
  });

  it("treats legacy review assets as ai-chroma", async () => {
    process.env.IMAGE_BASEURL = "https://image-api.example.test/v1";
    process.env.IMAGE_APIKEY = "test-key";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from(await solidPngBytes(1024, 1024)).toString("base64"),
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/generate-assets", {
        body: createRequestFormData(await solidPngBytes(32, 32), volumeIconManifest(), {
          height: 32,
          width: 32,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();
    const part = result.parts[0];

    expect(response.ok).toBe(true);
    expect(part.source).toBe("ai-chroma");
    expect(part.assetName).toBe("notice_volume");
    expect(part.semanticName).toBe("volume");
  });

});

function createRequestFormData(
  bytes: Uint8Array,
  manifest = JSON.stringify({
    assets: [{ id: "asset_001", prompt: "Keep this asset unchanged." }],
    version: "asset-sheet-1.0",
  }),
  size = { height: 16, width: 16 },
) {
  const formData = new FormData();
  formData.append(
    "assetSheet",
    new File([toArrayBuffer(bytes)], "preview.png", { type: "image/png" }),
  );
  formData.append("assetSheetWidth", String(size.width));
  formData.append("assetSheetHeight", String(size.height));
  formData.append("assetManifest", manifest);
  return formData;
}

function mixedManifest() {
  return JSON.stringify({
    assets: [
      {
        elementType: "icon",
        exportSize: { height: 8, width: 8 },
        id: "asset_icon",
        prompt: "search icon outline",
        sheetBBox: [0, 0, 8, 8],
        strategy: "asset",
      },
      {
        elementType: "image",
        exportSize: { height: 8, width: 8 },
        id: "asset_product",
        prompt: "product photo",
        sheetBBox: [8, 8, 8, 8],
        strategy: "crop",
      },
    ],
    sheetSize: { height: 16, width: 16 },
    version: "asset-sheet-1.0",
  });
}

function cropOnlyManifest() {
  return JSON.stringify({
    assets: [
      {
        assetPipeline: "crop",
        elementType: "image",
        exportSize: { height: 8, width: 8 },
        id: "asset_product",
        prompt: "product photo",
        sheetBBox: [8, 8, 8, 8],
        strategy: "crop",
      },
    ],
    sheetSize: { height: 16, width: 16 },
    version: "asset-sheet-1.0",
  });
}

function regenerateManifest() {
  return JSON.stringify({
    assets: [
      {
        elementType: "decoration",
        exportSize: { height: 160, width: 160 },
        id: "asset_ai",
        prompt: "abstract decoration",
        sheetBBox: [0, 0, 160, 160],
        strategy: "regenerate",
      },
    ],
    sheetSize: { height: 160, width: 160 },
    version: "asset-sheet-1.0",
  });
}

function noisyIconManifest() {
  return JSON.stringify({
    assets: [
      {
        assetPipeline: "crop",
        elementType: "icon",
        exportSize: { height: 16, width: 16 },
        id: "asset_noisy_icon",
        prompt: "small icon with crop guide residue",
        sheetBBox: [0, 0, 16, 16],
        strategy: "asset",
      },
    ],
    sheetSize: { height: 16, width: 16 },
    version: "asset-sheet-1.0",
  });
}

function mapIconManifest() {
  return JSON.stringify({
    assets: [
      {
        assetName: "nav_map",
        assetPipeline: "svg-icon",
        elementType: "icon",
        exportSize: { height: 28, width: 31 },
        id: "asset_map",
        prompt: "底部导航中的手绘地图图标是功能性导航图标",
        reason: "底部导航中的手绘地图图标是功能性导航图标，需要单独提取。",
        sheetBBox: [0, 0, 31, 28],
        strategy: "asset",
      },
    ],
    sheetSize: { height: 32, width: 32 },
    version: "asset-sheet-1.0",
  });
}

function volumeIconManifest() {
  return JSON.stringify({
    assets: [
      {
        assetName: "notice_volume",
        assetPipeline: "review",
        elementType: "icon",
        exportSize: { height: 24, width: 24 },
        id: "asset_volume",
        prompt: "公告栏左侧喇叭为提示播报功能图标",
        semanticName: "volume",
        sheetBBox: [0, 0, 24, 24],
        strategy: "asset",
      },
    ],
    sheetSize: { height: 32, width: 32 },
    version: "asset-sheet-1.0",
  });
}

async function noisyIconPngBytes() {
  const width = 16;
  const height = 16;
  const raw = Buffer.alloc(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    raw[index * 4] = 0;
    raw[index * 4 + 1] = 255;
    raw[index * 4 + 2] = 0;
    raw[index * 4 + 3] = 255;
  }

  for (let x = 3; x < 13; x += 1) {
    raw[(1 * width + x) * 4] = 0;
    raw[(1 * width + x) * 4 + 1] = 0;
    raw[(1 * width + x) * 4 + 2] = 0;
  }
  for (let y = 3; y < 13; y += 1) {
    raw[(y * width + 1) * 4] = 0;
    raw[(y * width + 1) * 4 + 1] = 0;
    raw[(y * width + 1) * 4 + 2] = 0;
  }
  for (let y = 6; y < 11; y += 1) {
    for (let x = 6; x < 11; x += 1) {
      raw[(y * width + x) * 4] = 102;
      raw[(y * width + x) * 4 + 1] = 102;
      raw[(y * width + x) * 4 + 2] = 102;
    }
  }

  const { default: sharp } = await import("sharp");
  return Uint8Array.from(
    await sharp(raw, { raw: { channels: 4, height, width } }).png().toBuffer(),
  );
}

function tinyPngBytes() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR4nGNkYPj/n4ECwESJ5lEDRg0YNWDUgFEDhgYAgKQDHm6Zgk8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
}

async function solidPngBytes(width: number, height: number) {
  const { default: sharp } = await import("sharp");
  return Uint8Array.from(
    await sharp({
      create: {
        background: { alpha: 1, b: 0, g: 255, r: 0 },
        channels: 4,
        height,
        width,
      },
    })
      .png()
      .toBuffer(),
  );
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
