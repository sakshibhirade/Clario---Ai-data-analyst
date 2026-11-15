import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { resetPassword } from "../api";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token.trim(), newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Clario Branding */}
        <div className="auth-header">
          <div className="brand-badge">
            <span className="dot" />
            <span className="brand-name">Clario</span>
          </div>
          <h1 className="auth-title">Set new password.</h1>
          <p className="auth-subtitle">Create a new secure password for your account.</p>
        </div>

        {error && (
          <div className="auth-error-box">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {success ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-emerald-300">
                  Password reset successfully
                </div>
                <div className="text-[var(--ink-soft)] text-xs mt-0.5">
                  Your password has been updated. You can now sign in with your new credentials.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="auth-btn-primary w-full"
            >
              Sign In Now
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="token">
                Reset token
              </label>
              <input
                id="token"
                type="text"
                className="form-input font-mono text-xs"
                placeholder="Paste the reset token here"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="newPassword">
                New password
              </label>
              <div className="password-input-wrap">
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  className="form-input pr-10"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <div className="password-input-wrap">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  className="form-input pr-10"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-btn-primary mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Updating Password...
                </>
              ) : (
                "Update Password"
              )}
            </button>

            <div className="text-center pt-4">
              <Link to="/login" className="auth-link-sm flex items-center justify-center gap-1.5">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
