import type { ProductEvent } from "@rakazo/contracts";
import { createStoredPreference } from "./stored-preference";

export const RUN_SOUNDS_STORAGE_KEY = "rakazo.runSounds";
export const RUN_START_SOUND_STORAGE_KEY = "rakazo.runStartSound";
export const RUN_FINISH_SOUND_STORAGE_KEY = "rakazo.runFinishSound";

/** Sounds play unless a saved choice turns them off. */
export const runSoundsPreference = createStoredPreference({
  key: RUN_SOUNDS_STORAGE_KEY,
  parse: (raw) => raw?.trim().toLowerCase() !== "off",
  serialize: (enabled) => (enabled ? "on" : "off"),
});

export type RunSound = "start" | "finish" | "failed";
export type RunSoundSet = keyof typeof RUN_SOUND_SETS;
export type RunSoundChoice = RunSoundSet | "none";
/** What plays: the chosen set's start or finish, or the failure blips, which never change. */
export type RunCue = { sound: "start" | "finish"; set: RunSoundSet } | { sound: "failed" };

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

function cueFor(
  sound: RunSound,
  chosen: (sound: "start" | "finish") => RunSoundChoice,
): RunCue | undefined {
  if (sound === "failed") {
    return { sound };
  }
  const set = chosen(sound);
  if (set === "none") {
    return undefined;
  }
  return { sound, set };
}

/**
 * Decides which live run events make a sound. Events from before the chat opened and redelivered
 * events stay silent, and bots that start or finish together make one sound, not a pile of them.
 */
export function createRunSoundCue({
  play,
  enabled,
  chosen,
  now,
}: {
  play: (cue: RunCue) => void;
  enabled: () => boolean;
  /** The set picked for starts or finishes, read as each event arrives. */
  chosen: (sound: "start" | "finish") => RunSoundChoice;
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
    const cue = cueFor(sound, chosen);
    if (!cue) {
      return;
    }
    const time = now();
    const last = lastPlayedAt.get(sound);
    if (last !== undefined && time - last < 250) {
      return;
    }
    lastPlayedAt.set(sound, time);
    play(cue);
  };
}

type AudioOutput = { context: AudioContext; dry: AudioNode; wet: AudioNode };
type Synth = (audio: AudioOutput, at: number) => void;

let output: AudioOutput | undefined;

/** White noise that fades out over its length by `fade` (0 keeps it flat). */
function noiseBuffer(
  context: BaseAudioContext,
  channels: number,
  seconds: number,
  fade: number,
): AudioBuffer {
  const length = Math.ceil(context.sampleRate * seconds);
  const buffer = context.createBuffer(channels, length, context.sampleRate);
  for (let channel = 0; channel < channels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** fade;
    }
  }
  return buffer;
}

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
  // A short generated room so the sounds come out round instead of harsh.
  const room = context.createConvolver();
  room.buffer = noiseBuffer(context, 2, 1.2, 3);
  const wet = context.createGain();
  wet.gain.value = 0.16;
  wet.connect(room).connect(dry);
  output = { context, dry, wet };
  return output;
}

/** Sends a sound to the speakers, with a little of it through the room. */
function out(audio: AudioOutput, node: AudioNode) {
  node.connect(audio.dry);
  node.connect(audio.wet);
}

function tone(
  audio: AudioOutput,
  frequency: number,
  at: number,
  {
    type = "sine",
    gain,
    attack = 0.004,
    decay,
    glideTo,
    lowpass,
  }: {
    type?: OscillatorType;
    gain: number;
    attack?: number;
    decay: number;
    /** Slides the pitch to this frequency early in the note. */
    glideTo?: number;
    lowpass?: number;
  },
) {
  const { context } = audio;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (glideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(glideTo, at + attack + decay * 0.4);
  }
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  if (lowpass) {
    const softener = context.createBiquadFilter();
    softener.type = "lowpass";
    softener.frequency.value = lowpass;
    oscillator.connect(softener).connect(envelope);
  } else {
    oscillator.connect(envelope);
  }
  out(audio, envelope);
  oscillator.start(at);
  oscillator.stop(at + attack + decay + 0.05);
}

function blip(audio: AudioOutput, frequency: number, at: number, gain = 0.07, decay = 0.035) {
  tone(audio, frequency, at, { type: "square", gain, attack: 0.002, decay, lowpass: 4200 });
}

function bell(
  audio: AudioOutput,
  frequency: number,
  at: number,
  gain = 0.22,
  decay = 1.3,
  type: OscillatorType = "sine",
) {
  tone(audio, frequency, at, { type, gain, decay });
  tone(audio, frequency * 2, at, { gain: gain * 0.32, decay: decay * 0.55 });
  tone(audio, frequency * 3.01, at, { gain: gain * 0.12, decay: decay * 0.35 });
}

function marimba(audio: AudioOutput, frequency: number, at: number, gain = 0.3) {
  tone(audio, frequency, at, { gain, attack: 0.003, decay: 0.45 });
  tone(audio, frequency * 3.93, at, { gain: gain * 0.18, attack: 0.002, decay: 0.12 });
}

function pluck(audio: AudioOutput, frequency: number, at: number) {
  tone(audio, frequency, at, { gain: 0.28, attack: 0.002, decay: 0.9 });
  tone(audio, frequency * 2, at, { gain: 0.28 * 0.08, attack: 0.002, decay: 0.3 });
  tone(audio, frequency * 5.4, at, { gain: 0.28 * 0.05, attack: 0.001, decay: 0.08 });
}

/** A key press: a short noise click over a low thump. */
function clack(audio: AudioOutput, at: number, body: number, loudness = 1) {
  const { context } = audio;
  const click = context.createBufferSource();
  click.buffer = noiseBuffer(context, 1, 0.018, 2);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3400 + Math.random() * 900;
  band.Q.value = 0.9;
  const level = context.createGain();
  level.gain.value = 0.5 * loudness;
  click.connect(band).connect(level);
  out(audio, level);
  click.start(at);
  tone(audio, body, at, {
    gain: 0.22 * loudness,
    attack: 0.001,
    decay: 0.05,
    glideTo: body * 0.65,
  });
}

/** Air rushing upward, like a message being sent. */
function whoosh(audio: AudioOutput, at: number) {
  const { context } = audio;
  const air = context.createBufferSource();
  air.buffer = noiseBuffer(context, 1, 0.45, 0);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(350, at);
  band.frequency.exponentialRampToValueAtTime(2600, at + 0.38);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.35, at + 0.16);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
  air.connect(band).connect(envelope);
  out(audio, envelope);
  air.start(at);
}

/** A rising hum with a fast wobble, ending in a blip. */
function powerUp(audio: AudioOutput, at: number) {
  const { context } = audio;
  const hum = context.createOscillator();
  hum.frequency.setValueAtTime(220, at);
  hum.frequency.exponentialRampToValueAtTime(880, at + 0.32);
  const wobble = context.createOscillator();
  wobble.frequency.value = 32;
  const depth = context.createGain();
  depth.gain.value = 18;
  wobble.connect(depth).connect(hum.frequency);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.12, at + 0.08);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
  hum.connect(envelope);
  out(audio, envelope);
  hum.start(at);
  wobble.start(at);
  hum.stop(at + 0.42);
  wobble.stop(at + 0.42);
  blip(audio, 1760, at + 0.34, 0.06, 0.03);
}

/** The sets a person picks from, each with a cue for when a bot starts and when it is done. */
const RUN_SOUND_SETS = {
  terminal: {
    start: (audio, at) => {
      [1568, 1047, 1760, 1319, 2093, 1568, 1760].forEach((frequency, i) => {
        blip(audio, frequency, at + i * 0.034);
      });
    },
    finish: (audio, at) => {
      [1047, 1319, 1568, 2093].forEach((frequency, i) => {
        blip(audio, frequency, at + i * 0.05, 0.09, 0.08);
      });
      tone(audio, 2093, at + 0.2, {
        type: "triangle",
        gain: 0.09,
        attack: 0.002,
        decay: 0.6,
        lowpass: 4200,
      });
    },
  },
  keyboard: {
    start: (audio, at) => {
      clack(audio, at, 200);
      clack(audio, at + 0.085, 185);
      clack(audio, at + 0.15, 210);
      clack(audio, at + 0.235, 195);
    },
    finish: (audio, at) => {
      clack(audio, at, 140, 1.35);
      tone(audio, 1568, at + 0.09, { type: "triangle", gain: 0.1, attack: 0.003, decay: 0.12 });
      tone(audio, 2093, at + 0.16, { type: "triangle", gain: 0.1, attack: 0.003, decay: 0.35 });
    },
  },
  hud: {
    start: powerUp,
    finish: (audio, at) => {
      blip(audio, 2637, at, 0.06, 0.04);
      blip(audio, 2637, at + 0.07, 0.06, 0.04);
      tone(audio, 1319, at + 0.15, { type: "triangle", gain: 0.12, decay: 0.5 });
      tone(audio, 1976, at + 0.15, { gain: 0.07, decay: 0.45 });
    },
  },
  digitalBubble: {
    start: (audio, at) => {
      tone(audio, 320, at, { gain: 0.3, attack: 0.003, decay: 0.14, glideTo: 880 });
      blip(audio, 1760, at + 0.06, 0.05, 0.03);
      blip(audio, 2349, at + 0.09, 0.04, 0.03);
    },
    finish: (audio, at) => {
      bell(audio, 784, at, 0.2, 1.1, "triangle");
      bell(audio, 1047, at + 0.11, 0.18, 1.3, "triangle");
      blip(audio, 2093, at + 0.22, 0.035, 0.04);
      blip(audio, 3136, at + 0.27, 0.03, 0.04);
      blip(audio, 4186, at + 0.32, 0.025, 0.04);
    },
  },
  bubble: {
    start: (audio, at) => {
      tone(audio, 320, at, { gain: 0.32, attack: 0.003, decay: 0.14, glideTo: 880 });
      tone(audio, 1200, at, { gain: 0.03, attack: 0.001, decay: 0.03 });
    },
    finish: (audio, at) => {
      bell(audio, 784, at);
      bell(audio, 1047, at + 0.11, 0.2, 1.5);
    },
  },
  marimba: {
    start: (audio, at) => marimba(audio, 587, at),
    finish: (audio, at) => {
      [523, 659, 784, 1047].forEach((frequency, i) => {
        marimba(audio, frequency, at + i * 0.075, 0.26);
      });
    },
  },
  whoosh: {
    start: whoosh,
    finish: (audio, at) => bell(audio, 1319, at, 0.2, 1.8),
  },
  kalimba: {
    start: (audio, at) => pluck(audio, 587, at),
    finish: (audio, at) => {
      pluck(audio, 587, at);
      pluck(audio, 880, at + 0.12);
      tone(audio, 1760, at + 0.14, { gain: 0.04, decay: 1.2 });
    },
  },
} satisfies Record<string, Record<"start" | "finish", Synth>>;

/** Plays a cue now. Failures always get the same low double blip. */
export function playRunSound(cue: RunCue): void {
  const audio = audioOutput();
  if (!audio) {
    return;
  }
  // A context made before the page was used starts suspended; a blocked resume just stays silent.
  void audio.context.resume().catch(() => undefined);
  const at = audio.context.currentTime + 0.02;
  if (cue.sound === "failed") {
    blip(audio, 330, at, 0.1, 0.09);
    blip(audio, 220, at + 0.12, 0.1, 0.16);
    return;
  }
  RUN_SOUND_SETS[cue.set][cue.sound](audio, at);
}

function soundChoicePreference(key: string) {
  return createStoredPreference<RunSoundChoice>({
    key,
    // Terminal until another set, or None, is saved.
    parse: (raw) =>
      raw === "none" || (raw !== null && Object.hasOwn(RUN_SOUND_SETS, raw))
        ? (raw as RunSoundChoice)
        : "terminal",
    serialize: (choice) => choice,
  });
}

export const runStartSoundPreference = soundChoicePreference(RUN_START_SOUND_STORAGE_KEY);
export const runFinishSoundPreference = soundChoicePreference(RUN_FINISH_SOUND_STORAGE_KEY);

/** One cue for the whole page, so switching chats never replays a sound. */
export const cueRunSound = createRunSoundCue({
  play: playRunSound,
  enabled: runSoundsPreference.get,
  chosen: (sound) => (sound === "start" ? runStartSoundPreference : runFinishSoundPreference).get(),
  now: () => performance.now(),
});
