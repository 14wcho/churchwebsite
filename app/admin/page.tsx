"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Channel, Segment, VideoRecord } from "@/lib/db";
import { secondsToTimestamp } from "@/lib/youtube";

const PAGE_SIZE = 50;

export default function AdminPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [newHandle, setNewHandle] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const [source, setSource] = useState<"youtube" | "local">("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [localVideoId, setLocalVideoId] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localVideos, setLocalVideos] = useState<VideoRecord[]>([]);
  const [scanningLocal, setScanningLocal] = useState(false);

  const [editing, setEditing] = useState<{ id: string; timestamp: string; label: string } | null>(null);
  const [editingVideoTitle, setEditingVideoTitle] = useState<{ id: string; title: string } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/segments");
    const data = await res.json();
    setSegments(data.segments);
    setVideos(data.videos);
    setChannels(data.channels ?? []);
    setLoading(false);
  }

  async function scanLocalVideos() {
    setScanningLocal(true);
    try {
      const res = await fetch("/api/local-videos");
      const data = await res.json();
      setLocalVideos(data.videos);
    } finally {
      setScanningLocal(false);
    }
  }

  useEffect(() => {
    load();
    scanLocalVideos();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body =
        source === "youtube" ? { videoUrl, timestamp, label } : { localVideoId, timestamp, label };
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "추가 실패");
      setLabel("");
      setTimestamp("");
      setVideoUrl("");
      setLocalVideoId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await fetch(`/api/segments/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: editing.timestamp, label: editing.label }),
    });
    setEditing(null);
    await load();
  }

  async function handleSync(handle?: string, label?: string) {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "동기화 실패");
      setSyncResult(
        `${data.channel} · 영상 ${data.videosScanned}개 확인, 새 영상 ${data.newVideos}개, 새 구간 ${data.newSegments}개 추가됨`
      );
      setNewHandle("");
      setNewLabel("");
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function handleSaveVideoTitle() {
    if (!editingVideoTitle) return;
    await fetch(`/api/videos/${editingVideoTitle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editingVideoTitle.title }),
    });
    setEditingVideoTitle(null);
    await load();
  }

  const videoById = new Map(videos.map((v) => [v.id, v]));
  const sortedSegments = [...segments].sort((a, b) => {
    const va = videoById.get(a.videoId)?.title ?? "";
    const vb = videoById.get(b.videoId)?.title ?? "";
    return va === vb ? a.timestampSec - b.timestampSec : va.localeCompare(vb);
  });
  const totalPages = Math.max(1, Math.ceil(sortedSegments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedSegments = sortedSegments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 검색으로
        </Link>
        <button onClick={handleLogout} className="text-sm text-zinc-500 hover:underline">
          로그아웃
        </button>
      </div>
      <h1 className="text-2xl font-semibold mb-6">관리자 - 찬양 구간 관리</h1>

      <div className="mb-10 space-y-3 rounded-lg border border-zinc-200 p-4">
        <h2 className="font-medium">유튜브 채널 동기화</h2>
        <p className="text-sm text-zinc-500">
          채널의 모든 영상 설명란에서 타임스탬프(찬양 구간)를 자동으로 가져옵니다. 채널마다 검색 페이지에
          별도 탭으로 나타나요.
        </p>

        {channels.length > 0 && (
          <ul className="space-y-1">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{c.label ?? c.name}</span>{" "}
                  <span className="text-zinc-500">
                    ({c.name} · {c.handle})
                  </span>
                </span>
                <button
                  onClick={() => handleSync(c.handle)}
                  disabled={syncing}
                  className="shrink-0 text-blue-600 disabled:opacity-50"
                >
                  재동기화
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 pt-1">
          <input
            className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
            placeholder="유튜브 채널 핸들 (예: @newjerseyonnurichurch)"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
          />
          <input
            className="w-28 rounded border border-zinc-300 px-3 py-2 text-sm"
            placeholder="탭 이름 (예: 성인부)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            onClick={() => handleSync(newHandle, newLabel)}
            disabled={syncing || !newHandle.trim()}
            className="shrink-0 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {syncing ? "동기화 중..." : "채널 추가/동기화"}
          </button>
        </div>
        {syncResult && <p className="text-sm text-green-700">{syncResult}</p>}
        {syncError && <p className="text-sm text-red-600">{syncError}</p>}
      </div>

      <div className="mb-10 space-y-2 rounded-lg border border-zinc-200 p-4">
        <h2 className="font-medium">로컬 영상</h2>
        <p className="text-sm text-zinc-500">
          <code>local-videos</code> 폴더에 영상 파일을 넣고 스캔하면 아래 추가 폼에서 선택할 수 있어요.
        </p>
        <button
          onClick={scanLocalVideos}
          disabled={scanningLocal}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {scanningLocal ? "스캔 중..." : "폴더 스캔"}
        </button>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600">
          {localVideos.map((v) => (
            <li key={v.id}>{v.title}</li>
          ))}
          {localVideos.length === 0 && <li className="text-zinc-400">등록된 로컬 영상이 없습니다.</li>}
        </ul>
      </div>

      <form onSubmit={handleAdd} className="mb-10 space-y-3 rounded-lg border border-zinc-200 p-4">
        <h2 className="font-medium">새 구간 추가</h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={source === "youtube"}
              onChange={() => setSource("youtube")}
            />
            유튜브
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={source === "local"} onChange={() => setSource("local")} />
            로컬 영상
          </label>
        </div>
        {source === "youtube" ? (
          <input
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="유튜브 영상 URL (예: https://www.youtube.com/watch?v=...)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            required
          />
        ) : (
          <select
            className="w-full rounded border border-zinc-300 px-3 py-2"
            value={localVideoId}
            onChange={(e) => setLocalVideoId(e.target.value)}
            required
          >
            <option value="">로컬 영상 선택...</option>
            {localVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-3">
          <input
            className="w-32 rounded border border-zinc-300 px-3 py-2"
            placeholder="mm:ss"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            required
          />
          <input
            className="flex-1 rounded border border-zinc-300 px-3 py-2"
            placeholder="찬양 이름"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "추가 중..." : "추가"}
        </button>
      </form>

      <h2 className="mb-3 font-medium">전체 구간 ({segments.length})</h2>
      {loading ? (
        <p className="text-zinc-500">불러오는 중...</p>
      ) : (
        <ul className="space-y-2">
          {pagedSegments.map((s) => {
            const video = videoById.get(s.videoId);
            const isEditing = editing?.id === s.id;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded border border-zinc-200 p-3">
                {video?.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />
                )}
                <div className="flex-1">
                  {editingVideoTitle?.id === s.videoId ? (
                    <div className="mb-1 flex gap-2">
                      <input
                        className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                        value={editingVideoTitle.title}
                        onChange={(e) => setEditingVideoTitle({ ...editingVideoTitle, title: e.target.value })}
                      />
                      <button onClick={handleSaveVideoTitle} className="text-sm text-blue-600">
                        저장
                      </button>
                      <button onClick={() => setEditingVideoTitle(null)} className="text-sm text-zinc-500">
                        취소
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      {video?.title ?? s.videoId}{" "}
                      {video && (
                        <button
                          onClick={() => setEditingVideoTitle({ id: video.id, title: video.title })}
                          className="text-blue-600"
                        >
                          (제목 수정)
                        </button>
                      )}
                    </p>
                  )}
                  {isEditing ? (
                    <div className="mt-1 flex gap-2">
                      <input
                        className="w-24 rounded border border-zinc-300 px-2 py-1"
                        value={editing.timestamp}
                        onChange={(e) => setEditing({ ...editing, timestamp: e.target.value })}
                      />
                      <input
                        className="flex-1 rounded border border-zinc-300 px-2 py-1"
                        value={editing.label}
                        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                      />
                    </div>
                  ) : (
                    <p className="font-medium">
                      {secondsToTimestamp(s.timestampSec)} · {s.label}
                    </p>
                  )}
                </div>
                {isEditing ? (
                  <>
                    <button onClick={handleSaveEdit} className="text-sm text-blue-600">
                      저장
                    </button>
                    <button onClick={() => setEditing(null)} className="text-sm text-zinc-500">
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing({ id: s.id, timestamp: secondsToTimestamp(s.timestampSec), label: s.label })}
                      className="text-sm text-blue-600"
                    >
                      수정
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="text-sm text-red-600">
                      삭제
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-zinc-500">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </main>
  );
}
