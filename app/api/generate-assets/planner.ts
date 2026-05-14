import type { AssetPipeline, AssetSheetManifest, PlannedAsset } from "./types";

export function planAssetPipelines(manifest: AssetSheetManifest): PlannedAsset[] {
  return (manifest.assets ?? []).map((asset, index) => {
    const id = asset.id ?? `asset_${String(index + 1).padStart(3, "0")}`;
    const semanticName = asset.semanticName || inferIconSemanticName(asset);

    return {
      asset,
      id,
      pipeline: normalizeAssetPipeline(
        asset.assetPipeline ?? chooseAssetPipeline(asset),
      ),
      semanticName,
    };
  });
}

export function countPlannedPipelines(plannedAssets: PlannedAsset[]) {
  return plannedAssets.reduce<Record<AssetPipeline, number>>(
    (counts, asset) => {
      counts[asset.pipeline] += 1;
      return counts;
    },
    { "ai-chroma": 0, crop: 0 },
  );
}

export function filterManifestForPipeline(
  manifest: AssetSheetManifest,
  plannedAssets: PlannedAsset[],
  pipeline: AssetPipeline,
): AssetSheetManifest {
  const ids = new Set(
    plannedAssets.filter((asset) => asset.pipeline === pipeline).map((asset) => asset.id),
  );

  return {
    ...manifest,
    assets: (manifest.assets ?? []).filter((asset, index) =>
      ids.has(asset.id ?? `asset_${String(index + 1).padStart(3, "0")}`),
    ),
  };
}

export function isLikelySmallIcon(
  asset: NonNullable<AssetSheetManifest["assets"]>[number],
) {
  const bbox = asset.sheetBBox;
  if (!bbox) {
    return false;
  }
  const [, , width, height] = bbox;
  return Math.max(width, height) <= 96 && Math.min(width, height) <= 72;
}

export function assetSearchText(
  asset: NonNullable<AssetSheetManifest["assets"]>[number],
) {
  return [
    asset.id,
    asset.elementType,
    asset.strategy,
    asset.prompt,
    asset.reason,
    asset.text,
    asset.state ? JSON.stringify(asset.state) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeAssetPipeline(input: unknown): AssetPipeline {
  return input === "crop" ? "crop" : "ai-chroma";
}

function chooseAssetPipeline(
  asset: NonNullable<AssetSheetManifest["assets"]>[number],
): AssetPipeline {
  const text = assetSearchText(asset);
  const type = String(asset.elementType ?? "").toLowerCase();
  const strategy = String(asset.strategy ?? "").toLowerCase();

  if (strategy === "regenerate") {
    return "ai-chroma";
  }
  if (type === "illustration" || type === "background") {
    return "ai-chroma";
  }
  if (
    /product|photo|image|banner|avatar|logo|商品|产品|照片|图片|横幅|海报|背景/.test(
      text,
    ) ||
    ["avatar", "image", "logo"].includes(type)
  ) {
    return "crop";
  }
  if (type === "decoration") {
    return isLargeComplexDecoration(asset) ? "ai-chroma" : "crop";
  }
  return "ai-chroma";
}

function isLargeComplexDecoration(
  asset: NonNullable<AssetSheetManifest["assets"]>[number],
) {
  const bbox = asset.sheetBBox;
  if (!bbox) {
    return true;
  }
  const [, , width, height] = bbox;
  return width * height > 18_000 || Math.max(width, height) > 180;
}

function inferIconSemanticName(
  asset: NonNullable<AssetSheetManifest["assets"]>[number],
) {
  const text = assetSearchText(asset);
  const type = String(asset.elementType ?? "").toLowerCase();
  const bbox = asset.sheetBBox;
  const centerX = bbox ? bbox[0] + bbox[2] / 2 : 0;
  const centerY = bbox ? bbox[1] + bbox[3] / 2 : 0;
  const matches: Array<[string, RegExp]> = [
    ["search", /search|magnifier|放大镜|搜索/],
    ["cart", /cart|shopping|trolley|购物车|购物|车/],
    ["message", /message|chat|bubble|comment|消息|聊天|客服/],
    ["user", /profile|user|account|person|mine|我的|个人|用户/],
    ["location", /map|pin|location|marker|地图|导览|定位|位置/],
    ["home", /home|house|首页|主页|房子/],
    ["grid", /category|grid|menu|分类|宫格|九宫格/],
    ["fullscreen", /fullscreen|scan|expand|扫码|扫描|全屏/],
  ];
  const matched = matches.find(([, pattern]) => pattern.test(text))?.[0];
  if (matched) {
    return matched;
  }
  if (
    isLikelySmallIcon(asset) &&
    (type === "decoration" || type === "icon" || !type) &&
    !/product|photo|image|banner|avatar|logo|商品|产品|照片|图片|横幅|海报/.test(text)
  ) {
    if (centerY > 650) {
      if (centerX < 450) {
        return "grid";
      }
      if (centerX < 1100) {
        return "cart";
      }
      return "message";
    }
    if (centerY < 140) {
      if (centerX < 600) {
        return "search";
      }
      if (centerX < 1300) {
        return "message";
      }
      return "fullscreen";
    }
  }
  return undefined;
}
