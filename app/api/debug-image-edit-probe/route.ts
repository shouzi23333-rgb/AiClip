import { createHash } from "node:crypto";
import { getServerEnv } from "@/core/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const OUTPUT_DIR = "tmp/debug-image-edit-probe";
const PROMPT =
  "请将我提供的图片中所有素材全部抠图，把背景调整为透明，注意不要修改顺序和比例等";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path")?.trim();
  if (!pathParam) {
    return Response.json(
      { error: "Expected path query parameter for the input image." },
      { status: 400 },
    );
  }

  const inputPath = resolve(pathParam);
  const prompt = url.searchParams.get("prompt") ?? PROMPT;
  const config = getImageConfig();

  if (!config) {
    return Response.json(
      {
        error:
          "Missing image generation API configuration. Set IMAGE_BASEURL and IMAGE_APIKEY, and optionally IMAGE_MODEL.",
      },
      { status: 400 },
    );
  }

  const inputBytes = await readFile(inputPath);
  const inputHash = sha256(inputBytes);
  const inputFile = new File([inputBytes], basename(inputPath), {
    type: "image/png",
  });
  const upstream = new FormData();

  // Keep this request shape exactly aligned with scripts/test-image-edit-invert.mjs.
  upstream.append("model", config.model);
  upstream.append("image", inputFile, inputFile.name);
  upstream.append("prompt", prompt);
  upstream.append("output_format", "png");
  upstream.append("quality", "high");
  upstream.append("size", "auto");

  console.info("[debug-image-edit-probe] request", {
    endpoint: config.endpoint,
    image: {
      filename: inputFile.name,
      mimeType: inputFile.type,
      sha256: inputHash,
      size: inputFile.size,
      uploadField: "image",
    },
    model: config.model,
    prompt,
  });

  const response = await fetch(config.endpoint, {
    body: upstream,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    method: "POST",
  });
  const bodyText = await response.text();

  if (!response.ok) {
    return Response.json(
      {
        body: bodyText.slice(0, 2000),
        error: "Image edit probe failed.",
        status: response.status,
      },
      { status: 502 },
    );
  }

  const payload = JSON.parse(bodyText) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = payload.data?.[0];

  if (!first?.b64_json && !first?.url) {
    return Response.json(
      { error: "Image edit probe response did not include an image.", payload },
      { status: 502 },
    );
  }

  await mkdir(resolve(OUTPUT_DIR), { recursive: true });
  const outputPath = resolve(
    OUTPUT_DIR,
    `probe-output-${Date.now()}.png`,
  );
  const inputCopyPath = resolve(
    OUTPUT_DIR,
    `probe-input-${inputHash.slice(0, 12)}.png`,
  );
  await writeFile(inputCopyPath, inputBytes);

  let outputBytes: Buffer;
  let imageDataUrl: string;
  let providerUrl: string | undefined;

  if (first.b64_json) {
    outputBytes = Buffer.from(first.b64_json, "base64");
    imageDataUrl = `data:image/png;base64,${first.b64_json}`;
  } else {
    providerUrl = first.url;
    const imageResponse = await fetch(first.url as string);
    outputBytes = Buffer.from(await imageResponse.arrayBuffer());
    imageDataUrl = `data:image/png;base64,${outputBytes.toString("base64")}`;
  }

  await writeFile(outputPath, outputBytes);

  return Response.json({
    imageDataUrl,
    input: {
      filename: inputFile.name,
      mimeType: inputFile.type,
      path: inputCopyPath,
      sha256: inputHash,
      size: inputFile.size,
      uploadField: "image",
    },
    model: config.model,
    output: {
      path: outputPath,
      providerUrl,
      sha256: sha256(outputBytes),
      size: outputBytes.byteLength,
    },
    prompt,
  });
}

function getImageConfig() {
  const baseUrl = getServerEnv("IMAGE_BASEURL") ?? getServerEnv("IMAGE_BASE_URL");
  const apiKey = getServerEnv("IMAGE_APIKEY") ?? getServerEnv("IMAGE_API_KEY");
  const model = getServerEnv("IMAGE_MODEL") ?? getServerEnv("AI_IMAGE_MODEL");

  if (!baseUrl || !apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: `${baseUrl.replace(/\/$/, "")}/images/edits`,
    model: model || DEFAULT_IMAGE_MODEL,
  };
}

function sha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
