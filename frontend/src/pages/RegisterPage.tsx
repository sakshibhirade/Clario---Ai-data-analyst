import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength calculation
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "" };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500", text: "text-red-400" };
    if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500", text: "text-amber-400" };
    if (score === 3) return { score: 3, label: "Good", color: "bg-blue-400", text: "text-blue-300" };
    return { score: 4, label: "Strong", color: "bg-emerald-500", text: "text-emerald-400" };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please fill out all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await register(fullName.trim(), email.trim(), password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
          <h1 className="auth-title">Create your account.</h1>
          <p className="auth-subtitle">Get started with your analytics workspace in seconds.</p>
        </div>

        {error && (
          <div className="auth-error-box">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              className="form-input"
              placeholder="Alex Morgan"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div className="password-input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input pr-10"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

            {/* Password Strength Indicator */}
            {password && (
              <div className="mt-2.5">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-[#B5A795]">Password strength</span>
                  <span className={`font-semibold ${strength.text}`}>{strength.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-[#1F1B18] rounded-full overflow-hidden p-0.5 border border-[rgba(181,167,149,0.15)]">
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 1 ? strength.color : "bg-transparent"}`} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 2 ? strength.color : "bg-transparent"}`} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 3 ? strength.color : "bg-transparent"}`} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 4 ? strength.color : "bg-transparent"}`} />
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">
              Confirm password
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
            {confirmPassword && password === confirmPassword && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1.5 font-medium">
                <CheckCircle2 size={13} />
                <span>Passwords match</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="auth-btn-primary mt-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="auth-footer mt-6">
          <span className="text-sm text-[#B5A795]">
            Already have an account?{" "}
            <Link to="/login" className="auth-link font-semibold">
              Sign In
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
