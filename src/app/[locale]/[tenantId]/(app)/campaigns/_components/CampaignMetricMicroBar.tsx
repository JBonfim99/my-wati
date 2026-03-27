"use client";

type Props = {
  value: number;
  total: number;
  colorClass: string;
  /** Largura máxima da barra (ex.: para células estreitas). */
  maxWidthClass?: string;
};

export function CampaignMetricMicroBar({
  value,
  total,
  colorClass,
  maxWidthClass = "max-w-[120px]",
}: Props) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div
      className={`mt-1 h-1.5 w-full min-w-[56px] overflow-hidden rounded-full bg-neutral-200/90 ${maxWidthClass}`}
      role="presentation"
    >
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
