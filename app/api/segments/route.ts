import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readDB, updateDB } from "@/lib/db";
import { fetchOEmbedInfo, fetchVideoSnippets, parseYouTubeUrl, timestampToSeconds } from "@/lib/youtube";

export async function GET() {
  const db = await readDB();
  return NextResponse.json({ segments: db.segments, videos: db.videos, channels: db.channels });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { videoUrl, localVideoId, timestamp, label } = body as {
    videoUrl?: string;
    localVideoId?: string;
    timestamp?: string;
    label?: string;
  };

  if ((!videoUrl && !localVideoId) || !timestamp || !label) {
    return NextResponse.json(
      { error: "videoUrl (or localVideoId), timestamp, label are all required" },
      { status: 400 }
    );
  }

  const timestampSec = timestampToSeconds(timestamp);
  if (Number.isNaN(timestampSec)) {
    return NextResponse.json({ error: "Invalid timestamp, expected mm:ss or h:mm:ss" }, { status: 400 });
  }

  if (localVideoId) {
    const result = await updateDB((db) => {
      const video = db.videos.find((v) => v.id === localVideoId && v.source === "local");
      if (!video) return null;
      const segment = { id: uuidv4(), videoId: localVideoId, timestampSec, label: label.trim() };
      db.segments.push(segment);
      return { segment, video };
    });
    if (!result) return NextResponse.json({ error: "Local video not found" }, { status: 404 });
    return NextResponse.json(result);
  }

  const parsed = parseYouTubeUrl(videoUrl!);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse a video id from videoUrl" }, { status: 400 });
  }

  const result = await updateDB((db) => {
    let video = db.videos.find((v) => v.id === parsed.videoId);
    if (!video) {
      // Title gets filled in right after (outside the lock) via oEmbed or the Data API.
      // The thumbnail CDN URL works unconditionally, even for videos with embedding disabled.
      video = {
        id: parsed.videoId,
        source: "youtube",
        title: parsed.videoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`,
      };
      db.videos.push(video);
    }
    const segment = { id: uuidv4(), videoId: parsed.videoId, timestampSec, label: label.trim() };
    db.segments.push(segment);
    return { segment, video, needsInfo: video.title === parsed.videoId };
  });

  if (result.needsInfo) {
    // Some channels disable embedding, which also makes oEmbed 401. Fall back to the
    // Data API (if a key is configured) — that endpoint returns snippet data regardless
    // of embeddability.
    let info = await fetchOEmbedInfo(parsed.videoId).catch(() => null);
    if (!info && process.env.YOUTUBE_API_KEY) {
      try {
        const [snippet] = await fetchVideoSnippets([parsed.videoId]);
        if (snippet) info = { title: snippet.title, thumbnailUrl: snippet.thumbnailUrl };
      } catch {
        // No key, or API error — leave the placeholder title for the admin to fix by hand.
      }
    }
    if (info) {
      await updateDB((db) => {
        const v = db.videos.find((v) => v.id === parsed.videoId);
        if (v) {
          v.title = info.title;
          v.thumbnailUrl = info.thumbnailUrl;
        }
      });
    }
  }

  const db = await readDB();
  return NextResponse.json({
    segment: result.segment,
    video: db.videos.find((v) => v.id === parsed.videoId),
  });
}
