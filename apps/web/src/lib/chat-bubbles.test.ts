// @vitest-environment jsdom

import { BOT_COLOR_LIST, chatUserBubbleColors } from "@rakazo/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  botBubbleFill,
  bubbleOverridesPreference,
  setBubbleOverride,
  userBubbleColors,
} from "./chat-bubbles";

const blue = BOT_COLOR_LIST.find((color) => color.id === "blue")!;
const orange = BOT_COLOR_LIST.find((color) => color.id === "orange")!;

describe("bot bubbles", () => {
  it("stay neutral unless Settings or the bot asks for a color", () => {
    expect(botBubbleFill("neutral", undefined, blue.hex)).toBeUndefined();
    expect(botBubbleFill("bot", undefined, blue.hex)).toContain(blue.hex);
  });

  it("follow the bot's own choice over Settings", () => {
    expect(botBubbleFill("bot", "neutral", blue.hex)).toBeUndefined();
    expect(botBubbleFill("neutral", "orange", blue.hex)).toContain(orange.hex);
    expect(botBubbleFill("neutral", "not-a-color", blue.hex)).toBeUndefined();
  });
});

describe("your bubbles", () => {
  it("take the bot's color unless Settings or the bot says neutral", () => {
    expect(userBubbleColors("bot", undefined, blue.hex, "bot-1")).toEqual(
      chatUserBubbleColors(blue.hex, "bot-1"),
    );
    expect(userBubbleColors("neutral", undefined, blue.hex, "bot-1")).toBeUndefined();
    expect(userBubbleColors("bot", "neutral", blue.hex, "bot-1")).toBeUndefined();
  });

  it("take the color the bot picked, and stay neutral in a group", () => {
    expect(userBubbleColors("neutral", "orange", blue.hex, "bot-1")).toEqual(
      chatUserBubbleColors(orange.hex, "bot-1"),
    );
    expect(userBubbleColors("bot", undefined, blue.hex, undefined)).toBeUndefined();
  });
});

describe("per-bot choices", () => {
  beforeEach(() => {
    bubbleOverridesPreference.set({});
  });

  it("are saved per bot and dropped once both go back to Settings", () => {
    setBubbleOverride("bot-1", "bot", "orange");
    setBubbleOverride("bot-1", "user", "neutral");
    expect(bubbleOverridesPreference.get()).toEqual({
      "bot-1": { bot: "orange", user: "neutral" },
    });
    expect(JSON.parse(localStorage.getItem("rakazo.bubbleOverrides") ?? "{}")).toEqual({
      "bot-1": { bot: "orange", user: "neutral" },
    });

    setBubbleOverride("bot-1", "bot", undefined);
    setBubbleOverride("bot-1", "user", undefined);
    expect(bubbleOverridesPreference.get()).toEqual({});
    expect(localStorage.getItem("rakazo.bubbleOverrides")).toBeNull();
  });
});
