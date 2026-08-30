import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getState } from "../api";
import { getAuth, setAuth as storeAuth, clearAuth as removeAuth } from "../session";
import type { AppState } from "../types";
import type { AuthInfo } from "../session";

interface AppStateContextType {
  state: AppState | null;
  auth: AuthInfo | null;
  isLoading: boolean;
  error: string | null;
  isTutorOpen: boolean;
  setTutorOpen: (open: boolean) => void;
  refreshState: () => Promise<void>;
  updateState: (newState: AppState) => void;
  login: (authInfo: AuthInfo) => void;
  logout: () => void;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [auth, setAuthInfo] = useState<AuthInfo | null>(getAuth());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTutorOpen, setTutorOpen] = useState(false);
  const stateRef = useRef<AppState | null>(null);

  const commitState = useCallback((next: AppState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Refresh state without flashing a loading screen when we already have data.
  // Only the first-ever load (no state yet) may show the splash/skeleton.
  const refreshState = useCallback(async () => {
    const currentAuth = getAuth();
    setAuthInfo(currentAuth);
    if (!currentAuth) {
      commitState(null);
      setIsLoading(false);
      return;
    }

    const isFirstLoad = stateRef.current === null;
    if (isFirstLoad) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const res = await getState(currentAuth.session_id);
      commitState(res.state);
      setError(null);
    } catch (err) {
      // Keep stale data on background refresh failures instead of blowing away the UI.
      if (isFirstLoad) {
        setError("Failed to fetch application state.");
        commitState(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [commitState]);

  // Sync auth changes periodically or on mount
  useEffect(() => {
    refreshState();
    
    // We can listen to a custom event if we want cross-tab sync, 
    // but for now, running on mount is sufficient.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "learning_path_auth") {
        refreshState();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshState]);

  const updateState = useCallback((newState: AppState) => {
    commitState(newState);
  }, [commitState]);

  const login = useCallback((authInfo: AuthInfo) => {
    storeAuth(authInfo);
    setAuthInfo(authInfo);
    refreshState();
  }, [refreshState]);

  const logout = useCallback(() => {
    removeAuth();
    stateRef.current = null;
    setAuthInfo(null);
    setState(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return (
    <AppStateContext.Provider value={{ state, auth, isLoading, error, isTutorOpen, setTutorOpen, refreshState, updateState, login, logout }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
