import React, { useMemo } from 'react';
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
  // Memoize the text segments construction to avoid unnecessary recalculations
  const segments = useMemo(() => {
    if (!issues.length) return [{ text: content, issue: null }];

    const sortedIssues = [...issues]
      .filter(i => i.status !== 'fixed')
      .sort((a, b) => {
        // We need to find the index of the phrase in the text
        const indexA = content.indexOf(a.originalText);
        const indexB = content.indexOf(b.originalText);
        return indexA - indexB;
      });

    const result: { text: string; issue: Issue | null }[] = [];
    let lastIndex = 0;

    sortedIssues.forEach(issue => {
      // Find ALL occurrences or just the first valid one after lastIndex? 
      // Simplified: Find first occurrence after lastIndex
      const index = content.indexOf(issue.originalText, lastIndex);
      
      if (index !== -1) {
        // Text before issue
        if (index > lastIndex) {
          result.push({ text: content.substring(lastIndex, index), issue: null });
        }
        // Issue text
        result.push({ text: content.substring(index, index + issue.originalText.length), issue });
        lastIndex = index + issue.originalText.length;
      }
    });

    // Remaining text
    if (lastIndex < content.length) {
      result.push({ text: content.substring(lastIndex), issue: null });
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

  return (
    <div className="flex h-full bg-white rounded-lg border border-pw-border shadow-sm overflow-hidden font-mono text-sm leading-relaxed">
      {/* Gutter */}
      <div className="w-10 bg-gray-50 border-r border-pw-border flex-shrink-0 text-right py-4 pr-2 text-pw-muted select-none text-xs">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-6 leading-6">{i + 1}</div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 whitespace-pre-wrap">
        {segments.map((segment, idx) => {
          if (!segment.issue) return <span key={idx}>{segment.text}</span>;

          const colors = SEVERITY_COLORS[segment.issue.severity];
          const isActive = segment.issue.id === activeIssueId;
          const statusOpacity = segment.issue.status === 'ignored' ? 'opacity-50 grayscale' : '';

          return (
            <span
              key={idx}
              onClick={() => segment.issue && onIssueClick(segment.issue)}
              className={`
                cursor-pointer transition-all duration-200 rounded px-0.5
                ${colors.highlight}
                ${isActive ? 'ring-2 ring-offset-1 ring-pw-blue z-10 relative' : ''}
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