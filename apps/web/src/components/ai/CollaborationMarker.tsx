import { useLingui } from "@lingui/react/macro";
import type { BotAvatarSet } from "@rakazo/contracts";
import { splitPeerLabel } from "@rakazo/core";
import type { GroupAvatarMember } from "@rakazo/ui-web";
import { BotAvatar, GroupAvatar } from "@rakazo/ui-web";
import { ChevronDown, MessagesSquare } from "lucide-react";
import { IconTooltip } from "../IconTooltip";

export function CollaborationMarker({
  color,
  avatarSet,
  identity,
  label,
  peerName,
  open,
  onClick,
  onOpenChat,
}: {
  color: string;
  avatarSet?: BotAvatarSet;
  identity: string;
  label: string;
  peerName: string;
  /** Set when replies fold under this line: whether they show. */
  open?: boolean;
  onClick: () => void;
  /** Opens the whole conversation, offered while folded replies show. */
  onOpenChat?: () => void;
}) {
  const { t } = useLingui();
  const parts = splitPeerLabel(label, peerName);
  return (
    <div className="flex min-w-0 max-w-full justify-center py-1">
      <button
        type="button"
        data-testid="peer-receipt-chip"
        aria-label={label}
        aria-expanded={open}
        onClick={onClick}
        className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-body-sm text-muted-foreground transition-colors hover:text-foreground/75 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        {parts.before ? <span className="whitespace-pre-wrap">{parts.before}</span> : null}
        <BotAvatar avatarSet={avatarSet} color={color} identity={identity} size={16} />
        {parts.name ? (
          <span dir="auto" className="truncate font-medium">
            {parts.name}
          </span>
        ) : null}
        {parts.after ? <span className="whitespace-pre-wrap">{parts.after}</span> : null}
        {open === undefined ? null : (
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {onOpenChat ? (
        <IconTooltip label={t`Open chat with ${peerName}`}>
          <button
            type="button"
            aria-label={t`Open chat with ${peerName}`}
            onClick={onOpenChat}
            className="ms-1 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground/75 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MessagesSquare size={14} aria-hidden="true" />
          </button>
        </IconTooltip>
      ) : null}
    </div>
  );
}

/** The working bot with what it is doing right now, such as its current tool call. */
export function ActiveBotGlyph({ bots, label }: { bots: GroupAvatarMember[]; label: string }) {
  return (
    <div role="status" className="flex min-h-10 min-w-0 items-center gap-2.5 px-1">
      <GroupAvatar members={bots} size={28} />
      <span dir="auto" className="min-w-0 truncate text-body-lg text-muted-foreground text-shimmer">
        {label}
      </span>
    </div>
  );
}
