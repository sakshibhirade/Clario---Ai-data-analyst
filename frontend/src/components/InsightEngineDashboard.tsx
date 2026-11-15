import { useState, useEffect } from "react";
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  RefreshCw,
  Loader2,
  Check,
  Bookmark,
  Eye,
  EyeOff,
  Filter,
  Database,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Calendar,
} from "lucide-react";
import {
  analyzeInsights,
  getInsights,
  updateInsightStatus,
  type InsightReport,
  type InsightItem,
  type DataSource,
} from "../api";
import InsightDetailModal from "./InsightDetailModal";

interface Props {
  activeDataSource: DataSource | null;
  onAskAi: (insight: InsightItem) => void;
}

type FilterCategory = "all" | "anomaly" | "trend" | "recommendation" | "saved";

export default function InsightEngineDashboard({ activeDataSource, onAskAi }: Props) {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [items, setItems] = useState<InsightItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const targetDsId = activeDataSource ? activeDataSource.id : null;
  const targetLabel = activeDataSource ? activeDataSource.connection_name : "Default PostgreSQL";

  // Load existing insights on mount or active datasource change
  async function loadExistingInsights() {
    setLoading(true);
    setError("");
    try {
      const res = await getInsights(targetDsId);
      if (res.has_report && res.report) {
        setReport(res.report);
        setItems(res.items);
      } else {
        setReport(null);
        setItems([]);
      }
    } catch (err) {
      console.error("Failed to load insights", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExistingInsights();
  }, [targetDsId]);

  // Run new automated analysis
  async function handleAnalyze() {
    setAnalyzing(true);
    setError("");
    try {
      const res = await analyzeInsights(targetDsId);
      setReport(res.report);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // Handle status toggle
  async function handleStatusChange(id: string, newStatus: "new" | "reviewed" | "saved" | "dismissed") {
    try {
      await updateInsightStatus(id, newStatus);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
    } catch (err) {
      console.error("Failed to update item status", err);
    }
  }

  // Filter items
  const filteredItems = items.filter((item) => {
    if (selectedFilter === "all") return item.status !== "dismissed";
    if (selectedFilter === "saved") return item.status === "saved";
    if (selectedFilter === "anomaly") return item.category === "anomaly" && item.status !== "dismissed";
    if (selectedFilter === "trend") return item.category === "trend" && item.status !== "dismissed";
    if (selectedFilter === "recommendation") return item.ai_recommendation && item.status !== "dismissed";
    return true;
  });

  const anomaliesCount = items.filter((i) => i.category === "anomaly").length;
  const positiveTrendsCount = items.filter((i) => i.severity === "positive").length;
  const negativeTrendsCount = items.filter((i) => i.category === "trend" && (i.severity === "warning" || i.severity === "critical")).length;
  const recommendationsCount = items.filter((i) => Boolean(i.ai_recommendation)).length;

  return (
    <div style={{ animation: "riseIn 0.5s ease both" }}>
      {/* Top Header */}
      <div className="ds-header" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 className="ds-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={22} color="var(--orange-deep)" />
              Clario Insight Engine
            </h2>
            <span className="secure-pill" style={{ padding: "3px 8px", fontSize: 9.5 }}>
              <ShieldCheck size={12} /> AUTOMATED AI PROFILER
            </span>
          </div>
          <div className="ds-subtitle">
            Autonomous data profiling, statistical anomaly detection, trend trajectory, and Gemini-grounded actions.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {report && (
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={13} />
              <span>
                Last analyzed: {new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}

          <button
            className="run-btn"
            disabled={analyzing}
            onClick={handleAnalyze}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 22px",
            }}
          >
            {analyzing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={15} />}
            {analyzing ? "Analyzing Dataset…" : "Analyse Now"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Target Data Source Pill */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 18,
          padding: "6px 12px",
          borderRadius: 10,
          background: "rgba(120,105,88,0.08)",
          width: "fit-content",
          fontSize: 12,
        }}
      >
        <Database size={14} color="var(--orange-deep)" />
        <span>
          Analyzing Database: <b>{targetLabel}</b>
        </span>
      </div>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="icard" style={{ padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: "700 11px Archivo, sans-serif", color: "var(--ink-soft)", textTransform: "uppercase" }}>
              Total Insights
            </span>
            <BarChart3 size={16} color="var(--orange)" />
          </div>
          <div style={{ font: "900 24px 'Archivo', sans-serif", color: "var(--ink)", marginTop: 6 }}>
            {items.length}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Computed across tables</div>
        </div>

        <div className="icard" style={{ padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: "700 11px Archivo, sans-serif", color: "#8e3d31", textTransform: "uppercase" }}>
              Anomalies
            </span>
            <AlertTriangle size={16} color="#8e3d31" />
          </div>
          <div style={{ font: "900 24px 'Archivo', sans-serif", color: "#8e3d31", marginTop: 6 }}>
            {anomaliesCount}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Z-score & IQR outliers</div>
        </div>

        <div className="icard" style={{ padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: "700 11px Archivo, sans-serif", color: "#2e7d32", textTransform: "uppercase" }}>
              Positive Trends
            </span>
            <TrendingUp size={16} color="#2e7d32" />
          </div>
          <div style={{ font: "900 24px 'Archivo', sans-serif", color: "#2e7d32", marginTop: 6 }}>
            {positiveTrendsCount}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Growth trajectories</div>
        </div>

        <div className="icard" style={{ padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: "700 11px Archivo, sans-serif", color: "#b07b11", textTransform: "uppercase" }}>
              Negative Trends
            </span>
            <TrendingDown size={16} color="#b07b11" />
          </div>
          <div style={{ font: "900 24px 'Archivo', sans-serif", color: "#b07b11", marginTop: 6 }}>
            {negativeTrendsCount}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Declines & concentrations</div>
        </div>

        <div className="icard" style={{ padding: "14px 16px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ font: "700 11px Archivo, sans-serif", color: "var(--orange-deep)", textTransform: "uppercase" }}>
              Recommendations
            </span>
            <Lightbulb size={16} color="var(--orange-deep)" />
          </div>
          <div style={{ font: "900 24px 'Archivo', sans-serif", color: "var(--orange-deep)", marginTop: 6 }}>
            {recommendationsCount}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Grounded actions</div>
        </div>
      </div>

      {/* Executive Summary Card */}
      {report?.executive_summary && (
        <div className="insight-card" style={{ marginTop: 0, marginBottom: 20 }}>
          <div className="insight-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="result-kicker">EXECUTIVE SUMMARY · GEMINI AI SYNTHESIS</div>
            <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.55 }}>{report.executive_summary}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div className="nav-tabs" style={{ margin: 0 }}>
          <button
            className={`nav-tab ${selectedFilter === "all" ? "active" : ""}`}
            onClick={() => setSelectedFilter("all")}
          >
            All Insights ({items.filter((i) => i.status !== "dismissed").length})
          </button>
          <button
            className={`nav-tab ${selectedFilter === "anomaly" ? "active" : ""}`}
            onClick={() => setSelectedFilter("anomaly")}
          >
            Anomalies ({anomaliesCount})
          </button>
          <button
            className={`nav-tab ${selectedFilter === "trend" ? "active" : ""}`}
            onClick={() => setSelectedFilter("trend")}
          >
            Trends ({items.filter((i) => i.category === "trend").length})
          </button>
          <button
            className={`nav-tab ${selectedFilter === "recommendation" ? "active" : ""}`}
            onClick={() => setSelectedFilter("recommendation")}
          >
            Recommendations ({recommendationsCount})
          </button>
          <button
            className={`nav-tab ${selectedFilter === "saved" ? "active" : ""}`}
            onClick={() => setSelectedFilter("saved")}
          >
            Saved ({items.filter((i) => i.status === "saved").length})
          </button>
        </div>
      </div>

      {/* Loading or Empty State */}
      {loading ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--ink-soft)" }}>
          <Loader2 size={26} className="spin" style={{ margin: "0 auto 10px" }} />
          <div>Loading discovered insights…</div>
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            background: "rgba(48, 41, 35, 0.6)",
            border: "1.5px dashed rgba(181, 167, 149, 0.25)",
            borderRadius: 16,
          }}
        >
          <Sparkles size={34} color="var(--orange-deep)" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ font: "800 18px 'Archivo', sans-serif", margin: "0 0 6px", color: "var(--ink)" }}>
            No Insights Generated Yet for {targetLabel}
          </h3>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", maxWidth: 440, margin: "0 auto 18px" }}>
            Click <b>Analyse Now</b> to profile all tables, calculate numerical baselines, detect IQR/Z-score outliers,
            and formulate AI recommendations.
          </p>
          <button
            className="run-btn"
            disabled={analyzing}
            onClick={handleAnalyze}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 22px" }}
          >
            {analyzing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {analyzing ? "Analyzing…" : "Run Automated Analysis"}
          </button>
        </div>
      ) : (
        /* Insight Cards Grid */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {filteredItems.map((item) => {
            const isPos = item.severity === "positive";
            const isCrit = item.severity === "critical";
            const isWarn = item.severity === "warning";

            return (
              <div
                key={item.id}
                className="ds-card"
                style={{
                  borderLeft: `4px solid ${
                    isCrit ? "#8e3d31" : isWarn ? "#b07b11" : isPos ? "#2e7d32" : "var(--orange)"
                  }`,
                }}
              >
                <div>
                  <div className="ds-card-top">
                    <div
                      className={`ds-icon-box ${
                        isCrit ? "pg" : isWarn ? "csv" : isPos ? "xlsx" : "pg"
                      }`}
                      style={{
                        background: isCrit
                          ? "rgba(185,62,48,0.12)"
                          : isWarn
                          ? "rgba(224,162,26,0.12)"
                          : isPos
                          ? "rgba(63,174,106,0.12)"
                          : "rgba(120,105,88,0.1)",
                        color: isCrit ? "#8e3d31" : isWarn ? "#b07b11" : isPos ? "#2e7d32" : "var(--ink)",
                      }}
                    >
                      {item.category === "anomaly" ? (
                        <AlertTriangle size={18} />
                      ) : isPos ? (
                        <TrendingUp size={18} />
                      ) : isWarn || isCrit ? (
                        <TrendingDown size={18} />
                      ) : (
                        <Lightbulb size={18} />
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span
                        style={{
                          font: "700 9px 'Sora', sans-serif",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: isCrit
                            ? "rgba(185,62,48,0.15)"
                            : isWarn
                            ? "rgba(224,162,26,0.15)"
                            : isPos
                            ? "rgba(63,174,106,0.15)"
                            : "rgba(120,105,88,0.1)",
                          color: isCrit ? "#8e3d31" : isWarn ? "#b07b11" : isPos ? "#2e7d32" : "var(--ink-soft)",
                        }}
                      >
                        {item.severity}
                      </span>
                      {item.status === "saved" && (
                        <span style={{ fontSize: 10, color: "var(--orange-deep)" }}>
                          <Bookmark size={12} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ds-card-title" style={{ fontSize: 14 }}>
                    {item.title}
                  </div>

                  {/* Value / Baseline strip */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                      margin: "8px 0",
                      padding: "5px 8px",
                      borderRadius: 8,
                      background: "rgba(120,105,88,0.06)",
                    }}
                  >
                    <span>
                      Observed: <b>{item.detected_value}</b>
                    </span>
                    <span style={{ color: "var(--ink-soft)" }}>·</span>
                    <span>
                      Baseline: <span style={{ color: "var(--ink-soft)" }}>{item.baseline_value}</span>
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-soft)",
                      lineHeight: 1.45,
                      margin: "0 0 12px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {item.ai_explanation || item.description}
                  </p>
                </div>

                <div className="ds-card-actions">
                  <button
                    className="mini-btn"
                    onClick={() => onAskAi(item)}
                    style={{
                      color: "var(--orange-deep)",
                      fontWeight: 700,
                      marginRight: "auto",
                      border: "1px solid rgba(232,133,58,0.4)",
                    }}
                    title="Open in AI Analyst chat"
                  >
                    <Sparkles size={12} />
                    Ask AI
                  </button>

                  <button
                    className="mini-btn"
                    onClick={() => setSelectedInsightId(item.id)}
                    title="View Evidence & Data"
                  >
                    <Eye size={12} />
                    Evidence
                  </button>

                  <button
                    className="mini-btn"
                    onClick={() => handleStatusChange(item.id, item.status === "saved" ? "new" : "saved")}
                    title={item.status === "saved" ? "Remove from saved" : "Save insight"}
                    style={{ color: item.status === "saved" ? "var(--orange-deep)" : undefined }}
                  >
                    <Bookmark size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedInsightId && (
        <InsightDetailModal
          insightId={selectedInsightId}
          onClose={() => setSelectedInsightId(null)}
          onAskAi={onAskAi}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
