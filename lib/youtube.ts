// Helpers for parsing YouTube URLs/descriptions and talking to the YouTube Data API v3.

export function timestampToSeconds(ts: string): number {
  const parts = ts.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function secondsToTimestamp(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Extracts a YouTube video id (and optional start-time in seconds) from any common URL shape. */
export function parseYouTubeUrl(
  input: string
): { videoId: string; startSec?: number } | null {
  const trimmed = input.trim();

  // Bare 11-char video id
  if (/^[\w-]{11}$/.test(trimmed)) return { videoId: trimmed };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  let videoId: string | null = null;
  if (url.hostname.includes("youtu.be")) {
    videoId = url.pathname.slice(1).split("/")[0] || null;
  } else if (url.hostname.includes("youtube.com")) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")) {
      videoId = url.pathname.split("/")[2] || null;
    }
  }
  if (!videoId) return null;

  const tParam = url.searchParams.get("t");
  let startSec: number | undefined;
  if (tParam) {
    if (/^\d+$/.test(tParam)) {
      startSec = parseInt(tParam, 10);
    } else {
      // e.g. "1h2m3s"
      const match = tParam.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
      if (match) {
        const [, h, m, s] = match;
        startSec = (parseInt(h || "0", 10) * 3600) + (parseInt(m || "0", 10) * 60) + parseInt(s || "0", 10);
      }
    }
  }

  return { videoId, startSec };
}

/** Fetches title/thumbnail for a single video with no API key, via the public oEmbed endpoint. */
export async function fetchOEmbedInfo(
  videoId: string
): Promise<{ title: string; thumbnailUrl: string } | null> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    title: data.title as string,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export interface ParsedDescriptionSegment {
  timestampSec: number;
  label: string;
}

/** Parses "0:00 Song Name" style lines out of a video description. */
export function parseDescriptionSegments(description: string): ParsedDescriptionSegment[] {
  const lineRegex = /^\s*(\d{1,2}(?::\d{2}){1,2})\s+(.+?)\s*$/gm;
  const results: ParsedDescriptionSegment[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(description)) !== null) {
    const timestampSec = timestampToSeconds(m[1]);
    const label = m[2].trim();
    if (!Number.isNaN(timestampSec) && label) {
      results.push({ timestampSec, label });
    }
  }
  return results;
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

function requireApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set in .env.local");
  return key;
}

export async function fetchChannelByHandle(
  handle: string
): Promise<{ id: string; title: string; uploadsPlaylistId: string } | null> {
  const key = requireApiKey();
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const res = await fetch(
    `${API_BASE}/channels?part=id,snippet,contentDetails&forHandle=${encodeURIComponent(
      cleanHandle
    )}&key=${key}`
  );
  if (!res.ok) throw new Error(`YouTube API error (channels.list): ${res.status} ${await res.text()}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return {
    id: item.id,
    title: item.snippet.title,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

export async function fetchAllUploadedVideoIds(uploadsPlaylistId: string): Promise<string[]> {
  const key = requireApiKey();
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API_BASE}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", key);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube API error (playlistItems.list): ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

export interface VideoSnippet {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
}

export async function fetchVideoSnippets(videoIds: string[]): Promise<VideoSnippet[]> {
  const key = requireApiKey();
  const results: VideoSnippet[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = new URL(`${API_BASE}/videos`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube API error (videos.list): ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const item of data.items ?? []) {
      results.push({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description ?? "",
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl:
          item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? "",
      });
    }
  }
  return results;
}
