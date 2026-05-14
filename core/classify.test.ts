import { describe, expect, it } from "vitest";
import { normalizeElementStrategy, normalizeManifest } from "./classify";
import { sanitizeManifestInput, UIManifestSchema, type UIElement } from "./manifest";

function element(overrides: Partial<UIElement>): UIElement {
  return {
    id: "sample",
    type: "button",
    bbox: [10, 20, 100, 40],
    strategy: "regenerate",
    confidence: 0.93,
    reason: "model guess",
    needsReview: false,
    ...overrides,
  };
}

describe("normalizeElementStrategy", () => {
  it("forces the internal strategy to asset", () => {
    const result = normalizeElementStrategy(
      element({ type: "button", strategy: "regenerate" }),
    );

    expect(result.strategy).toBe("asset");
  });

  it("forces asset strategy for image-like identity assets", () => {
    const result = normalizeElementStrategy(
      element({ type: "avatar", strategy: "regenerate" }),
    );

    expect(result.strategy).toBe("asset");
  });

  it("marks low confidence elements for review", () => {
    const result = normalizeElementStrategy(element({ confidence: 0.72 }));

    expect(result.needsReview).toBe(true);
  });
});

describe("normalizeManifest", () => {
  it("keeps visual types and assigns asset pipelines", () => {
    const result = normalizeManifest({
      elements: [
        element({ id: "title", type: "text", strategy: "code" }),
        element({ id: "button", type: "button", strategy: "code" }),
        element({ id: "icon", type: "icon", strategy: "asset" }),
        element({ id: "photo", type: "image", strategy: "asset" }),
      ],
      sourceImage: {
        height: 100,
        path: "upload://source.png",
        width: 100,
      },
      theme: {
        colors: ["#ffffff"],
        fontStyle: "system",
        radius: [8],
      },
      version: "1.0",
    });

    expect(result.elements.map((item) => [item.id, item.type])).toEqual([
      ["title", "text"],
      ["button", "button"],
      ["icon", "icon"],
      ["photo", "image"],
    ]);
    expect(result.elements.find((item) => item.id === "icon")?.assetPipeline).toBe(
      "ai-chroma",
    );
    expect(result.elements.find((item) => item.id === "photo")?.assetPipeline).toBe(
      "crop",
    );
    expect(result.elements.find((item) => item.id === "icon")?.assetName).toBe("top_icon");
    expect(result.elements.every((item) => item.strategy === "asset")).toBe(
      true,
    );
  });

  it("preserves explicit asset names and creates semantic fallback names", () => {
    const result = normalizeManifest({
      elements: [
        element({
          assetName: "Nav Profile!",
          id: "profile",
          semanticName: "user",
          type: "icon",
        }),
        element({
          bbox: [20, 760, 24, 24],
          id: "cart",
          reason: "购物车图标",
          type: "icon",
        }),
      ],
      sourceImage: {
        height: 844,
        path: "upload://source.png",
        width: 390,
      },
      theme: {
        colors: ["#ffffff"],
        fontStyle: "system",
        radius: [8],
      },
      version: "1.0",
    });

    expect(result.elements[0]?.assetName).toBe("nav_profile");
    expect(result.elements[1]?.assetName).toBe("nav_cart");
  });

  it("deduplicates generated asset names", () => {
    const result = normalizeManifest({
      elements: [
        element({ assetName: "nav_icon", id: "first", type: "icon" }),
        element({ assetName: "nav_icon", id: "second", type: "icon" }),
      ],
      sourceImage: {
        height: 844,
        path: "upload://source.png",
        width: 390,
      },
      theme: {
        colors: ["#ffffff"],
        fontStyle: "system",
        radius: [8],
      },
      version: "1.0",
    });

    expect(result.elements.map((item) => item.assetName)).toEqual([
      "nav_icon",
      "nav_icon_02",
    ]);
  });

  it("normalizes legacy svg and review pipelines into ai-chroma", () => {
    const parsed = UIManifestSchema.parse(
      sanitizeManifestInput({
      elements: [
        {
          assetPipeline: "svg-icon",
          bbox: [10, 20, 30, 30],
          confidence: 0.93,
          id: "legacy_svg",
          needsReview: false,
          reason: "legacy value from AI",
          strategy: "asset",
          type: "icon",
        },
        {
          assetPipeline: "review",
          bbox: [50, 20, 30, 30],
          confidence: 0.93,
          id: "legacy_review",
          needsReview: false,
          reason: "legacy value from AI",
          strategy: "asset",
          type: "icon",
        },
      ],
      sourceImage: {
        height: 100,
        path: "upload://source.png",
        width: 100,
      },
      theme: {
        colors: ["#ffffff"],
        fontStyle: "system",
        radius: [8],
      },
      version: "1.0",
      }),
    );
    const result = normalizeManifest(parsed);

    expect(result.elements.map((item) => item.assetPipeline)).toEqual([
      "ai-chroma",
      "ai-chroma",
    ]);
  });
});

describe("sanitizeManifestInput", () => {
  it("coerces common AI state field type mistakes before schema parsing", () => {
    const parsed = UIManifestSchema.parse(
      sanitizeManifestInput({
        elements: [
          {
            bbox: ["10", "20", "30", "40"],
            confidence: "0.82",
            id: "search_input",
            needsReview: "true",
            reason: null,
            state: {
              checked: "false",
              disabled: null,
              placeholder: null,
              value: 123,
            },
            strategy: "code",
            text: null,
            type: "input",
          },
          {
            bbox: [1, 2, 3, 4],
            assetPipeline: "svg-icon",
            confidence: 0.9,
            id: "cart_icon",
            assetName: "Cart Icon@2x",
            needsReview: false,
            reason: "cart",
            strategy: "icon",
            type: "nav",
          },
        ],
        sourceImage: {
          height: 100,
          path: "upload://source.png",
          width: 100,
        },
        theme: {
          colors: ["#ffffff"],
          fontStyle: "system",
          radius: [8],
        },
        version: "1.0",
      }),
    );

    expect(parsed.elements[0]?.bbox).toEqual([10, 20, 30, 40]);
    expect(parsed.elements[0]?.confidence).toBe(0.82);
    expect(parsed.elements[0]?.needsReview).toBe(true);
    expect(parsed.elements[0]?.state).toEqual({
      checked: false,
      value: "123",
    });
    expect(parsed.elements[1]?.strategy).toBe("asset");
    expect(parsed.elements[1]?.type).toBe("icon");
    expect(parsed.elements[1]?.assetName).toBe("cart_icon_2x");
    expect(parsed.elements[1]?.assetPipeline).toBe("ai-chroma");
  });
});
