import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  SunMoon,
  Lock,
  Sliders,
  Info,
  LogOut,
  Save,
  Check,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Database,
  Bell,
  Clock,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  updateProfile,
  changePassword,
  updateUserPreferences,
  getDataSources,
  DataSource,
} from "../api";

type SettingsSection = "profile" | "appearance" | "security" | "preferences" | "about";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, logout, updateUser, theme, setTheme } = useAuth();

  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [initials, setInitials] = useState(user?.avatar_initials || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Preferences state
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [defaultDs, setDefaultDs] = useState<string>(user?.preferences?.default_datasource_id || "");
  const [notifications, setNotifications] = useState<boolean>(user?.preferences?.notifications_enabled ?? true);
  const [rememberLastDs, setRememberLastDs] = useState<boolean>(user?.preferences?.remember_last_ds ?? true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setInitials(user.avatar_initials || "");
      setDefaultDs(user.preferences?.default_datasource_id || "");
      setNotifications(user.preferences?.notifications_enabled ?? true);
      setRememberLastDs(user.preferences?.remember_last_ds ?? true);
    }
  }, [user]);

  useEffect(() => {
    getDataSources()
      .then(setDataSources)
      .catch(() => {});
  }, []);

  // Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const updated = await updateProfile({ full_name: fullName, avatar_initials: initials }, token);
      updateUser(updated);
      setProfileStatus({ type: "success", message: "Profile details updated successfully." });
    } catch (err: unknown) {
      setProfileStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to update profile." });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({ type: "error", message: "New password must be at least 6 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await changePassword(currentPassword, newPassword, token);
      setPasswordStatus({ type: "success", message: res.message || "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to update password." });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsSaving(true);
    setPrefsStatus(null);
    try {
      const updated = await updateUserPreferences(
        {
          default_datasource_id: defaultDs || null,
          notifications_enabled: notifications,
          remember_last_ds: rememberLastDs,
        },
        token
      );
      updateUser(updated);
      setPrefsStatus({ type: "success", message: "Preferences saved successfully." });
    } catch (err: unknown) {
      setPrefsStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to save preferences." });
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="settings-container">
      {/* Settings Top Bar */}
      <header className="settings-topbar">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="settings-back-btn"
            title="Return to Clario Workspace"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Workspace</span>
          </button>
          <span className="text-[var(--ink-soft)] opacity-40">/</span>
          <h1 className="text-lg font-semibold font-display tracking-tight text-[var(--ink)]">
            Account Settings
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="avatar-pill">
            <span className="avatar-chip">{user?.avatar_initials || "CL"}</span>
            <span className="text-sm font-medium text-[var(--ink)] hidden sm:inline">
              {user?.full_name || "Analyst"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Settings Body */}
      <div className="settings-body">
        {/* Navigation Sidebar */}
        <aside className="settings-sidebar">
          <nav className="settings-nav">
            <button
              type="button"
              className={`settings-nav-item ${activeSection === "profile" ? "active" : ""}`}
              onClick={() => setActiveSection("profile")}
            >
              <User size={16} />
              <span>My Profile</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === "appearance" ? "active" : ""}`}
              onClick={() => setActiveSection("appearance")}
            >
              <SunMoon size={16} />
              <span>Appearance</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === "security" ? "active" : ""}`}
              onClick={() => setActiveSection("security")}
            >
              <Lock size={16} />
              <span>Security</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === "preferences" ? "active" : ""}`}
              onClick={() => setActiveSection("preferences")}
            >
              <Sliders size={16} />
              <span>Preferences</span>
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeSection === "about" ? "active" : ""}`}
              onClick={() => setActiveSection("about")}
            >
              <Info size={16} />
              <span>About Clario</span>
            </button>
          </nav>

          <div className="settings-sidebar-footer">
            <button
              type="button"
              onClick={handleLogout}
              className="settings-logout-btn"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Settings Content Pane */}
        <main className="settings-content">
          {/* 1. MY PROFILE */}
          {activeSection === "profile" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">My Profile</h2>
                <p className="settings-card-desc">
                  Manage your personal information and account avatar.
                </p>
              </div>

              {profileStatus && (
                <div
                  className={`status-alert ${
                    profileStatus.type === "success" ? "status-success" : "status-error"
                  }`}
                >
                  {profileStatus.type === "success" ? (
                    <Check size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  )}
                  <span className="text-sm">{profileStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="flex items-center gap-5 pb-2">
                  <div className="profile-large-avatar">
                    {initials || "CL"}
                  </div>
                  <div>
                    <label className="form-label mb-1" htmlFor="avatarInitials">
                      Avatar Initials
                    </label>
                    <input
                      id="avatarInitials"
                      type="text"
                      maxLength={4}
                      className="form-input w-24 text-center font-bold tracking-widest uppercase"
                      value={initials}
                      onChange={(e) => setInitials(e.target.value.toUpperCase())}
                    />
                    <p className="text-xs text-[var(--ink-soft)] mt-1">
                      Up to 4 characters shown in your avatar badge.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label" htmlFor="fullName">
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      className="form-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="email">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="form-input opacity-75 cursor-not-allowed"
                      value={user?.email || ""}
                      disabled
                      title="Email address is tied to your account login"
                    />
                    <p className="text-xs text-[var(--ink-soft)] mt-1">
                      Account email cannot be modified directly.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="settings-save-btn"
                    disabled={profileSaving}
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Profile
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. APPEARANCE */}
          {activeSection === "appearance" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Appearance</h2>
                <p className="settings-card-desc">
                  Customize the look and feel of the Clario application.
                </p>
              </div>

              <div className="space-y-4">
                <label className="form-label">Theme Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Light */}
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`theme-selector-card ${theme === "light" ? "active" : ""}`}
                  >
                    <div className="theme-icon-wrap">
                      <Sun size={20} className="text-amber-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm text-[var(--ink)]">Light</div>
                      <div className="text-xs text-[var(--ink-soft)]">Warm ivory theme</div>
                    </div>
                  </button>

                  {/* Dark */}
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`theme-selector-card ${theme === "dark" ? "active" : ""}`}
                  >
                    <div className="theme-icon-wrap">
                      <Moon size={20} className="text-indigo-400" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm text-[var(--ink)]">Dark</div>
                      <div className="text-xs text-[var(--ink-soft)]">Low-glare dark mode</div>
                    </div>
                  </button>

                  {/* System */}
                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={`theme-selector-card ${theme === "system" ? "active" : ""}`}
                  >
                    <div className="theme-icon-wrap">
                      <Laptop size={20} className="text-[var(--orange)]" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm text-[var(--ink)]">System</div>
                      <div className="text-xs text-[var(--ink-soft)]">Sync with OS</div>
                    </div>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-[var(--ink-soft)] mt-4">
                  Theme preference is persisted to your account and across devices.
                </div>
              </div>
            </div>
          )}

          {/* 3. SECURITY */}
          {activeSection === "security" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Security</h2>
                <p className="settings-card-desc">
                  Update your password and manage account session security.
                </p>
              </div>

              {passwordStatus && (
                <div
                  className={`status-alert ${
                    passwordStatus.type === "success" ? "status-success" : "status-error"
                  }`}
                >
                  {passwordStatus.type === "success" ? (
                    <Check size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  )}
                  <span className="text-sm">{passwordStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="currentPassword">
                    Current Password
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    className="form-input"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label" htmlFor="newPassword">
                      New Password
                    </label>
                    <input
                      id="newPassword"
                      type="password"
                      className="form-input"
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="confirmNewPassword">
                      Confirm New Password
                    </label>
                    <input
                      id="confirmNewPassword"
                      type="password"
                      className="form-input"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1.5"
                  >
                    <LogOut size={13} /> Sign out of current session
                  </button>

                  <button
                    type="submit"
                    className="settings-save-btn"
                    disabled={passwordSaving}
                  >
                    {passwordSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Update Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 4. PREFERENCES */}
          {activeSection === "preferences" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">Preferences</h2>
                <p className="settings-card-desc">
                  Customize your default data sources and workflow options.
                </p>
              </div>

              {prefsStatus && (
                <div
                  className={`status-alert ${
                    prefsStatus.type === "success" ? "status-success" : "status-error"
                  }`}
                >
                  {prefsStatus.type === "success" ? (
                    <Check size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-red-500 shrink-0" />
                  )}
                  <span className="text-sm">{prefsStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleSavePreferences} className="space-y-6">
                <div className="form-group">
                  <label className="form-label flex items-center gap-2" htmlFor="defaultDs">
                    <Database size={15} className="text-[var(--orange)]" />
                    Default Data Source
                  </label>
                  <select
                    id="defaultDs"
                    className="form-input cursor-pointer"
                    value={defaultDs}
                    onChange={(e) => setDefaultDs(e.target.value)}
                  >
                    <option value="">Internal Demo Store (PostgreSQL default)</option>
                    {dataSources.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.connection_name} ({ds.database_type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--ink-soft)] mt-1.5">
                    Select which data source is active upon launching Clario.
                  </p>
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2">
                        <Clock size={15} className="text-[var(--orange)]" />
                        Remember Last Selected Data Source
                      </div>
                      <p className="text-xs text-[var(--ink-soft)]">
                        Automatically restore the data source you used in your previous session.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={rememberLastDs}
                        onChange={(e) => setRememberLastDs(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-black/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--orange)]" />
                    </label>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2">
                        <Bell size={15} className="text-[var(--orange)]" />
                        Notification Preferences
                      </div>
                      <p className="text-xs text-[var(--ink-soft)]">
                        Show in-app toasts when query execution or insight generation finishes.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={notifications}
                        onChange={(e) => setNotifications(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-black/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--orange)]" />
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="settings-save-btn"
                    disabled={prefsSaving}
                  >
                    {prefsSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Preferences
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 5. ABOUT CLARIO */}
          {activeSection === "about" && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h2 className="settings-card-title">About Clario</h2>
                <p className="settings-card-desc">Application details and licensing information.</p>
              </div>

              <div className="space-y-6 pt-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffc98a] to-[var(--orange-deep)] flex items-center justify-center shadow-sm">
                    <span className="w-3.5 h-3.5 rounded-full bg-white shadow-inner" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-display text-[var(--ink)]">
                      Clario AI Data Analyst
                    </h3>
                    <p className="text-xs font-mono text-[var(--orange)] font-medium">
                      Version 1.2.0
                    </p>
                  </div>
                </div>

                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
                  Clario is an AI-powered natural language analytics engine with dynamic multi-source
                  database connections, automated statistical profiling, and outlier insight detection.
                  Designed for analysts, engineers, and decision-makers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                    <span className="text-[var(--ink-soft)] block">Application Core</span>
                    <span className="font-semibold text-[var(--ink)]">React + Vite + FastAPI</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                    <span className="text-[var(--ink-soft)] block">Intelligence Layer</span>
                    <span className="font-semibold text-[var(--ink)]">Google Gemini 2.5 Flash</span>
                  </div>
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 text-xs text-[var(--ink-soft)]">
                  &copy; {new Date().getFullYear()} Clario Technologies. All rights reserved.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
