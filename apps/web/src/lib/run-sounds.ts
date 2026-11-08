import type { ProductEvent } from "@rakazo/contracts";
import { createStoredPreference } from "./stored-preference";

export const RUN_SOUNDS_STORAGE_KEY = "rakazo.runSounds";

/** Sounds play unless a saved choice turns them off. */
export const runSoundsPreference = createStoredPreference({
  key: RUN_SOUNDS_STORAGE_KEY,
  parse: (raw) => raw?.trim().toLowerCase() !== "off",
  serialize: (enabled) => (enabled ? "on" : "off"),
});

export type RunSound = "start" | "finish" | "failed";

function soundFor(type: ProductEvent["type"]): RunSound | undefined {
  switch (type) {
    case "run.started":
      return "start";
    case "run.completed":
      return "finish";
    case "run.failed":
      return "failed";
    default:
      return undefined;
  }
}

/**
 * Decides which live run events make a sound. Events from before the chat opened and redelivered
 * events stay silent, and bots that start or finish together make one sound, not a pile of them.
 */
export function createRunSoundCue({
  play,
  enabled,
  now,
}: {
  play: (sound: RunSound) => void;
  enabled: () => boolean;
  now: () => number;
}) {
  const heard = new Set<string>();
  const lastPlayedAt = new Map<RunSound, number>();
  return (event: Pick<ProductEvent, "id" | "type" | "seq">, initialCursor: number) => {
    const sound = soundFor(event.type);
    if (!sound || event.seq <= initialCursor || heard.has(event.id) || !enabled()) {
      return;
    }
    heard.add(event.id);
    const time = now();
    const last = lastPlayedAt.get(sound);
    if (last !== undefined && time - last < 250) {
      return;
    }
    lastPlayedAt.set(sound, time);
    play(sound);
  };
}

type AudioOutput = { context: AudioContext; dry: AudioNode; wet: AudioNode };

let output: AudioOutput | undefined;

function audioOutput(): AudioOutput | undefined {
  if (output) {
    return output;
  }
  if (typeof AudioContext === "undefined") {
    return undefined;
  }
  const context = new AudioContext();
  const dry = context.createGain();
  dry.gain.value = 0.5;
  dry.connect(context.destination);
  // A short generated room so the blips sound round instead of harsh.
  const length = Math.floor(context.sampleRate * 1.2);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
  }
  const room = context.createConvolver();
  room.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = 0.16;
  wet.connect(room).connect(dry);
  output = { context, dry, wet };
  return output;
}

function tone(
  audio: AudioOutput,
  frequency: number,
  at: number,
  { type, gain, decay }: { type: OscillatorType; gain: number; decay: number },
) {
  const { context } = audio;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  const softener = context.createBiquadFilter();
  softener.type = "lowpass";
  softener.frequency.value = 4200;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.002);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.002 + decay);
  oscillator.connect(softener).connect(envelope);
  envelope.connect(audio.dry);
  envelope.connect(audio.wet);
  oscillator.start(at);
  oscillator.stop(at + decay + 0.05);
}

/** Terminal-style cues: data blips while a bot works, an "access granted" run when it is done. */
export function playRunSound(sound: RunSound): void {
  const audio = audioOutput();
  if (!audio) {
    return;
  }
  // A context made before the page was used starts suspended; a blocked resume just stays silent.
  void audio.context.resume().catch(() => undefined);
  const at = audio.context.currentTime + 0.02;
  if (sound === "start") {
    [1568, 1047, 1760, 1319, 2093, 1568, 1760].forEach((frequency, i) => {
      tone(audio, frequency, at + i * 0.034, { type: "square", gain: 0.07, decay: 0.035 });
    });
    return;
  }
  if (sound === "finish") {
    [1047, 1319, 1568, 2093].forEach((frequency, i) => {
      tone(audio, frequency, at + i * 0.05, { type: "square", gain: 0.09, decay: 0.08 });
    });
    tone(audio, 2093, at + 0.2, { type: "triangle", gain: 0.09, decay: 0.6 });
    return;
  }
  tone(audio, 330, at, { type: "square", gain: 0.1, decay: 0.09 });
  tone(audio, 220, at + 0.12, { type: "square", gain: 0.1, decay: 0.16 });
}

/** One cue for the whole page, so switching chats never replays a sound. */
export const cueRunSound = createRunSoundCue({
  play: playRunSound,
  enabled: runSoundsPreference.get,
  now: () => performance.now(),
});
