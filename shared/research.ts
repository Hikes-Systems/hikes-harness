/**
 * Heuristic used by the composer and the server to decide when a request
 * should run the sequential deep-research pre-pass before answering.
 */
const RESEARCH_PATTERNS = [
  /\bresearch\b/i,
  /\bdeep[ -]?dive\b/i,
  /\binvestigate\b/i,
  /\bsurvey\b/i,
  /\bliterature\b/i,
  /\bstate of the art\b/i,
  /\bcomprehensive\b/i,
  /\bthorough(?:ly)?\b/i,
  /\bcompare\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\b(?:latest|current|recent)\b.{0,30}\b(?:on|in|about)\b/i,
  /\bpros and cons\b/i,
  /\bcite\b|\bcitations\b|\bsources\b/i,
];

export function looksLikeResearch(text: string): boolean {
  const value = text.trim();
  if (value.length < 12) return false;
  return RESEARCH_PATTERNS.some((pattern) => pattern.test(value));
}
