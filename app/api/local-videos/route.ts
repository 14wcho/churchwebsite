import path from "path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateDB } from "@/lib/db";
import { listVideoFiles } from "@/lib/localVideos";

// Scans local-videos/ for files not yet registered, adds them as untitled local videos,
// and returns the full local video list. Filenames become the default title; the admin
// tags each one with song segments by hand since there's no description to auto-parse.
export async function GET() {
  const files = await listVideoFiles();

  const videos = await updateDB((db) => {
    const knownPaths = new Set(
      db.videos.filter((v) => v.source === "local").map((v) => v.localPath)
    );
    for (const file of files) {
      if (!knownPaths.has(file)) {
        db.videos.push({
          id: `local-${uuidv4()}`,
          source: "local",
          title: path.parse(file).name,
          localPath: file,
        });
      }
    }
    return db.videos.filter((v) => v.source === "local");
  });

  return NextResponse.json({ videos });
}
