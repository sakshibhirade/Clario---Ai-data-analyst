import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, KeyRound, Copy, Check } from "lucide-react";
import { forgotPassword } from "../api";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccess(true);
      if (res.reset_token) {
        setResetToken(res.reset_token);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to request password reset.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (!resetToken) return;
    navigator.clipboard.writeText(resetToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1 className="auth-title">Reset password.</h1>
          <p className="auth-subtitle">
            Enter your email to receive your password reset token.
          </p>
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
                  Reset Token Generated
                </div>
                <div className="text-[var(--ink-soft)] text-xs mt-0.5">
                  A secure password reset token has been generated, valid for 60 minutes.
                </div>
              </div>
            </div>

            {resetToken && (
              <div className="p-3.5 rounded-xl bg-[#1A1614] border border-[rgba(181,167,149,0.18)]">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-[var(--ink-soft)] flex items-center gap-1.5">
                    <KeyRound size={12} className="text-[var(--orange)]" /> Reset Token
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="text-xs flex items-center gap-1 text-[var(--orange)] hover:underline font-medium"
                  >
                    {copied ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy Token
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-xs break-all bg-[#13100E] p-2.5 rounded-lg border border-[rgba(181,167,149,0.1)] text-[#E9E1D2]">
                  {resetToken}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate(`/reset-password${resetToken ? `?token=${encodeURIComponent(resetToken)}` : ""}`)}
              className="auth-btn-primary w-full"
            >
              Continue to Reset Password
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="auth-link-sm flex items-center justify-center gap-1.5">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="auth-btn-primary mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Token...
                </>
              ) : (
                "Send Reset Link"
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
