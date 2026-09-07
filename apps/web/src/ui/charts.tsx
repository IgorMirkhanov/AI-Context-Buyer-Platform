"use client";

import { useId, useMemo, useState } from "react";

export type SeriesPoint = { date: string; value: number };

type ChartTone = "accent" | "secondary" | "alert" | "danger";

const TONE_STROKE: Record<ChartTone, string> = {
  accent: "var(--accent)",
  secondary: "var(--secondary)",
  alert: "var(--status-alert-fg)",
  danger: "var(--status-danger-fg)",
};

function niceMax(values: number[]): number {
  const max = Math.max(...values, 0);
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / pow) * pow;
}

export function Sparkline({
  values,
  tone = "accent",
  className = "h-8 w-24",
}: {
  values: number[];
  tone?: ChartTone;
  className?: string;
}) {
  if (values.length < 2) {
    return <div className={`${className} rounded bg-[var(--bg-mid)]`} aria-hidden />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 96;
  const h = 32;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline
        fill="none"
        stroke={TONE_STROKE[tone]}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
        opacity={0.95}
      />
    </svg>
  );
}

export function AreaChart({
  points,
  label,
  format = (v) => String(Math.round(v * 100) / 100),
  tone = "accent",
  height = 200,
  emptyHint,
}: {
  points: SeriesPoint[];
  label: string;
  format?: (value: number) => string;
  tone?: ChartTone;
  height?: number;
  emptyHint?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const max = niceMax(values);
    const min = Math.min(0, ...values);
    const span = max - min || 1;
    const padL = 8;
    const padR = 8;
    const padT = 16;
    const padB = 28;
    const w = 720;
    const h = height;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const coords = values.map((value, index) => {
      const x =
        points.length === 1
          ? padL + innerW / 2
          : padL + (index / (points.length - 1)) * innerW;
      const y = padT + innerH - ((value - min) / span) * innerH;
      return { x, y, value, date: points[index].date };
    });
    const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const area = `${padL},${padT + innerH} ${line} ${padL + innerW},${padT + innerH}`;
    const gridY = [0.25, 0.5, 0.75, 1].map((t) => ({
      y: padT + innerH * (1 - t),
      label: format(min + span * t),
    }));
    return { w, h, padL, padT, padB, innerW, innerH, coords, line, area, gridY, max };
  }, [points, height, format]);

  if (!layout) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-10 text-center text-xs text-[var(--fg-muted)]">
        {emptyHint ?? `${label}: данных пока нет`}
      </div>
    );
  }

  const active = hover != null ? layout.coords[hover] : layout.coords[layout.coords.length - 1];
  const stroke = TONE_STROKE[tone];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] text-[var(--outline)]">{label}</p>
          <p className="font-mono text-lg font-semibold tracking-tight text-[var(--fg)]">
            {format(active.value)}
          </p>
        </div>
        <p className="font-mono text-[11px] text-[var(--fg-faint)]">{active.date}</p>
      </div>
      <svg
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        className="h-[200px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {layout.gridY.map((g) => (
          <g key={g.y}>
            <line
              x1={layout.padL}
              x2={layout.padL + layout.innerW}
              y1={g.y}
              y2={g.y}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <text
              x={layout.padL + layout.innerW}
              y={g.y - 4}
              textAnchor="end"
              fill="var(--fg-faint)"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              {g.label}
            </text>
          </g>
        ))}
        <polygon points={layout.area} fill={`url(#fill-${gid})`} />
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={layout.line}
        />
        {layout.coords.map((c, i) => (
          <circle
            key={c.date}
            cx={c.x}
            cy={c.y}
            r={hover === i ? 4.5 : 0}
            fill={stroke}
            className="transition-all"
          />
        ))}
        {layout.coords.map((c, i) => (
          <rect
            key={`hit-${c.date}`}
            x={c.x - layout.innerW / layout.coords.length / 2}
            y={layout.padT}
            width={Math.max(layout.innerW / layout.coords.length, 8)}
            height={layout.innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover != null ? (
          <line
            x1={layout.coords[hover].x}
            x2={layout.coords[hover].x}
            y1={layout.padT}
            y2={layout.padT + layout.innerH}
            stroke="var(--outline)"
            strokeDasharray="3 3"
            opacity={0.5}
          />
        ) : null}
        <text
          x={layout.padL}
          y={layout.h - 8}
          fill="var(--fg-faint)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {points[0]?.date}
        </text>
        <text
          x={layout.padL + layout.innerW}
          y={layout.h - 8}
          textAnchor="end"
          fill="var(--fg-faint)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {points[points.length - 1]?.date}
        </text>
      </svg>
    </div>
  );
}

export function BarChart({
  items,
  label,
  format = (v) => String(Math.round(v * 10000) / 10000),
  tone = "accent",
  emptyHint,
}: {
  items: Array<{ id: string; label: string; value: number }>;
  label: string;
  format?: (value: number) => string;
  tone?: ChartTone;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-8 text-center text-xs text-[var(--fg-muted)]">
        {emptyHint ?? `${label}: нет данных`}
      </div>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  const stroke = TONE_STROKE[tone];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 p-3">
      <p className="mb-3 text-[11px] text-[var(--outline)]">{label}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const pct = Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0);
          return (
            <li key={item.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-[var(--fg)]">{item.label}</span>
                <span className="shrink-0 font-mono text-[var(--fg-muted)]">
                  {format(item.value)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-high)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${stroke}, color-mix(in srgb, ${stroke} 55%, transparent))`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ id: string; label: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 p-3">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--bg-high)"
            strokeWidth="12"
          />
          {segments.map((seg) => {
            const len = (seg.value / total) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={seg.id}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-sm font-semibold">{centerValue}</span>
          <span className="text-[10px] text-[var(--fg-faint)]">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {segments.map((seg) => (
          <li key={seg.id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: seg.color }}
              />
              {seg.label}
            </span>
            <span className="font-mono text-[var(--fg-muted)]">
              {Math.round((seg.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
