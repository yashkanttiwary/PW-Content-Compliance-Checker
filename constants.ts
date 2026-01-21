import { ContentType, Severity } from './types';

export const CONTENT_TYPE_OPTIONS = Object.values(ContentType);

export const GEMINI_MODEL = 'gemini-3-flash-preview';

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

export const GUIDELINE_DETAILS = [
  {
    title: "1. IPO Information",
    severity: Severity.CRITICAL,
    description: "Strict prohibition on financial terminology usually associated with public listings.",
    examples: "IPO, stock, shares, valuation, listing, going public, fundraising, investor returns."
  },
  {
    title: "2. Superlatives & Comparatives",
    severity: Severity.CRITICAL,
    description: "Avoid absolute claims that cannot be factually substantiated.",
    examples: "Best, Top, #1, Biggest, Unmatched, Unparalleled, Leading (without source)."
  },
  {
    title: "3. Unsubstantiated Descriptors",
    severity: Severity.WARNING,
    description: "Avoid subjective adjectives that frame opinions as facts.",
    examples: "Expert (use Experienced), Unique, Revolutionary, Historic."
  },
  {
    title: "4. Success Claims",
    severity: Severity.CRITICAL,
    description: "Do not promise outcomes that are not guaranteed.",
    examples: "Guarantee success, 100% results, Crack the exam, Achieve your dreams."
  },
  {
    title: "5. Unverified Metrics",
    severity: Severity.CRITICAL,
    description: "All statistics and numbers must be accurate and verifiable.",
    examples: "50,000 selections, Highest package, 1M+ students (unless sourced)."
  },
  {
    title: "6. Forward-Looking Statements",
    severity: Severity.CRITICAL,
    description: "Avoid speculative statements about future business performance.",
    examples: "Will achieve, Future growth, Upcoming expansion, Planned centers."
  },
  {
    title: "7. Coaching Guidelines 2024",
    severity: Severity.CRITICAL,
    description: "Strict adherence to government coaching center guidelines.",
    examples: "False urgency (Limited seats), Rank guarantees, Misleading testimonials."
  },
  {
    title: "8. Third-Party IP",
    severity: Severity.WARNING,
    description: "Respect intellectual property and trademarks of others.",
    examples: "Competitor names, copyrighted music/text, brand logos."
  },
  {
    title: "9. Controversial Content",
    severity: Severity.WARNING,
    description: "Maintain neutrality and professionalism.",
    examples: "Market rumors, political comments, aggressive competitive claims."
  }
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
      "originalText": "exact substring from text to be replaced",
      "category": "Category Name",
      "severity": "CRITICAL" | "WARNING" | "SUGGESTION",
      "explanation": "Why this is flagged",
      "suggestion": "The EXACT replacement text ONLY. Do NOT include explanations. If removing, use empty string.",
      "guidelineRef": "Guideline Name"
    }
  ],
  "cleanContent": "Rewritten content with all fixes applied"
}

IMPORTANT: The 'suggestion' field must ONLY contain the replacement text. Do NOT add context like 'Use X instead' or 'Change to Y'. JUST the new text.

Identify ALL issues. Be strict but helpful.
`;