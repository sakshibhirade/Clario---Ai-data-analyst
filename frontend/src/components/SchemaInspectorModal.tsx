import { useState, useEffect } from "react";
import { X, Database, Table, Columns, Eye, Key, Loader2, AlertCircle } from "lucide-react";
import {
  getDataSourceSchema,
  getDataSourceTablePreview,
  type DataSource,
  type DataSourceSchema,
  type TablePreviewResponse,
} from "../api";

interface Props {
  dataSource: DataSource;
  onClose: () => void;
}

export default function SchemaInspectorModal({ dataSource, onClose }: Props) {
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [schemaData, setSchemaData] = useState<DataSourceSchema | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<TablePreviewResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoadingSchema(true);
    setError("");
    getDataSourceSchema(dataSource.id)
      .then((data) => {
        if (!alive) return;
        setSchemaData(data);
        const tables = Object.keys(data.schema);
        if (tables.length > 0) {
          setSelectedTable(tables[0]);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load schema");
      })
      .finally(() => {
        if (alive) setLoadingSchema(false);
      });

    return () => {
      alive = false;
    };
  }, [dataSource.id]);

  useEffect(() => {
    if (!selectedTable || !dataSource.id) return;
    let alive = true;
    setPreviewLoading(true);
    getDataSourceTablePreview(dataSource.id, selectedTable, 20)
      .then((data) => {
        if (alive) setPreviewData(data);
      })
      .catch(() => {
        if (alive) setPreviewData(null);
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [dataSource.id, selectedTable]);

  const tables = schemaData?.schema ? Object.keys(schemaData.schema) : [];
  const currentTableSchema = selectedTable && schemaData?.schema?.[selectedTable] ? schemaData.schema[selectedTable] : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-window"
        style={{ maxWidth: 840 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={`ds-icon-box ${dataSource.database_type === "postgresql" ? "pg" : dataSource.database_type === "csv" ? "csv" : "xlsx"}`}>
              <Database size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 18 }}>{dataSource.connection_name}</h2>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {dataSource.database_type.toUpperCase()} · {dataSource.database_name || "Dataset"} · {tables.length} table{tables.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 14 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loadingSchema ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>
            <Loader2 size={24} className="spin" style={{ margin: "0 auto 8px" }} />
            <div>Inspecting schema and discovered tables…</div>
          </div>
        ) : tables.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--ink-soft)" }}>
            No tables discovered in this data source.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 18, marginTop: 10 }}>
            {/* Table Selector Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ font: "700 11px Archivo, sans-serif", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                Discovered Tables ({tables.length})
              </div>
              <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {tables.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTable(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: selectedTable === t ? "1.5px solid var(--orange-deep)" : "1px solid rgba(120,105,88,0.18)",
                      background: selectedTable === t ? "rgba(232,133,58,0.12)" : "rgba(48,41,35,0.6)",
                      color: selectedTable === t ? "var(--orange-deep)" : "var(--ink)",
                      font: "600 12px 'JetBrains Mono', monospace",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span>
                    <small style={{ color: "var(--ink-soft)", fontSize: 10, flex: "none" }}>
                      {schemaData?.schema[t]?.columns?.length || 0} cols
                    </small>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Details: Columns & Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Table size={16} color="var(--orange-deep)" />
                  <strong style={{ font: "700 14px 'JetBrains Mono', monospace" }}>{selectedTable}</strong>
                  {previewData && (
                    <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6 }}>
                      ({previewData.total_rows.toLocaleString()} total rows)
                    </span>
                  )}
                </div>
              </div>

              {/* Columns Schema */}
              {currentTableSchema && (
                <div>
                  <div style={{ font: "700 11px Archivo, sans-serif", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                    Columns ({currentTableSchema.columns.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 110, overflowY: "auto", padding: 2 }}>
                    {currentTableSchema.columns.map((c) => (
                      <div
                        key={c.name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "#f4eddf",
                          border: "1px solid rgba(120,105,88,0.18)",
                          fontSize: 11,
                        }}
                      >
                        {c.primary_key && <Key size={10} color="#d96f1f" />}
                        <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{c.name}</span>
                        <span style={{ fontSize: 9.5, color: "var(--ink-soft)", textTransform: "uppercase" }}>{c.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 20 Row Data Preview */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ font: "700 11px Archivo, sans-serif", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Sample Data Preview (First 20 Rows)
                  </span>
                  {previewLoading && <Loader2 size={13} className="spin" />}
                </div>

                {previewLoading ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--ink-soft)", fontSize: 12 }}>
                    Loading preview…
                  </div>
                ) : previewData && previewData.rows.length > 0 ? (
                  <div className="table-preview-scroll">
                    <table className="table-preview-table">
                      <thead>
                        <tr>
                          {previewData.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.map((row, idx) => (
                          <tr key={idx}>
                            {previewData.columns.map((c) => (
                              <td key={c}>{String(row[c] ?? "—")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 18, textAlign: "center", color: "var(--ink-soft)", fontSize: 11.5 }}>
                    No rows to preview in table {selectedTable}.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 22, textAlign: "right" }}>
          <button className="mini-btn" onClick={onClose} style={{ padding: "8px 18px" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
