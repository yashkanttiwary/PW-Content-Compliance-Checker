import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { AnalysisResult, Issue, Severity } from "../types";

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
      
      // Post-process to add IDs and ensure structure
      const issues: Issue[] = (parsed.issues || []).map((issue: any, index: number) => ({
        ...issue,
        id: `issue-${Date.now()}-${index}`,
        line: this.calculateLineNumber(content, issue.originalText),
        status: 'pending'
      }));

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

  private calculateLineNumber(fullText: string, searchPhrase: string): number {
    const index = fullText.indexOf(searchPhrase);
    if (index === -1) return 1;
    return fullText.substring(0, index).split('\n').length;
  }
}