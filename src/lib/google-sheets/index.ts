export { parseGoogleSheetUrl, SheetUrlError, appendSheetUrlParams } from "./parse-url";
export type { ParsedSheetUrl } from "./parse-url";

export { mapHeaders } from "./header-mapper";
export type { HeaderMapping, HeaderMappingResult } from "./header-mapper";

export {
  getSheetsClient,
  getSheetTabs,
  isDemoMode,
  readSheetData,
  readSheetDataWithLinks,
  resolveTabTitle,
  SheetsConfigError,
} from "./client";
export type { SheetTab } from "./client";

export { normalizeRows, takeLastUsableRows } from "./row-normalizer";
export type { InterviewRecord, NormalizationResult } from "./row-normalizer";

export { deduplicateInterviewRecords } from "./deduplicate";
export type { DuplicateInterviewRecord } from "./deduplicate";
