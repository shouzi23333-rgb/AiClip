// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/debug-image-edit-probe", () => {
  it("requires an explicit input path instead of using a local default path", async () => {
    const response = await GET(
      new Request("http://localhost/api/debug-image-edit-probe"),
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toContain("Expected path query parameter");
  });
});
