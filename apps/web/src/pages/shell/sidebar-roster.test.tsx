// @vitest-environment jsdom

import type { Bot, Space } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarRoster } from "./sidebar-roster";
import { sidebarGroupsForSpaces } from "./space-sidebar";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

const chief = {
  id: "bot-1",
  name: "Chief",
  color: "#3b82f6",
  status: "idle",
  spaceId: "space-1",
  sectionId: null,
  pinned: false,
  unread: false,
  preview: "",
  updatedAt: "2026-11-08T10:00:00.000Z",
} as unknown as Bot;

const sidebarGroups = sidebarGroupsForSpaces<Space["bots"][number], Space["groups"][number]>(
  [{ id: "space-1", name: "Home", bots: [chief], groups: [], botSections: [] }],
  "",
);

function render(mini: boolean) {
  return act(async () =>
    root.render(
      <SidebarRoster
        sidebarGroups={sidebarGroups}
        collapsedSidebarSections={new Set()}
        bootstrapMe={{ spaceId: "space-1" }}
        botSections={[]}
        spaces={[]}
        rosterDropKey={null}
        setRosterDropKey={() => undefined}
        rosterDropAction={() => null}
        applyRosterDrop={() => undefined}
        openSpaceChat={() => undefined}
        spaceMenuAnchor={{ current: null }}
        setSpaceMenu={() => undefined}
        setRenameSectionTarget={() => undefined}
        setDeleteSectionTarget={() => undefined}
        toggleSidebarSection={() => undefined}
        inGroup={false}
        active={undefined}
        activeGroup={undefined}
        botsSidebarDensity="comfortable"
        dismissedRunErrorIds={new Set()}
        displayedRunError={null}
        draggedBotId={null}
        setDraggedBotId={() => undefined}
        botMenu={null}
        setBotMenu={() => undefined}
        reorderRosterBot={() => undefined}
        activeSnapshot={null}
        botMenuContent={null}
        mini={mini}
      />,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps each bot's avatar mounted when the sidebar collapses and expands", async () => {
  const avatar = () => host.querySelector('[data-roster-bot-id="bot-1"] [data-working]');
  await render(false);
  const expanded = avatar();
  expect(expanded).toBeTruthy();

  await render(true);
  expect(avatar()).toBe(expanded);
  expect(host.querySelector('[data-roster-bot-id="bot-1"]')?.getAttribute("aria-label")).toBe(
    "Chief",
  );

  await render(false);
  expect(avatar()).toBe(expanded);
});
