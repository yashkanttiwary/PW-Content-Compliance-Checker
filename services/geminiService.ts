import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, GEMINI_MODEL } from "../constants";
import { AnalysisResult, Issue, Severity } from "../types";

// Developed by Yash Kant Tiwary (PW26173)

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKey: string = '';
  private readonly CHUNK_SIZE = 100000;

  constructor(apiKey: string) {
    if (apiKey) {
      this.apiKey = apiKey;
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
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

  /**
   * Uploads a file to Google GenAI Files API using standard fetch to avoid browser memory issues.
   * This uses the Resumable Upload protocol.
   */
  private async uploadFileToGemini(file: File, onStatusUpdate?: (status: string) => void): Promise<string> {
    if (onStatusUpdate) onStatusUpdate("Initializing secure upload...");

    const API_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";
    const uploadUrlQuery = `?key=${this.apiKey}`;

    // 1. Initiate Resumable Upload
    const startHeaders = {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': file.size.toString(),
        'X-Goog-Upload-Header-Content-Type': file.type,
        'Content-Type': 'application/json',
    };

    const startResponse = await fetch(`${API_BASE}${uploadUrlQuery}`, {
        method: 'POST',
        headers: startHeaders,
        body: JSON.stringify({ file: { display_name: file.name } })
    });

    if (!startResponse.ok) throw new Error(`Upload initiation failed: ${startResponse.statusText}`);

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error("Failed to get upload URL");

    // 2. Perform Upload (fetch streams the body, preventing memory crash)
    if (onStatusUpdate) onStatusUpdate("Uploading file to Gemini...");
    
    const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Length': file.size.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: file 
    });

    if (!uploadResponse.ok) throw new Error(`File upload failed: ${uploadResponse.statusText}`);

    const uploadResult = await uploadResponse.json();
    const fileUri = uploadResult.file.uri;
    const fileName = uploadResult.file.name; // This is the resource ID name

    // 3. Wait for Active State
    return this.waitForFileActive(fileName, fileUri, onStatusUpdate);
  }

  private async waitForFileActive(resourceName: string, fileUri: string, onStatusUpdate?: (status: string) => void): Promise<string> {
      if (onStatusUpdate) onStatusUpdate("Processing file...");
      
      const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${resourceName}?key=${this.apiKey}`;
      
      let attempts = 0;
      while (attempts < 30) { // Timeout after ~60s
          await new Promise(r => setTimeout(r, 2000));
          const res = await fetch(checkUrl);
          const data = await res.json();
          
          if (data.state === 'ACTIVE') {
              return fileUri;
          }
          if (data.state === 'FAILED') {
              throw new Error("File processing failed on Gemini servers");
          }
          if (onStatusUpdate) onStatusUpdate(`Processing file... (${attempts * 2}s)`);
          attempts++;
      }
      throw new Error("File processing timed out");
  }

  async analyzeContent(
    content: string, 
    contentType: string,
    onStatusUpdate?: (status: string) => void,
    onPartialResult?: (result: AnalysisResult) => void,
    fileData?: { mimeType: string; data: string; fileObject?: File } // Modified signature
  ): Promise<AnalysisResult> {
    if (!this.ai) throw new Error("API Key not configured");

    const analysisTimestamp = Date.now();

    // Strategy Selection
    if (fileData) {
        // If we have a raw File object, we use the efficient Files API
        if (fileData.fileObject) {
            try {
                const fileUri = await this.uploadFileToGemini(fileData.fileObject, onStatusUpdate);
                return this.analyzeStream(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult, {
                    mimeType: fileData.mimeType,
                    fileUri: fileUri 
                });
            } catch (e) {
                console.error("File API Upload Failed", e);
                // Fallback to base64 if it exists and is small enough, otherwise throw
                if (fileData.data) {
                    return this.analyzeStream(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult, {
                        mimeType: fileData.mimeType,
                        data: fileData.data
                    });
                }
                throw e;
            }
        } 
        // Legacy Base64 path
        else if (fileData.data) {
            return this.analyzeStream(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult, {
                mimeType: fileData.mimeType,
                data: fileData.data
            });
        }
    }

    // Text-only strategy
    if (content.length > this.CHUNK_SIZE) {
        return this.analyzeInParallel(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult);
    } else {
        return this.analyzeStream(content, contentType, analysisTimestamp, onStatusUpdate, onPartialResult);
    }
  }

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
            const chunkResult = await this.analyzeSingleChunk(chunk.text, contentType);
            const adjustedIssues = chunkResult.issues.map(issue => {
                const globalStart = (issue.startIndex || 0) + chunk.offset;
                const globalEnd = (issue.endIndex || 0) + chunk.offset;
                return {
                    ...issue,
                    id: `issue-${timestamp}-${index}-${issue.id.split('-').pop()}`,
                    startIndex: globalStart,
                    endIndex: globalEnd,
                    line: this.calculateLineNumber(content, globalStart)
                };
            });

            allIssues.push(...adjustedIssues);
            completedChunks++;

            if (onStatusUpdate) {
                onStatusUpdate(`Analyzed part ${completedChunks}/${chunks.length}...`);
            }

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

  private async analyzeSingleChunk(chunkText: string, contentType: string): Promise<{ issues: Issue[] }> {
     if (!this.ai) throw new Error("No API Key");
     const prompt = `CONTENT TYPE: ${contentType}\n\nCONTENT SEGMENT:\n${chunkText}`;
     
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
                     temperature: 1,
                     thinkingConfig: { thinkingBudget: 8192 }
                 }
             });
             
             const text = response.text || '';
             let parsed: any = {};
             
             try {
                parsed = JSON.parse(text);
             } catch (e) {
                const jsonClean = text.replace(/```json\n?|\n?```/g, '').trim();
                parsed = JSON.parse(jsonClean);
             }
             
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
    const paragraphs = content.split(/(\n\n+)/);
    let currentChunk = '';

    for (const part of paragraphs) {
        if ((currentChunk.length + part.length) > this.CHUNK_SIZE && currentChunk.length > 0) {
            chunks.push({ text: currentChunk, offset: currentOffset });
            currentOffset += currentChunk.length;
            currentChunk = '';
        }
        currentChunk += part;
    }
    if (currentChunk.length > 0) {
        chunks.push({ text: currentChunk, offset: currentOffset });
    }
    return chunks;
  }

  private async analyzeStream(
    content: string, 
    contentType: string,
    timestamp: number,
    onStatusUpdate?: (status: string) => void,
    onPartialResult?: (result: AnalysisResult) => void,
    fileSource?: { mimeType: string; data?: string; fileUri?: string } // Updated signature
  ): Promise<AnalysisResult> {
    
    let instructionAddition = "";
    if (fileSource) {
        instructionAddition = `
        
IMPORTANT INSTRUCTIONS FOR FILE ANALYSIS:
1. You MUST extract the text content from the provided file.
2. Include a field 'extractedText' in the root JSON response containing this text.
   - **CRITICAL**: You MUST preserve the original visual layout, line breaks, and paragraph structure. 
   - Insert newline characters (\\n) exactly where line breaks occur in the document.
   - DO NOT flatten the text into a single line.
3. In each 'issue' object, ADD a 'page' field (integer) indicating the page number where the issue occurs.
`;
    }

    const promptText = `CONTENT TYPE: ${contentType}\n\nCONTENT:\n${content || "(See attached file)"}${instructionAddition}`;
    
    const parts: any[] = [{ text: promptText }];
    
    // Support both Inline (legacy/small) and URI (large/Files API)
    if (fileSource) {
        if (fileSource.fileUri) {
             parts.unshift({
                fileData: {
                    mimeType: fileSource.mimeType,
                    fileUri: fileSource.fileUri
                }
            });
        } else if (fileSource.data) {
            parts.unshift({
                inlineData: {
                    mimeType: fileSource.mimeType,
                    data: fileSource.data
                }
            });
        }
    }

    let attempts = 0;
    let fullTextResponse = '';
    let lastEmittedIssueCount = 0;

    while (attempts < 3) {
      try {
        attempts++;
        if (onStatusUpdate && attempts > 1) onStatusUpdate(`Retrying attempt ${attempts}...`);

        const streamResult = await this.ai!.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 1,
            thinkingConfig: { thinkingBudget: 8192 }
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

            const partialRawIssues = this.extractIssuesFromStream(fullTextResponse);
            
            if (partialRawIssues.length > lastEmittedIssueCount) {
                 lastEmittedIssueCount = partialRawIssues.length;
                 const partialResult = this.processRawIssues(partialRawIssues, content, timestamp);
                 if (onPartialResult) onPartialResult(partialResult);
            }
        }
        break;
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

    let rawIssues: any[] = [];
    let extractedText = '';

    try {
        const parsed = JSON.parse(fullTextResponse);
        rawIssues = parsed.issues || [];
        if (parsed.extractedText) {
            extractedText = parsed.extractedText;
        }
    } catch (e) {
        rawIssues = this.extractIssuesFromStream(fullTextResponse);
    }

    const contentToUse = extractedText || content;

    return this.processRawIssues(rawIssues, contentToUse, timestamp);
  }

  // --- SHARED HELPERS ---

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

    for (let i = arrayStartIndex + 1; i < text.length; i++) {
      const char = text[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          if (braceCount === 0) startIndex = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            const jsonStr = text.substring(startIndex, i + 1);
            try {
              const obj = JSON.parse(jsonStr);
              if (obj && typeof obj === 'object') {
                  objects.push(obj);
              }
            } catch (e) {}
            startIndex = -1;
          }
        } else if (char === ']' && braceCount === 0) {
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
            for (let i = found; i < found + length; i++) {
                if (usedIndices.has(i)) { collision = true; break; }
            }
            
            if (!collision) {
                start = found;
                matchLen = length;
                break;
            }
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