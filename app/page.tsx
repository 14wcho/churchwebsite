"use client";

import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import type { Channel, Segment, VideoRecord } from "@/lib/db";
import { guessServiceLabel, secondsToTimestamp } from "@/lib/youtube";

interface SearchItem {
  segment: Segment;
  video: VideoRecord;
}

const PAGE_SIZE = 50;

// Cross-cutting tabs on top of the per-channel ones — a video can show up under
// both its channel tab and one of these, matched by a day-of-week keyword in the
// title (e.g. "...| 수요성령집회 | ..."). Not a separate channel, just a filter.
const DAY_TABS: { key: string; label: string; test: RegExp }[] = [
  { key: "day:수요", label: "수요예배", test: /수요/ },
  { key: "day:토요", label: "토요예배", test: /토요/ },
];

export default function Home() {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/segments");
      const data = await res.json();
      const videoById = new Map<string, VideoRecord>(
        (data.videos as VideoRecord[]).map((v) => [v.id, v])
      );
      const combined: SearchItem[] = (data.segments as Segment[])
        .map((segment) => {
          const video = videoById.get(segment.videoId);
          return video ? { segment, video } : null;
        })
        .filter((x): x is SearchItem => x !== null);
      setItems(combined);
      setChannels((data.channels as Channel[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const dayTab = DAY_TABS.find((t) => t.key === selectedFilter);
  const scopedItems = dayTab
    ? items.filter((i) => dayTab.test.test(i.video.title))
    : selectedFilter
      ? items.filter((i) => i.video.channelId === selectedFilter)
      : items;

  const fuse = useMemo(
    () =>
      new Fuse(scopedItems, {
        keys: [
          { name: "segment.label", weight: 2 },
          { name: "video.title", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [scopedItems]
  );

  const results = query.trim()
    ? fuse.search(query.trim()).map((r) => r.item)
    : scopedItems
        .slice()
        .sort((a, b) => (a.video.publishedAt ?? "").localeCompare(b.video.publishedAt ?? ""))
        .reverse();

  useEffect(() => {
    setPage(1);
  }, [query, selectedFilter]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">찬양 검색</h1>
        <div className="flex gap-4 text-sm text-zinc-500">
          <Link href="/transpose" className="hover:underline">
            코드 변환
          </Link>
          <Link href="/admin" className="hover:underline">
            관리자
          </Link>
        </div>
      </div>

      {channels.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => setSelectedFilter(null)}
            className={`rounded-full px-3 py-1 ${
              selectedFilter === null ? "bg-black text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            전체
          </button>
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedFilter(c.id)}
              className={`rounded-full px-3 py-1 ${
                selectedFilter === c.id ? "bg-black text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {c.label ?? c.name}
            </button>
          ))}
          {DAY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedFilter(t.key)}
              className={`rounded-full px-3 py-1 ${
                selectedFilter === t.key ? "bg-black text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <input
        autoFocus
        className="mb-8 w-full rounded-lg border border-zinc-300 px-4 py-3 text-lg"
        placeholder="찬양 이름을 입력하세요..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <p className="text-zinc-500">불러오는 중...</p>
      ) : results.length === 0 ? (
        <p className="text-zinc-500">
          {query ? "검색 결과가 없습니다." : "아직 등록된 찬양 구간이 없습니다. 관리자 페이지에서 추가하세요."}
        </p>
      ) : (
        <>
        <p className="mb-3 text-sm text-zinc-500">
          {results.length}개 중 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, results.length)}
        </p>
        <ul className="space-y-3">
          {pagedResults.map(({ segment, video }) => {
            const isPlaying = playingSegmentId === segment.id;
            const thumb = video.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumbnailUrl} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
            );
            const info = (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-500">{video.title}</p>
                <p className="font-medium">
                  {segment.approx
                    ? `${guessServiceLabel(video.title)} · ${segment.label}`
                    : `${secondsToTimestamp(segment.timestampSec)} · ${segment.label}`}
                </p>
              </div>
            );

            if (video.source === "youtube") {
              // This channel disables embedding, so inline playback isn't possible —
              // open the real watch page at the right timestamp instead.
              return (
                <li key={segment.id} className="overflow-hidden rounded-lg border border-zinc-200">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}&t=${segment.timestampSec}s`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-3 hover:bg-zinc-50"
                  >
                    {thumb}
                    {info}
                    <span className="shrink-0 text-xl">↗</span>
                  </a>
                </li>
              );
            }

            return (
              <li key={segment.id} className="overflow-hidden rounded-lg border border-zinc-200">
                <button
                  className="flex w-full items-center gap-4 p-3 text-left hover:bg-zinc-50"
                  onClick={() => setPlayingSegmentId(isPlaying ? null : segment.id)}
                >
                  {thumb}
                  {info}
                  <span className="shrink-0 text-xl">{isPlaying ? "▼" : "▶"}</span>
                </button>

                {isPlaying && (
                  <div className="aspect-video w-full bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      className="h-full w-full"
                      src={`/api/local-videos/${video.id}#t=${segment.timestampSec}`}
                      controls
                      autoPlay
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-zinc-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
        </>
      )}
    </main>
  );
}
