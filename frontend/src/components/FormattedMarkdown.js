import React from "react";

/**
 * Lightweight, clean Markdown renderer component for LLM text outputs.
 * Converts bold (**text**), bullet points (* item / - item), and headers cleanly into React elements.
 */
export default function FormattedMarkdown({ content, className = "" }) {
  if (!content) return null;

  // Split lines and parse line-by-line
  const lines = content.split("\n");
  const elements = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={idx} className="h-2" />);
      return;
    }

    // Bullet points: * or -
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      const text = trimmed.slice(2);
      elements.push(
        <div key={idx} className="flex items-start gap-2 my-1">
          <span className="text-signal font-bold mt-0.5">•</span>
          <div className="flex-1">{renderInlineFormatting(text)}</div>
        </div>
      );
      return;
    }

    // Headers: ### or ## or #
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={idx} className="font-display font-bold text-base mt-3 mb-1 text-ink">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={idx} className="font-display font-bold text-lg mt-4 mb-2 text-ink">
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>
      );
      return;
    }

    // Regular paragraph line
    elements.push(
      <p key={idx} className="my-1 leading-relaxed">
        {renderInlineFormatting(trimmed)}
      </p>
    );
  });

  return <div className={`formatted-markdown ${className}`}>{elements}</div>;
}

function renderInlineFormatting(text) {
  // Regex to split by **bold** text
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endswith("**")) {
      return (
        <strong key={i} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Handle case where endsWith fails or standard bold format
    if (part.startsWith("**") && part.length > 4) {
      const inner = part.slice(2, part.endsWith("**") ? -2 : part.length);
      return (
        <strong key={i} className="font-bold text-ink">
          {inner}
        </strong>
      );
    }
    return part;
  });
}
