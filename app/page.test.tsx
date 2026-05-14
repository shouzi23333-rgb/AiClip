import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("keeps the original workspace flow on one page", () => {
    render(<Home />);

    expect(screen.getByText("请上传图片")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /选择元素/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "使用示例图" }));

    expect(screen.getByRole("heading", { name: "画布" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /选择元素 profile_avatar/ }),
    ).toBeInTheDocument();
  });
});
