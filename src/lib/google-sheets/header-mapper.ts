// ==============================================================================
// Fuzzy Header Mapper — Maps messy spreadsheet headers to canonical field names
// ==============================================================================
//
// Google Sheet column headers may vary in casing, spacing, and naming conventions.
// This mapper uses a priority-ordered alias list + fuzzy matching to find the best
// column for each canonical field.

export interface HeaderMapping {
  /** Canonical field name */
  field: string;
  /** The actual column header in the sheet that was matched */
  matchedHeader: string;
  /** Column index (0-based) */
  columnIndex: number;
  /** Match quality: "exact" | "alias" | "fuzzy" | "manual" */
  matchType: "exact" | "alias" | "fuzzy" | "manual";
}

export interface HeaderMappingResult {
  mappings: HeaderMapping[];
  unmappedHeaders: string[];
  missingRequired: string[];
  warnings: string[];
}

// --- Canonical field → known aliases ---
// Order matters: earlier aliases are preferred.

const FIELD_ALIASES: Record<string, string[]> = {
  intervieweeName: [
    "interviewee",
    "interviewee name",
    "name",
    "guest",
    "guest name",
    "person",
    "subject",
    "name company",
    "name & company",
    "name and company",
  ],
  publicistName: [
    "publicist",
    "publicist name",
    "pr contact",
    "pr name",
    "pr rep",
    "media contact",
  ],
  intervieweeEmail: [
    "interviewee email",
    "email of the interviewee",
    "email interviewee",
    "guest email",
    "interviewee e-mail",
    "email",
  ],
  publicistEmail: [
    "publicist email",
    "email of the publicist",
    "email publicist",
    "pr email",
    "publicist e-mail",
  ],
  topic: ["topic", "topics", "interview topic", "subject", "theme"],
  interviewDocUrl: [
    "interview",
    "interview link",
    "interview doc",
    "google doc",
    "doc link",
    "interview url",
    "word document",
    "interview word document",
    "kindly upload your interview in a word document here",
  ],
  articleUrl: [
    "authority magazine link",
    "authority magazine url",
    "authority mag link",
    "article link",
    "article url",
    "published link",
    "published url",
    "am link",
  ],
  buzzfeedUrl: [
    "buzzfeed link",
    "buzzfeed url",
    "buzzfeed",
  ],
  image1Url: [
    "image 1",
    "image1",
    "first image",
    "first image headshot",
    "headshot",
    "photo",
    "photo 1",
    "primary image",
    "main image",
    "upload your first image",
    "kindly upload your first image headshot here",
  ],
  image2Url: [
    "image 2",
    "image2",
    "second image",
    "second image action shot or group photo",
    "photo 2",
    "secondary image",
    "action shot",
    "group photo",
    "upload your second image",
    "kindly upload your second image action shot or group photo here",
  ],
  extraImagesUrl: [
    "extra images",
    "additional images",
    "hi resolution images",
    "more images",
    "other images",
    "if you would like to include additional images kindly upload your hi resolution images headshots and action shots to a google photos googledrive or dropbox file and paste the share link here",
  ],
  videoUrl: [
    "video",
    "video url",
    "video link",
    "youtube",
    "youtube link",
  ],
  linkedinUrl: [
    "linkedin",
    "linkedin url",
    "linkedin profile",
    "linkedin link",
  ],
  twitterUrl: [
    "twitter",
    "twitter url",
    "twitter handle",
    "x",
    "x url",
    "x handle",
    "twitter/x",
  ],
  socialProfiles: [
    "social media",
    "social media profiles",
    "social profiles",
    "social handles",
    "social media handles",
    "profiles to tag",
    "if you would like us to tag you on social media when we share it please list your profiles",
  ],
  estimatedPublishDate: [
    "live",
    "live?",
    "is live",
    "published",
    "published?",
    "publish status",
    "published status",
    "status",
    "estimated publishing date",
    "publish date",
    "publishing date",
    "est publish date",
    "estimated pub date",
    "scheduled date",
    "date",
  ],
  timestamp: [
    "timestamp",
    "date submitted",
    "submitted",
    "submission date",
  ],
  liveEmailStatusImported: [
    "emailed",
    "live email sent date",
    "live email status",
    "email sent",
  ],
  pressFollowupStatusImported: [
    "press follow-up status",
    "press followup status",
    "follow-up status",
    "followup status",
    "press follow-up sent date",
  ],
  intervieweeCompany: [
    "company",
    "organization",
    "org",
    "interviewee company",
  ],
  intervieweeTitle: [
    "title",
    "job title",
    "position",
    "role",
    "interviewee title",
  ],
  companyEmployeeCount: [
    "employees",
    "employee count",
    "company employees",
    "company size",
    "number of employees",
    "team size",
    "headcount",
  ],
  companyRevenueUsd: [
    "revenue",
    "annual revenue",
    "company revenue",
    "yearly revenue",
    "revenue usd",
    "estimated revenue",
  ],
  largestSocialFollowerCount: [
    "followers",
    "follower count",
    "social followers",
    "social media followers",
    "largest following",
    "audience size",
    "social reach",
    "linkedin followers",
    "total followers",
  ],
  prominenceNotes: [
    "prominence",
    "notability",
    "notable",
    "vip notes",
    "authority notes",
    "press",
    "awards",
    "recognition",
    "public figure",
    "why notable",
  ],
};

// Fields that MUST be found for a valid import
const REQUIRED_FIELDS = ["articleUrl"];

// Fields that trigger a warning if missing (but don't block import)
const RECOMMENDED_FIELDS = ["intervieweeName", "intervieweeEmail", "topic"];

/**
 * Normalize a header string for comparison.
 * Lowercases, trims, collapses whitespace, removes special chars.
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s/-]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Simple similarity score between two normalized strings.
 * Uses Dice coefficient on bigrams for fuzzy matching.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.substring(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    bigramsB.add(b.substring(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

const FUZZY_THRESHOLD = 0.65;

function isTwitterOrXUrl(val: string): boolean {
  const cleanVal = val.trim().toLowerCase();
  const match = cleanVal.match(/https?:\/\/[^\s,;)\]]+/g);
  const urlsToTest = match ? match : [cleanVal];
  
  for (let urlStr of urlsToTest) {
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
    try {
      const url = new URL(urlStr);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (
        hostname === "twitter.com" ||
        hostname.endsWith(".twitter.com") ||
        hostname === "x.com" ||
        hostname.endsWith(".x.com")
      ) {
        return true;
      }
    } catch {
      // ignore parse failure
    }
  }
  return false;
}

/**
 * Map actual sheet headers to canonical field names.
 */
export function mapHeaders(
  headers: string[],
  rawRows?: string[][],
  customMappings?: Record<string, number>
): HeaderMappingResult {
  const mappings: HeaderMapping[] = [];
  const usedColumns = new Set<number>();
  const usedFields = new Set<string>();
  const warnings: string[] = [];

  const normalizedHeaders = headers.map(normalizeHeader);

  // Pass 0: Apply custom manual mappings first
  if (customMappings) {
    for (const [field, colIdx] of Object.entries(customMappings)) {
      if (colIdx >= 0 && colIdx < headers.length) {
        mappings.push({
          field,
          matchedHeader: headers[colIdx],
          columnIndex: colIdx,
          matchType: "manual",
        });
        usedColumns.add(colIdx);
        usedFields.add(field);
      }
    }
  }

  // Pass 1: Exact and alias matches (highest confidence)
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (usedFields.has(field)) continue;

    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const colIdx = normalizedHeaders.findIndex(
        (h, i) => !usedColumns.has(i) && h === normalizedAlias
      );

      if (colIdx !== -1) {
        mappings.push({
          field,
          matchedHeader: headers[colIdx],
          columnIndex: colIdx,
          matchType: alias === normalizedHeaders[colIdx] ? "exact" : "alias",
        });
        usedColumns.add(colIdx);
        usedFields.add(field);
        break;
      }
    }
  }

  // Pass 2: Fuzzy matches for remaining fields
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (usedFields.has(field)) continue;

    let bestScore = 0;
    let bestColIdx = -1;
    let bestAlias = "";

    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (usedColumns.has(i)) continue;

        const score = similarity(normalizedAlias, normalizedHeaders[i]);
        if (score > bestScore && score >= FUZZY_THRESHOLD) {
          bestScore = score;
          bestColIdx = i;
          bestAlias = alias;
        }
      }
    }

    if (bestColIdx !== -1) {
      mappings.push({
        field,
        matchedHeader: headers[bestColIdx],
        columnIndex: bestColIdx,
        matchType: "fuzzy",
      });
      usedColumns.add(bestColIdx);
      usedFields.add(field);
      warnings.push(
        `Column "${headers[bestColIdx]}" was fuzzy-matched to "${field}" ` +
          `(matched alias: "${bestAlias}", confidence: ${(bestScore * 100).toFixed(0)}%). ` +
          `Please verify this mapping is correct.`
      );
    }
  }

  // Pass 3: Smart content-based detection for remaining unmapped fields
  if (rawRows && rawRows.length > 1) {
    const dataRows = rawRows.slice(1);
    const maxRowsToScan = Math.min(dataRows.length, 10);

    for (const field of Object.keys(FIELD_ALIASES)) {
      if (usedFields.has(field)) continue;

      // Content-based detection is supported for links, profiles, and emails
      if (
        field !== "articleUrl" &&
        field !== "linkedinUrl" &&
        field !== "twitterUrl" &&
        field !== "interviewDocUrl" &&
        field !== "videoUrl" &&
        field !== "intervieweeEmail"
      ) {
        continue;
      }

      let bestColIdx = -1;
      let highestMatchCount = 0;

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        if (usedColumns.has(colIdx)) continue;

        let matchCount = 0;
        let nonEmptyCount = 0;

        for (let r = 0; r < maxRowsToScan; r++) {
          const val = dataRows[r][colIdx];
          if (val !== undefined && val !== null && String(val).trim()) {
            nonEmptyCount++;
            const cleanVal = String(val).trim().toLowerCase();
            let isMatch = false;

            if (field === "articleUrl") {
              isMatch =
                (cleanVal.startsWith("http://") || cleanVal.startsWith("https://")) &&
                (cleanVal.includes("authoritymagazine") ||
                  cleanVal.includes("authority-mag") ||
                  cleanVal.includes("medium.com/authority-magazine") ||
                  cleanVal.includes("medium.com/p/"));
            } else if (field === "linkedinUrl") {
              isMatch = cleanVal.includes("linkedin.com/");
            } else if (field === "twitterUrl") {
              isMatch = isTwitterOrXUrl(cleanVal);
            } else if (field === "interviewDocUrl") {
              isMatch = cleanVal.includes("docs.google.com/document/");
            } else if (field === "videoUrl") {
              isMatch =
                cleanVal.includes("youtube.com/") ||
                cleanVal.includes("youtu.be/") ||
                cleanVal.includes("vimeo.com/");
            } else if (field === "intervieweeEmail") {
              isMatch = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanVal);
            }

            if (isMatch) {
              matchCount++;
            }
          }
        }

        if (nonEmptyCount > 0 && matchCount >= Math.max(1, nonEmptyCount * 0.3)) {
          if (matchCount > highestMatchCount) {
            highestMatchCount = matchCount;
            bestColIdx = colIdx;
          }
        }
      }

      if (bestColIdx !== -1) {
        mappings.push({
          field,
          matchedHeader: headers[bestColIdx],
          columnIndex: bestColIdx,
          matchType: "fuzzy",
        });
        usedColumns.add(bestColIdx);
        usedFields.add(field);
        warnings.push(
          `Column "${headers[bestColIdx]}" was auto-detected as "${field}" based on cell content. ` +
            `Please verify this mapping is correct.`
        );
      }
    }
  }

  // Identify unmapped headers
  const unmappedHeaders = headers.filter((_, i) => !usedColumns.has(i));

  // Identify missing required fields
  const missingRequired = REQUIRED_FIELDS.filter((f) => !usedFields.has(f));

  // Warn about missing recommended fields
  for (const field of RECOMMENDED_FIELDS) {
    if (!usedFields.has(field)) {
      warnings.push(
        `Recommended column "${field}" was not found. Some features may be limited.`
      );
    }
  }

  if (missingRequired.length > 0) {
    warnings.unshift(
      `Required column(s) not found: ${missingRequired.join(", ")}. ` +
        `We could not find an "Authority Magazine Link" column. ` +
        `Please check the sheet headers.`
    );
  }

  return { mappings, unmappedHeaders, missingRequired, warnings };
}
