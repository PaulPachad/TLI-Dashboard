import { ResearchInterview } from "./research";

export interface ProminenceIdentityContext {
  name: string | null;
  company: string | null;
  title: string | null;
  topic: string | null;
  articleUrl: string | null;
  bioText: string | null;
  websites: string[];
  socialUrls: string[];
  linkedinUrls: string[];
  socialHandles: string[];
  bookTitles: string[];
  podcastNames: string[];
  awardPhrases: string[];
  mediaMentionPhrases: string[];
  sourceQuality: {
    hasExactCompany: boolean;
    hasWebsite: boolean;
    hasLinkedIn: boolean;
    hasBio: boolean;
  };
}

/**
 * Parses raw text to extract URLs.
 */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,;)\]"']+/gi;
  return text.match(urlRegex) || [];
}

/**
 * Standardizes a URL by returning the hostname.
 */
export function getDomain(urlStr: string): string | null {
  try {
    let cleanUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Checks if a hostname belongs to a social media platform.
 */
function isSocialHost(host: string): boolean {
  const socialHosts = [
    "linkedin.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "pinterest.com",
    "github.com",
    "medium.com",
  ];
  return socialHosts.some((sh) => host === sh || host.endsWith("." + sh));
}

/**
 * Checks if a hostname belongs to file sharing or search domains.
 */
function isIgnoredHost(host: string, articleUrl?: string | null): boolean {
  const ignored = [
    "google.com",
    "drive.google.com",
    "docs.google.com",
    "sheets.google.com",
    "photos.google.com",
    "dropbox.com",
    "box.com",
    "wetransfer.com",
    "buzzfeed.com",
    "authoritymag.co",
    "medium.com",
  ];
  if (ignored.some((h) => host === h || host.endsWith("." + h))) {
    return true;
  }
  if (articleUrl) {
    const articleHost = getDomain(articleUrl);
    if (articleHost && (host === articleHost || host.endsWith("." + articleHost))) {
      return true;
    }
  }
  return false;
}

/**
 * Extract social handles starting with @ or from profile URLs.
 */
function extractHandles(text: string): string[] {
  const handles = new Set<string>();
  const handleRegex = /(?:\s|^)@([a-zA-Z0-9_\.]{3,30})\b/g;
  let match;
  while ((match = handleRegex.exec(text)) !== null) {
    if (match[1]) {
      handles.add("@" + match[1].toLowerCase());
    }
  }
  return Array.from(handles);
}

/**
 * Safe phrase extraction around keywords.
 */
function extractKeywordPhrases(text: string, keywords: string[]): string[] {
  const phrases: string[] = [];
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const cleanWord = words[i].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const matched = keywords.some(kw => cleanWord === kw || (kw.includes(" ") && words.slice(i, i + kw.split(" ").length).join(" ").toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "") === kw));
    
    if (matched) {
      const start = Math.max(0, i - 4);
      const end = Math.min(words.length, i + 5);
      const phrase = words.slice(start, end).join(" ").trim();
      if (phrase && !phrases.includes(phrase)) {
        phrases.push(phrase);
      }
    }
  }
  return phrases;
}

/**
 * Extract book titles conservatively (quotes or author of patterns).
 */
export function extractBookTitles(text: string): string[] {
  const books = new Set<string>();

  // 1. Double quotes - e.g. author of "The Lean Startup"
  const doubleQuoteRegex = /"([^"]{3,60})"/g;
  let match;
  while ((match = doubleQuoteRegex.exec(text)) !== null) {
    const title = match[1].trim();
    if (/^[A-Z]/.test(title) && title.split(/\s+/).length >= 2) {
      books.add(title);
    }
  }

  // 2. Single quotes - e.g. author of 'The Lean Startup'
  const singleQuoteRegex = /'([^']{3,60})'/g;
  while ((match = singleQuoteRegex.exec(text)) !== null) {
    const title = match[1].trim();
    if (/^[A-Z]/.test(title) && title.split(/\s+/).length >= 2) {
      books.add(title);
    }
  }

  // 3. Patterns: "author of [Title]"
  const authorOfRegex = /\b(?:author of|wrote|published)\s+([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,5})\b/g;
  while ((match = authorOfRegex.exec(text)) !== null) {
    const title = match[1].trim();
    // Exclude cases where it extracts trailing lowercase stuff or standard stop words
    if (!/\b(?:a|an|the|and|or|but|at|by|for|in|of|on|to|with)\b$/i.test(title)) {
      books.add(title);
    }
  }

  return Array.from(books);
}

/**
 * Extract podcast names conservatively.
 */
export function extractPodcastNames(text: string): string[] {
  const podcasts = new Set<string>();
  
  // Patterns like: host of the [Name] Podcast, or [Name] Podcast host (case sensitive for title words)
  const hostOfRegex = /\b(?:[hH]ost of|[cC]reator of|[pP]odcast)\s+(?:the\s+)?(["']?[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){0,5}["']?\s+(?:[pP]odcast|[sS]how|[rR]adio))\b/g;
  let match;
  while ((match = hostOfRegex.exec(text)) !== null) {
    const name = match[1].replace(/["']/g, "").trim();
    podcasts.add(name);
  }

  const podcastHostRegex = /\b(["']?[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){1,5}["']?\s+(?:[pP]odcast|[sS]how|[rR]adio))\b/g;
  while ((match = podcastHostRegex.exec(text)) !== null) {
    const name = match[1].replace(/["']/g, "").trim();
    podcasts.add(name);
  }

  return Array.from(podcasts);
}

export function isProviderGeneratedNotes(notes: string): boolean {
  if (!notes) return false;
  const clean = notes.trim();
  
  // If it contains Markdown headers (e.g. ### Leadership or ### Role)
  if (/^#+\s+/m.test(clean)) return true;
  
  // If it contains bolded field labels typical of our AI/provider output structure
  // e.g. **Role:**, **Revenue:**, **Audience:**, **Company Size:**
  if (/\*\*(Role|Revenue|Audience|Company Size|Leadership|Notability|Scale|Evidence)\*\*:/i.test(clean)) return true;

  // If it contains a URL in parentheses or brackets (how search results are annotated)
  if (/[\(\[][a-zA-Z0-9]+:\/\/[^\)\]]+[\)\]]/.test(clean)) return true;
  
  // If it matches typical provider prefix patterns (e.g. "Forbes: Taylor Chen is...")
  // where a known search engine/source site is followed by a colon and snippet
  if (/^(forbes|linkedin|twitter|x\.com|wikipedia|crunchbase|bloomberg|nyt|new york times|wsj|wall street journal|inc|fortune|fast company|cnbc|tedx?|entrepreneur|huffpost|techcrunch|business insider|wired):\s/mi.test(clean)) {
    return true;
  }

  // If it contains typical provider patterns
  const providerPattern = /\b(here are|below are|the following are|based on the research|no information found|prominence signals|evidence summary|unfortunately|i found|grounded search|search result|search engine|provider failure)\b/i;
  if (providerPattern.test(clean)) return true;

  // If there are multiple external links (e.g. >= 2 links) it's likely a list of research sources
  const urlMatches = clean.match(/https?:\/\/[^\s]+/gi);
  if (urlMatches && urlMatches.length >= 2) return true;

  return false;
}

/**
 * Builds the identity context object from available fields.
 */
export function buildProminenceIdentityContext(
  interview: ResearchInterview
): ProminenceIdentityContext {
  const name = interview.intervieweeName?.trim() || null;
  const company = interview.intervieweeCompany?.trim() || null;
  const title = interview.intervieweeTitle?.trim() || null;
  const topic = interview.topic?.trim() || null;
  const articleUrl = interview.articleUrl?.trim() || null;
  const bioText = interview.bioText?.trim() || null;
  const notes = (interview as Record<string, any>).prominenceNotes || null;
  const rawNotes = notes && !isProviderGeneratedNotes(notes) ? notes : null;


  const websites = new Set<string>();
  const socialUrls = new Set<string>();
  const linkedinUrls = new Set<string>();
  const socialHandles = new Set<string>();
  const bookTitles = new Set<string>();
  const podcastNames = new Set<string>();
  const awardPhrases = new Set<string>();
  const mediaMentionPhrases = new Set<string>();

  // Add baseline URLs from interview object if present
  if (interview.linkedinUrl) {
    const host = getDomain(interview.linkedinUrl);
    if (host && host.includes("linkedin.com")) {
      linkedinUrls.add(interview.linkedinUrl.trim());
    } else {
      socialUrls.add(interview.linkedinUrl.trim());
    }
  }

  if (interview.twitterUrl) {
    const cleanTwitter = interview.twitterUrl.trim();
    if (/^https?:\/\//i.test(cleanTwitter)) {
      socialUrls.add(cleanTwitter);
      const host = getDomain(cleanTwitter);
      if (host && (host === "twitter.com" || host === "x.com")) {
        const pathParts = new URL(cleanTwitter).pathname.split("/").filter(Boolean);
        if (pathParts[0]) {
          socialHandles.add("@" + pathParts[0].toLowerCase());
        }
      }
    } else if (cleanTwitter.startsWith("@")) {
      socialHandles.add(cleanTwitter.toLowerCase());
    } else if (cleanTwitter.length > 0) {
      socialHandles.add("@" + cleanTwitter.toLowerCase());
    }
  }

  // Gather all fields to extract from
  const textFields = [title, topic, bioText, rawNotes].filter(Boolean) as string[];
  const combinedText = textFields.join(" ");

  // Extract URLs from all text fields
  for (const field of textFields) {
    const urls = extractUrls(field);
    for (const url of urls) {
      const host = getDomain(url);
      if (!host) continue;

      if (host.includes("linkedin.com")) {
        linkedinUrls.add(url);
      } else if (isSocialHost(host)) {
        socialUrls.add(url);
        if ((host === "twitter.com" || host === "x.com" || host === "instagram.com") && !url.includes("/status/") && !url.includes("/p/")) {
          try {
            const pathParts = new URL(url).pathname.split("/").filter(Boolean);
            if (pathParts[0] && !["home", "share", "intent", "search"].includes(pathParts[0].toLowerCase())) {
              socialHandles.add("@" + pathParts[0].toLowerCase());
            }
          } catch {}
        }
      } else if (!isIgnoredHost(host, articleUrl)) {
        websites.add(url);
      }
    }
  }

  // Extract handles from combined text
  const extractedHandles = extractHandles(combinedText);
  for (const h of extractedHandles) {
    socialHandles.add(h);
  }

  // Extract books and podcasts
  const extractedBooks = extractBookTitles(combinedText);
  for (const b of extractedBooks) {
    bookTitles.add(b);
  }

  const extractedPodcasts = extractPodcastNames(combinedText);
  for (const p of extractedPodcasts) {
    podcastNames.add(p);
  }

  // Extract awards
  const awardKeywords = [
    "award", "winner", "winning", "recipient", "received", "nominee", "nominated", 
    "finalist", "honoree", "30 under 30", "40 under 40", "inc 500", "inc 5000",
    "emmy", "oscar", "grammy", "pulitzer", "macarthur", "nobel", "peabody"
  ];
  const awards = extractKeywordPhrases(combinedText, awardKeywords);
  for (const a of awards) {
    awardPhrases.add(a);
  }

  // Extract media mentions
  const mediaKeywords = [
    "forbes", "inc", "fortune", "fast company", "new york times", "nyt", "wsj", 
    "wall street journal", "bloomberg", "cnbc", "ted", "tedx", "entrepreneur",
    "huffpost", "techcrunch", "business insider", "wired"
  ];
  const media = extractKeywordPhrases(combinedText, mediaKeywords);
  for (const m of media) {
    mediaMentionPhrases.add(m);
  }

  const uniqueWebsites = Array.from(websites);
  const uniqueLinkedin = Array.from(linkedinUrls);

  return {
    name,
    company,
    title,
    topic,
    articleUrl,
    bioText,
    websites: uniqueWebsites,
    socialUrls: Array.from(socialUrls),
    linkedinUrls: uniqueLinkedin,
    socialHandles: Array.from(socialHandles),
    bookTitles: Array.from(bookTitles),
    podcastNames: Array.from(podcastNames),
    awardPhrases: Array.from(awardPhrases),
    mediaMentionPhrases: Array.from(mediaMentionPhrases),
    sourceQuality: {
      hasExactCompany: Boolean(company),
      hasWebsite: uniqueWebsites.length > 0,
      hasLinkedIn: uniqueLinkedin.length > 0,
      hasBio: Boolean(bioText || rawNotes),
    },
  };
}
