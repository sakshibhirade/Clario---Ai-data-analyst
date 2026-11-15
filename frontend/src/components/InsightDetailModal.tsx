import { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  CheckCircle2,
  Bookmark,
  EyeOff,
  Database,
  Table,
  Layers,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  getInsightDetail,
  updateInsightStatus,
  type InsightItem,
} from "../api";

interface Props {
  insightId: string;
  onClose: () => void;
  onAskAi: (insight: InsightItem) => void;
  onStatusChange?: (id: string, newStatus: "new" | "reviewed" | "saved" | "dismissed") => void;
}

export default function InsightDetailModal({
  insightId,
  onClose,
  onAskAi,
  onStatusChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<InsightItem | null>(null);
  const [sampleRecords, setSampleRecords] = useState<Record<string, unknown>[]>([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getInsightDetail(insightId)
      .then((res) => {
        if (!alive) return;
        setInsight(res.insight);
        setSampleRecords(res.sample_records || []);
      })
      .catch((err) => {
        console.error("Failed to load insight detail", err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [insightId]);

  async function handleStatus(newStatus: "new" | "reviewed" | "saved" | "dismissed") {
    if (!insight) return;
    setUpdating(true);
    try {
      await updateInsightStatus(insight.id, newStatus);
      setInsight((prev) => (prev ? { ...prev, status: newStatus } : null));
      onStatusChange?.(insight.id, newStatus);
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setUpdating(false);
    }
  }

  if (loading || !insight) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-window" style={{ maxWidth: 720, textAlign: "center", padding: 50 }}>
          <Loader2 size={26} className="spin" style={{ margin: "0 auto 10px" }} />
          <div>Loading insight evidence…</div>
        </div>
      </div>
    );
  }

  const chartData = insight.evidence_data?.chart_data || [];
  const maxChartVal = chartData.length
    ? Math.max(...chartData.map((d) => Math.abs(d.value)), 1)
    : 1;

  const isPositive = insight.severity === "positive";
  const isCritical = insight.severity === "critical";
  const isWarning = insight.severity === "warning";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-window"
        style={{ maxWidth: 780 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              className={`ds-icon-box ${
                isCritical
                  ? "pg"
                  : isWarning
                  ? "csv"
                  : isPositive
                  ? "xlsx"
                  : "pg"
              }`}
              style={{
                background: isCritical
                  ? "rgba(185,62,48,0.14)"
                  : isWarning
                  ? "rgba(224,162,26,0.14)"
                  : isPositive
                  ? "rgba(63,174,106,0.14)"
                  : "rgba(120,105,88,0.14)",
                color: isCritical
                  ? "#8e3d31"
                  : isWarning
                  ? "#b07b11"
                  : isPositive
                  ? "#2e7d32"
                  : "var(--ink)",
              }}
            >
              {insight.category === "anomaly" ? (
                <AlertTriangle size={20} />
              ) : isPositive ? (
                <TrendingUp size={20} />
              ) : isWarning || isCritical ? (
                <TrendingDown size={20} />
              ) : (
                <Info size={20} />
              )}
            </div>
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span
                  style={{
                    font: "700 9.5px 'Sora', sans-serif",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: isCritical
                      ? "rgba(185,62,48,0.15)"
                      : isWarning
                      ? "rgba(224,162,26,0.15)"
                      : isPositive
                      ? "rgba(63,174,106,0.15)"
                      : "rgba(120,105,88,0.12)",
                    color: isCritical
                      ? "#8e3d31"
                      : isWarning
                      ? "#b07b11"
                      : isPositive
                      ? "#2e7d32"
                      : "var(--ink-soft)",
                  }}
                >
                  {insight.severity} {insight.category}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>
                  Confidence: <b>{insight.confidence?.toUpperCase() || "HIGH"}</b>
                </span>
                {insight.status !== "new" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 6,
                      background: "rgba(232,133,58,0.12)",
                      color: "var(--orange-deep)",
                    }}
                  >
                    {insight.status.toUpperCase()}
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: 18, marginTop: 4 }}>{insight.title}</h2>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Statistical Metrics Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            padding: 12,
            borderRadius: 14,
            background: "rgba(48, 41, 35, 0.6)",
            border: "1px solid rgba(181, 167, 149, 0.16)",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>Detected Value</div>
            <div style={{ font: "800 15px 'JetBrains Mono', monospace", color: "var(--orange-deep)" }}>
              {insight.detected_value || "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>Baseline / Expected</div>
            <div style={{ font: "700 14px 'JetBrains Mono', monospace", color: "var(--ink)" }}>
              {insight.baseline_value || "—"}
            </div>
          </div>
          {insight.deviation_pct !== undefined && insight.deviation_pct !== null && (
            <div>
              <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>Deviation</div>
              <div
                style={{
                  font: "800 15px 'JetBrains Mono', monospace",
                  color: isCritical || isWarning ? "#8e3d31" : "#2e7d32",
                }}
              >
                {insight.deviation_pct > 0 ? `+${insight.deviation_pct}%` : `${insight.deviation_pct}%`}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>Methodology</div>
            <div style={{ font: "600 12px 'Sora', sans-serif", color: "var(--ink)", textTransform: "capitalize" }}>
              {insight.methodology?.replace(/_/g, " ") || "Statistical Baseline"}
            </div>
          </div>
        </div>

        {/* AI Explanation Card */}
        {insight.ai_explanation && (
          <div className="insight-card" style={{ marginTop: 0, marginBottom: 14 }}>
            <div className="insight-icon">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="result-kicker">AI INTERPRETATION</div>
              <p>{insight.ai_explanation}</p>
            </div>
          </div>
        )}

        {/* AI Recommendations Card */}
        {insight.ai_recommendation && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "rgba(232,133,58,0.08)",
              border: "1px dashed rgba(232,133,58,0.35)",
              marginBottom: 16,
            }}
          >
            <div style={{ font: "700 10px 'Sora', sans-serif", letterSpacing: "0.1em", color: "var(--orange-deep)" }}>
              ACTIONABLE RECOMMENDATION
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.5 }}>
              {insight.ai_recommendation}
            </p>
          </div>
        )}

        {/* Supporting Chart */}
        {chartData.length > 0 && (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: "rgba(48, 41, 35, 0.6)",
              border: "1px solid rgba(181, 167, 149, 0.16)",
              marginBottom: 16,
            }}
          >
            <div style={{ font: "700 11px Archivo, sans-serif", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 10 }}>
              Supporting Evidence Data Points ({chartData.length})
            </div>

            {insight.chart_type === "line" || insight.chart_type === "area" ? (
              <div>
                <svg viewBox="0 0 500 140" style={{ width: "100%", height: 140, overflow: "visible" }}>
                  <polyline
                    fill="none"
                    stroke="var(--orange-deep)"
                    strokeWidth="2.5"
                    points={chartData
                      .map((d, i) => {
                        const x = 20 + (i * 460) / Math.max(chartData.length - 1, 1);
                        const y = 120 - (Math.max(d.value, 0) / maxChartVal) * 100;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                  {chartData.map((d, i) => {
                    const x = 20 + (i * 460) / Math.max(chartData.length - 1, 1);
                    const y = 120 - (Math.max(d.value, 0) / maxChartVal) * 100;
                    return <circle key={i} cx={x} cy={y} r="4" fill="var(--orange-deep)" />;
                  })}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ink-soft)", marginTop: 6 }}>
                  {chartData.map((d) => (
                    <span key={d.label}>{d.label}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 7 }}>
                {chartData.map((d) => (
                  <div
                    key={d.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.label}>
                      {d.label}
                    </span>
                    <div style={{ height: 8, background: "rgba(120,105,88,0.12)", borderRadius: 999, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(5, (Math.abs(d.value) / maxChartVal) * 100)}%`,
                          background: "linear-gradient(90deg, var(--orange-soft), var(--orange-deep))",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <b style={{ font: "600 10.5px 'JetBrains Mono', monospace", color: "var(--orange-deep)" }}>
                      {d.value.toLocaleString()}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sample Underlying Records Preview */}
        {sampleRecords.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ font: "700 11px Archivo, sans-serif", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 6 }}>
              Sample Records from {insight.table_name}
            </div>
            <div className="table-preview-scroll" style={{ maxHeight: 180 }}>
              <table className="table-preview-table">
                <thead>
                  <tr>
                    {Object.keys(sampleRecords[0]).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRecords.map((r, ri) => (
                    <tr key={ri}>
                      {Object.keys(sampleRecords[0]).map((k) => (
                        <td key={k}>{String(r[k] ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 14,
            borderTop: "1px solid rgba(120,105,88,0.16)",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {/* Status actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="mini-btn"
              disabled={updating}
              onClick={() => handleStatus("reviewed")}
              title="Mark as Reviewed"
            >
              <CheckCircle2 size={13} color="#2e7d32" />
              Reviewed
            </button>
            <button
              className="mini-btn"
              disabled={updating}
              onClick={() => handleStatus("saved")}
              title="Save for Later"
            >
              <Bookmark size={13} color="var(--orange-deep)" />
              Save
            </button>
            <button
              className="mini-btn"
              disabled={updating}
              onClick={() => handleStatus("dismissed")}
              title="Dismiss"
            >
              <EyeOff size={13} color="#8e3d31" />
              Dismiss
            </button>
          </div>

          {/* Ask AI Action */}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mini-btn" onClick={onClose}>
              Close
            </button>
            <button
              className="run-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 18px" }}
              onClick={() => {
                onAskAi(insight);
                onClose();
              }}
            >
              <Sparkles size={15} />
              Ask AI About This
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
