import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { remoteHtmlToText } from "@/lib/images/remote-html";
import { remoteImageUrlToDataUrl } from "@/lib/images/remote-image";
import {
  extractArticleMetadata,
  normalizeSheetImageUrl,
} from "@/lib/images/interview-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const articleMetadataCache = new Map<
  string,
  { expiresAt: number; imageUrl: string | null; title: string | null }
>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    const interview = await db.interview.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!interview) {
      return new Response("Not found", { status: 404 });
    }

    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return new Response("Access denied", { status: 403 });
    }

    const articleMetadata = await fetchArticleMetadata(interview.articleUrl);
    const imageCandidates = [
      articleMetadata.imageUrl,
      normalizeSheetImageUrl(interview.image1Url),
      normalizeSheetImageUrl(interview.image2Url),
    ];
    const featureImageUrl = await firstAvailableImageDataUrl(imageCandidates);
    const headline = articleMetadata.title || buildFallbackHeadline(interview);
    
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#151126',
            backgroundImage: 'linear-gradient(135deg, #171126, #202657 45%, #5b1634)',
            color: 'white',
            padding: '64px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {featureImageUrl ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={featureImageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '360px', fontWeight: 800, color: 'rgba(255,255,255,0.14)' }}>
                {interview.intervieweeName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(180deg, rgba(8,10,24,0.28), rgba(8,10,24,0.44) 38%, rgba(8,10,24,0.88) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(90deg, rgba(91,22,52,0.32), rgba(20,17,38,0) 44%, rgba(15,23,42,0.32))' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ display: 'flex', width: '86px', height: '86px', alignItems: 'center', justifyContent: 'center', borderRadius: '999px', border: '2px solid rgba(255,255,255,0.82)', color: 'white', fontSize: '48px', fontWeight: 850, fontFamily: 'Georgia, serif' }}>
                A
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '27px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Authority Magazine
                </span>
                <span style={{ marginTop: '5px', fontSize: '22px', color: 'rgba(255,255,255,0.76)' }}>
                  Featured Interview
                </span>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div style={{ display: 'flex', marginBottom: '24px', alignSelf: 'flex-start', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)', padding: '12px 22px', fontSize: '22px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Featured
            </div>
            <h1 style={{ fontSize: '70px', fontWeight: 850, margin: '0 0 22px 0', lineHeight: 1.04, letterSpacing: '0' }}>
              {headline}
            </h1>
            <div style={{ width: '150px', height: '6px', borderRadius: '999px', backgroundColor: '#e40062', marginBottom: '28px' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: '38px', fontWeight: 800, margin: 0 }}>
                {interview.intervieweeName}
              </p>
              {(interview.intervieweeTitle || interview.intervieweeCompany) && (
                <p style={{ margin: '8px 0 0 0', fontSize: '26px', color: 'rgba(255,255,255,0.82)' }}>
                  {[interview.intervieweeTitle, interview.intervieweeCompany].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <p style={{ margin: '42px 0 0 0', fontSize: '24px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              Read the full interview on Authority Magazine
            </p>
          </div>

          {/* Hidden accessibility text for the generated image tree. */}
          <div style={{ display: 'none' }}>
            <span>
              {interview.intervieweeName}
            </span>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(error);
    return new Response("Failed to generate image", { status: 500 });
  }
}

async function fetchArticleMetadata(articleUrl?: string | null): Promise<{
  imageUrl: string | null;
  title: string | null;
}> {
  if (!articleUrl || articleUrl.includes("/unpublished/")) {
    return { imageUrl: null, title: null };
  }

  if (articleMetadataCache.has(articleUrl)) {
    const cached = articleMetadataCache.get(articleUrl)!;
    if (cached.expiresAt > Date.now()) {
      return { imageUrl: cached.imageUrl, title: cached.title };
    }
  }

  try {
    const html = await remoteHtmlToText(articleUrl, {
      isAllowedUrl: isAllowedArticleUrl,
    });

    if (!html) return { imageUrl: null, title: null };

    const metadata = extractArticleMetadata(html);
    articleMetadataCache.set(articleUrl, {
      ...metadata,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return metadata;
  } catch {
    return { imageUrl: null, title: null };
  }
}

function isAllowedArticleUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return (
    hostname === "medium.com" ||
    hostname.endsWith(".medium.com") ||
    hostname === "authoritymagazine.com" ||
    hostname.endsWith(".authoritymagazine.com")
  );
}

async function firstAvailableImageDataUrl(
  urls: Array<string | null | undefined>
): Promise<string | null> {
  for (const url of urls) {
    const image = await remoteImageUrlToDataUrl(url);
    if (image) return image;
  }
  return null;
}

function buildFallbackHeadline(interview: {
  intervieweeName: string;
  topic?: string | null;
}) {
  const topic = interview.topic?.trim();
  if (
    topic &&
    !/\([^)]*name[^)]*\)|\bname\b|rising star/i.test(topic)
  ) {
    return topic;
  }
  return `An Authority Magazine interview with ${interview.intervieweeName}`;
}
