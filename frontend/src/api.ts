const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export interface QueryResponse {
  status: string;
  question: string;
  datasource?: string;
  datasource_id?: string | null;
  database_type?: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  tables: string[];
  insight: string;
  chart_type: "bar" | "line" | "donut" | "table";
  plan: string[];
}

export interface QueryHistoryItem {
  question: string;
  insight?: string;
}

export interface ApiStatus {
  api: boolean;
  database: boolean;
  ai: boolean;
}

export interface DataSource {
  id: string;
  user_id?: string;
  connection_name: string;
  database_type: "postgresql" | "csv" | "excel";
  host?: string | null;
  port?: number | null;
  database_name?: string | null;
  username?: string | null;
  connection_status: "connected" | "disconnected" | "error";
  created_at?: string | null;
  table_count?: number;
  tables?: string[];
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary_key?: boolean;
}

export interface TableSchemaInfo {
  columns: TableColumn[];
  foreign_keys: {
    column: string[];
    references_table: string | null;
    references_columns: string[];
  }[];
}

export interface DataSourceSchema {
  status: string;
  datasource_id: string;
  connection_name: string;
  database_type: string;
  schema: Record<string, TableSchemaInfo>;
}

export interface TablePreviewResponse {
  status: string;
  datasource_id: string;
  table_name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  preview_count: number;
  total_rows: number;
}

export interface TestConnectionPayload {
  connection_name?: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password: string;
  sslmode?: string;
}

export interface ConnectPayload extends TestConnectionPayload {
  connection_name: string;
}

const OFFLINE_MESSAGE = `Can't reach the Clario API at ${API_BASE_URL}. Start the backend (uvicorn app.main:app --reload --port 8000) and try again.`;

export async function getStatus(): Promise<ApiStatus> {
  const response = await fetch(`${API_BASE_URL}/api/status`);
  if (!response.ok) throw new Error("Status check failed.");
  return response.json();
}

export async function analyzeQuestion(
  question: string,
  history: QueryHistoryItem[] = [],
  datasourceId?: string | null
): Promise<QueryResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/ai/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        history,
        datasource_id: datasourceId || null,
      }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Unable to analyze the question.";
    try {
      const error = await response.json();
      message = typeof error.detail === "string" ? error.detail : JSON.stringify(error.detail) || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function getDatabaseSchema() {
  const response = await fetch(`${API_BASE_URL}/api/database/schema`);
  if (!response.ok) throw new Error("Unable to load database schema.");
  return response.json();
}

// Data Sources API calls
export async function getDataSources(): Promise<DataSource[]> {
  const response = await fetch(`${API_BASE_URL}/api/datasources`);
  if (!response.ok) {
    throw new Error("Unable to load data sources.");
  }
  const data = await response.json();
  return data.datasources || [];
}

export async function testConnection(payload: TestConnectionPayload): Promise<{
  status: string;
  message: string;
  tables: string[];
}> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/datasources/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Connection test failed.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail) || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function connectDataSource(payload: ConnectPayload): Promise<{
  status: string;
  message: string;
  datasource: DataSource;
  tables: string[];
}> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/datasources/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Failed to connect data source.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail) || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function uploadDataSource(file: File, connectionName?: string): Promise<{
  status: string;
  message: string;
  datasource: DataSource;
  table_name: string;
  row_count: number;
  column_count: number;
  columns: TableColumn[];
  preview_rows: Record<string, unknown>[];
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (connectionName) {
    formData.append("connection_name", connectionName);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/datasources/upload`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Failed to upload dataset.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail) || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function getDataSourceSchema(id: string): Promise<DataSourceSchema> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/${id}/schema`);
  if (!response.ok) {
    let message = "Unable to fetch schema.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function getDataSourceTablePreview(
  id: string,
  tableName: string,
  limit: number = 20
): Promise<TablePreviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/${id}/preview/${encodeURIComponent(tableName)}?limit=${limit}`);
  if (!response.ok) {
    let message = "Unable to preview table.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

export async function deleteDataSource(id: string): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    let message = "Failed to delete data source.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}


// ---------- Insight Engine Interfaces & Methods ----------

export interface InsightReport {
  id: string;
  datasource_id: string;
  user_id: string;
  dataset_label: string;
  total_insights: number;
  anomalies_count: number;
  trends_count: number;
  recommendations_count: number;
  executive_summary: string;
  created_at: string;
}

export interface InsightItem {
  id: string;
  report_id: string;
  datasource_id: string;
  user_id: string;
  title: string;
  category: "anomaly" | "trend" | "recommendation";
  severity: "critical" | "warning" | "positive" | "info";
  metric_name?: string;
  table_name?: string;
  detected_value?: string;
  baseline_value?: string;
  deviation_pct?: number;
  methodology?: string;
  confidence?: "high" | "medium" | "low";
  description: string;
  ai_explanation?: string;
  ai_recommendation?: string;
  evidence_data?: {
    chart_data?: { label: string; value: number }[];
  };
  chart_type?: "line" | "bar" | "area" | "donut";
  status: "new" | "reviewed" | "saved" | "dismissed";
  created_at: string;
}

export async function analyzeInsights(datasourceId?: string | null): Promise<{
  status: string;
  message: string;
  report: InsightReport;
  items: InsightItem[];
}> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/insights/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasource_id: datasourceId || null }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Insight analysis failed.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail) || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function getInsights(
  datasourceId?: string | null,
  category?: string,
  statusFilter?: string
): Promise<{
  has_report: boolean;
  report: InsightReport | null;
  items: InsightItem[];
}> {
  const params = new URLSearchParams();
  if (datasourceId) params.append("datasource_id", datasourceId);
  if (category && category !== "all") params.append("category", category);
  if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);

  const response = await fetch(`${API_BASE_URL}/api/insights?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Unable to load insights.");
  }
  return response.json();
}

export async function getInsightDetail(id: string): Promise<{
  status: string;
  insight: InsightItem;
  sample_records: Record<string, unknown>[];
}> {
  const response = await fetch(`${API_BASE_URL}/api/insights/${id}`);
  if (!response.ok) {
    throw new Error("Unable to load insight details.");
  }
  return response.json();
}

export async function prepareAskAi(id: string): Promise<{
  status: string;
  datasource_id: string;
  default_question: string;
  suggested_queries: string[];
  insight_context: Record<string, unknown>;
}> {
  const response = await fetch(`${API_BASE_URL}/api/insights/${id}/ask`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Unable to prepare AI context.");
  }
  return response.json();
}

export async function updateInsightStatus(
  id: string,
  status: "new" | "reviewed" | "saved" | "dismissed"
): Promise<{ status: string; new_status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/insights/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error("Failed to update insight status.");
  }
  return response.json();
}

// ---------- Authentication Interfaces & API ----------

export interface UserPreferences {
  theme?: "light" | "dark" | "system";
  notifications_enabled?: boolean;
  remember_last_ds?: boolean;
  default_datasource_id?: string | null;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  avatar_initials: string;
  preferences: UserPreferences;
  created_at?: string | null;
}

export interface AuthResponse {
  status: string;
  access_token: string;
  token_type: string;
  user: AuthUser;
}

const AUTH_TOKEN_KEY = "clario_auth_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {}
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}

export async function loginUser(
  email: string,
  password: string,
  remember_me: boolean = false
): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember_me }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Invalid email address or password.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function demoLogin(): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    throw new Error("Unable to sign in to demo account.");
  }

  return response.json();
}

export async function registerUser(
  full_name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name, email, password }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Registration failed.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function forgotPassword(email: string): Promise<{
  status: string;
  message: string;
  reset_token?: string | null;
  expires_in_minutes?: number;
}> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Failed to process forgot password request.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function resetPassword(
  token: string,
  new_password: string
): Promise<{ status: string; message: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password }),
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    let message = "Failed to reset password.";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function getMe(token?: string | null): Promise<AuthUser> {
  const authToken = token || getStoredToken();
  if (!authToken) throw new Error("No authorization token found.");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }

  if (!response.ok) {
    throw new Error("Session expired or invalid.");
  }

  const data = await response.json();
  return data.user;
}

export async function updateProfile(
  data: { full_name?: string; avatar_initials?: string },
  token?: string | null
): Promise<AuthUser> {
  const authToken = token || getStoredToken();
  if (!authToken) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let message = "Failed to update profile";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  const res = await response.json();
  return res.user;
}

export async function changePassword(
  current_password: string,
  new_password: string,
  token?: string | null
): Promise<{ status: string; message: string }> {
  const authToken = token || getStoredToken();
  if (!authToken) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ current_password, new_password }),
  });

  if (!response.ok) {
    let message = "Failed to update password";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function updateUserPreferences(
  preferences: UserPreferences,
  token?: string | null
): Promise<AuthUser> {
  const authToken = token || getStoredToken();
  if (!authToken) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/auth/preferences`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ preferences }),
  });

  if (!response.ok) {
    let message = "Failed to update preferences";
    try {
      const err = await response.json();
      message = typeof err.detail === "string" ? err.detail : message;
    } catch {}
    throw new Error(message);
  }

  const res = await response.json();
  return res.user;
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST" });
  } catch {}
  clearStoredToken();
}
