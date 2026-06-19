import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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

const SYNC_BATCH_SIZE = 250;

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    const user = await requireApiAuth();

    // --- Determine target sheet sources ---
    const searchParams = request.nextUrl.searchParams;
    const reqClientId = searchParams.get("clientId");
    let sheetSources;

    if (user.role === UserRole.ADMIN && reqClientId) {
      // Admin syncing specific client
      const client = await db.client.findUnique({ where: { id: reqClientId } });
      if (!client) {
        return NextResponse.json({ error: "Client not found." }, { status: 404 });
      }
      sheetSources = await db.sheetSource.findMany({ where: { clientId: reqClientId } });
    } else if (user.role === UserRole.ADMIN && !reqClientId) {
      // Admin syncing ALL clients globally
      sheetSources = await db.sheetSource.findMany();
    } else if (user.clientId) {
      // Client syncing their own sheets
      const client = await db.client.findUnique({ where: { id: user.clientId } });
      if (!client) {
        return NextResponse.json({ error: "Client not found." }, { status: 404 });
      }
      sheetSources = await db.sheetSource.findMany({ where: { clientId: user.clientId } });
    } else {
      return NextResponse.json(
        { error: "No client is associated with this account." },
        { status: 400 }
      );
    }

    if (sheetSources.length === 0) {
      return NextResponse.json(
        { error: "No Google Sheet sources found. Please add one first." },
        { status: 404 }
      );
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;
    let totalDuplicatesSkipped = 0;
    let totalProcessed = 0;
    let totalBatches = 0;
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
      const headerResult = mapHeaders(headers, rawData, parsedUrl.customMappings);

      if (headerResult.missingRequired.length > 0) {
        warnings.push(
          `Could not map headers for "${tabTitle}". Missing required columns: ${headerResult.missingRequired.join(
            ", "
          )}`
        );
        continue;
      }

      const totalDataRows = rawData.length - 1;
      let finalRawData = rawData;
      let rowOffset = 0;
      const importAll = source.sheetUrl.includes("importAll=true");
      const wasLimited = !importAll && totalDataRows > 200;

      if (wasLimited) {
        const targetLimit = 100;
        const skippedCount = totalDataRows - targetLimit;
        const dataRows = rawData.slice(1);
        finalRawData = [rawData[0], ...dataRows.slice(-targetLimit)];
        rowOffset = skippedCount;
        warnings.push(
          `[${tabTitle}] Large sheet (${totalDataRows} rows) is limited to syncing the last 100 rows. ` +
            `To sync all rows, re-import the sheet with the "Import all entries" toggle enabled.`
        );
      }

      // Normalize rows (passing spreadsheetId to support unpublished rows)
      const normResult = normalizeRows(
        finalRawData,
        headerResult.mappings,
        0,
        parsedUrl.spreadsheetId,
        rowOffset
      );

      const deduplicated = deduplicateInterviewRecords(normResult.published);
      const importRecords = deduplicated.records;

      // Warnings compilation
      warnings.push(...headerResult.warnings.map(w => `[${tabTitle}] ${w}`));
      warnings.push(...normResult.warnings.map(w => `[${tabTitle}] ${w}`));

      if (importRecords.length === 0) {
        continue;
      }

      await db.sheetSource.update({
        where: { id: source.id },
        data: { lastSyncedAt: new Date() },
      });

      const currentSourceInterviews = await db.interview.findMany({
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

      const otherSourceInterviews = await db.interview.findMany({
        where: {
          clientId: source.clientId,
          NOT: { sheetSourceId: source.id },
        },
        select: { articleUrl: true },
      });
      const duplicateArticleUrls = new Set(
        otherSourceInterviews.map((i) => i.articleUrl)
      );

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let duplicatesSkipped = deduplicated.duplicates.length;
      let processed = 0;
      const recordBatches = chunk(importRecords, SYNC_BATCH_SIZE);

      for (const recordBatch of recordBatches) {
        const batchResult = await db.$transaction(async (tx) => {
          let batchCreated = 0;
          let batchUpdated = 0;
          let batchUnchanged = 0;
          let batchDuplicatesSkipped = 0;

          for (const record of recordBatch) {
            if (duplicateArticleUrls.has(record.articleUrl)) {
              batchDuplicatesSkipped++;
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
              if (
                existing.sourceRowHash === record.sourceRowHash &&
                existing.sourceRowNumber === record.sourceRowNumber
              ) {
                batchUnchanged++;
                continue;
              }

              await clearRowNumberConflict(
                tx,
                source.id,
                record.sourceRowNumber,
                existing.id
              );
              const conflictingRow = byRowNumber.get(record.sourceRowNumber);
              if (conflictingRow && conflictingRow.id !== existing.id) {
                byRowNumber.delete(record.sourceRowNumber);
              }

              const updatedInterview = await tx.interview.update({
                where: { id: existing.id },
                data: {
                  sourceRowNumber: record.sourceRowNumber,
                  sourceRowHash: record.sourceRowHash,
                  intervieweeName: record.intervieweeName,
                  intervieweeCompany: record.intervieweeCompany,
                  intervieweeTitle: record.intervieweeTitle,
                  companyEmployeeCount:
                    record.companyEmployeeCount ?? existing.companyEmployeeCount,
                  companyRevenueUsd:
                    record.companyRevenueUsd ?? existing.companyRevenueUsd,
                  largestSocialFollowerCount:
                    record.largestSocialFollowerCount ??
                    existing.largestSocialFollowerCount,
                  prominenceNotes:
                    record.prominenceNotes ?? existing.prominenceNotes,
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
                  liveEmailStatusImported:
                    record.estimatedPublishDate || record.liveEmailStatusImported,
                  pressFollowupStatusImported:
                    record.pressFollowupStatusImported,
                  estimatedPublishDate: parseOptionalDate(
                    record.estimatedPublishDate
                  ),
                },
              });

              byArticleUrl.delete(existing.articleUrl);
              byArticleUrl.set(updatedInterview.articleUrl, updatedInterview);
              if (existing.sourceRowNumber !== null) {
                byRowNumber.delete(existing.sourceRowNumber);
              }
              if (updatedInterview.sourceRowNumber !== null) {
                byRowNumber.set(
                  updatedInterview.sourceRowNumber,
                  updatedInterview
                );
              }
              batchUpdated++;
              continue;
            }

            await clearRowNumberConflict(
              tx,
              source.id,
              record.sourceRowNumber
            );
            byRowNumber.delete(record.sourceRowNumber);

            const createdInterview = await tx.interview.create({
              data: {
                clientId: source.clientId,
                sheetSourceId: source.id,
                sourceRowNumber: record.sourceRowNumber,
                sourceRowHash: record.sourceRowHash,
                intervieweeName: record.intervieweeName,
                intervieweeCompany: record.intervieweeCompany,
                intervieweeEmail: record.intervieweeEmail,
                intervieweeTitle: record.intervieweeTitle,
                companyEmployeeCount: record.companyEmployeeCount,
                companyRevenueUsd: record.companyRevenueUsd,
                largestSocialFollowerCount: record.largestSocialFollowerCount,
                prominenceNotes: record.prominenceNotes,
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
                liveEmailStatusImported:
                  record.estimatedPublishDate || record.liveEmailStatusImported,
                pressFollowupStatusImported:
                  record.pressFollowupStatusImported,
                estimatedPublishDate: parseOptionalDate(
                  record.estimatedPublishDate
                ),
              },
            });

            await tx.action.create({
              data: {
                clientId: source.clientId,
                interviewId: createdInterview.id,
                actionType: "IMPORT_CREATED",
                status: "SUCCESS",
                note: `Imported during sync from ${tabTitle}, row ${record.sourceRowNumber}.`,
              },
            });

            byArticleUrl.set(createdInterview.articleUrl, createdInterview);
            if (createdInterview.sourceRowNumber !== null) {
              byRowNumber.set(
                createdInterview.sourceRowNumber,
                createdInterview
              );
            }
            usedInterviewIds.add(createdInterview.id);
            batchCreated++;
          }

          return {
            created: batchCreated,
            updated: batchUpdated,
            unchanged: batchUnchanged,
            duplicatesSkipped: batchDuplicatesSkipped,
          };
        }, { timeout: 30_000 });

        created += batchResult.created;
        updated += batchResult.updated;
        unchanged += batchResult.unchanged;
        duplicatesSkipped += batchResult.duplicatesSkipped;
        processed += recordBatch.length;
      }

      const result = {
        created,
        updated,
        unchanged,
        duplicatesSkipped,
        processed,
        batches: recordBatches.length,
      };

      totalCreated += result.created;
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;
      totalDuplicatesSkipped += result.duplicatesSkipped;
      totalProcessed += result.processed;
      totalBatches += result.batches;
    }

    return NextResponse.json({
      success: true,
      result: {
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        duplicatesSkipped: totalDuplicatesSkipped,
        processed: totalProcessed,
        batches: totalBatches,
      },
      warnings,
      message: `Sync complete. ${totalCreated} created, ${totalUpdated} updated, ${totalUnchanged} skipped unchanged across ${totalBatches} batch(es).`,
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function clearRowNumberConflict(
  tx: Prisma.TransactionClient,
  sheetSourceId: string,
  sourceRowNumber: number,
  keepInterviewId?: string
) {
  await tx.interview.updateMany({
    where: {
      sheetSourceId,
      sourceRowNumber,
      ...(keepInterviewId ? { NOT: { id: keepInterviewId } } : {}),
    },
    data: { sourceRowNumber: null },
  });
}
