import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { extractArticleImage } from "@/lib/images/interview-image";

const imageCache = new Map<string, string | null>();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;
    const interview = await db.interview.findUnique({
      where: { id },
      select: { clientId: true, articleUrl: true },
    });

    if (!interview) {
      return new NextResponse(null, { status: 404 });
    }
    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return new NextResponse(null, { status: 403 });
    }

    if (interview.articleUrl.includes("/unpublished/")) {
      return new NextResponse(null, { status: 404 });
    }

    if (imageCache.has(interview.articleUrl)) {
      return imageResponse(imageCache.get(interview.articleUrl) || null);
    }

    const articleUrl = new URL(interview.articleUrl);
    const hostname = articleUrl.hostname.toLowerCase().replace(/^www\./, "");
    if (
      hostname !== "medium.com" &&
      hostname !== "authoritymagazine.com" &&
      !hostname.endsWith(".authoritymagazine.com")
    ) {
      imageCache.set(interview.articleUrl, null);
      return new NextResponse(null, { status: 404 });
    }

    const response = await fetch(interview.articleUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (compatible; TLI-Leverage-Dashboard/1.0; image-preview)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      imageCache.set(interview.articleUrl, null);
      return new NextResponse(null, { status: 404 });
    }

    const imageUrl = extractArticleImage(await response.text());
    imageCache.set(interview.articleUrl, imageUrl);
    return imageResponse(imageUrl);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401 || err.status === 403) {
      return new NextResponse(null, { status: err.status });
    }
    return new NextResponse(null, { status: 404 });
  }
}

function imageResponse(imageUrl: string | null) {
  if (!imageUrl) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(imageUrl, {
    headers: {
      "Cache-Control": "private, max-age=86400",
    },
  });
}
