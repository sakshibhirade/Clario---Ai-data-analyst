import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email address or password.");
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
          <h1 className="auth-title">Welcome back.</h1>
          <p className="auth-subtitle">Sign in to continue to your workspace.</p>
        </div>

        {error && (
          <div className="auth-error-box">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}

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

          <div className="form-group">
            <div className="flex justify-between items-center mb-1">
              <label className="form-label mb-0" htmlFor="password">
                Password
              </label>
              <Link to="/forgot-password" className="auth-link-sm">
                Forgot password?
              </Link>
            </div>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--ink-soft)] select-none">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Remember me
            </label>
          </div>

          <button
            type="submit"
            className="auth-btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span className="text-sm text-[var(--ink-soft)]">
            Don't have an account?{" "}
            <Link to="/register" className="auth-link font-semibold">
              Create Account
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
