import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceCanvas } from "./SourceCanvas";
import { mockManifest } from "@/core/mock-manifest";

describe("SourceCanvas", () => {
  it("renders one button per manifest element", () => {
    render(
      <SourceCanvas
        assetCount={4}
        manifest={mockManifest}
        reviewCount={2}
        selectedElement={mockManifest.elements[0]}
        selectedElementId={mockManifest.elements[0].id}
        onSelectElement={() => {}}
      />,
    );

    expect(screen.getAllByRole("button", { name: /选择元素/ })).toHaveLength(
      mockManifest.elements.length,
    );
  });
});
