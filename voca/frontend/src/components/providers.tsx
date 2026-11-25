"use client";

/**
 * App-wide client state: the profile, target and plan, persisted to
 * localStorage; light/dark theme; and a small toast queue for API errors.
 *
 * The backend is the source of truth for anything computed. This context only
 * holds what the user has done so far, so a refresh never loses the flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/components/ui";
import { EMPTY_STATE, type VocaState } from "@/lib/types";

const STATE_KEY = "voca.state.v1";
const THEME_KEY = "voca.theme";

type Theme = "light" | "dark";
type ToastVariant = "error" | "success" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

type VocaContextValue = {
  state: VocaState;
  hydrated: boolean;
  update: (patch: Partial<VocaState>) => void;
  resetAll: () => void;
  theme: Theme;
  toggleTheme: () => void;
  toast: (message: string, variant?: ToastVariant) => void;
};

const VocaContext = createContext<VocaContextValue | null>(null);

export function useVoca(): VocaContextValue {
  const context = useContext(VocaContext);
  if (!context) throw new Error("useVoca must be used inside <Providers>");
  return context;
}

function readStoredState(): VocaState {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<VocaState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private mode or blocked storage: use the light default.
  }
  return "light";
}

export function Providers({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VocaState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    setState(readStoredState());
    setTheme(readStoredTheme());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (hydrated) window.localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  const update = useCallback((patch: Partial<VocaState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const resetAll = useCallback(() => {
    setState(EMPTY_STATE);
    try {
      window.localStorage.removeItem(STATE_KEY);
    } catch {
      // Private mode: nothing to clear.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "error") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(
    () => ({ state, hydrated, update, resetAll, theme, toggleTheme, toast }),
    [state, hydrated, update, resetAll, theme, toggleTheme, toast],
  );

  return (
    <VocaContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] p-3 text-[13px] text-[var(--text)] shadow-[var(--shadow-elevated)] animate-toast-in"
          >
            <span
              className={cn(
                "mt-0.5 shrink-0",
                item.variant === "error" && "text-[var(--red-ink)]",
                item.variant === "success" && "text-[var(--green-ink)]",
                item.variant === "info" && "text-[var(--blue-ink)]",
              )}
            >
              {item.variant === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : item.variant === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
            </span>
            <p className="flex-1 leading-snug">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--text-3)] transition-colors hover:bg-[var(--hover-fill)] hover:text-[var(--text)]"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </VocaContext.Provider>
  );
}
