import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AuthUser,
  getMe,
  getStoredToken,
  loginUser,
  demoLogin as apiDemoLogin,
  registerUser,
  logoutUser,
  setStoredToken,
  clearStoredToken,
  updateUserPreferences,
} from "../api";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  theme: "light" | "dark" | "system";
  login: (email: string, password: string, remember_me?: boolean) => Promise<void>;
  demoLogin: () => Promise<void>;
  register: (full_name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updatedUser: AuthUser) => void;
  setTheme: (newTheme: "light" | "dark" | "system") => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function applyThemeToDOM(theme: "light" | "dark" | "system") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [theme, setThemeState] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("clario_theme") as "light" | "dark" | "system") || "system";
  });

  // Apply theme whenever it changes
  useEffect(() => {
    applyThemeToDOM(theme);
    localStorage.setItem("clario_theme", theme);
  }, [theme]);

  // Load user on mount if token exists
  useEffect(() => {
    const initialToken = getStoredToken();
    if (!initialToken) {
      setLoading(false);
      return;
    }

    getMe(initialToken)
      .then((userData) => {
        setUser(userData);
        setToken(initialToken);
        if (userData.preferences?.theme) {
          setThemeState(userData.preferences.theme as "light" | "dark" | "system");
        }
      })
      .catch(() => {
        clearStoredToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email: string, password: string, remember_me: boolean = false) => {
    const res = await loginUser(email, password, remember_me);
    setStoredToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    if (res.user.preferences?.theme) {
      setThemeState(res.user.preferences.theme as "light" | "dark" | "system");
    }
  };

  const demoLogin = async () => {
    const res = await apiDemoLogin();
    setStoredToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    if (res.user.preferences?.theme) {
      setThemeState(res.user.preferences.theme as "light" | "dark" | "system");
    }
  };

  const register = async (full_name: string, email: string, password: string) => {
    const res = await registerUser(full_name, email, password);
    setStoredToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    logoutUser();
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser: AuthUser) => {
    setUser(updatedUser);
  };

  const setTheme = async (newTheme: "light" | "dark" | "system") => {
    setThemeState(newTheme);
    if (user && token) {
      try {
        const updated = await updateUserPreferences({ theme: newTheme }, token);
        setUser(updated);
      } catch (err) {
        console.error("Failed to save theme preference:", err);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        theme,
        login,
        demoLogin,
        register,
        logout,
        updateUser,
        setTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
