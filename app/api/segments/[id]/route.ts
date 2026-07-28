import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/db";
import { timestampToSeconds } from "@/lib/youtube";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { timestamp, label } = body as { timestamp?: string; label?: string };

  const updated = await updateDB((db) => {
    const segment = db.segments.find((s) => s.id === id);
    if (!segment) return null;
    if (label !== undefined) segment.label = label.trim();
    if (timestamp !== undefined) {
      const sec = timestampToSeconds(timestamp);
      if (!Number.isNaN(sec)) segment.timestampSec = sec;
    }
    return segment;
  });

  if (!updated) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  return NextResponse.json({ segment: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await updateDB((db) => {
    const idx = db.segments.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    db.segments.splice(idx, 1);
    return true;
  });

  if (!found) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
