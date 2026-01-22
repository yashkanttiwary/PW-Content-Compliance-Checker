import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, GEMINI_MODEL } from "../constants";
import { AnalysisResult, Issue, Severity } from "../types";

// Developed by Yash Kant Tiwary (PW26173)

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor(apiKey: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  setApiKey(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async validateKey(): Promise<boolean> {
    if (!this.ai) return false;
    try {
      await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: 'ping',
      });
      return true;
    } catch (e) {
      console.error("API Key Validation Failed", e);
      return false;
    }
  }

  async analyzeContent(
    content: string, 
    contentType: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<AnalysisResult> {
    if (!this.ai) throw new Error("API Key not configured");

    const prompt = `CONTENT TYPE: ${contentType}\n\nCONTENT:\n${content}`;

    let attempts = 0;
    const maxAttempts = 3;
    let fullTextResponse = '';

    while (attempts < maxAttempts) {
      try {
        attempts++;
        if (onStatusUpdate && attempts > 1) {
            onStatusUpdate(`Retrying attempt ${attempts}...`);
        }

        const streamResult = await this.ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0.2,
          }
        });

        let isFirstChunk = true;
        for await (const chunk of streamResult) {
            if (isFirstChunk) {
                if (onStatusUpdate) onStatusUpdate("Receiving analysis...");
                isFirstChunk = false;
            }
            fullTextResponse += chunk.text || '';
        }
        
        if (fullTextResponse) break;

      } catch (e: any) {
        // Check for Rate Limit (429) or Service Unavailable (503)
        const isRateLimit = e.message?.includes('429') || e.status === 429 || e.status === 503;
        
        if (isRateLimit && attempts < maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s...
          const delayMs = Math.pow(2, attempts - 1) * 1000;
          
          if (onStatusUpdate) {
             onStatusUpdate(`Rate limited. Retrying in ${delayMs/1000}s...`);
          }
          
          console.warn(`Rate limited. Retrying in ${delayMs}ms... (Attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // If not retryable or max attempts reached
        throw e;
      }
    }

    if (!fullTextResponse) throw new Error("No response from AI after retries");

    try {
      const parsed = JSON.parse(fullTextResponse);
      
      const issues: Issue[] = [];
      const usedIndices = new Set<number>();
      
      // Process issues to find unique non-overlapping occurrences
      (parsed.issues || []).forEach((issue: any, index: number) => {
        const searchPhrase = issue.originalText;
        if (!searchPhrase) return;

        let start = -1;
        let matchLen = 0;
        let pos = 0;
        
        // Find the first occurrence that doesn't overlap with existing issues
        while (pos < content.length) {
            const match = this.findMatch(content, searchPhrase, pos);
            if (!match) break;
            
            const { index: found, length } = match;
            
            let collision = false;
            // Check if any character in this range is already 'claimed'
            for (let i = found; i < found + length; i++) {
                if (usedIndices.has(i)) {
                    collision = true;
                    break;
                }
            }
            
            if (!collision) {
                start = found;
                matchLen = length;
                break;
            }
            // Move past this occurrence
            pos = found + 1;
        }

        if (start !== -1) {
            // Mark these indices as used
            for (let i = start; i < start + matchLen; i++) {
                usedIndices.add(i);
            }
            
            issues.push({
                ...issue,
                id: `issue-${Date.now()}-${index}`,
                line: this.calculateLineNumber(content, start),
                status: 'pending',
                startIndex: start,
                endIndex: start + matchLen
            });
        }
      });

      // Calculate summary
      const summary = {
        critical: issues.filter((i: Issue) => i.severity === Severity.CRITICAL).length,
        warning: issues.filter((i: Issue) => i.severity === Severity.WARNING).length,
        suggestion: issues.filter((i: Issue) => i.severity === Severity.SUGGESTION).length,
        total: issues.length
      };

      // Generate Clean Content Client-Side
      const cleanContent = this.generateCleanContent(content, issues);

      return {
        issues,
        summary,
        cleanContent,
        timestamp: new Date().toISOString()
      };

    } catch (e) {
      console.error("Failed to parse AI response", e);
      throw new Error("Analysis failed due to invalid response format.");
    }
  }

  private generateCleanContent(originalContent: string, issues: Issue[]): string {
    // Sort issues by start index to process sequentially
    // Filter out issues that were not found in text (no startIndex)
    const sortedIssues = [...issues]
      .filter(i => typeof i.startIndex === 'number')
      .sort((a, b) => (a.startIndex || 0) - (b.startIndex || 0));

    let result = '';
    let lastIndex = 0;

    sortedIssues.forEach(issue => {
      // Safety check: ensure we don't go backwards
      if ((issue.startIndex || 0) < lastIndex) return;

      // Append text from last end to current start
      result += originalContent.slice(lastIndex, issue.startIndex);

      // Append the suggestion instead of original text
      result += issue.suggestion;

      // Update last index
      lastIndex = issue.endIndex || 0;
    });

    // Append remaining text
    result += originalContent.slice(lastIndex);

    return result;
  }

  private findMatch(content: string, searchPhrase: string, startFrom: number): { index: number, length: number } | null {
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Try Whole Word Match first (Best for accuracy - Fix H-02)
    // This avoids matching "best" inside "asbestos" by checking word boundaries
    try {
      const escaped = escapeRegExp(searchPhrase);
      // \b matches word boundaries (start/end of string, space, punctuation, etc.)
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'g');
      wordRegex.lastIndex = startFrom;
      const wordMatch = wordRegex.exec(content);
      
      if (wordMatch) {
         return { index: wordMatch.index, length: wordMatch[0].length };
      }
    } catch (e) {
      // Ignore regex errors, fallback to standard search
    }

    // 2. Exact match (Fallback if whole word not found)
    const exactIndex = content.indexOf(searchPhrase, startFrom);
    if (exactIndex !== -1) {
      return { index: exactIndex, length: searchPhrase.length };
    }

    // 3. Flexible Whitespace Match
    // Handles cases where AI normalizes multiple spaces or newlines to single spaces
    try {
      // Split search phrase into words, filtering out empty strings
      const parts = searchPhrase.split(/\s+/).filter(p => p.length > 0);
      if (parts.length === 0) return null;

      // Escape special regex characters in each part
      const pattern = parts.map(escapeRegExp).join('[\\s\\r\\n]+');
      
      const regex = new RegExp(pattern, 'g');
      regex.lastIndex = startFrom;
      
      const match = regex.exec(content);
      if (match) {
        return { index: match.index, length: match[0].length };
      }
    } catch (e) {
      // If regex fails (rare), return null
      return null;
    }

    return null;
  }

  private calculateLineNumber(fullText: string, startIndex: number): number {
    if (startIndex < 0 || startIndex >= fullText.length) return 1;
    return fullText.substring(0, startIndex).split('\n').length;
  }
}