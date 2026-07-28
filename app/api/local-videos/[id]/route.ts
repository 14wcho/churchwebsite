import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { readDB } from "@/lib/db";
import { LOCAL_VIDEOS_DIR, mimeTypeFor } from "@/lib/localVideos";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDB();
  const video = db.videos.find((v) => v.id === id && v.source === "local");
  if (!video || !video.localPath) {
    return NextResponse.json({ error: "Local video not found" }, { status: 404 });
  }

  const filePath = path.join(LOCAL_VIDEOS_DIR, video.localPath);
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });

  const mimeType = mimeTypeFor(video.localPath);
  const range = req.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
  return new NextResponse(stream, {
    status: 206,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
