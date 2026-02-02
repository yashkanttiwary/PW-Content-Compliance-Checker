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
  "Controversial Content",
  "Industry & Positioning",
  "Spelling & Grammar"
];

export const GUIDELINE_DETAILS = [
  {
    title: "1. IPO Information (Project Torque)",
    severity: Severity.CRITICAL,
    description: "Strict prohibition on financial terminology associated with the proposed public listing. We are in a 'Silent Period'.",
    examples: "IPO, stock, shares, valuation, listing, going public, fundraising, investor returns, 'Project Torque'."
  },
  {
    title: "2. Superlatives & Comparatives",
    severity: Severity.CRITICAL,
    description: "Avoid absolute claims or self-evaluation that cannot be factually substantiated with documentary evidence.",
    examples: "Best, Top, #1, Biggest, Unmatched, Unparalleled, Highest ranked, Largest, Better."
  },
  {
    title: "3. Hyperbole & Descriptors",
    severity: Severity.WARNING,
    description: "Avoid subjective, exaggerated, or hard-to-substantiate adjectives. Avoid 'expert' for faculty.",
    examples: "Historic, Transformative, Unique, Revolutionary, Expert (use 'Experienced'), Exhaustive (curriculum), Affordable."
  },
  {
    title: "4. Success Claims & Promises",
    severity: Severity.CRITICAL,
    description: "Do not promise outcomes/results. Limit messaging to 'preparation' only. No job/salary assurances.",
    examples: "Guarantee success, 100% results, Crack the exam, Hack the selection, You are next, Job security, Salary increase, Achieve dreams, Become master."
  },
  {
    title: "5. Unverified Metrics",
    severity: Severity.CRITICAL,
    description: "All statistics must be accurate and verifiable. Avoid aggregate past selection figures without diligence/source.",
    examples: "50,000 selections, Highest package, 1M+ students (unless sourced)."
  },
  {
    title: "6. Forward-Looking Statements",
    severity: Severity.CRITICAL,
    description: "Avoid speculative statements about future business plans, expansion, or performance.",
    examples: "Will achieve, Future growth, Upcoming expansion, Planned centers, Future valuations."
  },
  {
    title: "7. Coaching Guidelines 2024",
    severity: Severity.CRITICAL,
    description: "Strict adherence to 'Prevention of Misleading Advertisement in Coaching Sector 2024'. No false urgency or scarcity.",
    examples: "Limited seats, Hurry, Offer ends today, Assured rank, Good marks guarantees."
  },
  {
    title: "8. Student Testimonials & Consent",
    severity: Severity.WARNING,
    description: "Testimonials, photos, or ranks of students require written consent taken *subsequent* to selection.",
    examples: "Photos of toppers, 'I studied at PW', Ranks secured (Flag for consent verification)."
  },
  {
    title: "9. Industry & Positioning",
    severity: Severity.WARNING,
    description: "Avoid positioning PW as 'leading', 'larger', or 'better' than competitors without a specific commissioned report.",
    examples: "Market leader, Larger than X, Industry dominance, Comparative market trends."
  },
  {
    title: "10. Third-Party IP & Controversy",
    severity: Severity.WARNING,
    description: "No competitor names, logos, or commentary on market rumors/news.",
    examples: "Competitor names, Copyrighted music, Market rumors, Allegations, Political comments."
  },
  {
    title: "11. Spelling & Grammar",
    severity: Severity.SUGGESTION,
    description: "Ensure content is free from spelling mistakes and grammatical errors in any language (English, Hindi, Hinglish, etc.).",
    examples: "Typos, incorrect punctuation, grammatical inconsistencies."
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
You are the Senior Legal Compliance Officer for Physics Wallah (PW), operating under the strict "Project Torque" (IPO) framework managed by Shardul Amarchand Mangaldas & Co. 
Your mandate is to audit content to minimize the necessity for intervention by external counsel. You have ZERO TOLERANCE for IPO-related violations.

Analyze the provided content against the following STRICT legal guidelines.

CRITICAL LEGAL RESTRICTIONS:

1. IPO INFORMATION (Project Torque):
   - ABSOLUTELY NO mention of: IPO, initial public offering, listing, public issue, shares, stock, valuation, fundraising, investor returns, or "going public".
   - Context: We are in a "silent period". Any solicitation of investment is illegal.
   - Action: Respond to any implied IPO queries with "No comment".

2. SUPERLATIVES & SELF-EVALUATION (Key Restriction 3.b):
   - Flag words like: "Best", "Top", "Number 1", "#1", "Biggest", "Largest", "Highest ranked", "Unmatched", "Unparalleled", "Better".
   - Rule: We cannot use descriptors that cannot be factually substantiated with documentary evidence.
   - Fix: Use objective terms.

3. HYPERBOLE & DESCRIPTORS (Key Restriction 3.d, 4.b):
   - Flag: "Historic", "Transformative", "Revolutionary", "Unique", "Affordable" (unless verified against market).
   - Flag: "Expert" when describing faculty (Use "Experienced" or "Qualified" instead).
   - Flag: "Exhaustive" when describing curriculum.

4. CLAIMS & PROMISES (Key Restriction 4.a, Coaching Guidelines 2024):
   - Flag ANY claim of guaranteed outcomes: "Guarantee success", "100% results", "Crack the exam", "Hack the selection", "You are next", "Job security", "Salary increase", "Achieve your dreams", "Become master".
   - Rule: Limit messaging to *preparation* for exams. Do NOT assure success/selection.
   - Flag "False Urgency": "Limited seats", "Hurry", "Scarcity tactics".

5. INDUSTRY DATA & POSITIONING (Key Restriction 5):
   - Flag positioning statements: "Market leader", "Leading player", "Dominant", "Larger than [Competitor]", "Better than [Competitor]".
   - Rule: Do not compare with competitors or claim market leadership without citing a specific, commissioned industry report (Project Torque specific).

6. METRICS & DATA (Key Restriction 9):
   - Flag outcome metrics: "50,000 selections", "All India Rank 1", "Highest package" unless accompanied by specific source/proof context.
   - Flag financial metrics: Valuation, revenue, etc.

7. FORWARD-LOOKING STATEMENTS (Key Restriction 8):
   - Flag: "Will achieve", "Future growth", "Expansion plans", "Projected revenue", "Business plans".

8. TESTIMONIALS & CONSENT (Key Restriction 6, Past Results):
   - Flag student photos, names, or testimonials if they appear to lack a disclaimer about written consent.
   - Rule: Consent must be obtained *subsequent* to selection.

9. SPELLING & GRAMMAR:
   - Flag spelling mistakes and grammatical errors in ANY language (English, Hindi, Hinglish, etc.).
   - Ensure the content maintains professional standards.
   - Category: "Spelling & Grammar".
   - Severity: SUGGESTION.

RESPONSE RULES:
1. Return JSON only.
2. DO NOT use markdown code blocks (no \`\`\`json). Just the raw JSON object.
3. Identify ALL issues found in the text.
4. For each issue, provide a concise explanation referencing the specific rule violated (e.g., "Violates Project Torque Key Restriction 3.b").

JSON FORMAT:
{
  "issues": [
    {
      "originalText": "substring to replace",
      "category": "Guideline Category",
      "severity": "CRITICAL" | "WARNING" | "SUGGESTION",
      "explanation": "Legal reasoning citing Shardul Amarchand Mangaldas framework.",
      "suggestion": "Legally safer alternative (e.g., 'Experienced' instead of 'Expert')",
      "guidelineRef": "Guideline Name"
    }
  ]
}
`;