import { z } from "zod";

export const RestoreStrategySchema = z.enum([
  "asset",
  "code",
  "crop",
  "regenerate",
  "ignore",
]);

export const UIElementTypeSchema = z.enum([
  "text",
  "button",
  "checkbox",
  "input",
  "card",
  "dropdown",
  "navbar",
  "radio",
  "slider",
  "switch",
  "tabbar",
  "list",
  "icon",
  "image",
  "avatar",
  "logo",
  "illustration",
  "background",
  "decoration",
]);

export const BBoxSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const AssetPipelineSchema = z.enum([
  "crop",
  "ai-chroma",
]);

export const UIElementStateSchema = z.object({
  active: z.boolean().optional(),
  checked: z.boolean().optional(),
  disabled: z.boolean().optional(),
  expanded: z.boolean().optional(),
  indeterminate: z.boolean().optional(),
  open: z.boolean().optional(),
  placeholder: z.string().optional(),
  selected: z.boolean().optional(),
  value: z.string().optional(),
});

export const UIElementSchema = z.object({
  id: z.string(),
  type: UIElementTypeSchema,
  bbox: BBoxSchema,
  groupId: z.string().optional(),
  parentId: z.string().optional(),
  repeatGroup: z.string().optional(),
  state: UIElementStateSchema.optional(),
  text: z.string().optional(),
  strategy: RestoreStrategySchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  assetPipeline: AssetPipelineSchema.optional(),
  assetName: z.string().optional(),
  prompt: z.string().optional(),
  assetPath: z.string().optional(),
  semanticName: z.string().optional(),
  needsReview: z.boolean(),
});

export const UIManifestSchema = z.object({
  version: z.literal("1.0"),
  sourceImage: z.object({
    width: z.number(),
    height: z.number(),
    path: z.string(),
  }),
  theme: z.object({
    colors: z.array(z.string()),
    fontStyle: z.string(),
    radius: z.array(z.number()),
    shadowStyle: z.string().optional(),
  }),
  elements: z.array(UIElementSchema),
});

export type RestoreStrategy = z.infer<typeof RestoreStrategySchema>;
export type AssetPipeline = z.infer<typeof AssetPipelineSchema>;
export type UIElementType = z.infer<typeof UIElementTypeSchema>;
export type UIElement = z.infer<typeof UIElementSchema>;
export type UIManifest = z.infer<typeof UIManifestSchema>;

const booleanStateKeys = [
  "active",
  "checked",
  "disabled",
  "expanded",
  "indeterminate",
  "open",
  "selected",
] as const;

const stringStateKeys = ["placeholder", "value"] as const;

export function sanitizeManifestInput(input: unknown) {
  if (!isRecord(input)) {
    return input;
  }

  return {
    ...input,
    elements: Array.isArray(input.elements)
      ? input.elements.map(sanitizeElementInput)
      : input.elements,
  };
}

function sanitizeElementInput(input: unknown) {
  if (!isRecord(input)) {
    return input;
  }
  const strategy = input.strategy === "icon" ? "asset" : input.strategy;
  const type = sanitizeElementTypeInput(input.type);

  return {
    ...input,
    bbox: Array.isArray(input.bbox)
      ? input.bbox.map((value) => coerceNumber(value))
      : input.bbox,
    confidence:
      input.confidence === undefined ? input.confidence : coerceNumber(input.confidence),
    needsReview:
      input.needsReview === undefined
        ? input.needsReview
        : coerceBoolean(input.needsReview),
    prompt: coerceOptionalString(input.prompt),
    reason:
      typeof input.reason === "string" ? input.reason : String(input.reason ?? ""),
    assetPipeline: sanitizeAssetPipelineInput(input.assetPipeline),
    assetName: sanitizeAssetNameInput(input.assetName),
    semanticName: coerceOptionalString(input.semanticName),
    state: sanitizeElementStateInput(input.state),
    strategy,
    text: coerceOptionalString(input.text),
    type,
  };
}

function sanitizeAssetNameInput(input: unknown) {
  if (typeof input !== "string") {
    return undefined;
  }

  const name = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

  return name || undefined;
}

function sanitizeElementTypeInput(input: unknown) {
  if (typeof input !== "string") {
    return "decoration";
  }

  const normalized = input.trim().toLowerCase();
  const aliases: Record<string, string> = {
    banner: "image",
    chat: "icon",
    goods: "image",
    menu: "icon",
    nav: "icon",
    navigation: "icon",
    photo: "image",
    product: "image",
    profile: "icon",
    tab: "icon",
  };
  const candidate = aliases[normalized] ?? normalized;

  return UIElementTypeSchema.options.includes(candidate as UIElementType)
    ? candidate
    : "decoration";
}

function sanitizeAssetPipelineInput(input: unknown) {
  if (input === "crop" || input === "ai-chroma") {
    return input;
  }

  if (
    input === "ai" ||
    input === "regenerate" ||
    input === "review" ||
    input === "svg-icon" ||
    input === "svg" ||
    input === "icon"
  ) {
    return "ai-chroma";
  }

  return undefined;
}

function sanitizeElementStateInput(input: unknown) {
  if (!isRecord(input)) {
    return undefined;
  }

  const state: Record<string, boolean | string> = {};

  for (const key of booleanStateKeys) {
    const value = coerceOptionalBoolean(input[key]);
    if (value !== undefined) {
      state[key] = value;
    }
  }

  for (const key of stringStateKeys) {
    const value = coerceOptionalString(input[key]);
    if (value !== undefined) {
      state[key] = value;
    }
  }

  return Object.keys(state).length > 0 ? state : undefined;
}

function coerceNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function coerceBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return Boolean(value);
}

function coerceOptionalBoolean(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return coerceBoolean(value);
}

function coerceOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "string" ? value : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
