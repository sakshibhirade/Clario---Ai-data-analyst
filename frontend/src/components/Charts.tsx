import { useMemo } from "react";

export type ChartType = "bar" | "line" | "donut" | "table";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  type: ChartType;
};

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,%₹,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function Charts({ columns, rows, type }: Props) {
  const data = useMemo(() => rows.slice(0, 8).map((row) => ({
    label: String(row[columns[0]] ?? "—"),
    value: numberValue(row[columns[1]]),
  })).filter((x) => x.value !== null) as { label: string; value: number }[], [columns, rows]);

  if (!columns[1] || data.length < 2 || type === "table") return null;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  if (type === "donut") {
    const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
    let cursor = 0;
    const segments = data.map((d) => {
      const start = cursor;
      cursor += Math.max(d.value, 0) / total;
      return `${start * 360} ${(cursor * 360)}`;
    });
    return (
      <div className="chart-card">
        <div className="chart-title">Distribution</div>
        <div className="donut-wrap">
          <div className="donut" style={{ background: `conic-gradient(${segments.map((s, i) => `hsl(${24 + i * 28} 75% 58%) ${s}deg`).join(",")})` }} />
          <div className="donut-center">{rows.length}<span>rows</span></div>
        </div>
        <div className="legend">{data.map((d, i) => <div key={d.label}><i style={{ background: `hsl(${24 + i * 28} 75% 58%)` }} />{d.label}</div>)}</div>
      </div>
    );
  }

  if (type === "line") {
    const width = 520, height = 170, pad = 22;
    const points = data.map((d, i) => {
      const x = pad + (i * (width - pad * 2)) / Math.max(data.length - 1, 1);
      const y = height - pad - (Math.max(d.value, 0) / max) * (height - pad * 2);
      return `${x},${y}`;
    }).join(" ");
    return <div className="chart-card"><div className="chart-title">Trend</div><svg className="line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{data.map((_, i) => { const [x,y] = points.split(" ")[i].split(","); return <circle key={i} cx={x} cy={y} r="4" fill="currentColor" />; })}</svg><div className="axis-labels">{data.map(d => <span key={d.label}>{d.label}</span>)}</div></div>;
  }

  return (
    <div className="chart-card">
      <div className="chart-title">Comparison</div>
      <div className="bars">{data.map((d) => <div className="bar-row" key={d.label}><span title={d.label}>{d.label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(5, (Math.abs(d.value) / max) * 100)}%` }} /></div><b>{d.value.toLocaleString()}</b></div>)}</div>
    </div>
  );
}
