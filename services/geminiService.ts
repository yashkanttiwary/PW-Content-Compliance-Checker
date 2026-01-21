import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
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
        model: 'gemini-3-flash-preview',
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

    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.2, // Low temperature for consistent adherence to rules
      }
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("No response from AI");

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