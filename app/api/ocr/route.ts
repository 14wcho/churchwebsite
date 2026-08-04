import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { CHORD_LIKE_PATTERN } from "@/lib/chord";

const TESSDATA_DIR = path.join(process.cwd(), "tessdata");

// OCR can take longer than the default serverless timeout, especially on cold starts.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Without a local langPath, tesseract.js fetches eng.traineddata (~5MB) from a
  // CDN on every cold start, which is what was blowing through the serverless
  // timeout. We bundle the plain (non-gzipped) file ourselves instead.
  const worker = await createWorker("eng", undefined, {
    langPath: TESSDATA_DIR,
    gzip: false,
    cachePath: "/tmp",
  });
  try {
    const { data } = await worker.recognize(buffer, {}, { blocks: true });
    const words: { text: string; x: number; y: number; width: number; height: number }[] = [];

    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const word of line.words) {
            const text = word.text.trim();
            if (CHORD_LIKE_PATTERN.test(text)) {
              words.push({
                text,
                x: word.bbox.x0,
                y: word.bbox.y0,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ words });
  } finally {
    await worker.terminate();
  }
}
