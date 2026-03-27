"use client";

import { Fragment } from "react";

function renderPart(segment: string, key: string): React.ReactNode {
  if (segment.startsWith("*") && segment.endsWith("*") && segment.length > 2) {
    return <strong key={key}>{segment.slice(1, -1)}</strong>;
  }
  if (segment.startsWith("_") && segment.endsWith("_") && segment.length > 2) {
    return <em key={key}>{segment.slice(1, -1)}</em>;
  }
  return (
    <span key={key} className="inline">
      {segment}
    </span>
  );
}

function renderLine(line: string, lineKey: string): React.ReactNode {
  const parts = line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((p, i) => renderPart(p, `${lineKey}-${i}`));
}

export function WhatsAppMdPreview({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {renderLine(line, `ln-${i}`)}
        </Fragment>
      ))}
    </>
  );
}
