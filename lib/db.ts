import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

export interface Channel {
  id: string; // YouTube channel id
  handle: string;
  name: string;
  uploadsPlaylistId: string;
}

export interface VideoRecord {
  id: string; // YouTube videoId, or "local-<uuid>" for local files
  source: "youtube" | "local";
  title: string;
  channelId?: string;
  thumbnailUrl?: string;
  localPath?: string; // relative to local-videos/, only for source === "local"
  publishedAt?: string;
}

export interface Segment {
  id: string;
  videoId: string;
  timestampSec: number;
  label: string;
}

export interface DB {
  channels: Channel[];
  videos: VideoRecord[];
  segments: Segment[];
}

const EMPTY_DB: DB = { channels: [], videos: [], segments: [] };

function ensureDBFile() {
  const dir = path.dirname(DB_PATH);
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
  if (!fsSync.existsSync(DB_PATH)) {
    fsSync.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), "utf-8");
  }
}

export async function readDB(): Promise<DB> {
  ensureDBFile();
  const raw = await fs.readFile(DB_PATH, "utf-8");
  return JSON.parse(raw) as DB;
}

async function writeDB(db: DB): Promise<void> {
  ensureDBFile();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// Serializes read-modify-write cycles so concurrent API requests don't clobber each other.
let writeQueue: Promise<unknown> = Promise.resolve();

export function updateDB<T>(mutator: (db: DB) => T): Promise<T> {
  const task = writeQueue.then(async () => {
    const db = await readDB();
    const result = mutator(db);
    await writeDB(db);
    return result;
  });
  // Swallow errors in the chain itself so one failed update doesn't wedge the queue,
  // while still propagating the error to this call's caller via `task`.
  writeQueue = task.catch(() => undefined);
  return task;
}
