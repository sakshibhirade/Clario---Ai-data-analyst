import { useState, useEffect } from "react";
import {
  Database,
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  Table,
  Check,
  RefreshCw,
  Loader2,
  Eye,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import {
  getDataSources,
  deleteDataSource,
  type DataSource,
} from "../api";
import DataSourcesWizardModal from "./DataSourcesWizardModal";
import SchemaInspectorModal from "./SchemaInspectorModal";

interface Props {
  activeDataSourceId: string | null;
  onSelectActive: (ds: DataSource | null) => void;
  onDataSourcesChanged?: () => void;
}

export default function DataSourcesView({
  activeDataSourceId,
  onSelectActive,
  onDataSourcesChanged,
}: Props) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [inspectingDataSource, setInspectingDataSource] = useState<DataSource | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadSources() {
    setLoading(true);
    setError("");
    try {
      const list = await getDataSources();
      setDataSources(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
  }, []);

  async function handleDelete(ds: DataSource) {
    if (!window.confirm(`Are you sure you want to disconnect "${ds.connection_name}"?`)) {
      return;
    }

    setDeletingId(ds.id);
    try {
      await deleteDataSource(ds.id);
      if (activeDataSourceId === ds.id) {
        onSelectActive(null);
      }
      await loadSources();
      onDataSourcesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete data source");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDataSourceAdded(newDs: DataSource) {
    setDataSources((prev) => [newDs, ...prev]);
    onSelectActive(newDs);
    onDataSourcesChanged?.();
  }

  return (
    <div style={{ animation: "riseIn 0.5s ease both" }}>
      {/* Top Header */}
      <div className="ds-header">
        <div>
          <h2 className="ds-title">Connected Data Sources</h2>
          <div className="ds-subtitle">
            Manage your databases and datasets. Clario’s AI Analyst queries whichever source is active.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="mini-btn"
            onClick={loadSources}
            disabled={loading}
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button
            className="run-btn"
            onClick={() => setShowWizard(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 18px" }}
          >
            <Plus size={16} />
            Add Data Source
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && dataSources.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>
          <Loader2 size={24} className="spin" style={{ margin: "0 auto 8px" }} />
          <div>Loading connected data sources…</div>
        </div>
      ) : (
        <div className="ds-grid">
          {/* Default Internal PostgreSQL Database Card */}
          <div
            className={`ds-card ${!activeDataSourceId ? "is-active" : ""}`}
            style={{ borderLeft: "4px solid var(--orange)" }}
          >
            <div>
              <div className="ds-card-top">
                <div className="ds-icon-box pg">
                  <Database size={20} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span className={`ds-type-badge ${!activeDataSourceId ? "active" : ""}`}>
                    PostgreSQL
                  </span>
                  <span className="secure-pill" style={{ padding: "3px 8px", fontSize: 9 }}>
                    Internal Demo
                  </span>
                </div>
              </div>

              <div className="ds-card-title">Default PostgreSQL Database</div>

              <div className="ds-card-meta">
                <span>
                  <b>Database:</b> ai_data_analyst
                </span>
                <span>
                  <b>Tables:</b> 5 pre-loaded sample tables (customers, orders, products)
                </span>
                <span>
                  <b>Access:</b> Read-only guarded transaction
                </span>
              </div>
            </div>

            <div className="ds-card-actions">
              {!activeDataSourceId ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--orange-deep)",
                  }}
                >
                  <Check size={14} /> Active for AI
                </span>
              ) : (
                <button
                  className="mini-btn"
                  onClick={() => onSelectActive(null)}
                  style={{ fontSize: 11 }}
                >
                  Use for AI
                </button>
              )}
            </div>
          </div>

          {/* User-Connected Data Sources */}
          {dataSources.map((ds) => {
            const isActive = activeDataSourceId === ds.id;
            const isPg = ds.database_type === "postgresql";
            const isCsv = ds.database_type === "csv";
            const isExcel = ds.database_type === "excel";

            return (
              <div
                key={ds.id}
                className={`ds-card ${isActive ? "is-active" : ""}`}
                style={{
                  borderLeft: `4px solid ${
                    isPg ? "#2b5b84" : isCsv ? "#2e7d32" : "#107c41"
                  }`,
                }}
              >
                <div>
                  <div className="ds-card-top">
                    <div className={`ds-icon-box ${isPg ? "pg" : isCsv ? "csv" : "xlsx"}`}>
                      {isPg && <Database size={20} />}
                      {isCsv && <FileText size={20} />}
                      {isExcel && <FileSpreadsheet size={20} />}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className={`ds-type-badge ${isActive ? "active" : ""}`}>
                        {ds.database_type.toUpperCase()}
                      </span>
                      <span
                        className={`conn-pill ${
                          ds.connection_status === "connected"
                            ? "online"
                            : ds.connection_status === "error"
                            ? "offline"
                            : "checking"
                        }`}
                        style={{ padding: "3px 8px", fontSize: 9.5 }}
                      >
                        <i />
                        {ds.connection_status === "connected" ? "Connected" : "Error"}
                      </span>
                    </div>
                  </div>

                  <div className="ds-card-title">{ds.connection_name}</div>

                  <div className="ds-card-meta">
                    {isPg ? (
                      <>
                        <span>
                          <b>Host:</b> {ds.host}:{ds.port || 5432}
                        </span>
                        <span>
                          <b>Database:</b> {ds.database_name}
                        </span>
                        <span>
                          <b>Discovered:</b> {ds.table_count ?? ds.tables?.length ?? 0} tables
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          <b>File:</b> {ds.database_name || "Uploaded dataset"}
                        </span>
                        <span>
                          <b>Storage:</b> Isolated queryable SQLite dataset
                        </span>
                        <span>
                          <b>Tables:</b> {ds.table_count ?? 1} table
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="ds-card-actions">
                  {isActive ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "var(--orange-deep)",
                        marginRight: "auto",
                      }}
                    >
                      <Check size={14} /> Active for AI
                    </span>
                  ) : (
                    <button
                      className="mini-btn"
                      onClick={() => onSelectActive(ds)}
                      style={{ fontSize: 11, marginRight: "auto" }}
                    >
                      Set Active
                    </button>
                  )}

                  <button
                    className="mini-btn"
                    onClick={() => setInspectingDataSource(ds)}
                    title="Inspect Schema & Preview Data"
                  >
                    <Eye size={13} />
                    Preview
                  </button>

                  <button
                    className="mini-btn"
                    onClick={() => handleDelete(ds)}
                    disabled={deletingId === ds.id}
                    title="Disconnect / Delete"
                    style={{ color: "#8e3d31" }}
                  >
                    {deletingId === ds.id ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Data Source Wizard Modal */}
      {showWizard && (
        <DataSourcesWizardModal
          onClose={() => setShowWizard(false)}
          onDataSourceAdded={handleDataSourceAdded}
        />
      )}

      {/* Schema & Table Data Preview Modal */}
      {inspectingDataSource && (
        <SchemaInspectorModal
          dataSource={inspectingDataSource}
          onClose={() => setInspectingDataSource(null)}
        />
      )}
    </div>
  );
}
