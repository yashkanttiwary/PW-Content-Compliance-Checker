import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, GEMINI_MODEL } from "../constants";
import { AnalysisResult, Issue, Severity } from "../types";

// Developed by Yash Kant Tiwary (PW26173)

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private readonly CHUNK_SIZE = 100000; // Increased to 100k chars for fewer requests (Flash context is large)

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
    onStatusUpdate?: (status: string) => void,
    onPartialResult?: (result: AnalysisResult) => void
  ): Promise<AnalysisResult> {
    if (!this.ai) throw new Error("API Key not configured");

    const analysisTimestamp = Date.now();

    // Decision: Stream (Small) vs Parallel (Large)
    // Flash models handle large context well, so we default to streaming for better UX 
    // unless the content is absolutely massive (>100k chars).
    if (content.length > this.CHUNK_SIZE) {
        return this.analyzeInParallel(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult);
    } else {
        return this.analyzeStream(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult);
    }
  }

  // --- PARALLEL PROCESSING STRATEGY ---
  private async analyzeInParallel(
    content: string,
    contentType: string,
    timestamp: number,
    onStatusUpdate?: (status: string) => void,
    onPartialResult?: (result: AnalysisResult) => void
  ): Promise<AnalysisResult> {
    const chunks = this.splitContent(content);
    const allIssues: Issue[] = [];
    let completedChunks = 0;

    if (onStatusUpdate) onStatusUpdate(`Analyzing ${chunks.length} segments in parallel...`);

    const promises = chunks.map(async (chunk, index) => {
        try {
            // Process chunk independently
            const chunkResult = await this.analyzeSingleChunk(chunk.text, contentType);
            
            // Adjust indices to match original full content
            const adjustedIssues = chunkResult.issues.map(issue => {
                const globalStart = (issue.startIndex || 0) + chunk.offset;
                const globalEnd = (issue.endIndex || 0) + chunk.offset;
                return {
                    ...issue,
                    id: `issue-${timestamp}-${index}-${issue.id.split('-').pop()}`, // Ensure unique ID
                    startIndex: globalStart,
                    endIndex: globalEnd,
                    line: this.calculateLineNumber(content, globalStart) // Recalculate line based on full text
                };
            });

            // Add to global list (Thread-safe in JS event loop)
            allIssues.push(...adjustedIssues);
            completedChunks++;

            // Emit progress
            if (onStatusUpdate) {
                onStatusUpdate(`Analyzed part ${completedChunks}/${chunks.length}...`);
            }

            // Emit partial results
            if (onPartialResult) {
                const currentSummary = this.calculateSummary(allIssues);
                const currentClean = this.generateCleanContent(content, allIssues);
                onPartialResult({
                    issues: this.sortIssues(allIssues),
                    summary: currentSummary,
                    cleanContent: currentClean,
                    timestamp: new Date(timestamp).toISOString()
                });
            }

        } catch (e) {
            console.error(`Chunk ${index} failed`, e);
            // We continue even if one chunk fails, to return partial results
        }
    });

    await Promise.all(promises);

    const summary = this.calculateSummary(allIssues);
    const cleanContent = this.generateCleanContent(content, allIssues);

    return {
        issues: this.sortIssues(allIssues),
        summary,
        cleanContent,
        timestamp: new Date(timestamp).toISOString()
    };
  }

  // Helper: Analyze a single chunk (Non-streaming for simplicity in parallel mode)
  private async analyzeSingleChunk(chunkText: string, contentType: string): Promise<{ issues: Issue[] }> {
     if (!this.ai) throw new Error("No API Key");
     const prompt = `CONTENT TYPE: ${contentType}\n\nCONTENT SEGMENT:\n${chunkText}`;
     
     // Retry logic specific to chunk
     let attempts = 0;
     while (attempts < 3) {
         try {
             attempts++;
             const response = await this.ai.models.generateContent({
                 model: GEMINI_MODEL,
                 contents: prompt,
                 config: {
                     systemInstruction: SYSTEM_PROMPT,
                     responseMimeType: "application/json",
                     temperature: 1, // Increased to 1 as requested
                     thinkingConfig: { thinkingBudget: 8192 } // Increased to 8k for deep analysis
                 }
             });
             
             const text = response.text || '';
             let parsed: any = {};
             
             try {
                parsed = JSON.parse(text);
             } catch (e) {
                // Fallback for markdown code blocks if strictly necessary
                const jsonClean = text.replace(/```json\n?|\n?```/g, '').trim();
                parsed = JSON.parse(jsonClean);
             }
             
             // Process raw issues relative to CHUNK text
             const processed = this.processRawIssues(parsed.issues || [], chunkText, Date.now());
             return { issues: processed.issues };

         } catch (e: any) {
             const isRateLimit = e.message?.includes('429') || e.status === 429 || e.status === 503;
             if (isRateLimit && attempts < 3) {
                 const delay = Math.pow(2, attempts) * 1000 + Math.random() * 500;
                 await new Promise(r => setTimeout(r, delay));
                 continue;
             }
             throw e;
         }
     }
     return { issues: [] };
  }

  private splitContent(content: string): { text: string; offset: number }[] {
    const chunks = [];
    let currentOffset = 0;
    
    // Split by double newline to preserve paragraphs
    const paragraphs = content.split(/(\n\n+)/);
    
    let currentChunk = '';

    for (const part of paragraphs) {
        // If adding this part exceeds size AND we have content, push current chunk
        if ((currentChunk.length + part.length) > this.CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push({ text: currentChunk, offset: currentOffset });
            currentOffset += currentChunk.length;
            currentChunk = '';
        }
        currentChunk += part;
    }
    // Push remaining
    if (currentChunk.length > 0) {
        chunks.push({ text: currentChunk, offset: currentOffset });
    }
    
    return chunks;
  }

  // --- STREAMING STRATEGY (Updated for Robust Partial Parsing) ---
  private async analyzeStream(
    content: string, 
    contentType: string,
    timestamp: number,
    onStatusUpdate?: (status: string) => void,
    onPartialResult?: (result: AnalysisResult) => void
  ): Promise<AnalysisResult> {
    const prompt = `CONTENT TYPE: ${contentType}\n\nCONTENT:\n${content}`;
    let attempts = 0;
    let fullTextResponse = '';
    let lastEmittedIssueCount = 0;

    while (attempts < 3) {
      try {
        attempts++;
        if (onStatusUpdate && attempts > 1) onStatusUpdate(`Retrying attempt ${attempts}...`);

        const streamResult = await this.ai!.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 1, // Increased to 1 as requested
            thinkingConfig: { thinkingBudget: 8192 } // Increased to 8k for deep analysis
          }
        });

        let isFirstChunk = true;
        for await (const chunk of streamResult) {
            if (isFirstChunk) {
                if (onStatusUpdate) onStatusUpdate("Analyzing...");
                isFirstChunk = false;
            }
            
            const chunkText = chunk.text || '';
            fullTextResponse += chunkText;

            // Real-time Partial Parsing
            // We only trigger an update if we find *more* issues than before.
            const partialRawIssues = this.extractIssuesFromStream(fullTextResponse);
            
            if (partialRawIssues.length > lastEmittedIssueCount) {
                 lastEmittedIssueCount = partialRawIssues.length;
                 const partialResult = this.processRawIssues(partialRawIssues, content, timestamp);
                 if (onPartialResult) onPartialResult(partialResult);
            }
        }
        break; // Success
      } catch (e: any) {
         console.error("Stream Error", e);
         const isRateLimit = e.message?.includes('429') || e.status === 429 || e.status === 503;
         if (isRateLimit && attempts < 3) {
             const delay = Math.pow(2, attempts) * 1000;
             await new Promise(r => setTimeout(r, delay));
             continue;
         }
         throw e;
      }
    }

    if (!fullTextResponse) throw new Error("No response from AI");

    // Final Parse to ensure completeness
    let rawIssues: any[] = [];
    try {
        // Try standard parse first
        const parsed = JSON.parse(fullTextResponse);
        rawIssues = parsed.issues || [];
    } catch (e) {
        // Fallback to our robust parser
        rawIssues = this.extractIssuesFromStream(fullTextResponse);
    }

    return this.processRawIssues(rawIssues, content, timestamp);
  }

  // --- SHARED HELPERS ---

  /**
   * Robustly extracts JSON objects from a potentially incomplete stream.
   * Looks for the "issues": [ pattern and extracts complete objects inside it.
   */
  private extractIssuesFromStream(text: string): any[] {
    const marker = '"issues"';
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) return [];

    const arrayStartIndex = text.indexOf('[', markerIndex);
    if (arrayStartIndex === -1) return [];

    const objects: any[] = [];
    let braceCount = 0;
    let startIndex = -1;
    let inString = false;
    let isEscaped = false;

    // Start scanning after the opening [
    for (let i = arrayStartIndex + 1; i < text.length; i++) {
      const char = text[i];
      
      // Handle Escape Sequences
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      // Handle Strings (ignore braces inside strings)
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          if (braceCount === 0) startIndex = i; // Found start of a potential issue object
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            // Found end of an issue object
            const jsonStr = text.substring(startIndex, i + 1);
            try {
              const obj = JSON.parse(jsonStr);
              // Simple validation to ensure it's not junk
              if (obj && typeof obj === 'object') {
                  objects.push(obj);
              }
            } catch (e) {
              // Ignore incomplete or malformed objects in the stream buffer
            }
            startIndex = -1;
          }
        } else if (char === ']' && braceCount === 0) {
            // End of issues array
            break;
        }
      }
    }
    
    return objects;
  }

  private sortIssues(issues: Issue[]): Issue[] {
      return issues.sort((a, b) => (a.startIndex || 0) - (b.startIndex || 0));
  }

  private calculateSummary(issues: Issue[]) {
      return {
        critical: issues.filter(i => i.severity === Severity.CRITICAL).length,
        warning: issues.filter(i => i.severity === Severity.WARNING).length,
        suggestion: issues.filter(i => i.severity === Severity.SUGGESTION).length,
        total: issues.length
      };
  }

  private processRawIssues(rawIssues: any[], content: string, timestamp: number): AnalysisResult {
      const issues: Issue[] = [];
      const usedIndices = new Set<number>();
      
      rawIssues.forEach((issue: any, index: number) => {
        const searchPhrase = issue.originalText;
        if (!searchPhrase) return;

        let start = -1;
        let matchLen = 0;
        let pos = 0;
        
        while (pos < content.length) {
            const match = this.findMatch(content, searchPhrase, pos);
            if (!match) break;
            
            const { index: found, length } = match;
            let collision = false;
            // Check for collision with previously found issues
            for (let i = found; i < found + length; i++) {
                if (usedIndices.has(i)) { collision = true; break; }
            }
            
            if (!collision) {
                start = found;
                matchLen = length;
                break;
            }
            // If collision, keep searching forward
            pos = found + 1;
        }

        if (start !== -1) {
            for (let i = start; i < start + matchLen; i++) usedIndices.add(i);
            issues.push({
                ...issue,
                id: `issue-${timestamp}-${index}`,
                line: this.calculateLineNumber(content, start),
                status: 'pending',
                startIndex: start,
                endIndex: start + matchLen
            });
        }
      });

      return {
        issues,
        summary: this.calculateSummary(issues),
        cleanContent: this.generateCleanContent(content, issues),
        timestamp: new Date(timestamp).toISOString()
      };
  }

  private generateCleanContent(originalContent: string, issues: Issue[]): string {
    const sortedIssues = this.sortIssues([...issues].filter(i => typeof i.startIndex === 'number'));
    let result = '';
    let lastIndex = 0;

    sortedIssues.forEach(issue => {
      if ((issue.startIndex || 0) < lastIndex) return;
      result += originalContent.slice(lastIndex, issue.startIndex);
      result += issue.suggestion;
      lastIndex = issue.endIndex || 0;
    });
    result += originalContent.slice(lastIndex);
    return result;
  }

  private findMatch(content: string, searchPhrase: string, startFrom: number): { index: number, length: number } | null {
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const escaped = escapeRegExp(searchPhrase);
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'g');
      wordRegex.lastIndex = startFrom;
      const wordMatch = wordRegex.exec(content);
      if (wordMatch) return { index: wordMatch.index, length: wordMatch[0].length };
    } catch (e) { }

    const exactIndex = content.indexOf(searchPhrase, startFrom);
    if (exactIndex !== -1) return { index: exactIndex, length: searchPhrase.length };

    try {
      const parts = searchPhrase.split(/\s+/).filter(p => p.length > 0);
      if (parts.length === 0) return null;
      const pattern = parts.map(escapeRegExp).join('[\\s\\r\\n]+');
      const regex = new RegExp(pattern, 'g');
      regex.lastIndex = startFrom;
      const match = regex.exec(content);
      if (match) return { index: match.index, length: match[0].length };
    } catch (e) { return null; }

    return null;
  }

  private calculateLineNumber(fullText: string, startIndex: number): number {
    if (startIndex < 0 || startIndex >= fullText.length) return 1;
    return fullText.substring(0, startIndex).split('\n').length;
  }
}