import { NextRequest, NextResponse } from "next/server";
import { updateDB } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title } = body as { title?: string };

  if (title === undefined || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const updated = await updateDB((db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video) return null;
    video.title = title.trim();
    return video;
  });

  if (!updated) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  return NextResponse.json({ video: updated });
}
