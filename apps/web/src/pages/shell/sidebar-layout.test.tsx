// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BotsSidebarLayout } from "./sidebar-layout";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <BotsSidebarLayout
        userId="user"
        collapsed={false}
        onCollapsedChange={() => undefined}
        onPreviewCollapsedChange={() => undefined}
        computerOpen={false}
      >
        <div data-slot="sidebar" />
      </BotsSidebarLayout>,
    ),
  );
  const edge = host.querySelector("hr")!;
  edge.setPointerCapture = vi.fn();
  edge.hasPointerCapture = vi.fn(() => true);
  edge.releasePointerCapture = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function pointer(type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  await act(async () => host.querySelector("hr")!.dispatchEvent(event));
}

const width = (element: Element | null) =>
  (element as HTMLElement).style.getPropertyValue("--sidebar-width");

it("restyles only the sidebar while dragging, and the whole shell once on release", async () => {
  const shell = host.querySelector('[data-slot="sidebar-wrapper"]');
  const sidebar = host.querySelector('[data-slot="sidebar"]');
  expect(width(shell)).toBe("316px");

  await pointer("pointerdown", 316);
  await pointer("pointermove", 360);
  await pointer("pointermove", 400);
  expect(width(shell)).toBe("316px");
  expect(width(sidebar)).toBe("400px");

  await pointer("pointerup", 400);
  expect(width(shell)).toBe("400px");
  expect(width(sidebar)).toBe("");
});
