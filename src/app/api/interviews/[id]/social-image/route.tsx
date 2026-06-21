import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { remoteImageUrlToDataUrl } from "@/lib/images/remote-image";
import {
  buildInterviewImageSources,
  extractArticleTitleFromUrl,
} from "@/lib/images/interview-image";
import { fetchArticleMetadata } from "@/lib/images/interview-image-server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiAuth();
    const { id } = await params;

    const interview = await db.interview.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        intervieweeName: true,
        intervieweeCompany: true,
        intervieweeTitle: true,
        articleUrl: true,
        image1Url: true,
        image2Url: true,
      },
    });

    if (!interview) {
      return new Response("Not found", { status: 404 });
    }

    if (user.role !== "ADMIN" && user.clientId !== interview.clientId) {
      return new Response("Access denied", { status: 403 });
    }

    const [logoUrl, articleMetadata] = await Promise.all([
      getLocalPublicImageDataUrl(
        "authority-logo-mark-white.png",
        "image/png"
      ),
      fetchArticleMetadata(interview.articleUrl),
    ]);
    const imageCandidates = [
      ...buildInterviewImageSources(interview),
      articleMetadata.imageUrl,
    ].filter(isRemoteImageUrl);
    const featureImageUrl = await firstAvailableImageDataUrl(imageCandidates);
    const headline =
      articleMetadata.title ||
      extractArticleTitleFromUrl(interview.articleUrl) ||
      buildFallbackHeadline(interview);

    const headlineFontSize = headline.length > 80 ? '48px' : headline.length > 50 ? '56px' : '70px';
    const headlineLineHeight = headline.length > 80 ? 1.1 : headline.length > 50 ? 1.08 : 1.04;
    
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
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Authority Magazine"
                  style={{ width: '86px', height: '86px', objectFit: 'contain' }}
                />
              ) : null}
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
            <h1 style={{ fontSize: headlineFontSize, fontWeight: 850, margin: '0 0 22px 0', lineHeight: headlineLineHeight, letterSpacing: '0' }}>
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

async function firstAvailableImageDataUrl(
  urls: Array<string | null | undefined>
): Promise<string | null> {
  let firstRemoteUrl: string | null = null;
  for (const url of urls) {
    if (!url) continue;
    firstRemoteUrl ||= url;
    const image = await remoteImageUrlToDataUrl(url);
    if (image) return image;
  }
  return firstRemoteUrl;
}

function isRemoteImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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

async function getLocalPublicImageDataUrl(
  filename: string,
  contentType: string
): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", filename));
    return `data:${contentType};base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}
