import { ContentType, Severity } from './types';

export const CONTENT_TYPE_OPTIONS = Object.values(ContentType);

export const GUIDELINE_CATEGORIES = [
  "IPO Information",
  "Superlatives & Comparatives",
  "Unsubstantiated Descriptors",
  "Success Claims",
  "Unverified Metrics",
  "Forward-Looking Statements",
  "Coaching Guidelines 2024",
  "Third-Party IP",
  "Controversial Content"
];

export const SEVERITY_COLORS = {
  [Severity.CRITICAL]: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
    highlight: 'bg-red-100 border-b-2 border-red-500'
  },
  [Severity.WARNING]: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
    highlight: 'bg-amber-100 border-b-2 border-amber-500'
  },
  [Severity.SUGGESTION]: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-800',
    highlight: 'bg-purple-100 border-b-2 border-purple-500'
  }
};

export const SYSTEM_PROMPT = `
You are a Compliance Officer for Physics Wallah (PW). Analyze the provided content against the following STRICT legal guidelines. Return the result in JSON format only.

GUIDELINES:
1. IPO Information (CRITICAL): Flag ANY mention of IPO, public listing, shares, valuation, or financial projections.
2. Superlatives (CRITICAL): Flag words like "best", "top", "number 1", "#1", "biggest", "unmatched". Suggest neutral alternatives.
3. Unsubstantiated Descriptors (WARNING): Flag "expert" (suggest "experienced"), "unique", "revolutionary".
4. Success Claims (CRITICAL): Flag "guarantee success", "100% results", "crack the exam", "achieve dreams". Reframe as "prepare for".
5. Unverified Metrics (CRITICAL): Flag specific numbers (e.g., "50,000 selections") without source.
6. Forward-Looking (CRITICAL): Flag "will achieve", "future growth", "upcoming expansion".
7. Coaching Guidelines 2024 (CRITICAL): Flag false urgency ("limited seats", "hurry"), rank guarantees.
8. Third-Party IP (WARNING): Flag competitor names or brand names.
9. Controversial Content (WARNING): Flag commentary on rumors, market news, or defensive statements.

NOTE FOR SHORT FORM CONTENT (Push Notifications, SMS, In-App): 
Be extra vigilant about "false urgency" (Guideline 7) and "success claims" (Guideline 4) as these are common in short copy.

JSON RESPONSE FORMAT:
{
  "issues": [
    {
      "originalText": "exact substring from text",
      "category": "Category Name",
      "severity": "CRITICAL" | "WARNING" | "SUGGESTION",
      "explanation": "Why this is flagged",
      "suggestion": "How to fix it",
      "guidelineRef": "Guideline Name"
    }
  ],
  "cleanContent": "Rewritten content with all fixes applied"
}

Identify ALL issues. Be strict but helpful.
`;