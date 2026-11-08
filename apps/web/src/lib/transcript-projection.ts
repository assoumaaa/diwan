import type { MessageReaction, Run, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import type { ChildBotBlock, FoldedTranscript, PeerExchange, VoiceChatGroup } from "@rakazo/core";
import {
  activeThreadRuns,
  answerableAskMessageIds,
  dismissableAskMessageIds,
  expandPeerReplies,
  foldPeerReplies,
  groupVoiceChats,
  isPeerReceiptBlocks,
  isRunWorking,
  liveActivityLine,
  liveMessageComposing,
  needsTimeSeparator,
  peerExchangeLines,
  projectBotMentions,
  projectMessageReactions,
  unreadDividerMessageId,
  voiceChatHoldsMessage,
  workingRoutineName,
} from "@rakazo/core";
import { useCallback, useMemo, useState } from "react";
import type { PageBlock } from "./page-cards";
import { projectPageCards } from "./page-cards";
import { messageHasVisibleBlocks } from "./tool-activity-view";

/** The run fields the transcript reads. */
export type TranscriptRun = Pick<Run, "id" | "botId" | "status"> &
  Partial<Pick<Run, "userId" | "trigger" | "routineName">>;

export type TranscriptInput = {
  messages: readonly ThreadMessage[];
  /** The thread's runs, as `activeThreadRuns` lists them. */
  runs: readonly TranscriptRun[];
  meId?: string;
  showToolActivity: boolean;
  /** The seq read up to when this chat opened; null when nothing was unread. */
  unreadAfterSeq: number | null;
  olderCursor: number | null;
  /** Peer markers whose folded replies show inline, after a jump to one of them. */
  expandedMarkerIds: ReadonlySet<string>;
};

export type TranscriptMessageRow = {
  kind: "message";
  message: ThreadMessage;
  /** A time separator goes above the row. */
  separator: boolean;
  /** The "New" divider goes above the row. */
  unreadDivider: boolean;
  peerReceipt: boolean;
  /** The adjacent receipts this peer line stands for. */
  peerExchange?: PeerExchange;
  /** Bots this reply announces. */
  mentions?: readonly ChildBotBlock[];
  /** Pages saved just before this reply. */
  pages?: readonly PageBlock[];
  /** Emoji replies folded under the message, with their counts. */
  reactions?: ReadonlyMap<MessageReaction, number>;
  /** Replies folded under this peer line: clicking the line folds them open or closed. */
  peerFold?: PeerFold;
  replyParent?: ThreadMessage;
  canAnswer: boolean;
  canDismiss: boolean;
};

export type PeerFold = {
  /** The markers this line stands for that hold folded replies. */
  markerIds: readonly string[];
  /** Whether those replies show right now. */
  open: boolean;
};

export type TranscriptVoiceChatRow = {
  kind: "voiceChat";
  group: VoiceChatGroup<ThreadMessage>;
  separator: boolean;
  unreadDivider: boolean;
};

export type TranscriptRow = TranscriptMessageRow | TranscriptVoiceChatRow;

type SeparatorEntry = { createdAt: string; after?: string; separator: boolean };

/** What the open chat shows, derived from its thread. */
export type TranscriptView = {
  /** The input it was projected from, with unchanged messages and runs kept from the last one. */
  input: TranscriptInput;
  /** The messages as they were passed in, before unchanged ones were swapped for earlier ones. */
  source: readonly ThreadMessage[];
  /** The thread's messages with peer replies folded under their markers; jumps resolve here. */
  folded: FoldedTranscript<ThreadMessage>;
  /** The listed messages, the folded replies of expanded markers included. */
  messages: readonly ThreadMessage[];
  /** One row per drawn message or call. A row whose content did not change is the same object. */
  rows: readonly TranscriptRow[];
  /** Listed messages by id, including those drawn inside a later reply. */
  messageById: ReadonlyMap<string, ThreadMessage>;
  /** The peer line each receipt is drawn in. */
  lineOf: ReadonlyMap<string, string>;
  /** The reply an announcement or page card is drawn inside, so a jump lands there. */
  foldedInto: ReadonlyMap<string, string>;
  isPageSuperseded: (messageId: string, block: PageBlock) => boolean;
  runs: readonly TranscriptRun[];
  workingRuns: readonly TranscriptRun[];
  running: boolean;
  workingRoutine?: string;
  /** The tool status line the live reply is showing ("Searching the web: …"), if any. */
  activityLine?: string;
  /** A live reply is writing, so the working indicator steps aside. */
  composing: boolean;
  pageCardsKey: string;
  rowByKey: ReadonlyMap<string, TranscriptRow>;
  separators: ReadonlyMap<string, SeparatorEntry>;
};

/**
 * Projects a thread into the rows its transcript draws. Everything that did not change since
 * `previous` comes back as the same object: a message equal to the one before it, a row and
 * the per-row data it carries, and the whole view when no input changed.
 */
export function projectTranscript(
  previous: TranscriptView | null,
  input: TranscriptInput,
): TranscriptView {
  const before = previous?.input;
  const messages = previous ? keepUnchangedMessages(previous, input.messages) : input.messages;
  const runs = before && sameItems(before.runs, input.runs) ? before.runs : input.runs;
  if (
    previous &&
    before &&
    messages === before.messages &&
    runs === before.runs &&
    input.meId === before.meId &&
    input.showToolActivity === before.showToolActivity &&
    input.unreadAfterSeq === before.unreadAfterSeq &&
    input.olderCursor === before.olderCursor &&
    input.expandedMarkerIds === before.expandedMarkerIds
  ) {
    // Messages rebuilt equal (a refresh) leave the view as it was, but later rebuilds compare
    // against them.
    return previous.source === input.messages ? previous : { ...previous, source: input.messages };
  }
  const settled: TranscriptInput = { ...input, messages, runs };
  const folded =
    previous && messages === before?.messages
      ? previous.folded
      : foldPeerReplies(messages, { includePeerReceipts: true, foldRelayReplies: true });
  const listed = expandPeerReplies(folded, input.expandedMarkerIds);
  const messageById = new Map(listed.map((message) => [message.id, message]));
  const mentionView = projectBotMentions(listed);
  const pageView = projectPageCards(mentionView.visibleMessages);
  const reactionView = projectMessageReactions(pageView.visibleMessages);
  const visibleReceipts = reactionView.visibleMessages.filter((message) =>
    messageHasVisibleBlocks(message.blocks, input.showToolActivity),
  );
  const exchanges = peerExchangeLines({ ...folded, messages: visibleReceipts });
  const shown = visibleReceipts.filter(
    (message) => !exchanges.lineOf.has(message.id) || exchanges.lines.has(message.id),
  );
  // Each peer line folds the replies of every marker it stands for.
  const foldMarkersOfLine = new Map<string, string[]>();
  for (const [messageId, lineId] of exchanges.lineOf) {
    if (folded.folded.get(messageId)?.length) {
      foldMarkersOfLine.set(lineId, [...(foldMarkersOfLine.get(lineId) ?? []), messageId]);
    }
  }
  const separators = timeSeparators(previous?.separators, shown);
  const unreadDividerId = unreadDividerMessageId(
    shown,
    input.unreadAfterSeq,
    input.olderCursor,
    input.meId,
  );
  const answerable = answerableAskMessageIds({ messages, activeRuns: runs });
  const dismissable = dismissableAskMessageIds({ messages, activeRuns: runs }, input.meId);

  const rowByKey = new Map<string, TranscriptRow>();
  const rows: TranscriptRow[] = [];
  for (const item of groupVoiceChats(reactionView.visibleMessages)) {
    if (item.kind === "voiceChat") {
      const first = item.messages[0];
      const prior = previous?.rowByKey.get(item.key);
      const row = reuseVoiceChatRow(prior, {
        kind: "voiceChat",
        group: item,
        separator: Boolean(first && separators.get(first.id)?.separator),
        unreadDivider: voiceChatHoldsMessage(item, unreadDividerId),
      });
      rowByKey.set(item.key, row);
      rows.push(row);
      continue;
    }
    const message = item.message;
    if (!messageHasVisibleBlocks(message.blocks, input.showToolActivity)) {
      continue;
    }
    const row = reuseMessageRow(previous?.rowByKey.get(message.id), {
      kind: "message",
      message,
      separator: separators.get(message.id)?.separator ?? false,
      unreadDivider: message.id === unreadDividerId,
      peerReceipt: isPeerReceiptBlocks(message.blocks),
      peerExchange: exchanges.lines.get(message.id),
      mentions: mentionView.mentions.get(message.id),
      pages: pageView.pages.get(message.id),
      reactions: reactionView.reactions.get(message.id),
      peerFold: peerFoldOf(foldMarkersOfLine.get(message.id), input.expandedMarkerIds),
      replyParent: message.replyToMessageId ? messageById.get(message.replyToMessageId) : undefined,
      canAnswer: answerable.has(message.id),
      canDismiss: dismissable.has(message.id),
    });
    rowByKey.set(message.id, row);
    rows.push(row);
  }

  const foldedInto = new Map(pageView.foldedInto);
  for (const [id, into] of mentionView.foldedInto) {
    foldedInto.set(id, pageView.foldedInto.get(into) ?? into);
  }
  const workingRuns = runs.filter((run) => isRunWorking(run.status));
  return {
    input: settled,
    source: input.messages,
    folded,
    messages: listed,
    rows,
    messageById,
    lineOf: exchanges.lineOf,
    foldedInto,
    isPageSuperseded:
      previous?.pageCardsKey === pageView.cardsKey
        ? previous.isPageSuperseded
        : pageView.isSuperseded,
    runs,
    workingRuns:
      previous && sameItems(previous.workingRuns, workingRuns) ? previous.workingRuns : workingRuns,
    running: workingRuns.length > 0,
    workingRoutine: workingRoutineName(workingRuns),
    activityLine: liveActivityLine(listed),
    composing: listed.some(
      (message) => message.id.startsWith("progress:") && liveMessageComposing(message.blocks),
    ),
    pageCardsKey: pageView.cardsKey,
    rowByKey,
    separators,
  };
}

const NO_MARKERS: ReadonlySet<string> = new Set();

/**
 * The open chat's transcript view, holding on to the previous one so unchanged rows keep their
 * identity. A jump to a folded peer reply expands its marker for the rest of the thread's visit.
 */
export function useTranscriptView({
  snapshot,
  meId,
  showToolActivity,
  unreadAfterSeq,
}: {
  /** The open chat's thread; null while it loads. */
  snapshot: Pick<
    ThreadSnapshot,
    "threadId" | "messages" | "run" | "activeRuns" | "olderCursor"
  > | null;
  meId: string | undefined;
  showToolActivity: boolean;
  unreadAfterSeq: number | null;
}) {
  const threadId = snapshot?.threadId;
  const [project] = useState(createProjector);
  const [expanded, setExpanded] = useState<{
    threadId?: string;
    markerIds: ReadonlySet<string>;
  }>({ threadId, markerIds: NO_MARKERS });
  // Another chat, or a reopened one, starts with every marker folded.
  if (expanded.threadId !== threadId) {
    setExpanded({ threadId, markerIds: NO_MARKERS });
  }
  const expandedMarkerIds = expanded.threadId === threadId ? expanded.markerIds : NO_MARKERS;
  // Every live event brings a new snapshot; the projection hands back the same view when
  // nothing it reads changed.
  const view = useMemo(
    () =>
      project({
        messages: snapshot?.messages ?? [],
        runs: activeThreadRuns(snapshot),
        meId,
        showToolActivity,
        unreadAfterSeq,
        olderCursor: snapshot?.olderCursor ?? null,
        expandedMarkerIds,
      }),
    [project, snapshot, meId, showToolActivity, unreadAfterSeq, expandedMarkerIds],
  );
  const expandPeerMarker = useCallback(
    (markerId: string) => {
      setExpanded((current) => {
        const markerIds = current.threadId === threadId ? current.markerIds : NO_MARKERS;
        if (markerIds.has(markerId)) {
          return current;
        }
        return { threadId, markerIds: new Set(markerIds).add(markerId) };
      });
    },
    [threadId],
  );
  // A peer line folds its replies open or closed together.
  const setPeerFold = useCallback(
    (markerIds: readonly string[], open: boolean) => {
      setExpanded((current) => {
        const next = new Set(current.threadId === threadId ? current.markerIds : NO_MARKERS);
        for (const id of markerIds) {
          if (open) {
            next.add(id);
          } else {
            next.delete(id);
          }
        }
        return { threadId, markerIds: next };
      });
    },
    [threadId],
  );
  return { view, expandPeerMarker, setPeerFold };
}

function createProjector() {
  let view: TranscriptView | null = null;
  return (input: TranscriptInput) => {
    view = projectTranscript(view, input);
    return view;
  };
}

/**
 * Keeps the earlier object for each message whose content did not change. A refresh rebuilds
 * every message, so those are compared by value, once: a message passed in again as the same
 * object maps straight to what it mapped to last time.
 */
function keepUnchangedMessages(
  previous: TranscriptView,
  next: readonly ThreadMessage[],
): readonly ThreadMessage[] {
  const kept = previous.input.messages;
  if (previous.source === next) {
    return kept;
  }
  // `kept` lines up with `source`: one kept message for each message passed in.
  const indexById = new Map(previous.source.map((message, index) => [message.id, index]));
  const messages = next.map((message) => {
    const index = indexById.get(message.id);
    const earlier = index === undefined ? undefined : kept[index];
    if (index === undefined || !earlier) {
      return message;
    }
    if (previous.source[index] === message || sameMessage(earlier, message)) {
      return earlier;
    }
    return message;
  });
  return sameItems(kept, messages) ? kept : messages;
}

function sameMessage(a: ThreadMessage, b: ThreadMessage): boolean {
  return (
    a.seq === b.seq &&
    a.createdAt === b.createdAt &&
    a.blocks.length === b.blocks.length &&
    JSON.stringify(a) === JSON.stringify(b)
  );
}

/** Which shown messages start a new stretch of time; unchanged neighbours reuse the last answer. */
function timeSeparators(
  previous: ReadonlyMap<string, SeparatorEntry> | undefined,
  shown: readonly ThreadMessage[],
): Map<string, SeparatorEntry> {
  const separators = new Map<string, SeparatorEntry>();
  let after: string | undefined;
  for (const message of shown) {
    if (!message.createdAt) {
      continue;
    }
    const prior = previous?.get(message.id);
    const entry =
      prior && prior.createdAt === message.createdAt && prior.after === after
        ? prior
        : {
            createdAt: message.createdAt,
            after,
            separator: needsTimeSeparator(message.createdAt, after),
          };
    separators.set(message.id, entry);
    after = message.createdAt;
  }
  return separators;
}

function reuseMessageRow(
  previous: TranscriptRow | undefined,
  row: TranscriptMessageRow,
): TranscriptMessageRow {
  if (previous?.kind !== "message") {
    return row;
  }
  const next: TranscriptMessageRow = {
    ...row,
    peerExchange: samePeerExchange(previous.peerExchange, row.peerExchange)
      ? previous.peerExchange
      : row.peerExchange,
    mentions: sameItems(previous.mentions, row.mentions) ? previous.mentions : row.mentions,
    pages: sameItems(previous.pages, row.pages) ? previous.pages : row.pages,
    reactions: sameReactions(previous.reactions, row.reactions)
      ? previous.reactions
      : row.reactions,
    peerFold:
      previous.peerFold?.open === row.peerFold?.open &&
      sameItems(previous.peerFold?.markerIds, row.peerFold?.markerIds)
        ? previous.peerFold
        : row.peerFold,
  };
  return sameFields(previous, next) ? previous : next;
}

function peerFoldOf(
  markerIds: readonly string[] | undefined,
  expandedMarkerIds: ReadonlySet<string>,
): PeerFold | undefined {
  if (!markerIds) {
    return undefined;
  }
  return { markerIds, open: markerIds.every((id) => expandedMarkerIds.has(id)) };
}

function reuseVoiceChatRow(
  previous: TranscriptRow | undefined,
  row: TranscriptVoiceChatRow,
): TranscriptVoiceChatRow {
  if (previous?.kind !== "voiceChat") {
    return row;
  }
  const same =
    previous.group.callId === row.group.callId &&
    previous.group.marker === row.group.marker &&
    sameItems(previous.group.messages, row.group.messages);
  const next = same ? { ...row, group: previous.group } : row;
  return sameFields(previous, next) ? previous : next;
}

function sameFields<T extends object>(a: T, b: T): boolean {
  return (Object.keys(b) as (keyof T)[]).every((key) => a[key] === b[key]);
}

function sameItems<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => item === b[index]);
}

function samePeerExchange(a: PeerExchange | undefined, b: PeerExchange | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.peerBotId === b.peerBotId &&
    a.peerBotName === b.peerBotName &&
    a.count === b.count &&
    a.direction === b.direction
  );
}

function sameReactions(
  a: ReadonlyMap<MessageReaction, number> | undefined,
  b: ReadonlyMap<MessageReaction, number> | undefined,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.size === b.size && [...a].every(([emoji, count]) => b.get(emoji) === count);
}
