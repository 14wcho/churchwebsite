import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

export interface Channel {
  id: string; // YouTube channel id
  handle: string;
  name: string;
  uploadsPlaylistId: string;
  label?: string; // custom tab name shown on the search page; falls back to `name`
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

// Vercel's deployed filesystem is read-only (writes only survive in /tmp, which
// isn't shared across invocations), so when Upstash credentials are present we
// store the whole DB as a single Redis key instead of a local file. Local dev
// keeps using the file — nothing else in the app needs to know which mode is active.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_KEY = "churchwebsite:db";

function ensureDBFile() {
  const dir = path.dirname(DB_PATH);
  if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
  if (!fsSync.existsSync(DB_PATH)) {
    fsSync.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), "utf-8");
  }
}

async function upstashCommand<T>(command: unknown[]): Promise<T> {
  const res = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Upstash request failed: ${res.status} ${await res.text()}`);
  }
  const { result } = await res.json();
  return result as T;
}

export async function readDB(): Promise<DB> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const raw = await upstashCommand<string | null>(["GET", UPSTASH_KEY]);
    return raw ? (JSON.parse(raw) as DB) : EMPTY_DB;
  }
  ensureDBFile();
  const raw = await fs.readFile(DB_PATH, "utf-8");
  return JSON.parse(raw) as DB;
}

async function writeDB(db: DB): Promise<void> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await upstashCommand(["SET", UPSTASH_KEY, JSON.stringify(db)]);
    return;
  }
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
