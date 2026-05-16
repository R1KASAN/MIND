"use client";

interface AIProcessingIndicatorProps {
  label: string;
  detail?: string;
  size?: 'inline' | 'panel' | 'hero';
}

export function AIProcessingIndicator({
  label,
  detail,
  size = 'inline',
}: AIProcessingIndicatorProps) {
  return (
    <div className={`ai-processing ai-processing-${size}`} role="status" aria-live="polite">
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
  );
}
