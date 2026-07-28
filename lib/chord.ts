// Chord parsing and transposition. Pure functions, no dependencies.

const SHARP_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_SCALE = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export const KEY_OPTIONS = SHARP_SCALE;

/** Chords: root note, optional quality suffix (m, 7, sus4, ...), optional slash bass note. */
const CHORD_PATTERN = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

/** Loose match used to filter OCR words down to plausible chord tokens. */
export const CHORD_LIKE_PATTERN =
  /^[A-G][#b]?(?:maj|min|sus|dim|aug|add|m)?\d{0,2}(?:\/[A-G][#b]?)?$/;

export function noteIndex(note: string): number | null {
  return note in NOTE_INDEX ? NOTE_INDEX[note] : null;
}

export function transposeNote(note: string, semitones: number, preferFlat = false): string {
  const idx = noteIndex(note);
  if (idx === null) return note;
  const shifted = ((idx + semitones) % 12 + 12) % 12;
  return preferFlat ? FLAT_SCALE[shifted] : SHARP_SCALE[shifted];
}

/** Transposes a single chord symbol (e.g. "F#m7/A") by a number of semitones. */
export function transposeChord(chord: string, semitones: number, preferFlat = false): string {
  const trimmed = chord.trim();
  const match = trimmed.match(CHORD_PATTERN);
  if (!match) return chord;
  const [, root, quality, bass] = match;
  if (noteIndex(root) === null) return chord;
  const newRoot = transposeNote(root, semitones, preferFlat);
  const newBass = bass ? transposeNote(bass, semitones, preferFlat) : undefined;
  return newRoot + quality + (newBass ? `/${newBass}` : "");
}

/** Semitone shift to go from one key to another, always expressed as an upward move (0-11). */
export function semitonesBetweenKeys(fromKey: string, toKey: string): number {
  const from = noteIndex(fromKey) ?? 0;
  const to = noteIndex(toKey) ?? 0;
  return ((to - from) % 12 + 12) % 12;
}
