import type { ProductEvent } from "@rakazo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunCue, RunSound, RunSoundChoice, RunSoundSet } from "./run-sounds";
import {
  createRunSoundCue,
  playRunSound,
  RUN_FINISH_SOUND_STORAGE_KEY,
  RUN_SOUNDS_STORAGE_KEY,
  RUN_START_SOUND_STORAGE_KEY,
} from "./run-sounds";

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
  const cues: RunCue[] = [];
  const chosen: Record<"start" | "finish", RunSoundChoice> = {
    start: "terminal",
    finish: "terminal",
  };
  let clock = 0;
  const cue = createRunSoundCue({
    play: (next) => {
      played.push(next.sound);
      cues.push(next);
    },
    enabled: () => enabled,
    chosen: (sound) => chosen[sound],
    now: () => clock,
  });
  return {
    played,
    cues,
    chosen,
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

  it("plays the set chosen when each event arrives", () => {
    const { cues, chosen, at } = setup();
    at(1_000, event("e1", "run.started", 11));
    chosen.start = "marimba";
    chosen.finish = "kalimba";
    at(5_000, event("e2", "run.started", 12));
    at(9_000, event("e3", "run.completed", 13));
    expect(cues).toEqual([
      { sound: "start", set: "terminal" },
      { sound: "start", set: "marimba" },
      { sound: "finish", set: "kalimba" },
    ]);
  });

  it("stays silent for a sound set to None but still plays failures", () => {
    const { cues, chosen, at } = setup();
    chosen.start = "none";
    chosen.finish = "none";
    at(1_000, event("e1", "run.started", 11));
    at(5_000, event("e2", "run.completed", 12));
    at(9_000, event("e3", "run.failed", 13));
    expect(cues).toEqual([{ sound: "failed" }]);
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

describe("start and finish sound preferences", () => {
  it("plays Terminal until another set or None is saved", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    const { runFinishSoundPreference, runStartSoundPreference } = await import("./run-sounds");
    expect(runStartSoundPreference.get()).toBe("terminal");
    expect(runFinishSoundPreference.get()).toBe("terminal");
    runStartSoundPreference.set("whoosh");
    runFinishSoundPreference.set("none");
    expect(store.get(RUN_START_SOUND_STORAGE_KEY)).toBe("whoosh");
    expect(store.get(RUN_FINISH_SOUND_STORAGE_KEY)).toBe("none");
  });

  it("reads saved sets and falls back to Terminal for unknown ones", async () => {
    const saved = new Map([
      [RUN_START_SOUND_STORAGE_KEY, "kalimba"],
      [RUN_FINISH_SOUND_STORAGE_KEY, "toString"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: () => undefined,
    });
    const { runFinishSoundPreference, runStartSoundPreference } = await import("./run-sounds");
    expect(runStartSoundPreference.get()).toBe("kalimba");
    expect(runFinishSoundPreference.get()).toBe("terminal");
  });
});

describe("playRunSound", () => {
  it("does nothing where the browser has no audio", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playRunSound({ sound: "finish", set: "terminal" })).not.toThrow();
  });

  it("plays every set's start and finish cue", async () => {
    const ramps: number[] = [];
    let started = 0;
    const param = () => ({
      value: 0,
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: (value: number) => {
        ramps.push(value);
      },
    });
    const node = () => ({ connect: (next: unknown) => next });
    const start = () => {
      started += 1;
    };
    vi.stubGlobal(
      "AudioContext",
      class {
        sampleRate = 48_000;
        currentTime = 0;
        destination = {};
        resume = () => Promise.resolve();
        createGain = () => ({ ...node(), gain: param() });
        createOscillator = () => ({ ...node(), frequency: param(), start, stop: () => undefined });
        createBiquadFilter = () => ({ ...node(), frequency: param(), Q: param() });
        createConvolver = () => node();
        createBufferSource = () => ({ ...node(), start });
        createBuffer = (_channels: number, length: number) => ({
          getChannelData: () => new Float32Array(length),
        });
      },
    );
    const { playRunSound: play } = await import("./run-sounds");
    const sets: RunSoundSet[] = [
      "terminal",
      "keyboard",
      "hud",
      "digitalBubble",
      "bubble",
      "marimba",
      "whoosh",
      "kalimba",
    ];
    for (const set of sets) {
      for (const sound of ["start", "finish"] as const) {
        started = 0;
        play({ sound, set });
        expect(started, `${set} ${sound}`).toBeGreaterThan(0);
      }
    }
    // Browsers throw on an exponential ramp to zero or below.
    expect(ramps.every((value) => value > 0)).toBe(true);
  });
});
