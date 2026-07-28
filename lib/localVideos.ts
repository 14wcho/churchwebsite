import fs from "fs/promises";
import path from "path";

export const LOCAL_VIDEOS_DIR = path.join(process.cwd(), "local-videos");

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv", ".webm", ".m4v"];

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
};

export function mimeTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function listVideoFiles(): Promise<string[]> {
  // On a hosted deployment (e.g. Vercel) the filesystem is read-only and this
  // directory doesn't exist — local video is a local-machine-only feature, so
  // just report an empty list there instead of throwing.
  try {
    await fs.mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
  } catch {
    return [];
  }
  const entries = await fs.readdir(LOCAL_VIDEOS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && VIDEO_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);
}
