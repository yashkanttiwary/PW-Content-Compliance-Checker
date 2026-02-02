import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, FileText, Upload, Copy, Download, 
  ChevronDown, X, Check, Info,
  History, Settings as SettingsIcon, HelpCircle, Loader, FileType,
  Trash2, RotateCcw, Shield, User, LogOut, ExternalLink, AlertTriangle,
  Layout, List, Edit3, Image as ImageIcon, Eye, Minimize2
} from 'lucide-react';
import { AppState, ContentType, HistoryItem, Issue, Severity } from '../types';
import { GeminiService } from '../services/geminiService';
import AnalysisPanel from './AnalysisPanel';
import { CONTENT_TYPE_OPTIONS, SEVERITY_COLORS, GUIDELINE_DETAILS } from '../constants';
import { jsPDF } from 'jspdf';
import { compressPDF } from '../services/compressionService';

// Developed by Yash Kant Tiwary (PW26173)

interface DashboardProps {
  appState: AppState;
  onLogout: () => void;
  onUpdateAppState: (newState: AppState) => void;
}

interface UploadedFile {
  name: string;
  type: string;
  data: string | null; // data is null if file is too large for inline/preview
  file?: File; // Store the raw file object for large uploads
  originalSize?: number; // Track original size if compressed
}

const base64ToBlobUrl = (base64: string, mimeType: string) => {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Blob conversion failed", e);
    return '';
  }
};

const Dashboard: React.FC<DashboardProps> = ({ appState, onLogout, onUpdateAppState }) => {
  const [content, setContent] = useState('');
  const [analyzedContent, setAnalyzedContent] = useState('');
  const [contentType, setContentType] = useState<ContentType>(appState.profile?.defaultContentType || ContentType.VIDEO_SCRIPT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeIssueId, setActiveIssueId] = useState<string | undefined>(undefined);
  const [geminiService] = useState(() => new GeminiService(appState.apiKey || ''));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [viewMode, setViewMode] = useState<'analysis' | 'original'>('analysis');

  // Compression State
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStatus, setCompressionStatus] = useState('');

  // New UI State
  const [activePanel, setActivePanel] = useState<'history' | 'settings' | 'help' | null>(null);
  const [mobileTab, setMobileTab] = useState<'input' | 'analysis' | 'issues'>('input');
  
  // File Preview URL State
  const [filePreviewUrl, setFilePreviewUrl] = useState<string>('');

  // Check if content matches analyzed content (for Sync Warning M-02)
  // Only applicable if NOT using a binary file
  const isDirty = result && !uploadedFile && content !== analyzedContent;

  // Manage file preview URL lifecycle
  useEffect(() => {
    let url = '';
    if (uploadedFile) {
        if (uploadedFile.file) {
            // Prefer raw file object (works for large files/compressed files)
            url = URL.createObjectURL(uploadedFile.file);
        } else if (uploadedFile.data) {
            // Fallback to base64 data
            url = base64ToBlobUrl(uploadedFile.data, uploadedFile.type);
        }
    }
    setFilePreviewUrl(url);

    return () => {
        if (url) URL.revokeObjectURL(url);
    };
  }, [uploadedFile]);

  const handleAnalyze = async () => {
    if (!content.trim() && !uploadedFile) return;
    
    // COMPLETE RESET of analysis state to ensure fresh start
    setIsAnalyzing(true);
    setStatusText("Initializing...");
    setResult(null);             // Clear previous AI response
    setActiveIssueId(undefined); // Clear active issue selection
    setErrorMsg(null);           // Clear any previous errors
    setViewMode('analysis');     // Force switch to analysis view
    
    if (!uploadedFile) {
        setAnalyzedContent(content); 
    } else {
        setAnalyzedContent("Analyzing document layout and content...");
    }
    
    try {
      // Prepare file data: prefer raw file object if available (large file path)
      // otherwise use base64 data (small file/legacy path)
      const filePayload = uploadedFile ? {
          mimeType: uploadedFile.type,
          data: uploadedFile.data || '',
          fileObject: uploadedFile.file
      } : undefined;

      const data = await geminiService.analyzeContent(
        content, 
        contentType,
        (status) => setStatusText(status),
        (partialData) => {
            setResult(partialData);
        },
        filePayload
      );
      
      setResult(data);
      
      // Use sourceContent (extracted/original text) as the base for highlighting issues.
      // This ensures we show the original text with issues highlighted, rather than the text with fixes already applied.
      if (data.sourceContent) {
          setAnalyzedContent(data.sourceContent);
      } else {
          setAnalyzedContent(content);
      }

      // Auto-switch to analysis view on mobile
      setMobileTab('analysis');
      
      // Save to History (M-01: Limit history size)
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        contentType,
        snippet: uploadedFile ? `File: ${uploadedFile.name}` : (content.substring(0, 80) + (content.length > 80 ? '...' : '')),
        issuesCount: data.summary.total,
        data: {
          ...data,
          cleanContent: data.cleanContent
        },
        originalContent: uploadedFile ? "" : content
      };

      const updatedHistory = [newHistoryItem, ...appState.history].slice(0, 20);
      onUpdateAppState({ ...appState, history: updatedHistory });

    } catch (error) {
      setErrorMsg("Analysis failed. Please check your connection or API key.");
      console.error(error);
      if (uploadedFile) setAnalyzedContent(""); 
    } finally {
      setIsAnalyzing(false);
      setStatusText(null);
    }
  };

  const handleRestoreHistory = (item: HistoryItem) => {
    setContent(item.originalContent);
    // Restore the source text (with errors) so user can see issues, not the clean text
    setAnalyzedContent(item.data.sourceContent || item.originalContent);
    setResult(item.data);
    setContentType(item.contentType);
    setActivePanel(null);
    setErrorMsg(null);
    setActiveIssueId(undefined);
    setUploadedFile(null); // History currently doesn't restore binary files
    setMobileTab('analysis');
    setViewMode('analysis');
  };

  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedHistory = appState.history.filter(item => item.id !== id);
    onUpdateAppState({ ...appState, history: updatedHistory });
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear all history?")) {
      onUpdateAppState({ ...appState, history: [] });
    }
  };

  const handleClear = () => {
    setContent('');
    setUploadedFile(null);
    setAnalyzedContent('');
    setResult(null);
    setActiveIssueId(undefined);
    setErrorMsg(null);
    setViewMode('analysis');
    setIsCompressing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset UI
    setUploadedFile(null);
    setContent('');
    setErrorMsg(null);
    setResult(null);
    setAnalyzedContent('');
    setIsCompressing(false);

    // Check file type
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf';
    const isText = file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt');

    if (!isImage && !isPDF && !isText) {
        setErrorMsg("Unsupported file type. Please upload Image, PDF, or Text.");
        return;
    }

    // Compression Threshold: 5MB
    const COMPRESSION_THRESHOLD = 5 * 1024 * 1024;
    let fileToProcess = file;
    let wasCompressed = false;

    // If PDF > 5MB, attempt compression
    if (isPDF && file.size > COMPRESSION_THRESHOLD) {
        setIsCompressing(true);
        setCompressionStatus("Compressing PDF...");
        try {
            const compressedFile = await compressPDF(file, setCompressionStatus);
            if (compressedFile.size < file.size) {
                fileToProcess = compressedFile;
                wasCompressed = true;
            }
        } catch (err) {
            console.warn("Compression skipped or failed, using original file", err);
            // Non-blocking error, just continue with original
        } finally {
            setIsCompressing(false);
            setCompressionStatus('');
        }
    }

    // SAFE LIMIT: 4MB for inline preview. Anything larger uses Files API strategy.
    const MAX_INLINE_SIZE = 4 * 1024 * 1024; 
    const isLargeFile = fileToProcess.size > MAX_INLINE_SIZE;

    if (isText && !isLargeFile) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setContent(ev.target?.result as string);
          setUploadedFile(null);
        };
        reader.readAsText(fileToProcess);
    } else if (isImage || isPDF) {
        if (isLargeFile) {
            setUploadedFile({
                name: fileToProcess.name,
                type: fileToProcess.type,
                data: null, // No preview data for large files (will use File object)
                file: fileToProcess, // Store raw file for Service to handle upload and preview
                originalSize: wasCompressed ? file.size : undefined
            });
            setContent('');
        } else {
            // Small files (or successfully compressed ones): read for preview
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                const base64Data = result.split(',')[1];
                setUploadedFile({
                    name: fileToProcess.name,
                    type: fileToProcess.type,
                    data: base64Data,
                    file: fileToProcess,
                    originalSize: wasCompressed ? file.size : undefined
                });
                setContent('');
            };
            reader.readAsDataURL(fileToProcess);
        }
    }
  };

  const handleApplyFix = (issue: Issue) => {
    setResult((prevResult: any) => {
      if (!prevResult) return null;

      const currentIssue = prevResult.issues.find((i: Issue) => i.id === issue.id);
      
      if (!currentIssue || typeof currentIssue.startIndex !== 'number' || typeof currentIssue.endIndex !== 'number') {
        console.error("Invalid issue indices", currentIssue);
        setErrorMsg("Unable to apply fix: Issue data is invalid.");
        return prevResult;
      }
      
      const targetText = analyzedContent.slice(currentIssue.startIndex, currentIssue.endIndex);
      if (targetText !== currentIssue.originalText) {
        setErrorMsg(`Sync error: The content has changed or shifted. Expected "${currentIssue.originalText}" but found "${targetText}". Please re-analyze.`);
        return {
          ...prevResult,
          issues: prevResult.issues.map((i: Issue) => 
            i.id === issue.id ? { ...i, status: 'ignored' } : i
          )
        };
      }
      
      const prefix = analyzedContent.slice(0, currentIssue.startIndex);
      const suffix = analyzedContent.slice(currentIssue.endIndex);
      const newContent = prefix + currentIssue.suggestion + suffix;
      
      setAnalyzedContent(newContent);
      if (!uploadedFile) setContent(newContent); 
      setErrorMsg(null);

      const lengthDiff = currentIssue.suggestion.length - (currentIssue.endIndex - currentIssue.startIndex);

      const updatedIssues = prevResult.issues.map((i: Issue) => {
        if (i.id === issue.id) {
          return { ...i, status: 'fixed' };
        }
        
        if (typeof i.startIndex === 'number' && i.startIndex > currentIssue.startIndex!) {
          return {
            ...i,
            startIndex: i.startIndex + lengthDiff,
            endIndex: (i.endIndex || 0) + lengthDiff
          };
        }
        return i;
      });

      const newSummary = { ...prevResult.summary };
      if (currentIssue.status !== 'fixed') { 
        const severityKey = issue.severity.toLowerCase() as keyof typeof prevResult.summary;
        if (newSummary[severityKey] > 0) newSummary[severityKey]--;
      }

      return {
        ...prevResult,
        issues: updatedIssues,
        summary: newSummary
      };
    });
    
    setActiveIssueId(undefined);
  };

  const handleIgnore = (issueId: string) => {
    setResult((prev: any) => {
      if (!prev) return null;
      return {
        ...prev,
        issues: prev.issues.map((i: Issue) => 
          i.id === issueId ? { ...i, status: 'ignored' } : i
        )
      };
    });
  };

  const handleExport = () => {
    if (!result) return;
    const report = `# Compliance Check Report
Date: ${new Date().toLocaleString()}
Content Type: ${contentType}
Total Issues: ${result.summary.total}

## Issues Found
${result.issues.map((i: Issue) => `
### ${i.page ? `Page ${i.page}` : `Line ${i.line}`}: ${i.category} [${i.severity}]
Original: "${i.originalText}"
Suggestion: "${i.suggestion}"
Reason: ${i.explanation}
Guideline: ${i.guidelineRef}
`).join('\n')}
    `;
    
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyClean = () => {
    const textToCopy = result?.cleanContent || analyzedContent;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
  };
  
  const handleCopyCurrent = () => {
    navigator.clipboard.writeText(analyzedContent);
    const btn = document.getElementById('copy-current-btn');
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>';
      setTimeout(() => btn.innerHTML = original, 1000);
    }
  };

  const handleDownloadDoc = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body><pre style='font-family: monospace; font-size: 11pt; white-space: pre-wrap;'>";
    const footer = "</pre></body></html>";
    const sourceHTML = header + analyzedContent + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pw-content-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowDownloadMenu(false);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(analyzedContent, 180);
    doc.text(splitText, 10, 10);
    doc.save(`pw-content-${Date.now()}.pdf`);
    setShowDownloadMenu(false);
  };

  const wordCount = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <header className="h-14 bg-white border-b border-pw-border flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pw-blue text-white rounded flex items-center justify-center font-bold">PW</div>
          <h1 className="font-semibold text-pw-text text-sm md:text-base">Compliance Checker</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActivePanel('history')}
            className={`p-2 rounded-md flex items-center gap-2 text-sm transition-colors ${activePanel === 'history' ? 'bg-blue-50 text-pw-blue' : 'text-pw-muted hover:bg-gray-100'}`}
            aria-label="History"
          >
            <History size={18} />
            <span className="hidden md:inline">History</span>
          </button>
          <button 
            onClick={() => setActivePanel('settings')}
            className={`p-2 rounded-md transition-colors ${activePanel === 'settings' ? 'bg-blue-50 text-pw-blue' : 'text-pw-muted hover:bg-gray-100'}`}
            aria-label="Settings"
          >
            <SettingsIcon size={18} />
          </button>
          <button 
            onClick={() => setActivePanel('help')}
            className={`p-2 rounded-md transition-colors ${activePanel === 'help' ? 'bg-blue-50 text-pw-blue' : 'text-pw-muted hover:bg-gray-100'}`}
            aria-label="Help"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Mobile Tabs */}
        <div className="lg:hidden flex border-b border-pw-border bg-white text-sm font-medium shrink-0">
          <button 
            onClick={() => setMobileTab('input')} 
            className={`flex-1 py-3 flex items-center justify-center gap-2 ${mobileTab === 'input' ? 'text-pw-blue border-b-2 border-pw-blue' : 'text-pw-muted'}`}
            role="tab"
            aria-selected={mobileTab === 'input'}
          >
            <Edit3 size={16} /> Input
          </button>
          <button 
            onClick={() => setMobileTab('analysis')} 
            className={`flex-1 py-3 flex items-center justify-center gap-2 ${mobileTab === 'analysis' ? 'text-pw-blue border-b-2 border-pw-blue' : 'text-pw-muted'}`}
            role="tab"
            aria-selected={mobileTab === 'analysis'}
          >
            <Layout size={16} /> View
          </button>
          <button 
            onClick={() => setMobileTab('issues')} 
            className={`flex-1 py-3 flex items-center justify-center gap-2 ${mobileTab === 'issues' ? 'text-pw-blue border-b-2 border-pw-blue' : 'text-pw-muted'}`}
            role="tab"
            aria-selected={mobileTab === 'issues'}
          >
            <List size={16} /> Issues
            {result?.issues.filter((i: Issue) => i.status !== 'fixed').length > 0 && (
              <span className="bg-red-100 text-red-600 text-[10px] px-1.5 rounded-full">
                {result.issues.filter((i: Issue) => i.status !== 'fixed').length}
              </span>
            )}
          </button>
        </div>

        {/* Column 1: Input */}
        <div className={`flex-1 flex-col border-r border-pw-border min-w-[320px] bg-white lg:max-w-md ${mobileTab === 'input' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-pw-border space-y-4 bg-pw-bg/30">
            <div>
              <label className="block text-xs font-semibold text-pw-muted uppercase mb-1">Content Type</label>
              <div className="relative">
                <select 
                  className="w-full pl-3 pr-10 py-2 bg-white border border-pw-border rounded-md appearance-none text-sm focus:ring-1 focus:ring-pw-blue focus:border-pw-blue outline-none"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                  aria-label="Select Content Type"
                >
                  {CONTENT_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-pw-muted pointer-events-none" />
              </div>
            </div>
          </div>
          
          <div className="flex-1 relative flex flex-col">
            {isCompressing ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-blue-50 m-4 rounded-lg border border-blue-100">
                <Loader className="animate-spin text-pw-blue mb-3" size={32} />
                <h3 className="font-semibold text-pw-blue text-sm mb-1">Compressing Large File...</h3>
                <p className="text-xs text-pw-muted text-center">{compressionStatus}</p>
                <p className="text-[10px] text-pw-muted mt-2 opacity-70">This happens locally on your device.</p>
              </div>
            ) : uploadedFile ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50 m-4 transition-all">
                    <div className="w-16 h-16 bg-blue-100 text-pw-blue rounded-full flex items-center justify-center mb-4 shadow-sm">
                        {uploadedFile.type.includes('pdf') ? <FileText size={32} /> : <ImageIcon size={32} />}
                    </div>
                    <h3 className="text-sm font-semibold text-pw-text mb-1 max-w-[200px] truncate" title={uploadedFile.name}>
                        {uploadedFile.name}
                    </h3>
                    <p className="text-xs text-pw-muted mb-2 uppercase tracking-wider font-medium">
                        {uploadedFile.type.split('/')[1] || 'FILE'} • 
                        {uploadedFile.originalSize && (
                           <span className="line-through mr-1 opacity-70">{(uploadedFile.originalSize / 1024 / 1024).toFixed(1)}MB</span>
                        )}
                        {(uploadedFile.file!.size / 1024 / 1024).toFixed(1)}MB
                    </p>
                    {uploadedFile.originalSize && (
                       <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium mb-4 flex items-center gap-1">
                          <Minimize2 size={10} /> Compressed
                       </span>
                    )}
                    
                    <button 
                        onClick={handleClear}
                        className="px-6 py-2 bg-white border border-red-200 text-red-500 rounded-md text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-all shadow-sm flex items-center gap-2 group mt-2"
                    >
                        <Trash2 size={16} className="group-hover:text-red-600" /> Remove File
                    </button>
                </div>
            ) : (
                <textarea
                  className="w-full h-full p-4 resize-none outline-none font-mono text-sm leading-relaxed whitespace-pre overflow-auto"
                  placeholder="Paste your content here or upload a file..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  aria-label="Input Content"
                />
            )}
            
            {!uploadedFile && !isCompressing && (
              <div className="absolute bottom-4 right-4 flex gap-2">
                 <button 
                   onClick={handleClear}
                   className="p-2 bg-white border border-pw-border shadow-sm rounded-md text-pw-muted hover:text-pw-error hover:border-pw-error transition-colors"
                   title="Clear"
                   aria-label="Clear content"
                 >
                   <X size={16} />
                 </button>
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="p-2 bg-white border border-pw-border shadow-sm rounded-md text-pw-muted hover:text-pw-blue hover:border-pw-blue transition-colors"
                   title="Upload File"
                   aria-label="Upload File"
                 >
                   <Upload size={16} />
                 </button>
              </div>
            )}
            
             <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept=".txt,.md,.pdf,image/png,image/jpeg,image/webp" 
                 onChange={handleFileUpload} 
             />
             
             {!content && !uploadedFile && !isCompressing && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="text-center opacity-40 pointer-events-auto cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                         <Upload size={48} className="mx-auto mb-2" />
                         <p className="text-sm font-medium">Click to upload file</p>
                         <p className="text-xs">PDF, Images, TXT supported</p>
                     </div>
                 </div>
             )}
          </div>

          <div className="p-4 border-t border-pw-border bg-pw-bg/30">
            <button 
              onClick={handleAnalyze}
              disabled={(!content.trim() && !uploadedFile) || isAnalyzing || isCompressing}
              className="w-full py-2.5 bg-pw-blue text-white rounded-md font-medium hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader className="animate-spin" size={18} />
                  {statusText || "Analyzing..."}
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  Analyze Content
                </>
              )}
            </button>
            <div className="mt-2 text-center text-xs text-pw-muted flex justify-center items-center flex-wrap gap-1">
              {!uploadedFile ? (
                <>
                    <span>{content.length} characters • {wordCount} words</span>
                </>
              ) : (
                  <span>Ready to analyze {uploadedFile.type.split('/')[1] || 'file'}</span>
              )}
            </div>
          </div>
          
          <div className="p-2 border-t border-pw-border bg-white text-[10px] text-gray-300 text-center font-mono select-none">
            PW26173 - Yash Kant Tiwary
          </div>
        </div>

        {/* Column 2: Analysis */}
        <div className={`flex-[1.5] flex-col min-w-[320px] bg-pw-bg overflow-hidden relative ${mobileTab === 'analysis' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-3 border-b border-pw-border flex justify-between items-center bg-white shadow-sm z-10">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-semibold text-pw-text">Analyzed Content</h2>
              
              {/* File Toggle */}
              {uploadedFile && (
                <div className="flex bg-gray-100 rounded p-0.5 text-xs font-medium">
                  <button 
                    onClick={() => setViewMode('analysis')}
                    className={`px-3 py-1 rounded-sm transition-all ${viewMode === 'analysis' ? 'bg-white shadow text-pw-blue' : 'text-pw-muted hover:text-pw-text'}`}
                  >
                    Analysis View
                  </button>
                  <button 
                    onClick={() => setViewMode('original')}
                    className={`px-3 py-1 rounded-sm transition-all ${viewMode === 'original' ? 'bg-white shadow text-pw-blue' : 'text-pw-muted hover:text-pw-text'}`}
                  >
                    Original File
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden md:flex gap-4 text-xs pr-4 border-r border-gray-200 mr-2">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></span> Critical</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm"></span> Warning</div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm"></span> Tip</div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  id="copy-current-btn"
                  onClick={handleCopyCurrent} 
                  disabled={!analyzedContent}
                  className="p-1.5 text-pw-muted hover:text-pw-blue hover:bg-blue-50 rounded transition-colors"
                  title="Copy Current Content"
                  aria-label="Copy Content"
                >
                  <Copy size={16} />
                </button>
                
                <div className="relative">
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    disabled={!analyzedContent}
                    className="p-1.5 text-pw-muted hover:text-pw-blue hover:bg-blue-50 rounded transition-colors"
                    title="Download"
                    aria-label="Download Menu"
                    aria-expanded={showDownloadMenu}
                  >
                    <Download size={16} />
                  </button>
                  
                  {showDownloadMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowDownloadMenu(false)}
                      ></div>
                      <div className="absolute right-0 top-full mt-1 bg-white border border-pw-border rounded shadow-lg z-50 w-36 py-1">
                         <button 
                           onClick={handleDownloadDoc}
                           className="w-full text-left px-3 py-2 text-sm text-pw-text hover:bg-gray-50 flex items-center gap-2"
                         >
                           <FileText size={14} className="text-blue-600" /> Word Doc
                         </button>
                         <button 
                           onClick={handleDownloadPDF}
                           className="w-full text-left px-3 py-2 text-sm text-pw-text hover:bg-gray-50 flex items-center gap-2"
                         >
                           <FileType size={14} className="text-red-600" /> PDF
                         </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 p-4 overflow-hidden relative flex flex-col">
             {isDirty && (
               <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2">
                 <AlertTriangle size={16} className="shrink-0" />
                 <span>Input text has changed. <strong className="cursor-pointer underline" onClick={handleAnalyze}>Re-analyze</strong> to apply fixes safely.</span>
               </div>
             )}

             {errorMsg && (
               <div className="mb-4 bg-red-50 border border-red-200 text-red-800 p-3 rounded-md flex items-center gap-2 text-sm">
                 <AlertTriangle size={16} />
                 {errorMsg}
               </div>
             )}
             
             <div className="flex-1 relative overflow-hidden bg-white rounded-lg border border-pw-border shadow-sm">
                {uploadedFile && viewMode === 'original' ? (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 overflow-hidden relative">
                    {uploadedFile.originalSize && (
                        <div className="absolute top-4 right-4 z-10 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-md shadow-sm border border-green-200 flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
                            <Minimize2 size={12} />
                            <span>Compressed Preview</span>
                        </div>
                    )}
                    
                    {filePreviewUrl ? (
                        uploadedFile.type === 'application/pdf' ? (
                        <iframe 
                            src={`${filePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                            className="w-full h-full border-none"
                            title="PDF Preview"
                        >
                            <div className="flex flex-col items-center justify-center h-full text-pw-muted p-4 text-center">
                                <FileText size={48} className="mb-4 text-gray-400" />
                                <p className="font-medium mb-2">Browser PDF Preview Not Supported</p>
                            </div>
                        </iframe>
                        ) : uploadedFile.type.startsWith('image/') ? (
                        <img src={filePreviewUrl} alt="Original" className="max-w-full max-h-full object-contain p-4" />
                        ) : (
                        <div className="flex flex-col items-center justify-center h-full text-pw-muted p-4">
                            <FileText size={48} className="mb-2" />
                            <p>Preview not available for this file type</p>
                        </div>
                        )
                    ) : (
                         <div className="flex flex-col items-center justify-center h-full text-pw-muted p-4">
                            <FileText size={48} className="mb-2 opacity-30" />
                            <p className="font-medium">File too large for inline preview</p>
                            <p className="text-xs text-gray-400 mt-2">Analysis will still work via secure upload.</p>
                        </div>
                    )}
                  </div>
                ) : (
                  <AnalysisPanel 
                    content={analyzedContent} 
                    issues={result?.issues || []} 
                    onIssueClick={(issue) => {
                      setActiveIssueId(issue.id);
                      setMobileTab('issues'); 
                    }}
                    activeIssueId={activeIssueId}
                  />
                )}
             </div>
          </div>

          {result && (
            <div className="p-3 bg-white border-t border-pw-border flex justify-between items-center text-xs text-pw-text">
               <span>Last checked: {new Date(result.timestamp).toLocaleTimeString()}</span>
               <div className="flex gap-2">
                 <button onClick={handleCopyClean} className="flex items-center gap-1 px-3 py-1.5 border border-pw-border rounded hover:bg-gray-50 transition-colors">
                    <Copy size={14} /> Copy Clean Version
                 </button>
                 <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 border border-pw-border rounded hover:bg-gray-50 transition-colors">
                    <Download size={14} /> Export Report
                 </button>
               </div>
            </div>
          )}
        </div>

        {/* Column 3: Issues (Unchanged mostly) */}
        <div className={`flex-1 flex-col border-l border-pw-border bg-white lg:max-w-sm min-w-[300px] ${mobileTab === 'issues' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-pw-border bg-pw-bg/30">
            <h2 className="font-semibold text-pw-text mb-3">Issues Found</h2>
            {result ? (
              <div className="grid grid-cols-3 gap-2">
                 <div className="bg-red-50 border border-red-100 rounded p-2 text-center">
                    <div className="text-xl font-bold text-red-700">{result.summary.critical}</div>
                    <div className="text-xs text-red-600 font-medium">Critical</div>
                 </div>
                 <div className="bg-amber-50 border border-amber-100 rounded p-2 text-center">
                    <div className="text-xl font-bold text-amber-700">{result.summary.warning}</div>
                    <div className="text-xs text-amber-600 font-medium">Warnings</div>
                 </div>
                 <div className="bg-purple-50 border border-purple-100 rounded p-2 text-center">
                    <div className="text-xl font-bold text-purple-700">{result.summary.suggestion}</div>
                    <div className="text-xs text-purple-600 font-medium">Tips</div>
                 </div>
              </div>
            ) : (
              <div className="text-sm text-pw-muted text-center py-4 italic">
                Run analysis to see summary
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {result?.issues.filter((i: Issue) => i.status !== 'fixed').map((issue: Issue) => {
              const colors = SEVERITY_COLORS[issue.severity];
              const isSelected = activeIssueId === issue.id;

              return (
                <div 
                  key={issue.id}
                  id={`issue-card-${issue.id}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveIssueId(issue.id);
                      setMobileTab('analysis');
                      setViewMode('analysis');
                    }
                  }}
                  className={`
                    bg-white rounded-lg border shadow-sm transition-all duration-200 cursor-pointer outline-none
                    ${isSelected ? 'border-pw-blue ring-1 ring-pw-blue shadow-md' : 'border-pw-border hover:border-gray-300 focus:border-pw-blue focus:ring-1 focus:ring-pw-blue'}
                  `}
                  onClick={() => {
                    setActiveIssueId(issue.id);
                    setMobileTab('analysis'); 
                    setViewMode('analysis');
                  }}
                >
                  <div className={`px-3 py-2 border-b flex justify-between items-center ${issue.status === 'ignored' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                       <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                         {issue.severity}
                       </span>
                       <span className="text-xs text-pw-muted">
                        {issue.page ? `Page ${issue.page}` : `Line ${issue.line}`}
                       </span>
                    </div>
                  </div>
                  
                  <div className={`p-3 ${issue.status === 'ignored' ? 'opacity-50' : ''}`}>
                    <p className="font-mono text-sm bg-red-50 text-red-800 px-2 py-1 rounded mb-2 inline-block border border-red-100">
                      "{issue.originalText}"
                    </p>
                    <p className="text-sm text-pw-text mb-2">{issue.explanation}</p>
                    <div className="flex items-center gap-2 text-xs text-pw-muted mb-3">
                      <Info size={12} />
                      <span>{issue.category}</span>
                    </div>
                    
                    {issue.status !== 'ignored' && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs font-semibold text-green-700 mb-1">Suggestion:</div>
                        <div className="text-sm text-pw-text mb-3 font-medium">"{issue.suggestion}"</div>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleApplyFix(issue); }}
                            className="flex-1 bg-pw-blue text-white py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                            aria-label="Apply Fix"
                          >
                            <Check size={12} /> Apply Fix
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleIgnore(issue.id); }}
                            className="px-3 py-1.5 border border-pw-border text-pw-muted rounded text-xs font-medium hover:bg-gray-50 transition-colors"
                            aria-label="Ignore Issue"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {result && result.issues.filter((i: Issue) => i.status !== 'fixed').length === 0 && (
              <div className="text-center py-10">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check size={24} />
                </div>
                <h3 className="text-pw-text font-medium">All Clear!</h3>
                <p className="text-sm text-pw-muted mt-1">No pending issues found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Panels (History/Help) */}
        {activePanel === 'history' && (
          <div className="absolute inset-0 z-30 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setActivePanel(null)} />
            <div className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 border-l border-pw-border relative">
              <div className="p-4 border-b border-pw-border flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-pw-text flex items-center gap-2">
                  <History size={18} /> History
                </h3>
                <button onClick={() => setActivePanel(null)} className="p-1 hover:bg-gray-200 rounded" aria-label="Close History">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-pw-bg/50">
                {appState.history.length === 0 ? (
                  <div className="text-center text-pw-muted py-8">
                    <History size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No history yet</p>
                  </div>
                ) : (
                  appState.history.map((item) => (
                    <div key={item.id} className="bg-white p-3 rounded-lg border border-pw-border shadow-sm hover:border-pw-blue transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-pw-blue bg-blue-50 px-2 py-0.5 rounded">{item.contentType}</span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] text-pw-muted">{new Date(item.date).toLocaleDateString()}</span>
                           <button 
                             onClick={(e) => handleDeleteHistory(e, item.id)}
                             className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                             aria-label="Delete history item"
                           >
                             <Trash2 size={14} />
                           </button>
                        </div>
                      </div>
                      <p className="text-xs text-pw-muted mb-3 line-clamp-2 font-mono bg-gray-50 p-1.5 rounded">"{item.snippet}"</p>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-1">
                          {item.data.summary.critical > 0 && <span className="w-2 h-2 rounded-full bg-red-500" title="Critical Issues" />}
                          {item.data.summary.warning > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" title="Warnings" />}
                        </div>
                        <button 
                          onClick={() => handleRestoreHistory(item)}
                          className="text-xs flex items-center gap-1 text-pw-blue font-medium hover:underline"
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {appState.history.length > 0 && (
                <div className="p-4 border-t border-pw-border bg-gray-50">
                  <button 
                    onClick={handleClearHistory}
                    className="w-full py-2 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded flex items-center justify-center gap-2 transition-colors"
                  >
                    <Trash2 size={14} /> Clear History
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help Panel */}
        {activePanel === 'help' && (
          <div className="absolute inset-0 z-30 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setActivePanel(null)} />
            <div className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 border-l border-pw-border relative">
              <div className="p-4 border-b border-pw-border flex justify-between items-center bg-blue-50">
                <h3 className="font-semibold text-pw-text flex items-center gap-2">
                  <HelpCircle size={18} /> Compliance Guidelines
                </h3>
                <button onClick={() => setActivePanel(null)} className="p-1 hover:bg-gray-200 rounded" aria-label="Close Help">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="text-xs text-pw-muted bg-yellow-50 p-3 rounded border border-yellow-100 mb-4">
                  Always consult with the PW Legal Team for specific cases not covered here.
                </div>
                {GUIDELINE_DETAILS.map((rule, idx) => (
                  <div key={idx} className="border-b border-pw-border last:border-0 pb-4 last:pb-0">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm font-semibold text-pw-text">{rule.title}</h4>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY_COLORS[rule.severity].badge}`}>
                        {rule.severity === Severity.CRITICAL ? 'CRITICAL' : 'WARN'}
                      </span>
                    </div>
                    <p className="text-xs text-pw-text mb-2 leading-relaxed">{rule.description}</p>
                    <div className="bg-gray-50 p-2 rounded text-xs border border-gray-100">
                      <span className="font-semibold text-pw-muted">Examples: </span>
                      <span className="text-gray-600 italic">{rule.examples}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {activePanel === 'settings' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActivePanel(null)} />
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl animate-in fade-in zoom-in duration-200 relative overflow-hidden">
              <div className="p-6">
                 <div className="flex justify-between items-center mb-6">
                   <h2 className="text-xl font-bold text-pw-text flex items-center gap-2">
                     <SettingsIcon size={24} className="text-pw-blue" /> Settings
                   </h2>
                   <button onClick={() => setActivePanel(null)} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Close Settings">
                     <X size={20} />
                   </button>
                 </div>
                 
                 <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
                        <User size={16} /> Profile Settings
                      </h3>
                      <div className="space-y-3">
                         <div>
                           <label className="block text-xs text-pw-muted mb-1">Display Name</label>
                           <input 
                              type="text" 
                              value={appState.profile?.name || ''}
                              onChange={(e) => onUpdateAppState({ ...appState, profile: { ...appState.profile!, name: e.target.value } })}
                              className="w-full p-2 border border-pw-border rounded text-sm focus:ring-1 focus:ring-pw-blue outline-none"
                              placeholder="Your Name"
                           />
                         </div>
                         <div>
                           <label className="block text-xs text-pw-muted mb-1">Default Content Type</label>
                           <select 
                              value={appState.profile?.defaultContentType}
                              onChange={(e) => onUpdateAppState({ ...appState, profile: { ...appState.profile!, defaultContentType: e.target.value as ContentType } })}
                              className="w-full p-2 border border-pw-border rounded text-sm bg-white focus:ring-1 focus:ring-pw-blue outline-none"
                           >
                             {CONTENT_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                           </select>
                         </div>
                      </div>
                    </div>

                    <div className="border-t border-pw-border pt-6">
                      <h3 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
                         <Shield size={16} /> Application
                      </h3>
                      <div className="space-y-3">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 border border-pw-border rounded hover:bg-gray-50 transition-colors text-sm">
                           <span>Manage Gemini API Key</span>
                           <ExternalLink size={14} className="text-pw-muted" />
                        </a>
                        <button 
                          onClick={onLogout}
                          className="w-full flex items-center justify-center gap-2 p-3 text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors text-sm font-medium"
                        >
                          <LogOut size={16} /> Disconnect API Key
                        </button>
                      </div>
                    </div>
                 </div>
              </div>
              <div className="bg-gray-50 p-4 text-center text-xs text-pw-muted border-t border-pw-border">
                Version 1.0.0 • Employee Code: PW26173
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;