import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

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

    const [logoUrl, profileImageUrl] = await Promise.all([
      getLocalPublicImageDataUrl("logo-white.png", "image/png"),
      imageUrlToDataUrl(interview.image1Url),
    ]);
    
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            backgroundImage: 'linear-gradient(to bottom right, #0f172a, #312e81, #1e1b4b)',
            color: 'white',
            padding: '80px',
            textAlign: 'center',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', marginBottom: '80px' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={logoUrl} 
                alt="Authority Magazine" 
                style={{ width: '400px', objectFit: 'contain' }} 
              />
            ) : (
              <div style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '0.04em' }}>
                Authority Magazine
              </div>
            )}
          </div>
          
          {/* Profile Picture */}
          {profileImageUrl ? (
            <div style={{ display: 'flex', borderRadius: '50%', overflow: 'hidden', width: '380px', height: '380px', border: '8px solid rgba(255,255,255,0.15)', marginBottom: '50px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={profileImageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', borderRadius: '50%', backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', width: '380px', height: '380px', border: '8px solid rgba(255,255,255,0.15)', marginBottom: '50px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
              <span style={{ fontSize: '150px', fontWeight: 'bold' }}>{interview.intervieweeName.charAt(0).toUpperCase()}</span>
            </div>
          )}

          {/* Name & Title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h1 style={{ fontSize: '72px', fontWeight: 800, margin: '0 0 16px 0', letterSpacing: '-0.03em' }}>
              {interview.intervieweeName}
            </h1>
            {interview.intervieweeCompany && (
              <h2 style={{ fontSize: '36px', fontWeight: 500, color: '#94a3b8', margin: '0 0 50px 0' }}>
                {interview.intervieweeTitle ? `${interview.intervieweeTitle}, ` : ""}{interview.intervieweeCompany}
              </h2>
            )}
          </div>

          {/* Topic */}
          {interview.topic && (
            <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.08)', padding: '32px 56px', borderRadius: '32px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.15)' }}>
              <p style={{ fontSize: '42px', fontWeight: 600, margin: 0, color: '#e0e7ff', lineHeight: 1.4 }}>
                &quot;{interview.topic}&quot;
              </p>
            </div>
          )}
        </div>
      ),
      {
        width: 1080,
        height: 1080,
      }
    );
  } catch (error) {
    console.error(error);
    return new Response("Failed to generate image", { status: 500 });
  }
}

async function getLocalPublicImageDataUrl(
  filename: string,
  contentType: string
): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", filename));
    return `data:${contentType};base64,${file.toString("base64")}`;
  } catch (error) {
    console.warn(`Could not load ${filename} for social image.`, error);
    return null;
  }
}

async function imageUrlToDataUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Authority-Magazine-Social-Image/1.0",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn("Could not load profile photo for social image.", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
