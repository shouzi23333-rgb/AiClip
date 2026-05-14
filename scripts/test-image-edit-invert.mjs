import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const defaultInput = "app-notice-html/assets/reference.png";
const inputPath = resolve(process.argv[2] ?? defaultInput);
const outputDir = resolve("tmp/image-edit-probe");
const prompt = "Invert the colors of the provided image. Return only the edited image.";

await loadDotEnv(resolve(".env.local"));

const baseUrl = process.env.IMAGE_BASEURL ?? process.env.IMAGE_BASE_URL;
const apiKey = process.env.IMAGE_APIKEY ?? process.env.IMAGE_API_KEY;
const model = process.env.IMAGE_MODEL ?? process.env.AI_IMAGE_MODEL ?? "gpt-image-2";

if (!baseUrl || !apiKey) {
  throw new Error("Missing IMAGE_BASEURL and IMAGE_APIKEY in environment or .env.local.");
}

const inputBytes = await readFile(inputPath);
const inputHash = sha256(inputBytes);
const endpoint = `${baseUrl.replace(/\/$/, "")}/images/edits`;
const formData = new FormData();
const inputFile = new File([inputBytes], basename(inputPath), {
  type: "image/png",
});

formData.append("model", model);
formData.append("image", inputFile, inputFile.name);
formData.append("prompt", prompt);
formData.append("output_format", "png");
formData.append("quality", "high");
formData.append("size", "auto");

console.info("[image-edit-probe] request", {
  endpoint,
  image: {
    filename: inputFile.name,
    mimeType: inputFile.type,
    sha256: inputHash,
    size: inputFile.size,
    uploadField: "image",
  },
  model,
  prompt,
});

const response = await fetch(endpoint, {
  body: formData,
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
  method: "POST",
});

const bodyText = await response.text();

if (!response.ok) {
  console.error("[image-edit-probe] failed", {
    body: bodyText.slice(0, 2000),
    status: response.status,
  });
  process.exit(1);
}

const payload = JSON.parse(bodyText);
const first = payload.data?.[0];

await mkdir(outputDir, { recursive: true });
const copiedInputPath = resolve(outputDir, `pad-${basename(inputPath)}`);
await copyFile(inputPath, copiedInputPath);

if (first?.b64_json) {
  const outputBytes = Buffer.from(first.b64_json, "base64");
  const outputPath = resolve(outputDir, "inverted-output.png");
  await writeFile(outputPath, outputBytes);
  console.info("[image-edit-probe] saved", {
    padImagePath: copiedInputPath,
    outputPath,
    sha256: sha256(outputBytes),
    size: outputBytes.byteLength,
  });
} else if (first?.url) {
  const imageResponse = await fetch(first.url);
  const outputBytes = Buffer.from(await imageResponse.arrayBuffer());
  const outputPath = resolve(outputDir, "inverted-output.png");
  await writeFile(outputPath, outputBytes);
  console.info("[image-edit-probe] saved", {
    padImagePath: copiedInputPath,
    outputPath,
    providerUrl: first.url,
    sha256: sha256(outputBytes),
    size: outputBytes.byteLength,
  });
} else {
  console.error("[image-edit-probe] no image in response", payload);
  process.exit(1);
}

async function loadDotEnv(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const index = trimmed.indexOf("=");
      if (index < 1) {
        continue;
      }

      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      process.env[key] ??= value.replace(/^['"]|['"]$/g, "");
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
