import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, FileText, Upload, Copy, Download, 
  ChevronDown, ChevronRight, X, Check, AlertTriangle, Info,
  History, Settings as SettingsIcon, HelpCircle, Loader
} from 'lucide-react';
import { AppState, ContentType, Issue, Severity } from '../types';
import { GeminiService } from '../services/geminiService';
import AnalysisPanel from './AnalysisPanel';
import { CONTENT_TYPE_OPTIONS, SEVERITY_COLORS } from '../constants';

interface DashboardProps {
  appState: AppState;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ appState, onLogout }) => {
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<ContentType>(appState.profile?.defaultContentType || ContentType.VIDEO_SCRIPT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null); // Using any for simplicity in mapping AnalysisResult
  const [activeIssueId, setActiveIssueId] = useState<string | undefined>(undefined);
  const [geminiService] = useState(() => new GeminiService(appState.apiKey || ''));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    if (!content.trim()) return;
    setIsAnalyzing(true);
    setResult(null);
    try {
      const data = await geminiService.analyzeContent(content, contentType);
      setResult(data);
      // Auto-save to history (mock implementation)
      // saveToHistory(data);
    } catch (error) {
      alert("Analysis failed. Please check your connection or API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleApplyFix = (issue: Issue) => {
    // Simple text replacement
    const newContent = content.replace(issue.originalText, issue.suggestion);
    setContent(newContent);
    
    // Mark issue as fixed
    if (result) {
      setResult({
        ...result,
        issues: result.issues.map((i: Issue) => 
          i.id === issue.id ? { ...i, status: 'fixed' } : i
        ),
        summary: {
           ...result.summary,
           // Recalculate summary counts roughly
           [issue.severity.toLowerCase()]: result.summary[issue.severity.toLowerCase() as keyof typeof result.summary] - 1
        }
      });
    }
    setActiveIssueId(undefined);
  };

  const handleIgnore = (issueId: string) => {
    if (result) {
      setResult({
        ...result,
        issues: result.issues.map((i: Issue) => 
          i.id === issueId ? { ...i, status: 'ignored' } : i
        )
      });
    }
  };

  const handleExport = () => {
    if (!result) return;
    const report = `# Compliance Check Report
Date: ${new Date().toLocaleString()}
Content Type: ${contentType}
Total Issues: ${result.summary.total}

## Issues Found
${result.issues.map((i: Issue) => `
### Line ${i.line}: ${i.category} [${i.severity}]
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
    if (result?.cleanContent) {
      navigator.clipboard.writeText(result.cleanContent);
      alert("Clean content copied to clipboard!");
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-pw-border flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pw-blue text-white rounded flex items-center justify-center font-bold">PW</div>
          <h1 className="font-semibold text-pw-text hidden md:block">Compliance Checker</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="p-2 text-pw-muted hover:bg-gray-100 rounded-md flex items-center gap-2 text-sm">
            <History size={18} />
            <span className="hidden md:inline">History</span>
          </button>
          <button onClick={onLogout} className="p-2 text-pw-muted hover:bg-gray-100 rounded-md">
            <SettingsIcon size={18} />
          </button>
          <button className="p-2 text-pw-muted hover:bg-gray-100 rounded-md">
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Column 1: Input */}
        <div className="flex-1 flex flex-col border-r border-pw-border min-w-[320px] bg-white lg:max-w-md">
          <div className="p-4 border-b border-pw-border space-y-4 bg-pw-bg/30">
            <div>
              <label className="block text-xs font-semibold text-pw-muted uppercase mb-1">Content Type</label>
              <div className="relative">
                <select 
                  className="w-full pl-3 pr-10 py-2 bg-white border border-pw-border rounded-md appearance-none text-sm focus:ring-1 focus:ring-pw-blue focus:border-pw-blue outline-none"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType)}
                >
                  {CONTENT_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-pw-muted pointer-events-none" />
              </div>
            </div>
          </div>
          
          <div className="flex-1 relative">
            <textarea
              className="w-full h-full p-4 resize-none outline-none font-mono text-sm leading-relaxed"
              placeholder="Paste your content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="absolute bottom-4 right-4 flex gap-2">
               <button 
                 onClick={() => setContent('')}
                 className="p-2 bg-white border border-pw-border shadow-sm rounded-md text-pw-muted hover:text-pw-error hover:border-pw-error transition-colors"
                 title="Clear"
               >
                 <X size={16} />
               </button>
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 className="hidden" 
                 accept=".txt,.md" 
                 onChange={handleFileUpload} 
               />
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="p-2 bg-white border border-pw-border shadow-sm rounded-md text-pw-muted hover:text-pw-blue hover:border-pw-blue transition-colors"
                 title="Upload File"
               >
                 <Upload size={16} />
               </button>
            </div>
          </div>

          <div className="p-4 border-t border-pw-border bg-pw-bg/30">
            <button 
              onClick={handleAnalyze}
              disabled={!content.trim() || isAnalyzing}
              className="w-full py-2.5 bg-pw-blue text-white rounded-md font-medium hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader className="animate-spin" size={18} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play size={18} fill="currentColor" />
                  Analyze Content
                </>
              )}
            </button>
            <div className="mt-2 text-center text-xs text-pw-muted">
              {content.length} characters • {content.split(/\s+/).filter(w => w).length} words
            </div>
          </div>
        </div>

        {/* Column 2: Analysis */}
        <div className="flex-[1.5] flex flex-col min-w-[320px] bg-pw-bg overflow-hidden relative">
          <div className="p-3 border-b border-pw-border flex justify-between items-center bg-white shadow-sm z-10">
            <h2 className="text-sm font-semibold text-pw-text">Analyzed Content</h2>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Critical</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Warning</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Tip</div>
            </div>
          </div>
          
          <div className="flex-1 p-4 overflow-hidden relative">
             <AnalysisPanel 
               content={content} 
               issues={result?.issues || []} 
               onIssueClick={(issue) => setActiveIssueId(issue.id)}
               activeIssueId={activeIssueId}
             />
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

        {/* Column 3: Issues */}
        <div className="flex-1 flex flex-col border-l border-pw-border bg-white lg:max-w-sm min-w-[300px]">
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
                  className={`
                    bg-white rounded-lg border shadow-sm transition-all duration-200
                    ${isSelected ? 'border-pw-blue ring-1 ring-pw-blue shadow-md' : 'border-pw-border hover:border-gray-300'}
                  `}
                  onClick={() => setActiveIssueId(issue.id)}
                >
                  <div className={`px-3 py-2 border-b flex justify-between items-center ${issue.status === 'ignored' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                       <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                         {issue.severity}
                       </span>
                       <span className="text-xs text-pw-muted">Line {issue.line}</span>
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
                          >
                            <Check size={12} /> Apply Fix
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleIgnore(issue.id); }}
                            className="px-3 py-1.5 border border-pw-border text-pw-muted rounded text-xs font-medium hover:bg-gray-50 transition-colors"
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
      </main>
    </div>
  );
};

export default Dashboard;