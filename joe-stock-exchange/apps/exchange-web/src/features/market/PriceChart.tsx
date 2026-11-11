import type { PricePoint } from "@joese/contracts";
import { formatJoellars } from "@joese/ui";
import { useId, useMemo, useState } from "react";

interface Props {
  points: PricePoint[];
  positive: boolean;
  growthColor: string;
  fallColor: string;
}

export function PriceChart({ points, positive, growthColor, fallColor }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId().replaceAll(":", "");
  const width = 900;
  const height = 330;
  const padX = 20;
  const padY = 26;
  const color = positive ? growthColor : fallColor;
  const chart = useMemo(() => {
    const safePoints = points.length > 1 ? points : [
      ...(points.length ? points : [{ assetId: "empty", priceCents: 0, recordedAt: new Date().toISOString() }]),
      { ...(points[0] ?? { assetId: "empty", priceCents: 0 }), recordedAt: new Date().toISOString() },
    ];
    const values = safePoints.map((point) => point.priceCents);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = Math.max(1, maximum - minimum);
    const coords = safePoints.map((point, index) => ({
      x: padX + (index / (safePoints.length - 1)) * (width - padX * 2),
      y: padY + (1 - (point.priceCents - minimum) / span) * (height - padY * 2),
      point,
    }));
    const line = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(" ");
    const area = `${line} L${coords.at(-1)!.x},${height} L${coords[0].x},${height} Z`;
    return { coords, line, area, minimum, maximum };
  }, [points]);

  const active = hovered == null ? null : chart.coords[hovered];

  return (
    <div className="price-chart-wrap">
      {active && (
        <div className="chart-tooltip" style={{ left: `${(active.x / width) * 100}%`, top: `${(active.y / height) * 100}%` }}>
          <strong>{formatJoellars(active.point.priceCents)}</strong>
          <span>{new Date(active.point.recordedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" })}</span>
        </div>
      )}
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price fluctuation chart" onMouseLeave={() => setHovered(null)}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.23" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} className="chart-grid" />
        ))}
        <path d={chart.area} fill={`url(#${gradientId})`} />
        <path d={chart.line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {chart.coords.map((coord, index) => (
          <circle
            key={`${coord.point.recordedAt}-${index}`}
            cx={coord.x}
            cy={coord.y}
            r={hovered === index ? 6 : 12}
            fill={hovered === index ? color : "transparent"}
            stroke={hovered === index ? "#0b0d11" : "transparent"}
            strokeWidth="3"
            onMouseEnter={() => setHovered(index)}
          />
        ))}
      </svg>
      <div className="chart-range">
        <span>{formatJoellars(chart.minimum)}</span>
        <span>{formatJoellars(chart.maximum)}</span>
      </div>
    </div>
  );
}

