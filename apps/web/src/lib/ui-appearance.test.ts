import { describe, expect, it } from "vitest";
import { applyPalette, applyResolvedAppearance, readSystemAppearance } from "./ui-appearance";

describe("ui-appearance", () => {
  it("treats matching light media as light", () => {
    expect(readSystemAppearance({ matches: true })).toBe("light");
    expect(readSystemAppearance({ matches: false })).toBe("dark");
  });

  it("marks the root with a palette only while that palette is chosen", () => {
    const root = { dataset: {} as DOMStringMap };
    applyPalette("graphite", root as unknown as HTMLElement);
    expect(root.dataset.palette).toBe("graphite");
    applyPalette("paper", root as unknown as HTMLElement);
    expect(root.dataset.palette).toBe("paper");
    applyPalette("dark", root as unknown as HTMLElement);
    expect(root.dataset.palette).toBeUndefined();
  });

  it("writes data-theme and color-scheme on the root", () => {
    const root = {
      dataset: {} as DOMStringMap,
      style: { colorScheme: "" },
    };
    applyResolvedAppearance("light", root as unknown as HTMLElement);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});
