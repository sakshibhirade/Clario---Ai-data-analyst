import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import {
  X,
  Database,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UploadCloud,
  ShieldCheck,
  Server,
} from "lucide-react";
import {
  testConnection,
  connectDataSource,
  uploadDataSource,
  type DataSource,
} from "../api";

interface Props {
  onClose: () => void;
  onDataSourceAdded: (ds: DataSource) => void;
}

type WizardTab = "postgres" | "csv" | "excel";

export default function DataSourcesWizardModal({ onClose, onDataSourceAdded }: Props) {
  const [activeTab, setActiveTab] = useState<WizardTab>("postgres");

  // Postgres form state
  const [connectionName, setConnectionName] = useState("");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5432);
  const [databaseName, setDatabaseName] = useState("ai_data_analyst");
  const [username, setUsername] = useState("postgres");
  const [password, setPassword] = useState("");
  const [sslmode, setSslmode] = useState("prefer");

  // Status & testing states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    tables?: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileConnectionName, setFileConnectionName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle PostgreSQL Test Connection
  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    setError("");

    try {
      const res = await testConnection({
        connection_name: connectionName || "PostgreSQL",
        host: host.trim(),
        port: Number(port) || 5432,
        database_name: databaseName.trim(),
        username: username.trim(),
        password,
        sslmode,
      });

      setTestResult({
        success: true,
        message: res.message,
        tables: res.tables,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection test failed";
      setTestResult({
        success: false,
        message: msg,
      });
    } finally {
      setTesting(false);
    }
  }

  // Handle PostgreSQL Connect & Save
  async function handleConnectPostgres(e: React.FormEvent) {
    e.preventDefault();
    if (!host || !databaseName || !username) {
      setError("Please fill in all required fields (Host, Database, Username).");
      return;
    }

    setSaving(true);
    setError("");

    const name = connectionName.trim() || `${databaseName} (${host})`;

    try {
      const res = await connectDataSource({
        connection_name: name,
        host: host.trim(),
        port: Number(port) || 5432,
        database_name: databaseName.trim(),
        username: username.trim(),
        password,
        sslmode,
      });

      onDataSourceAdded(res.datasource);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect data source");
    } finally {
      setSaving(false);
    }
  }

  // File drag & drop handlers
  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      selectFile(e.target.files[0]);
    }
  }

  function selectFile(selected: File) {
    const ext = selected.name.split(".").pop()?.toLowerCase();
    const expected = activeTab === "csv" ? "csv" : "xlsx";
    if (ext !== expected) {
      setError(`Please select a .${expected} file.`);
      return;
    }
    if (selected.size > 25 * 1024 * 1024) {
      setError("File exceeds 25MB limit.");
      return;
    }
    setError("");
    setFile(selected);
    if (!fileConnectionName) {
      setFileConnectionName(selected.name.replace(/\.[^/.]+$/, ""));
    }
  }

  // Handle File Upload
  async function handleUploadDataset(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const res = await uploadDataSource(file, fileConnectionName.trim());
      onDataSourceAdded(res.datasource);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Add Data Source</h2>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
              Connect external databases or upload tabular datasets for AI analysis.
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Wizard Source Type Tabs */}
        <div className="wizard-tabs">
          <button
            type="button"
            className={`wizard-tab-btn ${activeTab === "postgres" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("postgres");
              setError("");
              setTestResult(null);
            }}
          >
            <Database size={18} />
            <span>PostgreSQL</span>
          </button>
          <button
            type="button"
            className={`wizard-tab-btn ${activeTab === "csv" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("csv");
              setError("");
              setFile(null);
            }}
          >
            <FileText size={18} />
            <span>CSV Upload</span>
          </button>
          <button
            type="button"
            className={`wizard-tab-btn ${activeTab === "excel" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("excel");
              setError("");
              setFile(null);
            }}
          >
            <FileSpreadsheet size={18} />
            <span>Excel (.xlsx)</span>
          </button>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* PostgreSQL Connection Tab */}
        {activeTab === "postgres" && (
          <form onSubmit={handleConnectPostgres}>
            <div className="form-grid">
              <div className="form-field form-col-full">
                <label className="form-label">Connection Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Production Analytics"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Host *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="localhost or 127.0.0.1"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Port *</label>
                <input
                  type="number"
                  required
                  className="form-input"
                  placeholder="5432"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Database Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="ai_data_analyst"
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">SSL Mode</label>
                <select
                  className="form-select"
                  value={sslmode}
                  onChange={(e) => setSslmode(e.target.value)}
                >
                  <option value="prefer">prefer (default)</option>
                  <option value="require">require</option>
                  <option value="disable">disable</option>
                  <option value="verify-ca">verify-ca</option>
                  <option value="verify-full">verify-full</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Username *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="postgres"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Test Connection Result Box */}
            {testResult && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: testResult.success ? "rgba(76,138,90,0.1)" : "rgba(185,62,48,0.1)",
                  border: `1px solid ${testResult.success ? "rgba(76,138,90,0.3)" : "rgba(185,62,48,0.3)"}`,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: testResult.success ? "#2e7d32" : "#8e3d31" }}>
                  {testResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{testResult.message}</span>
                </div>
                {testResult.success && testResult.tables && testResult.tables.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10.5, color: "var(--ink-soft)", marginBottom: 4 }}>
                      Discovered tables:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {testResult.tables.map((tbl) => (
                        <span key={tbl} className="discovered-pill">
                          {tbl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22, paddingTop: 14, borderTop: "1px solid rgba(120,105,88,0.14)" }}>
              <button
                type="button"
                className="mini-btn"
                disabled={testing || saving}
                onClick={handleTestConnection}
                style={{ padding: "9px 16px" }}
              >
                {testing ? <Loader2 size={14} className="spin" /> : <Server size={14} />}
                {testing ? "Testing Connection…" : "Test Connection"}
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="mini-btn" onClick={onClose} disabled={saving}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="run-btn"
                  disabled={saving || testing}
                  style={{ padding: "0 20px", height: 38 }}
                >
                  {saving ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  {saving ? "Saving…" : "Save & Connect"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* CSV & Excel Upload Tab */}
        {(activeTab === "csv" || activeTab === "excel") && (
          <form onSubmit={handleUploadDataset}>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label className="form-label">Dataset Name</label>
              <input
                type="text"
                className="form-input"
                placeholder={activeTab === "csv" ? "e.g. Sales Q3 Report" : "e.g. Financial Model"}
                value={fileConnectionName}
                onChange={(e) => setFileConnectionName(e.target.value)}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              accept={activeTab === "csv" ? ".csv" : ".xlsx"}
              onChange={handleFileChange}
            />

            <div
              className={`dropzone ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={36} color="var(--orange-deep)" />
              {file ? (
                <div>
                  <p style={{ fontWeight: 700, color: "var(--orange-deep)" }}>{file.name}</p>
                  <small>{(file.size / 1024).toFixed(1)} KB · Ready to ingest</small>
                </div>
              ) : (
                <div>
                  <p>Click or drag {activeTab === "csv" ? "CSV" : "Excel (.xlsx)"} file here</p>
                  <small>Maximum size: 25MB · Parsed into an isolated queryable dataset</small>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22, paddingTop: 14, borderTop: "1px solid rgba(120,105,88,0.14)" }}>
              <button type="button" className="mini-btn" onClick={onClose} disabled={uploading}>
                Cancel
              </button>
              <button
                type="submit"
                className="run-btn"
                disabled={!file || uploading}
                style={{ padding: "0 22px", height: 38 }}
              >
                {uploading ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                {uploading ? "Ingesting Dataset…" : "Upload & Analyze"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
