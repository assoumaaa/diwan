// @vitest-environment jsdom
import type { ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { reduceThreadSnapshot } from "@rakazo/core";
import type { ReactNode } from "react";
import { act, useCallback, useMemo, useRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rpc } from "../../lib/rpc";
import { useTranscriptView } from "../../lib/transcript-projection";
import { Transcript } from "./transcript";

const messageRenders = vi.hoisted(() => new Map<string, number>());

vi.mock("./message-view", async () => {
  const { createElement, memo } = await import("react");
  return {
    MessageView: memo(function MessageView({ message }: { message: { id: string } }) {
      messageRenders.set(message.id, (messageRenders.get(message.id) ?? 0) + 1);
      return createElement("div", { "data-testid": `message-${message.id}` });
    }),
  };
});

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => String.raw(strings, ...values),
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  messageRenders.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollTo = () => undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function message(id: string, text: string): ThreadMessage {
  return {
    id,
    threadId: "thread",
    seq: 1,
    role: "bot",
    createdAt: "2026-10-30T12:00:00.000Z",
    blocks: [{ kind: "text", text }],
  };
}

function thread(messages: ThreadMessage[]): ThreadSnapshot {
  return { threadId: "thread", botId: "bot", cursor: 0, messages, olderCursor: null, run: null };
}

function Host({ snapshot }: { snapshot: ThreadSnapshot }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const artifactTarget = useMemo(() => ({ botId: "bot" }), []);
  const { view, expandPeerMarker } = useTranscriptView({
    snapshot,
    meId: "me",
    showToolActivity: false,
    unreadAfterSeq: null,
  });
  const reply = useCallback(() => undefined, []);
  const quote = useCallback(() => undefined, []);
  const peer = useCallback(() => undefined, []);
  const refresh = useCallback(async () => undefined, []);
  const answer = useCallback(async () => undefined, []);
  const react = useCallback(async () => undefined, []);
  return (
    <Transcript
      rpc={rpc}
      scrollRef={scrollRef}
      scrollRequest={null}
      onScrollRequestHandled={reply}
      followRequest={0}
      artifactTarget={artifactTarget}
      view={view}
      onExpandPeerMarker={expandPeerMarker}
      loadingOlder={false}
      onLoadOlder={reply}
      onOpenBot={reply}
      onAnswer={answer}
      onReply={reply}
      onMarkUnread={reply}
      onQuote={quote}
      onReact={react}
      onJumpToMessage={reply}
      onOpenPeerMessages={peer}
      peerBot={peer}
      onRefresh={refresh}
      onBotChanged={refresh}
      onAddRoutine={quote}
      voiceReady={false}
      speakingMessageId={null}
      callHoldsSpeaker={false}
      onSpeak={reply}
      onOpenComputer={reply}
    />
  );
}

it.each([false, true])(
  "leaves an unchanged message unrendered when a later one updates (mentions: %s)",
  (withMentions) => {
    const kept = message("kept", "Earlier");
    const announcement: ThreadMessage = {
      ...message("announcement", ""),
      blocks: [{ kind: "child_bot", botId: "child", name: "Planner", status: "created" }],
    };
    const earlier = withMentions ? [announcement, kept] : [kept];
    const live = message("progress:run", "Draft");
    act(() => root.render(<Host snapshot={thread([...earlier, live])} />));
    expect(messageRenders.get("kept")).toBe(1);
    expect(messageRenders.get("progress:run")).toBe(1);

    act(() =>
      root.render(
        <Host snapshot={thread([...earlier, message("progress:run", "Draft continues")])} />,
      ),
    );
    expect(messageRenders.get("kept")).toBe(1);
    expect(messageRenders.get("progress:run")).toBe(2);
    if (withMentions) {
      expect(messageRenders.has("announcement")).toBe(false);
      const renamed: ThreadMessage = {
        ...announcement,
        blocks: [{ kind: "child_bot", botId: "child", name: "Writer", status: "created" }],
      };
      act(() => root.render(<Host snapshot={thread([renamed, kept, live])} />));
      expect(messageRenders.get("kept")).toBe(2);
    }
  },
);

it("redraws a page card's reply only when a newer card supersedes it", () => {
  const card = (id: string, version: number): ThreadMessage => ({
    ...message(id, ""),
    botId: "bot",
    blocks: [{ kind: "page", pageId: "page", version, title: "Plan" }],
  });
  const reply = { ...message("reply", "Here is the plan"), botId: "bot" };
  const earlier = [card("card", 1), reply];
  act(() =>
    root.render(<Host snapshot={thread([...earlier, message("progress:run", "Draft")])} />),
  );
  act(() =>
    root.render(
      <Host snapshot={thread([...earlier, message("progress:run", "Draft continues")])} />,
    ),
  );
  expect(messageRenders.has("card")).toBe(false);
  expect(messageRenders.get("reply")).toBe(1);

  act(() => root.render(<Host snapshot={thread([...earlier, card("card-2", 2)])} />));
  expect(messageRenders.get("reply")).toBe(2);
});

it("re-renders only the streaming row's message on a progress event", () => {
  const receipt = (id: string, block: ThreadMessage["blocks"][number]): ThreadMessage => ({
    ...message(id, ""),
    blocks: [block],
  });
  let snapshot: ThreadSnapshot = {
    ...thread([
      { ...message("ask", "Plan the offsite"), role: "user" },
      receipt("sent", {
        kind: "bot_message_sent",
        toBotId: "atlas",
        toBotName: "Atlas",
        text: "Which dates work?",
      }),
      receipt("received", {
        kind: "bot_message_received",
        fromBotId: "atlas",
        fromBotName: "Atlas",
        text: "The second week",
        intent: "result",
      }),
      { ...message("reply", "Atlas picked the second week"), botId: "bot" },
    ]),
    run: {
      id: "run",
      botId: "bot",
      threadId: "thread",
      taskId: "run",
      status: "running",
      trigger: "user",
      routineId: null,
      modelProvider: null,
      modelId: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: "2026-10-30T12:00:00.000Z",
    },
  };
  const stream = (seq: number, delta: string) => {
    snapshot =
      reduceThreadSnapshot(snapshot, {
        type: "thread.progress",
        seq,
        threadId: "thread",
        botId: "bot",
        runId: "run",
        createdAt: "2026-10-30T12:01:00.000Z",
        payload: { delta },
      }) ?? snapshot;
    act(() => root.render(<Host snapshot={snapshot} />));
  };
  act(() => root.render(<Host snapshot={snapshot} />));
  stream(1, "Drafting");
  stream(2, " the agenda");

  expect(Object.fromEntries(messageRenders)).toEqual({
    ask: 1,
    sent: 1,
    received: 1,
    reply: 1,
    "progress:run": 2,
  });
});
