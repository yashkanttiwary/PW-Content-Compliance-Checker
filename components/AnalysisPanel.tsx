import React, { useMemo, useEffect, useRef } from 'react';
import { Issue } from '../types';
import { SEVERITY_COLORS } from '../constants';
import { AlertCircle } from 'lucide-react';

interface AnalysisPanelProps {
  content: string;
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
  activeIssueId?: string;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ content, issues, onIssueClick, activeIssueId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active issue
  useEffect(() => {
    if (activeIssueId && containerRef.current) {
      const element = containerRef.current.querySelector(`[data-issue-id="${activeIssueId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIssueId]);

  // Memoize the text segments construction
  const segments = useMemo(() => {
    if (!issues.length) return [{ text: content, issue: null }];

    // Filter valid issues and sort by position
    const sortedIssues = [...issues]
      .filter(i => i.status !== 'fixed' && typeof i.startIndex === 'number')
      .sort((a, b) => (a.startIndex || 0) - (b.startIndex || 0));

    const result: { text: string; issue: Issue | null }[] = [];
    let lastIndex = 0;

    sortedIssues.forEach(issue => {
      const start = issue.startIndex!;
      const end = issue.endIndex!;
      
      // If overlap or out of order (shouldn't happen with sort), skip safe
      if (start < lastIndex) return;

      // Text before issue
      if (start > lastIndex) {
        result.push({ text: content.slice(lastIndex, start), issue: null });
      }
      // Issue text
      result.push({ text: content.slice(start, end), issue });
      lastIndex = end;
    });

    // Remaining text
    if (lastIndex < content.length) {
      result.push({ text: content.slice(lastIndex), issue: null });
    }

    return result;
  }, [content, issues]);

  if (!content) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-pw-muted bg-pw-bg/50 rounded-lg border-2 border-dashed border-pw-border p-8">
        <AlertCircle size={48} className="mb-4 opacity-20" />
        <p>Analysis results will appear here</p>
      </div>
    );
  }

  // Generate line numbers
  const lines = content.split('\n').length;
  // Fallback: If AI returns everything in one huge line (>500 chars), we force wrap 
  // to avoid horizontal scroll nightmare, even though line numbers will be "1"
  const isSingleLineHuge = lines === 1 && content.length > 500;

  return (
    <div 
      className="flex h-full bg-white rounded-lg border border-pw-border shadow-sm overflow-auto font-mono text-sm leading-6 relative"
      ref={containerRef}
    >
      {/* Gutter: Sticky to left, scrolls vertically with content */}
      <div className="sticky left-0 z-20 w-10 bg-gray-50 border-r border-pw-border flex-shrink-0 text-right py-4 pr-2 text-pw-muted select-none text-xs min-h-full">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-6 leading-6">{i + 1}</div>
        ))}
      </div>

      {/* Content */}
      <div className={`flex-1 p-4 ${isSingleLineHuge ? 'whitespace-pre-wrap break-words' : 'whitespace-pre min-w-max'}`}>
        {segments.map((segment, idx) => {
          if (!segment.issue) return <span key={idx}>{segment.text}</span>;

          const colors = SEVERITY_COLORS[segment.issue.severity];
          const isActive = segment.issue.id === activeIssueId;
          const statusOpacity = segment.issue.status === 'ignored' ? 'opacity-50 grayscale' : '';

          return (
            <span
              key={idx}
              data-issue-id={segment.issue.id}
              onClick={() => segment.issue && onIssueClick(segment.issue)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && segment.issue) {
                  e.preventDefault();
                  onIssueClick(segment.issue);
                }
              }}
              className={`
                cursor-pointer transition-all duration-200 rounded px-0.5 outline-none
                ${colors.highlight}
                ${isActive ? 'ring-2 ring-offset-1 ring-pw-blue z-10 relative' : 'focus:ring-2 focus:ring-offset-1 focus:ring-pw-blue'}
                ${statusOpacity}
              `}
              title={segment.issue.category}
            >
              {segment.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default AnalysisPanel;