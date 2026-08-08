import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { updateDB } from "@/lib/db";
import {
  fetchAllUploadedVideoIds,
  fetchChannelByHandle,
  fetchVideoSnippets,
  parseDescriptionSegments,
  parseUntimedSongList,
} from "@/lib/youtube";

const DEFAULT_HANDLE = "@TVHolyimpact";

// Paginating through hundreds of videos plus the YouTube API calls can run
// past the default serverless timeout.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: ".env.local에 YOUTUBE_API_KEY가 설정되어 있지 않습니다." },
      { status: 400 }
    );
  }

  let handle = DEFAULT_HANDLE;
  let label: string | undefined;
  try {
    const body = await req.json();
    if (body?.handle) handle = body.handle;
    if (body?.label) label = body.label;
  } catch {
    // No JSON body sent — use the default channel.
  }

  const channel = await fetchChannelByHandle(handle);
  if (!channel) {
    return NextResponse.json({ error: `채널을 찾을 수 없습니다: ${handle}` }, { status: 404 });
  }

  const videoIds = await fetchAllUploadedVideoIds(channel.uploadsPlaylistId);
  const snippets = await fetchVideoSnippets(videoIds);

  const result = await updateDB((db) => {
    const existingChannel = db.channels.find((c) => c.id === channel.id);
    if (existingChannel) {
      existingChannel.name = channel.title;
      existingChannel.uploadsPlaylistId = channel.uploadsPlaylistId;
      if (label) existingChannel.label = label;
    } else {
      db.channels.push({
        id: channel.id,
        handle,
        name: channel.title,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        label,
      });
    }

    let newVideos = 0;
    let newSegments = 0;

    for (const snippet of snippets) {
      // Never overwrite an existing video's title/thumbnail — the admin may have hand-edited it.
      let video = db.videos.find((v) => v.id === snippet.id);
      if (!video) {
        video = {
          id: snippet.id,
          source: "youtube",
          title: snippet.title,
          channelId: channel.id,
          thumbnailUrl: snippet.thumbnailUrl,
          publishedAt: snippet.publishedAt,
        };
        db.videos.push(video);
        newVideos++;
      }

      // Dedupe on (videoId, timestampSec) so re-running sync doesn't duplicate rows or
      // clobber a label the admin has since corrected.
      const timedSegments = parseDescriptionSegments(snippet.description);
      for (const seg of timedSegments) {
        const exists = db.segments.some(
          (s) => s.videoId === snippet.id && s.timestampSec === seg.timestampSec
        );
        if (!exists) {
          db.segments.push({
            id: uuidv4(),
            videoId: snippet.id,
            timestampSec: seg.timestampSec,
            label: seg.label,
          });
          newSegments++;
        }
      }

      // Some videos (e.g. Wednesday livestreams) never got per-song timestamps —
      // only fall back to the untimed "찬양: <leader>" bullet list when nothing
      // timestamped was found, and dedupe by label since they all share timestampSec 0.
      if (timedSegments.length === 0) {
        for (const songLabel of parseUntimedSongList(snippet.description)) {
          const exists = db.segments.some(
            (s) => s.videoId === snippet.id && s.approx && s.label === songLabel
          );
          if (!exists) {
            db.segments.push({
              id: uuidv4(),
              videoId: snippet.id,
              timestampSec: 0,
              label: songLabel,
              approx: true,
            });
            newSegments++;
          }
        }
      }
    }

    return { newVideos, newSegments };
  });

  return NextResponse.json({
    channel: channel.title,
    videosScanned: snippets.length,
    ...result,
  });
}
