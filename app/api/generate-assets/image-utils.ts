export function clampBBox(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): [number, number, number, number] {
  const [x, y, width, height] = bbox;
  const left = Math.max(0, Math.min(Math.floor(x), imageWidth - 1));
  const top = Math.max(0, Math.min(Math.floor(y), imageHeight - 1));
  const right = Math.max(left + 1, Math.min(Math.ceil(x + width), imageWidth));
  const bottom = Math.max(top + 1, Math.min(Math.ceil(y + height), imageHeight));
  return [left, top, right - left, bottom - top];
}

export function dataUrlToBuffer(dataUrl: string) {
  const [, payload = ""] = dataUrl.split(",");
  return Buffer.from(payload, "base64");
}
