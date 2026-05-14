// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/plan-slices", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("falls back when AI slices do not cover the full image height", async () => {
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
                  slices: [
                    {
                      height: 120,
                      reason: "misses the bottom",
                      width: 100,
                      x: 0,
                      y: 0,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/plan-slices", {
        body: createRequestFormData({ count: 2, height: 300, width: 100 }),
        method: "POST",
      }),
    );
    const result = await response.json();

    expect(response.ok).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.slices).toHaveLength(2);
    expect(result.slices[0].y).toBe(0);
    expect(result.slices[1].y + result.slices[1].height).toBe(300);
  });
});

function createRequestFormData({
  count,
  height,
  width,
}: {
  count: number;
  height: number;
  width: number;
}) {
  const formData = new FormData();
  formData.append(
    "image",
    new File([tinyPngBytes()], "source.png", { type: "image/png" }),
  );
  formData.append("width", String(width));
  formData.append("height", String(height));
  formData.append("count", String(count));
  return formData;
}

function tinyPngBytes() {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR4nGNkYPj/n4ECwESJ5lEDRg0YNWDUgFEDhgYAgKQDHm6Zgk8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
}
