import type { Run, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { activeThreadRuns, reduceThreadSnapshot } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import type { TranscriptMessageRow, TranscriptView } from "./transcript-projection";
import { projectTranscript } from "./transcript-projection";

const run: Run = {
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
};

function message(
  id: string,
  blocks: ThreadMessage["blocks"],
  fields: Partial<ThreadMessage> = {},
): ThreadMessage {
  return {
    id,
    threadId: "thread",
    seq: 1,
    role: "bot",
    botId: "bot",
    createdAt: "2026-10-30T12:00:00.000Z",
    blocks,
    ...fields,
  };
}

function history(): ThreadMessage[] {
  return [
    message("ask", [{ kind: "text", text: "Plan the offsite" }], { role: "user", seq: 1 }),
    message(
      "sent",
      [{ kind: "bot_message_sent", toBotId: "atlas", toBotName: "Atlas", text: "Dates?" }],
      { seq: 2 },
    ),
    message(
      "received",
      [
        {
          kind: "bot_message_received",
          fromBotId: "atlas",
          fromBotName: "Atlas",
          text: "The second week",
          intent: "result",
        },
      ],
      { seq: 3 },
    ),
    message("reply", [{ kind: "text", text: "Atlas picked the second week" }], {
      seq: 4,
      createdAt: "2026-10-30T13:00:00.000Z",
    }),
    message("thumbs", [{ kind: "text", text: "👍" }], {
      role: "user",
      seq: 5,
      replyToMessageId: "reply",
      createdAt: "2026-10-30T13:01:00.000Z",
    }),
  ];
}

function snapshotOf(messages: ThreadMessage[]): ThreadSnapshot {
  return { threadId: "thread", botId: "bot", cursor: 0, messages, olderCursor: null, run };
}

function project(previous: TranscriptView | null, snapshot: ThreadSnapshot) {
  return projectTranscript(previous, {
    messages: snapshot.messages,
    runs: activeThreadRuns(snapshot),
    meId: "me",
    showToolActivity: false,
    unreadAfterSeq: null,
    olderCursor: null,
    // The same expansion as last time, as the hook passes it.
    expandedMarkerIds: previous?.input.expandedMarkerIds ?? new Set(),
  });
}

function stream(snapshot: ThreadSnapshot, seq: number, delta: string): ThreadSnapshot {
  return (
    reduceThreadSnapshot(snapshot, {
      type: "thread.progress",
      seq,
      threadId: "thread",
      botId: "bot",
      runId: "run",
      createdAt: "2026-10-30T13:02:00.000Z",
      payload: { delta },
    }) ?? snapshot
  );
}

function rowKeys(view: TranscriptView) {
  return view.rows.map((row) => (row.kind === "message" ? row.message.id : row.group.key));
}

function changedRows(before: TranscriptView, after: TranscriptView) {
  const previous = new Map(before.rows.map((row, index) => [rowKeys(before)[index], row]));
  return after.rows.flatMap((row, index) => {
    const key = rowKeys(after)[index];
    return previous.get(key ?? "") === row ? [] : [key];
  });
}

function messageRow(view: TranscriptView, id: string): TranscriptMessageRow {
  const row = view.rows.find(
    (candidate) => candidate.kind === "message" && candidate.message.id === id,
  );
  if (row?.kind !== "message") {
    throw new Error(`no row for ${id}`);
  }
  return row;
}

describe("projectTranscript", () => {
  it("projects rows with their peer line, reactions and separators", () => {
    const view = project(null, snapshotOf(history()));

    expect(rowKeys(view)).toEqual(["ask", "sent", "received", "reply"]);
    expect(messageRow(view, "sent").peerExchange).toEqual({
      peerBotId: "atlas",
      peerBotName: "Atlas",
      count: 2,
      direction: "sent",
    });
    expect(messageRow(view, "received").peerReceipt).toBe(true);
    expect([...(messageRow(view, "reply").reactions ?? [])]).toEqual([["👍", 1]]);
    expect(view.rows.map((row) => row.separator)).toEqual([true, false, false, true]);
    expect(view.running).toBe(true);
  });

  it("changes exactly one row's identity for a streamed progress event", () => {
    const opened = snapshotOf(history());
    const first = stream(opened, 1, "Drafting");
    const second = stream(first, 2, " the agenda");
    const before = project(project(null, opened), first);
    const after = project(before, second);

    expect(changedRows(before, after)).toEqual(["progress:run"]);
    // Peer lines and folded reactions keep their objects too, so memoized rows skip the event.
    expect(messageRow(after, "sent").peerExchange).toBe(messageRow(before, "sent").peerExchange);
    expect(messageRow(after, "reply").reactions).toBe(messageRow(before, "reply").reactions);
  });

  it("keeps every row when a refresh rebuilds equal messages", () => {
    const before = project(null, snapshotOf(history()));
    const refreshed = project(before, snapshotOf(structuredClone(history())));

    expect(changedRows(before, refreshed)).toEqual([]);
    expect(refreshed.messages).toBe(before.messages);
  });

  it("replaces only the row whose message a refresh changed", () => {
    const before = project(null, snapshotOf(history()));
    const edited = structuredClone(history()).map((candidate) =>
      candidate.id === "reply"
        ? { ...candidate, blocks: [{ kind: "text" as const, text: "Atlas picked the third week" }] }
        : candidate,
    );
    const after = project(before, snapshotOf(edited));

    expect(changedRows(before, after)).toEqual(["reply"]);
  });

  it("returns the same view when nothing it reads changed", () => {
    const snapshot = snapshotOf(history());
    const view = project(null, snapshot);

    // activeThreadRuns lists the run in a new array each time.
    expect(project(view, { ...snapshot, cursor: 7 })).toBe(view);
  });
});

describe("peer folds", () => {
  const exchange = [
    message("ask", [{ kind: "text", text: "Ask Coder." }], { role: "user", runId: "run-user" }),
    message(
      "sent",
      [{ kind: "bot_message_sent", toBotId: "coder", toBotName: "Coder", text: "Check this." }],
      { runId: "run-user" },
    ),
    message(
      "received",
      [
        {
          kind: "bot_message_received",
          fromBotId: "coder",
          fromBotName: "Coder",
          text: "It returns 200.",
          intent: "result",
        },
      ],
      { runId: "run-peer", role: "user", replyToMessageId: "sent" },
    ),
    message("update", [{ kind: "text", text: "Coder confirmed it returns 200." }], {
      runId: "run-peer",
    }),
  ];
  const projectWith = (expandedMarkerIds: ReadonlySet<string>) =>
    projectTranscript(null, {
      messages: exchange,
      runs: [],
      meId: "me",
      showToolActivity: false,
      unreadAfterSeq: null,
      olderCursor: null,
      expandedMarkerIds,
    });
  const rowIds = (view: TranscriptView) =>
    view.rows.map((row) => (row.kind === "message" ? row.message.id : row.kind));
  const chip = (view: TranscriptView) =>
    view.rows.find(
      (row): row is TranscriptMessageRow => row.kind === "message" && row.message.id === "sent",
    );

  it("folds a bot's update on delegated work under the line that opens the exchange", () => {
    const closed = projectWith(new Set());
    expect(rowIds(closed)).toEqual(["ask", "sent"]);
    expect(chip(closed)?.peerFold).toEqual({ markerIds: ["sent"], open: false });

    const open = projectWith(new Set(["sent"]));
    expect(rowIds(open)).toEqual(["ask", "sent", "update"]);
    expect(chip(open)?.peerFold).toEqual({ markerIds: ["sent"], open: true });
  });
});
