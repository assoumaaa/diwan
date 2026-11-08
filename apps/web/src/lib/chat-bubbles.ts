import { BOT_COLOR_LIST, chatUserBubbleColors } from "@rakazo/core";
import type { CSSProperties } from "react";
import { createStoredPreference } from "./stored-preference";

/** Bot replies sit on the theme's neutral bubble, or on a soft tint of the bot's color. */
export type BotBubbleStyle = "neutral" | "bot";
/** Your messages take the bot's color, or the theme's neutral bubble. */
export type UserBubbleStyle = "bot" | "neutral";
/** A bot's own choice for one bubble: "neutral" or a palette color id. Unset follows Settings. */
export type BubbleChoice = string;
export type BubbleOverrides = Record<string, { bot?: BubbleChoice; user?: BubbleChoice }>;

export const botBubbleStylePreference = createStoredPreference<BotBubbleStyle>({
  key: "rakazo.botBubbleStyle",
  parse: (raw) => (raw === "bot" ? "bot" : "neutral"),
  serialize: (value) => (value === "neutral" ? null : value),
});

export const userBubbleStylePreference = createStoredPreference<UserBubbleStyle>({
  key: "rakazo.userBubbleStyle",
  parse: (raw) => (raw === "neutral" ? "neutral" : "bot"),
  serialize: (value) => (value === "bot" ? null : value),
});

export const bubbleOverridesPreference = createStoredPreference<BubbleOverrides>({
  key: "rakazo.bubbleOverrides",
  parse: (raw) => {
    try {
      const value: unknown = JSON.parse(raw ?? "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as BubbleOverrides)
        : {};
    } catch {
      return {};
    }
  },
  serialize: (value) => (Object.keys(value).length > 0 ? JSON.stringify(value) : null),
});

/** Saves one bot's choice for a bubble; `undefined` goes back to following Settings. */
export function setBubbleOverride(
  botId: string,
  bubble: "bot" | "user",
  choice: BubbleChoice | undefined,
) {
  const next = { ...bubbleOverridesPreference.get() };
  const bot = { ...next[botId] };
  if (choice === undefined) {
    delete bot[bubble];
  } else {
    bot[bubble] = choice;
  }
  if (Object.keys(bot).length === 0) {
    delete next[botId];
  } else {
    next[botId] = bot;
  }
  bubbleOverridesPreference.set(next);
}

function paletteHex(choice: BubbleChoice): string | undefined {
  return BOT_COLOR_LIST.find((color) => color.id === choice)?.hex;
}

/** The fill for a bot's reply bubbles, or `undefined` for the theme's neutral bubble. */
export function botBubbleFill(
  style: BotBubbleStyle,
  choice: BubbleChoice | undefined,
  botHex: string,
): string | undefined {
  if (choice === "neutral" || (choice === undefined && style === "neutral")) {
    return undefined;
  }
  const hex = choice === undefined ? botHex : paletteHex(choice);
  if (!hex) {
    return undefined;
  }
  // A soft tint of the theme's bubble, so the theme's own text color stays readable on it.
  return `color-mix(in oklab, ${hex} 22%, var(--muted))`;
}

/** Your bubble's colors in a bot's chat, or `undefined` for the theme's neutral bubble. */
export function userBubbleColors(
  style: UserBubbleStyle,
  choice: BubbleChoice | undefined,
  botColor: string | undefined,
  botId: string | undefined,
): { background: string; foreground: string } | undefined {
  if (botId === undefined) {
    return undefined;
  }
  if (choice === "neutral" || (choice === undefined && style === "neutral")) {
    return undefined;
  }
  const color = choice === undefined ? botColor : paletteHex(choice);
  return color === undefined ? undefined : chatUserBubbleColors(color, botId);
}

/** The style that tints one bot's reply bubbles, following this device's choices. */
export function useBotBubbleStyle(
  botId: string | undefined,
  botHex: string,
): CSSProperties | undefined {
  const style = botBubbleStylePreference.useValue();
  const overrides = bubbleOverridesPreference.useValue();
  const fill = botBubbleFill(style, botId ? overrides[botId]?.bot : undefined, botHex);
  return fill ? ({ "--chat-bot": fill } as CSSProperties) : undefined;
}
