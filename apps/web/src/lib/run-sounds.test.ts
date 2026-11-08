import type { ProductEvent } from "@rakazo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunSound } from "./run-sounds";
import { createRunSoundCue, playRunSound, RUN_SOUNDS_STORAGE_KEY } from "./run-sounds";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

type CueEvent = Pick<ProductEvent, "id" | "type" | "seq">;

function event(id: string, type: ProductEvent["type"], seq: number): CueEvent {
  return { id, type, seq };
}

function setup({ enabled = true } = {}) {
  const played: RunSound[] = [];
  let clock = 0;
  const cue = createRunSoundCue({
    play: (sound) => played.push(sound),
    enabled: () => enabled,
    now: () => clock,
  });
  return {
    played,
    at(time: number, next: CueEvent, initialCursor = 10) {
      clock = time;
      cue(next, initialCursor);
    },
  };
}

describe("run sound cue", () => {
  it("plays the start, finish, and failed sounds for live run events", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.started", 11));
    at(5_000, event("e2", "run.completed", 12));
    at(9_000, event("e3", "run.started", 13));
    at(12_000, event("e4", "run.failed", 14));
    expect(played).toEqual(["start", "finish", "start", "failed"]);
  });

  it("stays silent for a run the person stopped and for other events", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.cancelled", 11));
    at(2_000, event("e2", "thread.message.created", 12));
    at(3_000, event("e3", "run.waiting_input", 13));
    expect(played).toEqual([]);
  });

  it("stays silent for events from before the chat was opened", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.completed", 10), 10);
    at(2_000, event("e2", "run.started", 4), 10);
    expect(played).toEqual([]);
  });

  it("plays a redelivered event only once", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.completed", 11));
    at(4_000, event("e1", "run.completed", 11));
    expect(played).toEqual(["finish"]);
  });

  it("plays one start sound when several bots start together", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.started", 11));
    at(1_100, event("e2", "run.started", 12));
    at(1_300, event("e3", "run.started", 13));
    expect(played).toEqual(["start", "start"]);
  });

  it("plays both sounds for a reply that finishes right after it starts", () => {
    const { played, at } = setup();
    at(1_000, event("e1", "run.started", 11));
    at(1_050, event("e2", "run.completed", 12));
    expect(played).toEqual(["start", "finish"]);
  });

  it("stays silent when sounds are turned off", () => {
    const { played, at } = setup({ enabled: false });
    at(1_000, event("e1", "run.started", 11));
    at(5_000, event("e2", "run.completed", 12));
    expect(played).toEqual([]);
  });
});

describe("run sounds preference", () => {
  it("plays sounds until a saved choice turns them off", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    const { runSoundsPreference } = await import("./run-sounds");
    expect(runSoundsPreference.get()).toBe(true);
    runSoundsPreference.set(false);
    expect(store.get(RUN_SOUNDS_STORAGE_KEY)).toBe("off");
    runSoundsPreference.set(true);
    expect(store.get(RUN_SOUNDS_STORAGE_KEY)).toBe("on");
  });

  it("reads a saved choice", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === RUN_SOUNDS_STORAGE_KEY ? "off" : null),
      setItem: () => undefined,
    });
    const { runSoundsPreference } = await import("./run-sounds");
    expect(runSoundsPreference.get()).toBe(false);
  });
});

describe("playRunSound", () => {
  it("does nothing where the browser has no audio", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playRunSound("finish")).not.toThrow();
  });
});
