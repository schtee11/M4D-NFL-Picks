import { NextResponse } from "next/server";
import { TEAMS, teamLogo, normalizeAbbr } from "@/lib/teams";

// Same-origin proxy for team logos. The share card renders logos through this
// so that turning the card into a PNG (html-to-image) doesn't taint the canvas
// with cross-origin CDN images. Cached hard — logos never change.
export async function GET(req: Request) {
  const id = normalizeAbbr(new URL(req.url).searchParams.get("id") || "");
  if (!TEAMS[id]) return new NextResponse("Unknown team", { status: 404 });

  try {
    const upstream = await fetch(teamLogo(id), {
      headers: { "user-agent": "Mozilla/5.0", accept: "image/*" },
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) return new NextResponse("Upstream error", { status: 502 });
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/png",
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
