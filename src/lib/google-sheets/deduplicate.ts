import type { InterviewRecord } from "./row-normalizer";

export interface DuplicateInterviewRecord {
  duplicate: InterviewRecord;
  originalRowNumber: number;
}

export function deduplicateInterviewRecords(records: InterviewRecord[]): {
  records: InterviewRecord[];
  duplicates: DuplicateInterviewRecord[];
} {
  const uniqueRecords: InterviewRecord[] = [];
  const duplicates: DuplicateInterviewRecord[] = [];
  const firstRowByArticleUrl = new Map<string, number>();

  for (const record of records) {
    const articleKey = normalizeArticleUrl(record.articleUrl);
    const originalRowNumber = firstRowByArticleUrl.get(articleKey);

    if (originalRowNumber !== undefined) {
      duplicates.push({ duplicate: record, originalRowNumber });
      continue;
    }

    firstRowByArticleUrl.set(articleKey, record.sourceRowNumber);
    uniqueRecords.push(record);
  }

  return { records: uniqueRecords, duplicates };
}

function normalizeArticleUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}
