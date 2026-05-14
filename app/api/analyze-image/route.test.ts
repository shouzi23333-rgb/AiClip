// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/analyze-image", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("keeps AI bbox coordinates exact instead of adding hidden padding", async () => {
    process.env.BASEURL = "https://api.example.test/v1";
    process.env.APIKEY = "test-key";
    process.env.AI_MODEL = "gpt-5.5";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  elements: [
                    {
                      assetPipeline: "svg-icon",
                      assetName: "nav_profile",
                      bbox: [10, 20, 30, 40],
                      confidence: 0.96,
                      id: "profile_icon",
                      needsReview: false,
                      reason: "用户图标需要作为独立资产提取。",
                      semanticName: "user",
                      strategy: "asset",
                      type: "icon",
                    },
                  ],
                  sourceImage: {
                    height: 100,
                    path: "upload://region.png",
                    width: 100,
                  },
                  theme: {
                    colors: ["#666666"],
                    fontStyle: "system",
                    radius: [],
                  },
                  version: "1.0",
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData(),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result.manifest.elements[0].bbox).toEqual([10, 20, 30, 40]);
    expect(result.manifest.elements[0].assetName).toBe("nav_profile");
  });

  it("uses the actual uploaded region size when AI reports the wrong sourceImage size", async () => {
    process.env.BASEURL = "https://api.example.test/v1";
    process.env.APIKEY = "test-key";
    process.env.AI_MODEL = "gpt-5.5";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  elements: [
                    {
                      assetPipeline: "svg-icon",
                      bbox: [10, 20, 30, 40],
                      confidence: 0.96,
                      id: "profile_icon",
                      needsReview: false,
                      reason: "用户图标需要作为独立资产提取。",
                      semanticName: "user",
                      strategy: "asset",
                      type: "icon",
                    },
                  ],
                  sourceImage: {
                    height: 200,
                    path: "upload://wrong-size.png",
                    width: 200,
                  },
                  theme: {
                    colors: ["#666666"],
                    fontStyle: "system",
                    radius: [],
                  },
                  version: "1.0",
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData(),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result.manifest.elements[0].bbox).toEqual([10, 20, 30, 40]);
    expect(result.meta.warnings).toContain(
      "AI returned sourceImage 200x200, but upload is 100x100. Rendering uses upload pixels.",
    );
  });

  it("keeps adding region offset for valid lower-half region coordinates", async () => {
    process.env.BASEURL = "https://api.example.test/v1";
    process.env.APIKEY = "test-key";
    process.env.AI_MODEL = "gpt-5.5";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  elements: [
                    {
                      assetPipeline: "svg-icon",
                      bbox: [10, 120, 30, 40],
                      confidence: 0.88,
                      id: "lower_region_icon",
                      needsReview: false,
                      reason: "区域下半部分图标需要作为独立资产提取。",
                      semanticName: "user",
                      strategy: "asset",
                      type: "icon",
                    },
                  ],
                  sourceImage: {
                    height: 200,
                    path: "upload://bottom-region.png",
                    width: 100,
                  },
                  theme: {
                    colors: ["#666666"],
                    fontStyle: "system",
                    radius: [],
                  },
                  version: "1.0",
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData({
          originalHeight: 900,
          regionHeight: 200,
          regionOriginalHeight: 200,
          regionOriginalY: 100,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result.manifest.elements[0].bbox).toEqual([10, 220, 30, 40]);
  });

  it("refines icon bbox to visible pixels inside the uploaded region", async () => {
    process.env.BASEURL = "https://api.example.test/v1";
    process.env.APIKEY = "test-key";
    process.env.AI_MODEL = "gpt-5.5";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  elements: [
                    {
                      assetPipeline: "svg-icon",
                      bbox: [21, 18, 16, 18],
                      confidence: 0.96,
                      id: "search_icon",
                      needsReview: false,
                      reason: "搜索图标需要作为独立资产提取。",
                      semanticName: "search",
                      strategy: "asset",
                      type: "icon",
                    },
                  ],
                  sourceImage: {
                    height: 60,
                    path: "upload://icon-region.png",
                    width: 60,
                  },
                  theme: {
                    colors: ["#666666"],
                    fontStyle: "system",
                    radius: [],
                  },
                  version: "1.0",
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData({
          imageBytes: iconRegionPngBytes(),
          originalHeight: 60,
          originalWidth: 60,
          regionHeight: 60,
          regionOriginalHeight: 60,
          regionOriginalWidth: 60,
          regionWidth: 60,
        }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result.manifest.elements[0].bbox).toEqual([18, 18, 24, 24]);
  });

  it("returns an explicit error instead of mock data when configured AI analysis fails", async () => {
    process.env.BASEURL = "https://api.example.test/v1";
    process.env.APIKEY = "test-key";
    process.env.AI_MODEL = "gpt-5.5";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("provider timeout", { status: 524 }),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData(),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(result.manifest).toBeUndefined();
    expect(result.meta.source).toBe("ai");
    expect(result.error).toContain("AI image analysis failed for all regions.");
    expect(result.error).toContain("Region 1 failed:");
  });

  it("returns an explicit error instead of mock data when AI is not configured", async () => {
    delete process.env.BASEURL;
    delete process.env.AI_BASE_URL;
    delete process.env.APIKEY;
    delete process.env.AI_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/analyze-image", {
        body: createAnalyzeFormData(),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
    expect(result.manifest).toBeUndefined();
    expect(result.meta.source).toBe("ai");
    expect(result.error).toContain("AI image analysis is not configured.");
  });
});

function createAnalyzeFormData(overrides: {
  imageBytes?: BlobPart;
  originalHeight?: number;
  originalWidth?: number;
  regionHeight?: number;
  regionOriginalHeight?: number;
  regionOriginalWidth?: number;
  regionOriginalX?: number;
  regionOriginalY?: number;
  regionWidth?: number;
} = {}) {
  const originalWidth = overrides.originalWidth ?? 100;
  const originalHeight = overrides.originalHeight ?? 100;
  const regionWidth = overrides.regionWidth ?? 100;
  const regionHeight = overrides.regionHeight ?? 100;
  const regionOriginalX = overrides.regionOriginalX ?? 0;
  const regionOriginalY = overrides.regionOriginalY ?? 0;
  const regionOriginalWidth = overrides.regionOriginalWidth ?? regionWidth;
  const regionOriginalHeight = overrides.regionOriginalHeight ?? regionHeight;
  const formData = new FormData();
  formData.append("locale", "zh");
  formData.append("originalWidth", String(originalWidth));
  formData.append("originalHeight", String(originalHeight));
  formData.append("sourceName", "source.png");
  formData.append("regionCount", "1");
  formData.append(
    "regionImage0",
    new File([overrides.imageBytes ?? tinyPngBytes()], "region.png", {
      type: "image/png",
    }),
  );
  formData.append("regionWidth0", String(regionWidth));
  formData.append("regionHeight0", String(regionHeight));
  formData.append("regionOriginalX0", String(regionOriginalX));
  formData.append("regionOriginalY0", String(regionOriginalY));
  formData.append("regionOriginalWidth0", String(regionOriginalWidth));
  formData.append("regionOriginalHeight0", String(regionOriginalHeight));
  return formData;
}

function tinyPngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR4nGNkYPj/n4ECwESJ5lEDRg0YNWDUgFEDhgYAgKQDHm6Zgk8AAAAASUVORK5CYII=",
    "base64",
  );
}

function iconRegionPngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAnElEQVR4nO3YwQ1DIQzAUE/L/hu4Q5D/28p5EleUCJ/AGIzBGIzBGIzBGIzBGIzBGIzBGIzBGIzBGIxh6qJzzqPnJxd+yi58AYfsCw/apC/gkE160CZ9AYds0oM26Qs4ZJMetElfwCGb9KBN+gIO2aQHbdIXcMgmXUj6lL5p/wXGYAzGYAzGYAzGYAzGYAzGYAzGYAzGYAzfHuBtH9AHZgbStLPOAAAAAElFTkSuQmCC",
    "base64",
  );
}
