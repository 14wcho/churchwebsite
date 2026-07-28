"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KEY_OPTIONS, semitonesBetweenKeys, transposeChord } from "@/lib/chord";

interface ChordBox {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

let boxIdCounter = 0;
function nextId() {
  boxIdCounter += 1;
  return `box-${boxIdCounter}`;
}

export default function TransposePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [boxes, setBoxes] = useState<ChordBox[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [fromKey, setFromKey] = useState("C");
  const [toKey, setToKey] = useState("D");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const displayImgRef = useRef<HTMLImageElement>(null);
  const naturalImgRef = useRef<HTMLImageElement | null>(null);

  const semitones = semitonesBetweenKeys(fromKey, toKey);

  function recomputeScale() {
    const img = displayImgRef.current;
    if (img && img.naturalWidth) {
      setDisplayScale(img.clientWidth / img.naturalWidth);
    }
  }

  useEffect(() => {
    window.addEventListener("resize", recomputeScale);
    return () => window.removeEventListener("resize", recomputeScale);
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setBoxes([]);
    setResultUrl(null);
    setOcrError(null);

    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      naturalImgRef.current = img;
    };
    img.src = url;

    await runOcr(file);
  }

  async function runOcr(file: File) {
    setOcrLoading(true);
    setOcrError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR 실패");
      setBoxes(
        (
          data.words as { text: string; x: number; y: number; width: number; height: number }[]
        ).map((w) => ({ id: nextId(), ...w }))
      );
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "OCR 실패");
    } finally {
      setOcrLoading(false);
    }
  }

  function updateBoxText(id: string, text: string) {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  }

  function removeBox(id: string) {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
  }

  function handleImageAreaClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!naturalSize || displayScale === 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / displayScale;
    const clickY = (e.clientY - rect.top) / displayScale;
    const width = 70;
    const height = 30;
    setBoxes((prev) => [
      ...prev,
      { id: nextId(), text: "", x: clickX - width / 2, y: clickY - height / 2, width, height },
    ]);
  }

  function generateResult() {
    const img = naturalImgRef.current;
    if (!img || !naturalSize) return;
    const canvas = document.createElement("canvas");
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    for (const box of boxes) {
      if (!box.text.trim()) continue;
      const newText = transposeChord(box.text, semitones);
      const padding = 2;
      ctx.fillStyle = "white";
      ctx.fillRect(box.x - padding, box.y - padding, box.width + padding * 2, box.height + padding * 2);
      const fontSize = Math.max(10, Math.floor(box.height * 0.9));
      ctx.fillStyle = "black";
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(newText, box.x, box.y);
    }

    setResultUrl(canvas.toDataURL("image/png"));
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">악보 코드 Transpose</h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          검색으로
        </Link>
      </div>

      <div className="mb-6 space-y-3 rounded-lg border border-zinc-200 p-4">
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {ocrLoading && <p className="text-sm text-zinc-500">코드 인식 중...</p>}
        {ocrError && <p className="text-sm text-red-600">{ocrError}</p>}
        {imageUrl && !ocrLoading && (
          <p className="text-sm text-zinc-500">
            인식된 코드 {boxes.length}개. 잘못 인식된 코드는 상자를 클릭해서 고치고, 빠진 코드는
            이미지 빈 곳을 클릭해서 추가하세요. 필요없는 상자는 × 버튼으로 지우세요.
          </p>
        )}
      </div>

      {imageUrl && (
        <div className="mb-6 space-y-3">
          <div
            className="relative inline-block max-w-full border border-zinc-200"
            onClick={handleImageAreaClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={displayImgRef}
              src={imageUrl}
              alt="업로드한 악보"
              className="block max-w-full"
              onLoad={recomputeScale}
            />
            {boxes.map((box) => (
              <div
                key={box.id}
                className="absolute flex items-center"
                style={{
                  left: box.x * displayScale,
                  top: box.y * displayScale,
                  width: Math.max(box.width * displayScale, 40),
                  height: box.height * displayScale,
                }}
              >
                <input
                  value={box.text}
                  onChange={(e) => updateBoxText(box.id, e.target.value)}
                  className="w-full border-2 border-blue-500 bg-white/90 px-1 text-xs font-semibold text-blue-700"
                  style={{ height: "100%" }}
                />
                <button onClick={() => removeBox(box.id)} className="ml-0.5 text-xs text-red-600" title="삭제">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {imageUrl && (
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 p-4">
          <div>
            <label className="block text-sm text-zinc-500">원래 키</label>
            <select
              className="rounded border border-zinc-300 px-2 py-1"
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value)}
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-500">바꿀 키</label>
            <select
              className="rounded border border-zinc-300 px-2 py-1"
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-zinc-500">(+{semitones}반음)</p>
          <button onClick={generateResult} className="rounded bg-black px-4 py-2 text-white">
            변환 이미지 만들기
          </button>
        </div>
      )}

      {resultUrl && (
        <div className="space-y-3">
          <h2 className="font-medium">결과</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultUrl} alt="변환된 악보" className="max-w-full border border-zinc-200" />
          <a
            href={resultUrl}
            download="transposed-chord-sheet.png"
            className="inline-block rounded bg-black px-4 py-2 text-white"
          >
            다운로드
          </a>
        </div>
      )}
    </main>
  );
}
