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

  async analyzeContent(content: string, contentType: string): Promise<AnalysisResult> {
    if (!this.ai) throw new Error("API Key not configured");

    const prompt = `CONTENT TYPE: ${contentType}\n\nCONTENT:\n${content}`;

    let attempts = 0;
    const maxAttempts = 3;
    let textResponse = '';

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const response = await this.ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0.2, // Low temperature for consistent adherence to rules
          }
        });
        textResponse = response.text || '';
        if (textResponse) break;
      } catch (e: any) {
        // Check for Rate Limit (429) or Service Unavailable (503)
        const isRateLimit = e.message?.includes('429') || e.status === 429 || e.status === 503;
        
        if (isRateLimit && attempts < maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s...
          const delay = Math.pow(2, attempts - 1) * 1000;
          console.warn(`Rate limited. Retrying in ${delay}ms... (Attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not retryable or max attempts reached
        throw e;
      }
    }

    if (!textResponse) throw new Error("No response from AI after retries");

    try {
      const parsed = JSON.parse(textResponse);
      
      const issues: Issue[] = [];
      const usedIndices = new Set<number>();
      
      // Process issues to find unique non-overlapping occurrences
      (parsed.issues || []).forEach((issue: any, index: number) => {
        const searchPhrase = issue.originalText;
        if (!searchPhrase) return;

        let start = -1;
        let pos = 0;
        
        // Find the first occurrence that doesn't overlap with existing issues
        while (pos < content.length) {
            const found = content.indexOf(searchPhrase, pos);
            if (found === -1) break;
            
            let collision = false;
            // Check if any character in this range is already 'claimed'
            for (let i = found; i < found + searchPhrase.length; i++) {
                if (usedIndices.has(i)) {
                    collision = true;
                    break;
                }
            }
            
            if (!collision) {
                start = found;
                break;
            }
            // Move past this occurrence
            pos = found + 1;
        }

        if (start !== -1) {
            // Mark these indices as used
            for (let i = start; i < start + searchPhrase.length; i++) {
                usedIndices.add(i);
            }
            
            issues.push({
                ...issue,
                id: `issue-${Date.now()}-${index}`,
                line: this.calculateLineNumber(content, start),
                status: 'pending',
                startIndex: start,
                endIndex: start + searchPhrase.length
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

      return {
        issues,
        summary,
        cleanContent: parsed.cleanContent || content,
        timestamp: new Date().toISOString()
      };

    } catch (e) {
      console.error("Failed to parse AI response", e);
      throw new Error("Analysis failed due to invalid response format.");
    }
  }

  private calculateLineNumber(fullText: string, startIndex: number): number {
    if (startIndex < 0 || startIndex >= fullText.length) return 1;
    return fullText.substring(0, startIndex).split('\n').length;
  }
}