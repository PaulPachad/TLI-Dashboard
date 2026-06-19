// ==============================================================================
// POST /api/import-google-sheet — Import interviews from Google Sheets
// ==============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiAuth } from "@/lib/auth-helpers";
import { UserRole } from "@/types/db";
import {
  parseGoogleSheetUrl,
  SheetUrlError,
  resolveTabTitle,
  readSheetData,
  mapHeaders,
  normalizeRows,
  deduplicateInterviewRecords,
  isDemoMode,
  SheetsConfigError,
  appendSheetUrlParams,
} from "@/lib/google-sheets";

interface ImportRequest {
  clientId: string;
  sheetUrl: string;
  confirm?: boolean; // If true, actually save to DB. If false/missing, preview only.
  importAll?: boolean; // If true, sync all. Otherwise limit to last 100 if > 200 entries.
  customMappings?: Record<string, number>;
}

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    const user = await requireApiAuth();

    // --- Parse request body ---
    const body: ImportRequest = await request.json();

    if (!body.clientId) {
      return NextResponse.json(
        { error: "clientId is required." },
        { status: 400 }
      );
    }

    if (user.role !== UserRole.ADMIN) {
      if (!user.clientId) {
        return NextResponse.json(
          { error: "No client is associated with this account." },
          { status: 400 }
        );
      }
      if (body.clientId !== user.clientId) {
        return NextResponse.json(
          { error: "You can only import interviews into your own account." },
          { status: 403 }
        );
      }
    }

    if (!body.sheetUrl) {
      return NextResponse.json(
        { error: "sheetUrl is required. Please paste a Google Sheets link." },
        { status: 400 }
      );
    }

    // --- Validate client exists ---
    const client = await db.client.findUnique({
      where: { id: body.clientId },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found." },
        { status: 404 }
      );
    }

    // --- Parse the Google Sheets URL ---
    let parsedUrl;
    try {
      parsedUrl = parseGoogleSheetUrl(body.sheetUrl);
    } catch (e) {
      if (e instanceof SheetUrlError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    // --- Resolve tab title from gid ---
    const tabTitle = await resolveTabTitle(
      parsedUrl.spreadsheetId,
      parsedUrl.gid
    );

    // --- Read sheet data ---
    const rawData = await readSheetData(
      parsedUrl.spreadsheetId,
      tabTitle,
      parsedUrl.gid
    );

    if (rawData.length === 0) {
      return NextResponse.json(
        { error: "This sheet tab appears to be empty." },
        { status: 400 }
      );
    }

        // --- Map headers ---
    const headers = rawData[0].map((h) => String(h));
    const headerResult = mapHeaders(headers, rawData, body.customMappings);

    if (headerResult.missingRequired.length > 0) {
      return NextResponse.json(
        {
          error:
            'We found the sheet, but could not find an "Authority Magazine Link" column. ' +
            'Please select the column mapping manually below.',
          warnings: headerResult.warnings,
          headers: headers,
        },
        { status: 200 }
      );
    }

    // --- Limit large sheets to the last 100 rows by default ---
    const totalDataRows = rawData.length - 1;
    let finalRawData = rawData;
    let rowOffset = 0;
    const importAll = !!body.importAll;
    const wasLimited = !importAll && totalDataRows > 200;

    if (wasLimited) {
      const targetLimit = 100;
      const skippedCount = totalDataRows - targetLimit;
      const dataRows = rawData.slice(1);
      finalRawData = [rawData[0], ...dataRows.slice(-targetLimit)];
      rowOffset = skippedCount;
    }

    // --- Normalize rows ---
    const normResult = normalizeRows(finalRawData, headerResult.mappings, 0, parsedUrl.spreadsheetId, rowOffset);
    const deduplicated = deduplicateInterviewRecords(normResult.published);
    const importRecords = deduplicated.records;

    const isRecordUnpublished = (r: typeof importRecords[0]) =>
      r.articleUrl.includes("/unpublished/") ||
      r.liveEmailStatusImported?.toUpperCase() !== "LIVE";

    const basePreview = {
      demoMode: isDemoMode(),
      sheetTitle: tabTitle,
      totalRows: normResult.totalRows,
      published: importRecords.filter((r) => !isRecordUnpublished(r)).length,
      skippedNoArticle: 0,
      skippedInvalidArticle: 0,
      skippedEmpty: normResult.skippedEmptyRow,
      interviews: importRecords
        .filter((r) => !isRecordUnpublished(r))
        .map((r) => ({
          rowNumber: r.sourceRowNumber,
          intervieweeName: r.intervieweeName,
          topic: r.topic,
          articleUrl: r.articleUrl,
          hasEmail: !!r.intervieweeEmail,
          hasPublicist: !!r.publicistName,
          hasProminenceSignals:
            r.companyEmployeeCount ||
            r.companyRevenueUsd ||
            r.largestSocialFollowerCount ||
            r.prominenceNotes
              ? true
              : false,
        })),
      unpublished: [
        ...normResult.unpublished.map((r) => ({
          rowNumber: r.sourceRowNumber,
          intervieweeName: r.intervieweeName,
          topic: r.topic,
          estimatedPublishDate: r.estimatedPublishDate,
          reason: r.reason,
        })),
        ...importRecords
          .filter((r) => !r.articleUrl.includes("/unpublished/") && r.liveEmailStatusImported?.toUpperCase() !== "LIVE")
          .map((r) => ({
            rowNumber: r.sourceRowNumber,
            intervieweeName: r.intervieweeName,
            topic: r.topic,
            estimatedPublishDate: r.estimatedPublishDate,
            reason: `Authority Magazine Link exists, but status is "${r.liveEmailStatusImported || "blank"}" (needs "LIVE")`,
          })),
      ].sort((a, b) => a.rowNumber - b.rowNumber),
      headerMappings: headerResult.mappings.map((m) => ({
        field: m.field,
        matchedHeader: m.matchedHeader,
        matchType: m.matchType,
        columnIndex: m.columnIndex,
      })),
      unmappedHeaders: headerResult.unmappedHeaders,
    };

    if (importRecords.length === 0) {
      return NextResponse.json(
        {
          error: "The real sheet was read successfully, but no interviews were found.",
          preview: basePreview,
          warnings: [
            ...headerResult.warnings,
            ...normResult.warnings,
          ],
          headers,
        },
        { status: 200 }
      );
    }

    const existingSheetSource = await db.sheetSource.findFirst({
      where: {
        clientId: body.clientId,
        spreadsheetId: parsedUrl.spreadsheetId,
        gid: parsedUrl.gid,
      },
    });
    const otherSourceInterviews = await db.interview.findMany({
      where: {
        clientId: body.clientId,
        ...(existingSheetSource
          ? { NOT: { sheetSourceId: existingSheetSource.id } }
          : {}),
      },
      select: {
        intervieweeName: true,
        articleUrl: true,
      },
    });
    const duplicateArticleUrls = new Set(
      otherSourceInterviews.map((interview) => interview.articleUrl)
    );
    const otherNames = new Set(
      otherSourceInterviews.map((interview) =>
        normalizeIdentityName(interview.intervieweeName)
      )
    );
    const exactDuplicates = importRecords.filter((record) =>
      duplicateArticleUrls.has(record.articleUrl)
    );
    const possibleNameDuplicates = importRecords.filter(
      (record) =>
        !duplicateArticleUrls.has(record.articleUrl) &&
        otherNames.has(normalizeIdentityName(record.intervieweeName))
    );

    // --- Preview mode (default) ---
    const preview = basePreview;

    const warnings = [...headerResult.warnings, ...normResult.warnings];
    if (wasLimited) {
      warnings.push(
        `This sheet has ${totalDataRows} entries. By default, only the last 100 entries ` +
          `are loaded. Check "Import all entries" to load the entire sheet.`
      );
    }
    if (deduplicated.duplicates.length > 0) {
      warnings.push(
        `${deduplicated.duplicates.length} repeated article link(s) in this sheet ` +
          `were skipped: ${deduplicated.duplicates
            .map(
              ({ duplicate, originalRowNumber }) =>
                `row ${duplicate.sourceRowNumber} repeats row ${originalRowNumber}`
            )
            .join(", ")}.`
      );
    }
    if (exactDuplicates.length > 0) {
      warnings.push(
        `${exactDuplicates.length} interview(s) already exist in another sheet ` +
          "with the same article URL and will be skipped."
      );
    }
    if (possibleNameDuplicates.length > 0) {
      warnings.push(
        `${possibleNameDuplicates.length} interview(s) have the same guest name ` +
          "as another sheet. Review the preview to confirm they are separate articles."
      );
    }

    if (!body.confirm) {
      return NextResponse.json({
        preview,
        warnings,
        headers,
        message: `Found ${importRecords.length} interview(s) ready to import. Send confirm: true to save.`,
      });
    }

    // --- Confirm mode: save to database ---

    const result = await db.$transaction(async (tx) => {
      const finalUrl = appendSheetUrlParams(body.sheetUrl, {
        importAll,
        customMappings: body.customMappings,
      });
      const sheetSource = existingSheetSource
        ? await tx.sheetSource.update({
            where: { id: existingSheetSource.id },
            data: {
              sheetUrl: finalUrl,
              sheetTitle: tabTitle,
              lastSyncedAt: new Date(),
            },
          })
        : await tx.sheetSource.create({
            data: {
              clientId: body.clientId,
              sheetUrl: finalUrl,
              spreadsheetId: parsedUrl.spreadsheetId,
              gid: parsedUrl.gid,
              sheetTitle: tabTitle,
              lastSyncedAt: new Date(),
            },
          });

      const currentSourceInterviews = await tx.interview.findMany({
        where: { sheetSourceId: sheetSource.id },
      });
      const byArticleUrl = new Map(
        currentSourceInterviews.map((interview) => [
          interview.articleUrl,
          interview,
        ])
      );
      const byRowNumber = new Map(
        currentSourceInterviews
          .filter((interview) => interview.sourceRowNumber !== null)
          .map((interview) => [interview.sourceRowNumber, interview])
      );
      const usedInterviewIds = new Set<string>();

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
          await clearRowNumberConflict(
            tx,
            sheetSource.id,
            record.sourceRowNumber,
            existing.id
          );
          if (existing.sourceRowNumber !== null) {
            byRowNumber.delete(existing.sourceRowNumber);
          }
          byRowNumber.delete(record.sourceRowNumber);

          usedInterviewIds.add(existing.id);
          await tx.interview.update({
            where: { id: existing.id },
            data: {
              sourceRowNumber: record.sourceRowNumber,
              sourceRowHash: record.sourceRowHash,
              intervieweeName: record.intervieweeName,
              intervieweeCompany: record.intervieweeCompany,
              intervieweeTitle: record.intervieweeTitle,
              companyEmployeeCount: record.companyEmployeeCount,
              companyRevenueUsd: record.companyRevenueUsd,
              largestSocialFollowerCount: record.largestSocialFollowerCount,
              prominenceNotes: record.prominenceNotes,
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

        await clearRowNumberConflict(
          tx,
          sheetSource.id,
          record.sourceRowNumber
        );
        byRowNumber.delete(record.sourceRowNumber);

        const createdInterview = await tx.interview.create({
          data: {
            clientId: body.clientId,
            sheetSourceId: sheetSource.id,
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
            clientId: body.clientId,
            interviewId: createdInterview.id,
            actionType: "IMPORT_CREATED",
            status: "SUCCESS",
            note: `Imported from ${tabTitle}, row ${record.sourceRowNumber}.`,
          },
        });
        created++;
      }

      return {
        created,
        updated,
        unchanged,
        duplicatesSkipped,
        total: importRecords.length,
      };
    }, { timeout: 60_000 });

    return NextResponse.json({
      success: true,
      preview,
      warnings,
      result,
      message:
        `Import complete. ${result.created} created, ${result.updated} updated, ` +
        `${result.unchanged} unchanged, ${result.duplicatesSkipped} duplicate(s) skipped.`,
    });
  } catch (error: unknown) {
    if (error instanceof SheetsConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const err = error as {
      code?: string;
      status?: number;
      message?: string;
      meta?: { target?: string[] };
    };

    // Auth errors thrown by requireApiAuth
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }

    if (
      err.code === "P2002" &&
      err.meta?.target?.includes("articleUrl")
    ) {
      return NextResponse.json(
        {
          error:
            "This import contains an article link that already belongs to this client. " +
            "Repeated links are skipped automatically; preview the sheet again and retry.",
        },
        { status: 409 }
      );
    }

    console.error("Import error:", error);
    return NextResponse.json(
      {
        error:
          err.message ||
          "An unexpected error occurred during import. Please try again.",
      },
      { status: 500 }
    );
  }
}

function parseOptionalDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeIdentityName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
