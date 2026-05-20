"use client";

interface AIProcessingIndicatorProps {
  label: string;
  detail?: string;
  size?: 'inline' | 'panel' | 'hero';
  showSkeleton?: boolean;
}

export function AIProcessingIndicator({
  label,
  detail,
  size = 'inline',
  showSkeleton = false,
}: AIProcessingIndicatorProps) {
  return (
    <div className={`ai-processing ai-processing-${size} ${showSkeleton ? 'has-skeleton' : ''}`} role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.72rem', width: '100%' }}>
        <span className="ai-processing-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="ai-processing-copy">
          <strong>{label}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
      </div>
      {showSkeleton && (
        <div className="ai-skeleton-container" aria-hidden="true">
          <div className="ai-skeleton-line"></div>
          <div className="ai-skeleton-line medium"></div>
          <div className="ai-skeleton-line short"></div>
        </div>
      )}
    </div>
  );
}
