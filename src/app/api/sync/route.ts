import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import {
  parseGoogleSheetUrl,
  resolveTabTitle,
  readSheetData,
  mapHeaders,
  normalizeRows,
  deduplicateInterviewRecords,
} from "@/lib/google-sheets";

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    const user = await requireApiAuth();

    // --- Determine target clientId ---
    const searchParams = request.nextUrl.searchParams;
    let clientId = searchParams.get("clientId");

    if (user.role === UserRole.ADMIN && clientId) {
      // Admin syncing specific client
    } else if (user.clientId) {
      clientId = user.clientId;
    } else {
      return NextResponse.json(
        { error: "No client is associated with this account." },
        { status: 400 }
      );
    }

    // --- Validate client exists ---
    const client = await db.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found." },
        { status: 404 }
      );
    }

    // --- Fetch all sheet sources for this client ---
    const sheetSources = await db.sheetSource.findMany({
      where: { clientId },
    });

    if (sheetSources.length === 0) {
      return NextResponse.json(
        { error: "No Google Sheet sources found for this client. Please add one first." },
        { status: 404 }
      );
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;
    let totalDuplicatesSkipped = 0;
    const warnings: string[] = [];

    // --- Sync each sheet source ---
    for (const source of sheetSources) {
      // Parse the Google Sheets URL
      const parsedUrl = parseGoogleSheetUrl(source.sheetUrl);

      // Resolve tab title
      const tabTitle = await resolveTabTitle(
        parsedUrl.spreadsheetId,
        parsedUrl.gid
      );

      // Read sheet data
      const rawData = await readSheetData(
        parsedUrl.spreadsheetId,
        tabTitle,
        parsedUrl.gid
      );

      if (rawData.length === 0) {
        warnings.push(`Tab "${tabTitle}" is empty, skipped sync for this tab.`);
        continue;
      }

      // Map headers
      const headers = rawData[0].map((h) => String(h));
      const headerResult = mapHeaders(headers);

      if (headerResult.missingRequired.length > 0) {
        warnings.push(
          `Could not map headers for "${tabTitle}". Missing required columns: ${headerResult.missingRequired.join(
            ", "
          )}`
        );
        continue;
      }

      // Normalize rows (passing spreadsheetId to support unpublished rows)
      const normResult = normalizeRows(
        rawData,
        headerResult.mappings,
        0,
        parsedUrl.spreadsheetId
      );

      const deduplicated = deduplicateInterviewRecords(normResult.published);
      const importRecords = deduplicated.records;

      // Warnings compilation
      warnings.push(...headerResult.warnings.map(w => `[${tabTitle}] ${w}`));
      warnings.push(...normResult.warnings.map(w => `[${tabTitle}] ${w}`));

      if (importRecords.length === 0) {
        continue;
      }

      // Sync with database inside a transaction
      const result = await db.$transaction(async (tx) => {
        // Update SheetSource lastSyncedAt
        await tx.sheetSource.update({
          where: { id: source.id },
          data: {
            lastSyncedAt: new Date(),
          },
        });

        // Query existing interviews for this sheet source
        const currentSourceInterviews = await tx.interview.findMany({
          where: { sheetSourceId: source.id },
        });

        const byArticleUrl = new Map(
          currentSourceInterviews.map((i) => [i.articleUrl, i])
        );
        const byRowNumber = new Map(
          currentSourceInterviews
            .filter((i) => i.sourceRowNumber !== null)
            .map((i) => [i.sourceRowNumber, i])
        );
        const usedInterviewIds = new Set<string>();

        // Temporarily nullify row numbers to prevent unique constraint conflicts
        await tx.interview.updateMany({
          where: { sheetSourceId: source.id },
          data: { sourceRowNumber: null },
        });

        // Find duplicates in other sheets
        const otherSourceInterviews = await tx.interview.findMany({
          where: {
            clientId,
            NOT: { sheetSourceId: source.id },
          },
          select: {
            articleUrl: true,
          },
        });
        const duplicateArticleUrls = new Set(
          otherSourceInterviews.map((i) => i.articleUrl)
        );

        let created = 0;
        let updated = 0;
        let unchanged = 0;
        let duplicatesSkipped = deduplicated.duplicates.length;

        for (const record of importRecords) {
          if (duplicateArticleUrls.has(record.articleUrl)) {
            duplicatesSkipped++;
            continue;
          }

          const articleMatch = byArticleUrl.get(record.articleUrl);
          const rowMatch = byRowNumber.get(record.sourceRowNumber);
          const existing =
            articleMatch && !usedInterviewIds.has(articleMatch.id)
              ? articleMatch
              : rowMatch && !usedInterviewIds.has(rowMatch.id)
                ? rowMatch
                : null;

          if (existing) {
            usedInterviewIds.add(existing.id);
            await tx.interview.update({
              where: { id: existing.id },
              data: {
                sourceRowNumber: record.sourceRowNumber,
                sourceRowHash: record.sourceRowHash,
                intervieweeName: record.intervieweeName,
                intervieweeCompany: record.intervieweeCompany,
                intervieweeTitle: record.intervieweeTitle,
                intervieweeEmail:
                  existing.intervieweeEmail || record.intervieweeEmail,
                publicistName: record.publicistName,
                publicistEmail:
                  existing.publicistEmail || record.publicistEmail,
                topic: record.topic,
                articleUrl: record.articleUrl,
                buzzfeedUrl: record.buzzfeedUrl,
                interviewDocUrl: record.interviewDocUrl,
                image1Url: record.image1Url,
                image2Url: record.image2Url,
                extraImagesUrl: record.extraImagesUrl,
                videoUrl: record.videoUrl,
                linkedinUrl: existing.linkedinUrl || record.linkedinUrl,
                twitterUrl: existing.twitterUrl || record.twitterUrl,
                liveEmailStatusImported: record.estimatedPublishDate || record.liveEmailStatusImported,
                pressFollowupStatusImported:
                  record.pressFollowupStatusImported,
                estimatedPublishDate: parseOptionalDate(
                  record.estimatedPublishDate
                ),
              },
            });
            if (existing.sourceRowHash === record.sourceRowHash) unchanged++;
            else updated++;
            continue;
          }

          // Create new record
          const createdInterview = await tx.interview.create({
            data: {
              clientId,
              sheetSourceId: source.id,
              sourceRowNumber: record.sourceRowNumber,
              sourceRowHash: record.sourceRowHash,
              intervieweeName: record.intervieweeName,
              intervieweeCompany: record.intervieweeCompany,
              intervieweeEmail: record.intervieweeEmail,
              intervieweeTitle: record.intervieweeTitle,
              publicistName: record.publicistName,
              publicistEmail: record.publicistEmail,
              topic: record.topic,
              articleUrl: record.articleUrl,
              buzzfeedUrl: record.buzzfeedUrl,
              interviewDocUrl: record.interviewDocUrl,
              image1Url: record.image1Url,
              image2Url: record.image2Url,
              extraImagesUrl: record.extraImagesUrl,
              videoUrl: record.videoUrl,
              linkedinUrl: record.linkedinUrl,
              twitterUrl: record.twitterUrl,
              liveEmailStatusImported: record.estimatedPublishDate || record.liveEmailStatusImported,
              pressFollowupStatusImported:
                record.pressFollowupStatusImported,
              estimatedPublishDate: parseOptionalDate(
                record.estimatedPublishDate
              ),
            },
          });

          await tx.action.create({
            data: {
              clientId,
              interviewId: createdInterview.id,
              actionType: "IMPORT_CREATED",
              status: "SUCCESS",
              note: `Imported during sync from ${tabTitle}, row ${record.sourceRowNumber}.`,
            },
          });
          created++;
        }

        return {
          created,
          updated,
          unchanged,
          duplicatesSkipped,
        };
      }, { timeout: 60_000 });

      totalCreated += result.created;
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;
      totalDuplicatesSkipped += result.duplicatesSkipped;
    }

    return NextResponse.json({
      success: true,
      result: {
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        duplicatesSkipped: totalDuplicatesSkipped,
      },
      warnings,
      message: `Sync complete. ${totalCreated} created, ${totalUpdated} updated, ${totalUnchanged} unchanged.`,
    });
  } catch (error: unknown) {
    console.error("Sync API error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "An unexpected error occurred during sync." },
      { status: 500 }
    );
  }
}

function parseOptionalDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
