import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Brain,
  ShieldCheck,
  Database,
  Lightbulb,
  GitBranch,
  Zap,
  Check,
  Download,
  Loader2,
  History,
  Copy,
  Sparkles,
  ChevronDown,
  AlertTriangle,
  Layers,
  Server,
  FileSpreadsheet,
  FileText,
  Plus,
  LineChart,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { createRobotScene, type RobotController } from "./robot";
import {
  analyzeQuestion,
  getDatabaseSchema,
  getDataSourceSchema,
  getDataSources,
  getStatus,
  type ApiStatus,
  type QueryResponse,
  type DataSource,
  type InsightItem,
} from "./api";
import Charts from "./components/Charts";
import DataSourcesView from "./components/DataSourcesView";
import DataSourcesWizardModal from "./components/DataSourcesWizardModal";
import InsightEngineDashboard from "./components/InsightEngineDashboard";

const DEFAULT_EXAMPLES = [
  "Show me top 5 customers by revenue last month",
  "Show total sales by region",
  "Show users who signed up this week",
  "Compare average order value by category",
];

const SQL_TOKEN =
  /('(?:[^']*)')|\b(SELECT|FROM|JOIN|ON|WHERE|AND|GROUP|BY|ORDER|LIMIT|AS|DESC|ASC|INTERVAL|HAVING|LEFT|RIGHT|INNER|UNION)\b|\b(ROUND|SUM|AVG|COUNT|DATE_TRUNC|TO_CHAR|CURRENT_DATE|MAX|MIN|STRFTIME)\b|(\b\d+(?:\.\d+)?\b)|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;

function HighlightSql({ code }: { code: string }) {
  const nodes = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0,
      k = 0;
    for (const m of code.matchAll(SQL_TOKEN)) {
      const i = m.index ?? 0;
      if (i > last) out.push(code.slice(last, i));
      const cls = m[1] ? "str" : m[2] ? "kw" : m[3] ? "fn" : m[4] ? "num" : "id";
      out.push(
        <span key={k++} className={cls}>
          {m[0]}
        </span>
      );
      last = i + m[0].length;
    }
    if (last < code.length) out.push(code.slice(last));
    return out;
  }, [code]);
  return <>{nodes}</>;
}

type Phase = "idle" | "running" | "done" | "error";
type HistoryItem = { question: string; insight: string; response: QueryResponse; datasourceName?: string };
type ActiveView = "analyst" | "datasources" | "insights";

export default function App() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<RobotController | null>(null);

  // Navigation
  const [activeView, setActiveView] = useState<ActiveView>("analyst");

  // Query & Execution States
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(-1);
  const [status, setStatus] = useState("");
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zipState, setZipState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const [conn, setConn] = useState<"checking" | "online" | "db-down" | "offline">("checking");

  // Data Sources State
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [activeDataSource, setActiveDataSource] = useState<DataSource | null>(null);
  const [dsDropdownOpen, setDsDropdownOpen] = useState(false);
  const [showWizardModal, setShowWizardModal] = useState(false);

  // Robot 3D initialization
  useEffect(() => {
    if (!stageRef.current) return;
    let ctrl: RobotController | null = null;
    try {
      ctrl = createRobotScene(stageRef.current);
      robotRef.current = ctrl;
      if (import.meta.env.DEV) (window as unknown as { __robot?: RobotController }).__robot = ctrl;
    } catch (e) {
      console.error("Robot failed to start", e);
    }
    return () => {
      ctrl?.dispose();
      robotRef.current = null;
    };
  }, []);

  // Backend status check polling
  useEffect(() => {
    let alive = true;
    const check = () =>
      getStatus()
        .then((s: ApiStatus) => {
          if (alive) {
            setConn(s.database ? "online" : "db-down");
          }
        })
        .catch(() => {
          if (alive) setConn("offline");
        });
    check();
    const id = window.setInterval(check, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // Fetch connected data sources
  const refreshDataSources = async () => {
    try {
      const list = await getDataSources();
      setDataSources(list);
    } catch (e) {
      console.error("Failed to load data sources", e);
    }
  };

  useEffect(() => {
    refreshDataSources();
  }, []);

  // Load schema dynamically based on selected active data source
  useEffect(() => {
    let alive = true;
    if (activeDataSource) {
      getDataSourceSchema(activeDataSource.id)
        .then((data) => {
          if (alive) setSchema(data.schema as unknown as Record<string, unknown>);
        })
        .catch(() => {
          if (alive) setSchema(null);
        });
    } else {
      getDatabaseSchema()
        .then((d) => {
          if (alive) setSchema(d.schema);
        })
        .catch(() => {
          if (alive) setSchema(null);
        });
    }
    return () => {
      alive = false;
    };
  }, [activeDataSource]);

  // Dynamic question suggestions based on active schema
  const dynamicExamples = useMemo(() => {
    if (!activeDataSource) return DEFAULT_EXAMPLES;
    if (!schema) return [`Summarize data from ${activeDataSource.connection_name}`, `Show row counts for all tables`];
    const tables = Object.keys(schema);
    if (!tables.length) return [`Show total records`];
    const firstTable = tables[0];
    return [
      `Show total count from ${firstTable}`,
      `Show top 5 rows from ${firstTable}`,
      `What are the most common values in ${firstTable}?`,
      `Summarize key statistics from ${activeDataSource.connection_name}`,
    ];
  }, [activeDataSource, schema]);

  async function run(question: string) {
    const q = question.trim();
    if (!q) {
      robotRef.current?.shrug();
      return;
    }
    if (phase === "running") return;

    setInput(q);
    setPhase("running");
    setStep(0);
    setResponse(null);
    setError("");
    setShowSql(false);

    const sourceName = activeDataSource ? activeDataSource.connection_name : "Default PostgreSQL";
    setStatus(`Thinking… parsing intent for [${sourceName}]`);
    robotRef.current?.setStage(0);

    const t1 = window.setTimeout(() => {
      setStep(1);
      setStatus(`Deciding… inspecting schema for [${sourceName}]`);
      robotRef.current?.setStage(1);
    }, 650);

    const t2 = window.setTimeout(() => {
      setStep(2);
      setStatus("Acting… generating, validating and executing read-only SQL");
      robotRef.current?.setStage(2);
    }, 1300);

    try {
      const result = await analyzeQuestion(
        q,
        history.slice(-5).map((h) => ({ question: h.question, insight: h.insight })),
        activeDataSource?.id
      );

      window.clearTimeout(t1);
      window.clearTimeout(t2);

      setResponse(result);
      setStep(3);
      setPhase("done");
      setStatus(`Done — ${result.row_count.toLocaleString()} row${result.row_count === 1 ? "" : "s"} analyzed.`);
      setHistory((prev) =>
        [
          { question: q, insight: result.insight, response: result, datasourceName: sourceName },
          ...prev.filter((h) => h.question !== q),
        ].slice(0, 8)
      );

      robotRef.current?.success();
      if (result.row_count === 0) window.setTimeout(() => robotRef.current?.shrug(), 900);
      else if (result.row_count >= 20) window.setTimeout(() => robotRef.current?.clap(), 1000);
      else window.setTimeout(() => robotRef.current?.point(), 1000);
    } catch (e) {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setPhase("error");
      setStep(2);
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("The agent stopped safely before returning a result.");
      robotRef.current?.error();
    }
  }

  // Handle Ask AI about a specific insight
  function handleAskAiAboutInsight(insight: InsightItem) {
    const q = insight.table_name
      ? `Investigate why ${insight.metric_name || insight.title} showed a deviation in ${insight.table_name}`
      : `Analyze the drivers behind: ${insight.title}`;

    setActiveView("analyst");
    setInput(q);
    // Automatically trigger run with robot interaction
    setTimeout(() => {
      run(q);
    }, 150);
  }

  async function copySql() {
    if (!response) return;
    await navigator.clipboard?.writeText(response.sql);
    setCopied(true);
    robotRef.current?.salute();
    window.setTimeout(() => setCopied(false), 1400);
  }

  function downloadCsv() {
    if (!response) return;
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [response.columns, ...response.rows.map((r) => response.columns.map((c) => r[c]))]
      .map((r) => r.map(esc).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${(response.datasource || "ai-analysis").toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    robotRef.current?.bow();
  }

  async function downloadZip() {
    if (zipState === "busy") return;
    setZipState("busy");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file(
        "README.md",
        "Clario AI Data Analyst\n\nRun backend and frontend using the instructions in backend/README.md and frontend/README.md.\n"
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "clario-project.zip";
      a.click();
      setZipState("done");
      robotRef.current?.dance();
      window.setTimeout(() => setZipState("idle"), 1800);
    } catch {
      setZipState("idle");
    }
  }

  const steps = [
    { icon: Lightbulb, b: "Think", s: response?.plan?.[0] || "Parse intent — metrics, filters, time range" },
    { icon: GitBranch, b: "Decide", s: response?.plan?.[1] || "Select the right tables & joins" },
    { icon: Zap, b: "Act", s: response?.plan?.[2] || "Generate, validate and execute safely" },
  ];
  const tableCount = schema ? Object.keys(schema).length : null;

  return (
    <div className="app-shell">
      <section className="robot-col">
        <div className="brand">
          <span className="dot" />
          Clario <span className="brand-agent">AI AGENT</span>
        </div>
        <div ref={stageRef} className="absolute inset-0" />
      </section>

      <main className="content-col">
        {/* Navigation Switcher */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeView === "analyst" ? "active" : ""}`}
              onClick={() => setActiveView("analyst")}
            >
              <Brain size={15} />
              AI Analyst
            </button>
            <button
              className={`nav-tab ${activeView === "insights" ? "active" : ""}`}
              onClick={() => setActiveView("insights")}
            >
              <Sparkles size={15} />
              AI Insights
              <span className="tab-badge" style={{ background: "rgba(217, 111, 31, 0.18)" }}>Engine</span>
            </button>
            <button
              className={`nav-tab ${activeView === "datasources" ? "active" : ""}`}
              onClick={() => setActiveView("datasources")}
            >
              <Database size={15} />
              Data Sources
              <span className="tab-badge">{dataSources.length + 1}</span>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Quick Active Source Picker Dropdown */}
            <div style={{ position: "relative" }}>
              <button
                className="active-ds-pill"
                onClick={() => setDsDropdownOpen((v) => !v)}
                title="Click to switch active database"
              >
                <i />
                <span>
                  <b>Active Source:</b> {activeDataSource ? activeDataSource.connection_name : "Default PostgreSQL"}
                </span>
                <ChevronDown size={13} />
              </button>

              {dsDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "#25201C",
                    border: "1px solid rgba(181,167,149,0.2)",
                    borderRadius: 12,
                    boxShadow: "0 14px 30px -10px rgba(0,0,0,0.6)",
                    padding: 6,
                    zIndex: 200,
                    minWidth: 260,
                  }}
                >
                  <div style={{ padding: "6px 10px", fontSize: 10.5, font: "700 10.5px Archivo, sans-serif", color: "var(--ink-soft)", textTransform: "uppercase" }}>
                    Select Database For AI
                  </div>
                  <button
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: !activeDataSource ? "rgba(232,133,58,0.12)" : "transparent",
                      color: !activeDataSource ? "var(--orange-deep)" : "var(--ink)",
                      font: "600 12px 'Sora', sans-serif",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onClick={() => {
                      setActiveDataSource(null);
                      setDsDropdownOpen(false);
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Database size={14} />
                      <span>Default PostgreSQL</span>
                    </div>
                    {!activeDataSource && <Check size={14} />}
                  </button>

                  {dataSources.map((ds) => (
                    <button
                      key={ds.id}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: activeDataSource?.id === ds.id ? "rgba(232,133,58,0.12)" : "transparent",
                        color: activeDataSource?.id === ds.id ? "var(--orange-deep)" : "var(--ink)",
                        font: "600 12px 'Sora', sans-serif",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setActiveDataSource(ds);
                        setDsDropdownOpen(false);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ds.database_type === "postgresql" && <Database size={14} />}
                        {ds.database_type === "csv" && <FileText size={14} />}
                        {ds.database_type === "excel" && <FileSpreadsheet size={14} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ds.connection_name}
                        </span>
                      </div>
                      {activeDataSource?.id === ds.id && <Check size={14} />}
                    </button>
                  ))}

                  <div style={{ borderTop: "1px solid rgba(120,105,88,0.12)", margin: "4px 0", paddingTop: 4 }}>
                    <button
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "var(--orange-deep)",
                        font: "600 11.5px 'Sora', sans-serif",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setDsDropdownOpen(false);
                        setShowWizardModal(true);
                      }}
                    >
                      <Plus size={14} />
                      <span>+ Add New Data Source…</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Settings Menu */}
            <div style={{ position: "relative" }}>
              <button
                className="active-ds-pill"
                onClick={() => setUserMenuOpen((v) => !v)}
                title="Account & Settings"
                style={{ padding: "6px 12px 6px 7px" }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "var(--orange)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {user?.avatar_initials || "CL"}
                </span>
                <span>{user?.full_name?.split(" ")[0] || "Account"}</span>
                <ChevronDown size={13} />
              </button>

              {userMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "#25201C",
                    border: "1px solid rgba(181,167,149,0.2)",
                    borderRadius: 12,
                    boxShadow: "0 14px 30px -10px rgba(0,0,0,0.6)",
                    padding: 6,
                    zIndex: 200,
                    minWidth: 200,
                  }}
                >
                  <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid rgba(181,167,149,0.12)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{user?.full_name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user?.email}
                    </div>
                  </div>

                  <div style={{ padding: "4px 0" }}>
                    <button
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "var(--ink)",
                        font: "500 12.5px 'Sora', sans-serif",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/settings");
                      }}
                    >
                      <Settings size={14} className="text-[var(--orange)]" />
                      <span>Settings</span>
                    </button>
                    <button
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "#dc2626",
                        font: "500 12.5px 'Sora', sans-serif",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                        navigate("/login");
                      }}
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View 1: AI Analyst Chat Interface */}
        {activeView === "analyst" && (
          <div className="glass-panel">
            <div className="eyebrow">CLARIO · AI DATA ANALYST</div>
            <h1 className="headline">
              ASK.
              <br />
              ANALYZE.
              <br />
              <span className="act">ACT.</span>
            </h1>
            <div className="subline">
              A conversational agent that turns plain English into safe SQL, data, charts and insights.
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22 }}>
              <label className="field-label" htmlFor="ask-input" style={{ margin: 0 }}>
                Ask your database anything
              </label>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                Targeting: <b>{activeDataSource ? activeDataSource.connection_name : "Default PostgreSQL"}</b>
              </span>
            </div>

            <div className="ask-row">
              <input
                id="ask-input"
                className="ask-input"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => robotRef.current?.ponder()}
                onKeyDown={(e) => e.key === "Enter" && run(input)}
                placeholder={
                  activeDataSource
                    ? `Ask anything about ${activeDataSource.connection_name}…`
                    : "Show me top 5 customers by revenue last month"
                }
              />
              <button
                className="run-btn"
                disabled={phase === "running"}
                onClick={() => run(input)}
              >
                {phase === "running" ? <Loader2 size={16} className="spin" /> : "Run"}
              </button>
            </div>

            {/* Dynamic chips based on active data source */}
            <div className="chips">
              {dynamicExamples.map((q) => (
                <button key={q} className="chip" onClick={() => run(q)}>
                  {q}
                </button>
              ))}
            </div>

            <div className="agent-toolbar">
              <button className="mini-btn" onClick={() => setSchemaOpen((v) => !v)}>
                <Database size={14} />
                {tableCount !== null
                  ? `${tableCount} table${tableCount === 1 ? "" : "s"} (${activeDataSource?.connection_name || "PostgreSQL"})`
                  : "Database schema"}
                <ChevronDown size={14} />
              </button>
              <span className="secure-pill">
                <ShieldCheck size={14} /> READ-ONLY GUARDRAIL
              </span>
              <span className={`conn-pill ${conn}`} title="Backend connection" role="status">
                <i />
                {conn === "online"
                  ? "API + DB connected"
                  : conn === "db-down"
                  ? "API up · database unreachable"
                  : conn === "offline"
                  ? "API offline"
                  : "Connecting…"}
              </span>
            </div>

            {schemaOpen && (
              <div className="schema-panel">
                <b>
                  Database the agent can reason over:{" "}
                  <span style={{ color: "var(--orange-deep)" }}>
                    {activeDataSource ? activeDataSource.connection_name : "ai_data_analyst (PostgreSQL)"}
                  </span>
                </b>
                <div className="schema-grid">
                  {schema ? (
                    Object.entries(schema).map(([name, value]) => (
                      <div className="schema-card" key={name}>
                        <strong>{name}</strong>
                        <span>
                          {Array.isArray((value as any)?.columns) ? (value as any).columns.length : 0} columns
                        </span>
                      </div>
                    ))
                  ) : (
                    <span>Connect the backend to load schema metadata.</span>
                  )}
                </div>
              </div>
            )}

            {phase !== "idle" && (
              <div className="steps">
                {steps.map((st, i) => {
                  const state = i < step || phase === "done" ? "done" : i === step ? "active" : "";
                  return (
                    <div key={st.b} className={`step ${state}`}>
                      <div className="badge">
                        {state === "done" ? <Check size={15} /> : <st.icon size={15} />}
                      </div>
                      <div className="txt">
                        <b>{st.b}</b>
                        <span>{st.s}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              role="status"
              aria-live="polite"
              className={`status-line ${phase === "done" ? "ok" : phase === "error" ? "error" : ""}`}
            >
              {status}
            </div>

            {error && (
              <div className="error-box">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {response && phase === "done" && (
              <>
                <div className="insight-card">
                  <div className="insight-icon">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div className="result-kicker">
                      AI INSIGHT · {response.datasource || "DATA SOURCE"}
                    </div>
                    <p>{response.insight}</p>
                  </div>
                </div>

                <div className="table-chips">
                  {response.tables.map((t) => (
                    <span key={t} className="tchip">
                      {t}
                    </span>
                  ))}
                  <span className="tchip safe">
                    <ShieldCheck size={12} /> SQLGlot validated
                  </span>
                </div>

                <Charts columns={response.columns} rows={response.rows} type={response.chart_type} />

                <div className="result-actions">
                  <button className="mini-btn" onClick={() => setShowSql((v) => !v)}>
                    {showSql ? "Hide SQL" : "View SQL"}
                  </button>
                  <button className="mini-btn" onClick={copySql}>
                    <Copy size={14} />
                    {copied ? "Copied" : "Copy SQL"}
                  </button>
                  <button className="mini-btn" onClick={downloadCsv}>
                    <Download size={14} />
                    CSV
                  </button>
                </div>

                {showSql && (
                  <div className="sql-block">
                    <HighlightSql code={response.sql} />
                  </div>
                )}

                <div className="results">
                  <table>
                    <thead>
                      <tr>
                        {response.columns.map((c, i) => (
                          <th key={c} style={i > 0 ? { textAlign: "right" } : undefined}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {response.rows.slice(0, 50).map((row, ri) => (
                        <tr key={ri}>
                          {response.columns.map((c, ci) => (
                            <td key={c} className={ci > 0 ? "num" : ""}>
                              {String(row[c] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {response.row_count > 50 && (
                    <div className="table-more">
                      Showing first 50 of {response.row_count.toLocaleString()} rows.
                    </div>
                  )}
                </div>

                <div className="followup">
                  <div>
                    <span className="result-kicker">KEEP EXPLORING</span>
                    <strong>Ask a follow-up in context</strong>
                  </div>
                  <button
                    className="chip"
                    onClick={() => run("Now compare that with the previous period")}
                  >
                    Compare with previous period
                  </button>
                  <button
                    className="chip"
                    onClick={() => run("Turn that into a chart and explain the biggest change")}
                  >
                    Explain the biggest change
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* View 2: Insight Engine Dashboard */}
        {activeView === "insights" && (
          <div className="glass-panel">
            <InsightEngineDashboard
              activeDataSource={activeDataSource}
              onAskAi={handleAskAiAboutInsight}
            />
          </div>
        )}

        {/* View 3: Data Sources Management View */}
        {activeView === "datasources" && (
          <div className="glass-panel">
            <DataSourcesView
              activeDataSourceId={activeDataSource?.id || null}
              onSelectActive={(ds) => {
                setActiveDataSource(ds);
                setActiveView("analyst");
              }}
              onDataSourcesChanged={refreshDataSources}
            />
          </div>
        )}

        {/* Recent Analyses History Panel */}
        <div className="history-panel">
          <div className="history-title">
            <History size={16} /> Recent analyses
          </div>
          {history.length ? (
            history.slice(0, 4).map((h, i) => (
              <button
                className="history-item"
                key={`${h.question}-${i}`}
                onClick={() => {
                  robotRef.current?.nod();
                  setInput(h.question);
                  setResponse(h.response);
                  setPhase("done");
                  setStatus(`Restored analysis — ${h.response.row_count.toLocaleString()} rows.`);
                  setStep(3);
                  setActiveView("analyst");
                }}
              >
                <span>
                  {h.question}
                  {h.datasourceName && (
                    <small style={{ marginLeft: 8, color: "var(--orange-deep)" }}>
                      [{h.datasourceName}]
                    </small>
                  )}
                </span>
                <small>{h.response.row_count} rows</small>
              </button>
            ))
          ) : (
            <span className="empty-history">Your recent questions will appear here.</span>
          )}
        </div>

        <div className="icon-cards">
          <div className="icard">
            <div className="ic">
              <Brain size={22} />
            </div>
            <h3>Agentic reasoning</h3>
            <p>Understands intent, plans the query, chooses tables and adapts to follow-up questions.</p>
          </div>
          <div className="icard">
            <div className="ic">
              <Sparkles size={22} />
            </div>
            <h3>Clario Insight Engine</h3>
            <p>Automatic data profiling, statistical IQR/Z-score anomaly detection and actionable AI guidance.</p>
          </div>
          <div className="icard">
            <div className="ic">
              <Database size={22} />
            </div>
            <h3>Dynamic databases</h3>
            <p>Connect PostgreSQL or upload CSV/Excel files. AI automatically discovers schemas and answers questions.</p>
          </div>
        </div>

        <div className="dl-row">
          <button className="dl-btn" onClick={downloadZip} disabled={zipState === "busy"}>
            {zipState === "busy" ? (
              <Loader2 size={15} className="spin" />
            ) : zipState === "done" ? (
              <Check size={15} />
            ) : (
              <Download size={15} />
            )}
            {zipState === "busy" ? "Packing…" : zipState === "done" ? "Ready" : "Download source (.zip)"}
          </button>
          <div className="foot-note">
            Clario agent · dynamic PostgreSQL, CSV, Excel connections with safe execution trail
          </div>
        </div>

        {/* Global Wizard Modal if opened from top dropdown */}
        {showWizardModal && (
          <DataSourcesWizardModal
            onClose={() => setShowWizardModal(false)}
            onDataSourceAdded={(ds) => {
              setDataSources((prev) => [ds, ...prev]);
              setActiveDataSource(ds);
              setActiveView("analyst");
              setShowWizardModal(false);
            }}
          />
        )}
      </main>
    </div>
  );
}
