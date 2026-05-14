import { mockManifest } from "./mock-manifest";
import type { UIManifest } from "./manifest";

export function buildMockManifestForSource({
  height,
  path,
  width,
}: {
  height: number;
  path: string;
  width: number;
}): UIManifest {
  const scaleX = width / mockManifest.sourceImage.width;
  const scaleY = height / mockManifest.sourceImage.height;

  return {
    ...mockManifest,
    sourceImage: { height, path, width },
    elements: mockManifest.elements.map((element) => {
      const [x, y, boxWidth, boxHeight] = element.bbox;

      return {
        ...element,
        bbox: [
          Math.round(x * scaleX),
          Math.round(y * scaleY),
          Math.round(boxWidth * scaleX),
          Math.round(boxHeight * scaleY),
        ],
      };
    }),
  };
}
