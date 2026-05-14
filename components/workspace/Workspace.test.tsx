import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Workspace, getGeneratedAssetPartBlob } from "./Workspace";

describe("Workspace", () => {
  it("renders a simplified design page", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    expect(
      screen.getByRole("heading", { name: "AiClip" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "画布" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "检查器" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
  });

  it("does not show removed draft, verification, or slice-preview controls", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    expect(screen.queryByText("草稿")).not.toBeInTheDocument();
    expect(screen.queryByText("未验证")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "切片预览" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "视觉验证" }),
    ).not.toBeInTheDocument();
  });

  it("exports the current manifest as JSON", () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:manifest");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));
    fireEvent.click(screen.getByRole("button", { name: "导出" }));

    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:manifest");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    click.mockRestore();
  });

  it("imports a manifest JSON file", async () => {
    render(<Workspace />);

    const manifest = {
      elements: [
        {
          bbox: [10, 20, 30, 40],
          confidence: 1,
          id: "imported_box",
          needsReview: true,
          reason: "Imported test element.",
          strategy: "crop",
          type: "decoration",
        },
      ],
      sourceImage: {
        height: 100,
        path: "upload://import.png",
        width: 100,
      },
      theme: {
        colors: ["#ffffff"],
        fontStyle: "system",
        radius: [8],
      },
      version: "1.0",
    };
    const file = new File([JSON.stringify(manifest)], "manifest.json", {
      type: "application/json",
    });
    const input = document.querySelector(
      'input[accept="application/json,.json"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByRole("button", { name: "选择元素 imported_box" }),
    ).toBeInTheDocument();
  });

  it("selects the next element that needs review", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    fireEvent.click(
      screen.getByRole("button", { name: "下一个待检" }),
    );

    expect(
      screen.getByRole("button", { name: /选择元素 search_icon_button/ }),
    ).toHaveClass("border-[#0f172a]");
  });

  it("deletes a layer from the right-click menu", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const layer = screen.getAllByRole("button", {
      name: /profile_avatar/,
    })[0];
    fireEvent.contextMenu(layer, { clientX: 120, clientY: 160 });

    fireEvent.click(
      screen.getByRole("button", { name: "删除标注 profile_avatar" }),
    );

    expect(
      screen.queryByRole("button", { name: /profile_avatar/ }),
    ).not.toBeInTheDocument();
  });

  it("deletes a canvas annotation from the right-click menu", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const annotation = screen.getByRole("button", {
      name: "选择元素 profile_avatar",
    });
    fireEvent.contextMenu(annotation, { clientX: 220, clientY: 180 });

    fireEvent.click(
      screen.getByRole("button", { name: "删除标注 profile_avatar" }),
    );

    expect(
      screen.queryByRole("button", { name: "选择元素 profile_avatar" }),
    ).not.toBeInTheDocument();
  });

  it("deletes the selected annotation with Delete", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const annotation = screen.getByRole("button", {
      name: "选择元素 profile_avatar",
    });
    fireEvent.click(annotation);
    fireEvent.keyDown(window, { key: "Delete" });

    expect(
      screen.queryByRole("button", { name: "选择元素 profile_avatar" }),
    ).not.toBeInTheDocument();
  });

  it("closes the right-click menu when clicking elsewhere", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const annotation = screen.getByRole("button", {
      name: "选择元素 profile_avatar",
    });
    fireEvent.contextMenu(annotation, { clientX: 220, clientY: 180 });

    expect(
      screen.getByRole("button", { name: "删除标注 profile_avatar" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("heading", { name: "画布" }));

    expect(
      screen.queryByRole("button", { name: "删除标注 profile_avatar" }),
    ).not.toBeInTheDocument();
  });

  it("zooms the canvas with ctrl wheel", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const resetZoom = screen.getByRole("button", { name: "重置画布缩放" });
    const canvas = resetZoom.closest(".relative");
    expect(canvas).not.toBeNull();

    fireEvent.wheel(canvas as Element, { ctrlKey: true, deltaY: -100 });

    expect(resetZoom).toHaveTextContent("110%");
  });

  it("adds a manual annotation by dragging on the canvas", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));
    fireEvent.click(screen.getByRole("button", { name: "新增标注" }));

    const annotation = screen.getByRole("button", {
      name: "选择元素 profile_avatar",
    });
    const frame = annotation.closest("[data-canvas-frame]");
    expect(frame).not.toBeNull();

    Object.defineProperty(frame, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 844,
        height: 844,
        left: 0,
        right: 390,
        top: 0,
        width: 390,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(frame as Element, {
      clientX: 120,
      clientY: 160,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, {
      clientX: 180,
      clientY: 240,
      pointerId: 1,
    });
    fireEvent.pointerUp(window, {
      clientX: 180,
      clientY: 240,
      pointerId: 1,
    });

    expect(
      screen.getByRole("button", { name: "选择元素 manual_annotation_10" }),
    ).toBeInTheDocument();
  });

  it("adds a manual annotation even when dragging over an existing box", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));
    fireEvent.click(screen.getByRole("button", { name: "新增标注" }));

    const annotation = screen.getByRole("button", {
      name: "选择元素 profile_avatar",
    });
    const frame = annotation.closest("[data-canvas-frame]");
    expect(frame).not.toBeNull();

    Object.defineProperty(frame, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 844,
        height: 844,
        left: 0,
        right: 390,
        top: 0,
        width: 390,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(annotation, {
      clientX: 24,
      clientY: 44,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, {
      clientX: 96,
      clientY: 128,
      pointerId: 1,
    });
    fireEvent.pointerUp(window, {
      clientX: 96,
      clientY: 128,
      pointerId: 1,
    });

    expect(
      screen.getByRole("button", { name: "选择元素 manual_annotation_10" }),
    ).toBeInTheDocument();
  });

  it("switches visible workspace copy between Chinese and English", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(
      screen.getByRole("heading", { name: "Canvas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate UI" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(
      screen.getByRole("heading", { name: "画布" }),
    ).toBeInTheDocument();
  });

  it("shows Chinese explanations for asset pipeline options in Chinese mode", () => {
    render(<Workspace />);

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    const pipeline = screen.getByLabelText("资产处理方式");
    expect(pipeline).toHaveTextContent("ai-chroma（AI 绿幕重绘，默认）");
    expect(pipeline).toHaveTextContent("crop（原图裁剪，保留原像素）");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    const englishPipeline = screen.getByLabelText("Asset pipeline");
    expect(englishPipeline).toHaveTextContent("ai-chroma");
    expect(englishPipeline).toHaveTextContent("crop");
    expect(englishPipeline).not.toHaveTextContent("AI 绿幕重绘");
  });

  it("downloads generated parts from the original data URL bytes", async () => {
    const pngBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const imageDataUrl = `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`;
    const fetchBlob = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])]));

    const blob = await getGeneratedAssetPartBlob(
      {
        imageDataUrl,
        url: "blob:preview-only",
      },
      fetchBlob,
    );

    expect(fetchBlob).not.toHaveBeenCalled();
    expect(await readBlobBytes(blob)).toEqual(pngBytes);
  });
});

function readBlobBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}
