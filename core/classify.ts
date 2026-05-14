import type { UIElement, UIManifest } from "./manifest";

export function normalizeElementStrategy(element: UIElement): UIElement {
  const needsReview = element.needsReview || element.confidence < 0.85;
  const semanticName = element.semanticName ?? inferSemanticName(element);
  const assetPipeline = normalizeAssetPipeline(
    element.assetPipeline ??
      inferAssetPipeline({
      ...element,
      semanticName,
      }),
  );

  return {
    ...element,
    assetPipeline,
    assetName: sanitizeAssetName(
      element.assetName ?? createAssetName({ ...element, assetPipeline, semanticName }),
    ),
    prompt:
      needsReview && !element.prompt
        ? createDefaultAssetPrompt(element)
        : element.prompt,
    semanticName,
    strategy: "asset",
    needsReview,
  };
}

function normalizeAssetPipeline(input: UIElement["assetPipeline"]) {
  return input === "crop" ? "crop" : "ai-chroma";
}

function createAssetName(element: UIElement) {
  const base = [
    inferLocationPrefix(element),
    element.semanticName ?? element.type ?? element.assetPipeline,
    inferStateSuffix(element),
  ]
    .filter(Boolean)
    .join("_");

  return sanitizeAssetName(base || element.id || "asset");
}

function inferLocationPrefix(element: UIElement) {
  const [, y] = element.bbox;
  const text = elementSearchText(element);
  if (/nav|tab|bottom|底部|导航|tabbar/.test(text) || y > 650) {
    return "nav";
  }
  if (/search|top|header|顶部/.test(text) || y < 140) {
    return "top";
  }
  return undefined;
}

function inferStateSuffix(element: UIElement) {
  const text = elementSearchText(element);
  if (element.state?.active || element.state?.selected || /active|selected|选中|当前/.test(text)) {
    return "active";
  }
  return undefined;
}

function sanitizeAssetName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function inferAssetPipeline(element: UIElement) {
  const text = elementSearchText(element);
  if (element.strategy === "regenerate" || /illustration|decoration|background|插画|装饰|背景/.test(text)) {
    return "ai-chroma" as const;
  }
  if (
    /product|photo|image|banner|avatar|logo|商品|产品|照片|图片|横幅|海报/.test(text) ||
    ["avatar", "image", "logo"].includes(element.type)
  ) {
    return "crop" as const;
  }
  return needsHumanReview(element) || element.type === "icon" || isLikelySmallIcon(element)
    ? ("ai-chroma" as const)
    : ("crop" as const);
}

function inferSemanticName(element: UIElement) {
  const text = elementSearchText(element);
  const matches: Array<[string, RegExp]> = [
    ["search", /search|magnifier|放大镜|搜索/],
    ["cart", /cart|shopping|trolley|购物车|购物/],
    ["message", /message|chat|bubble|comment|消息|聊天|客服/],
    ["user", /profile|user|account|person|mine|我的|个人|用户/],
    ["location", /map|pin|location|marker|地图|导览|定位|位置/],
    ["home", /home|house|首页|主页|房子/],
    ["grid", /category|grid|menu|分类|宫格|九宫格/],
    ["fullscreen", /fullscreen|scan|expand|扫码|扫描|全屏/],
  ];
  return matches.find(([, pattern]) => pattern.test(text))?.[0];
}

function elementSearchText(element: UIElement) {
  return [
    element.id,
    element.type,
    element.strategy,
    element.prompt,
    element.reason,
    element.text,
    element.state ? JSON.stringify(element.state) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isLikelySmallIcon(element: UIElement) {
  const [, , width, height] = element.bbox;
  return Math.max(width, height) <= 96 && Math.min(width, height) <= 72;
}

function needsHumanReview(element: UIElement) {
  return element.needsReview || element.confidence < 0.85;
}

export function normalizeManifest(manifest: UIManifest): UIManifest {
  const usedNames = new Map<string, number>();
  return {
    ...manifest,
    elements: manifest.elements.map((element) => {
      const normalized = normalizeElementStrategy(element);
      return {
        ...normalized,
        assetName: createUniqueAssetName(normalized.assetName ?? normalized.id, usedNames),
      };
    }),
  };
}

function createUniqueAssetName(value: string, usedNames: Map<string, number>) {
  const base = sanitizeAssetName(value) || "asset";
  const count = usedNames.get(base) ?? 0;
  usedNames.set(base, count + 1);
  return count === 0 ? base : `${base}_${String(count + 1).padStart(2, "0")}`;
}

function createDefaultAssetPrompt(element: UIElement) {
  return [
    "Extract this visual region as a standalone transparent PNG asset.",
    "Preserve the visible shape, colors, proportions, and details.",
    "Remove surrounding background unless it is part of the asset.",
    "Keep visible text only if it belongs to the asset itself.",
  ].join(" ");
}
