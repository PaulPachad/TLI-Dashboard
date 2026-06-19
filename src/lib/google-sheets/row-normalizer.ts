// ==============================================================================
// Row Normalizer — Transform raw sheet rows into InterviewRecord objects
// ==============================================================================

import { createHash } from "crypto";
import { HeaderMapping } from "./header-mapper";
import {
  parseCountMetric,
  parseMoneyMetric,
} from "@/lib/prominence/signals";

export interface InterviewRecord {
  sourceRowNumber: number;
  sourceRowHash: string;

  intervieweeName: string;
  intervieweeCompany: string | null;
  intervieweeEmail: string | null;
  intervieweeTitle: string | null;
  companyEmployeeCount: number | null;
  companyRevenueUsd: number | null;
  largestSocialFollowerCount: number | null;
  prominenceNotes: string | null;
  publicistName: string | null;
  publicistEmail: string | null;
  topic: string | null;

  articleUrl: string;
  buzzfeedUrl: string | null;
  interviewDocUrl: string | null;

  image1Url: string | null;
  image2Url: string | null;
  extraImagesUrl: string | null;
  videoUrl: string | null;

  linkedinUrl: string | null;
  twitterUrl: string | null;

  liveEmailStatusImported: string | null;
  pressFollowupStatusImported: string | null;
  estimatedPublishDate: string | null;
}

export interface NormalizationResult {
  published: InterviewRecord[];
  unpublished: UnpublishedInterviewRow[];
  skippedNoArticle: number;
  skippedInvalidArticle: number;
  skippedEmptyRow: number;
  skippedNeedsAttention: number;
  totalRows: number;
  warnings: string[];
}

export interface UnpublishedInterviewRow {
  sourceRowNumber: number;
  intervieweeName: string;
  topic: string | null;
  estimatedPublishDate: string | null;
  reason: string;
}

function extractUrlForHosts(value: string, hosts: string[]): string | null {
  const urls = value.match(/https?:\/\/[^\s,;)\]]+/gi) ?? [];

  return (
    urls.find((url) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
        return hosts.some(
          (host) => hostname === host || hostname.endsWith(`.${host}`)
        );
      } catch {
        return false;
      }
    }) ?? null
  );
}

export function extractSocialProfiles(value: string | null): {
  linkedinUrl: string | null;
  twitterUrl: string | null;
} {
  if (!value) {
    return { linkedinUrl: null, twitterUrl: null };
  }

  return {
    linkedinUrl: extractUrlForHosts(value, ["linkedin.com"]),
    twitterUrl: extractUrlForHosts(value, ["twitter.com", "x.com"]),
  };
}

/**
 * Normalize sheet data rows into InterviewRecord objects.
 * Only rows with a non-empty Authority Magazine Link (articleUrl) are included,
 * unless spreadsheetId is provided, in which case unpublished rows get a placeholder URL.
 */
export function normalizeRows(
  rows: string[][],
  mappings: HeaderMapping[],
  headerRowIndex: number = 0,
  spreadsheetId?: string,
  rowOffset: number = 0
): NormalizationResult {
  const dataRows = rows.slice(headerRowIndex + 1);
  const published: InterviewRecord[] = [];
  const unpublished: UnpublishedInterviewRow[] = [];
  const warnings: string[] = [];
  let skippedNoArticle = 0;
  let skippedInvalidArticle = 0;
  let skippedEmptyRow = 0;
  let skippedNeedsAttention = 0;

  // Build a quick lookup: field → column index
  const fieldToCol = new Map<string, number>();
  for (const m of mappings) {
    fieldToCol.set(m.field, m.columnIndex);
  }

  const getVal = (row: string[], field: string): string | null => {
    const colIdx = fieldToCol.get(field);
    if (colIdx === undefined) return null;
    const val = row[colIdx];
    if (val === undefined || val === null) return null;
    const trimmed = String(val).trim();
    return trimmed === "" ? null : trimmed;
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = headerRowIndex + 1 + i + 1 + rowOffset; // 1-based, accounting for header and offset

    // Skip completely empty rows
    if (!row || row.every((cell) => !cell || String(cell).trim() === "")) {
      skippedEmptyRow++;
      continue;
    }

    // Ignore rows with "attention needed" or "please resubmit" in estimated publishing date
    const estDateVal = getVal(row, "estimatedPublishDate");
    if (estDateVal) {
      const lowerEstDate = estDateVal.toLowerCase();
      if (lowerEstDate.includes("attention needed") || lowerEstDate.includes("please resubmit")) {
        skippedNeedsAttention++;
        continue;
      }
    }

    // Check if published or unpublished
    let articleUrl = getVal(row, "articleUrl");
    let isUnpublished = false;
    let unpublishedReason = "";

    if (!articleUrl) {
      isUnpublished = true;
      unpublishedReason = "Authority Magazine Link is missing";
      skippedNoArticle++;
    } else if (!isAuthorityMagazineUrl(articleUrl)) {
      isUnpublished = true;
      unpublishedReason = "Authority Magazine Link is not valid";
      skippedInvalidArticle++;
    }

    if (isUnpublished) {
      unpublished.push({
        sourceRowNumber: rowNumber,
        intervieweeName:
          getVal(row, "intervieweeName") || `Interview (Row ${rowNumber})`,
        topic: getVal(row, "topic"),
        estimatedPublishDate: getVal(row, "estimatedPublishDate"),
        reason: unpublishedReason,
      });

      if (!spreadsheetId) {
        // Old behavior: skip
        continue;
      }

      // Generate placeholder URL for database insertion
      articleUrl = `https://authoritymagazine.com/unpublished/${spreadsheetId}/${rowNumber}`;
    }

    // Extract interviewee name (required for display, use fallback)
    let intervieweeName = getVal(row, "intervieweeName") || `Interview (Row ${rowNumber})`;
    let intervieweeCompany = getVal(row, "intervieweeCompany");

    // If company is empty, but name has a comma, semicolon, or dash, split them!
    if (!intervieweeCompany && intervieweeName && !intervieweeName.startsWith("Interview (Row ")) {
      const separators = [",", ";", " - "];
      for (const sep of separators) {
        if (intervieweeName.includes(sep)) {
          const parts = intervieweeName.split(sep);
          const potentialName = parts[0].trim();
          const potentialCompany = parts.slice(1).join(sep).trim();

          if (potentialName && potentialCompany) {
            intervieweeName = potentialName;
            intervieweeCompany = potentialCompany;
            break;
          }
        }
      }
    }

    // Hash the row for dedup on re-sync
    const rowHash = hashRow(row);
    const combinedSocialProfiles = extractSocialProfiles(
      getVal(row, "socialProfiles")
    );

    published.push({
      sourceRowNumber: rowNumber,
      sourceRowHash: rowHash,
      intervieweeName,
      intervieweeCompany,
      intervieweeEmail: normalizeEmail(getVal(row, "intervieweeEmail")),
      intervieweeTitle: getVal(row, "intervieweeTitle"),
      companyEmployeeCount: parseCountMetric(getVal(row, "companyEmployeeCount")),
      companyRevenueUsd: parseMoneyMetric(getVal(row, "companyRevenueUsd")),
      largestSocialFollowerCount: parseCountMetric(
        getVal(row, "largestSocialFollowerCount")
      ),
      prominenceNotes: getVal(row, "prominenceNotes"),
      publicistName: getVal(row, "publicistName"),
      publicistEmail: normalizeEmail(getVal(row, "publicistEmail")),
      topic: getVal(row, "topic"),
      articleUrl: articleUrl!,
      buzzfeedUrl: getVal(row, "buzzfeedUrl"),
      interviewDocUrl: getVal(row, "interviewDocUrl"),
      image1Url: getVal(row, "image1Url"),
      image2Url: getVal(row, "image2Url"),
      extraImagesUrl: getVal(row, "extraImagesUrl"),
      videoUrl: getVal(row, "videoUrl"),
      linkedinUrl:
        getVal(row, "linkedinUrl") ?? combinedSocialProfiles.linkedinUrl,
      twitterUrl:
        getVal(row, "twitterUrl") ?? combinedSocialProfiles.twitterUrl,
      liveEmailStatusImported: getVal(row, "liveEmailStatusImported"),
      pressFollowupStatusImported: getVal(row, "pressFollowupStatusImported"),
      estimatedPublishDate: getVal(row, "estimatedPublishDate"),
    });
  }

  if (skippedInvalidArticle > 0) {
    warnings.push(
      `${skippedInvalidArticle} row(s) were skipped because the article link ` +
        "was not an Authority Magazine URL."
    );
  }

  if (skippedNeedsAttention > 0) {
    warnings.push(
      `${skippedNeedsAttention} row(s) were ignored because their Estimated Publishing Date contains "attention needed" or "please resubmit".`
    );
  }

  if (skippedEmptyRow > 0) {
    warnings.push(
      `${skippedEmptyRow} empty row(s) were skipped.`
    );
  }

  return {
    published,
    unpublished,
    skippedNoArticle,
    skippedInvalidArticle,
    skippedEmptyRow,
    skippedNeedsAttention,
    totalRows: dataRows.length,
    warnings,
  };
}

function isAuthorityMagazineUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase();

    return (
      hostname === "authoritymagazine.com" ||
      hostname.endsWith(".authoritymagazine.com") ||
      (hostname === "medium.com" && path.includes("authority-magazine"))
    );
  } catch {
    return false;
  }
}

/**
 * Create a stable hash of a row for deduplication.
 * Used to detect if a row has changed on re-sync.
 */
function hashRow(row: string[]): string {
  const content = row.map((cell) => String(cell ?? "").trim()).join("|");
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Basic email normalization: lowercase, trim.
 */
function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const cleaned = email.toLowerCase().trim();
  // Basic validation — must contain @ and a dot after @
  if (cleaned.includes("@") && cleaned.includes(".")) {
    return cleaned;
  }
  return null; // Invalid email format
}
