// Developed by Yash Kant Tiwary (PW26173)

export enum Severity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  SUGGESTION = 'SUGGESTION'
}

export enum ContentType {
  VIDEO_SCRIPT = 'Video Script',
  BLOG_POST = 'Blog Post',
  SOCIAL_MEDIA = 'Social Media Post',
  COURSE_DESC = 'Course Description',
  EMAIL_CAMPAIGN = 'Email/SMS Campaign',
  PRESS_RELEASE = 'Press Release',
  AD_COPY = 'Advertisement Copy',
  DRIP = 'Drip',
  IN_APP = 'In-app',
  CLM = 'CLM',
  PUSH_NOTIFICATION = 'Push Notification',
  OTHER = 'Other'
}

export interface Issue {
  id: string;
  line: number;
  originalText: string;
  category: string;
  severity: Severity;
  explanation: string;
  suggestion: string;
  guidelineRef: string;
  status: 'pending' | 'fixed' | 'ignored';
  startIndex?: number; // Calculated client-side
  endIndex?: number;   // Calculated client-side
}

export interface AnalysisResult {
  issues: Issue[];
  summary: {
    critical: number;
    warning: number;
    suggestion: number;
    total: number;
  };
  timestamp: string;
  cleanContent?: string; // AI generated clean version
}

export interface HistoryItem {
  id: string;
  date: string;
  contentType: ContentType;
  snippet: string;
  issuesCount: number;
  data: AnalysisResult;
  originalContent: string;
}

export interface UserProfile {
  name: string;
  defaultContentType: ContentType;
}

export interface AppState {
  apiKey: string | null;
  profile: UserProfile | null;
  history: HistoryItem[];
}