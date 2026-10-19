import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import {
  createGeminiServiceClient,
  GeminiServiceProvider,
  type IGeminiServiceClient,
} from "./lib/geminiApi.ts";
import "./index.css";

/**
 * Top-level runtime error guard that catches unhandled window errors and
 * unhandled promise rejections so standalone deployments never fail silently.
 */
function ProductionRuntimeGuard({ children }: { children: React.ReactNode }) {
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (event.error instanceof Error) {
        console.error("[Runtime Guard] Uncaught error:", event.error.message);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unknown");
      console.warn("[Runtime Guard] Unhandled promise rejection:", reason);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (fatalError) {
    return (
      <main
        role="alert"
        className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans"
      >
        <div className="max-w-md w-full rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl space-y-4">
          <h1 className="text-lg font-bold text-white">Application Recovery Mode</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Drive Organizer encountered an unexpected runtime error. Your Google Drive files and
            credentials remain safe.
          </p>
          <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-rose-300 font-mono overflow-x-auto">
            {fatalError}
          </pre>
          <button
            type="button"
            onClick={() => {
              setFatalError(null);
              window.location.reload();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Reload Application
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

export interface BootstrapOptions {
  rootElement?: HTMLElement | null;
  aiClient?: IGeminiServiceClient;
}

/**
 * Modular production bootstrap entry point that decouples the React UI tree
 * from the underlying AI service client implementation.
 */
export function bootstrapApplication(options: BootstrapOptions = {}): void {
  const container = options.rootElement ?? document.getElementById("root");
  if (!container) {
    throw new Error("Failed to mount application: #root container element not found in DOM.");
  }

  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configuredBaseUrl = metaEnv?.VITE_API_BASE_URL ? String(metaEnv.VITE_API_BASE_URL) : "";

  const aiServiceClient =
    options.aiClient ??
    createGeminiServiceClient({
      baseUrl: configuredBaseUrl,
    });

  createRoot(container).render(
    <StrictMode>
      <ProductionRuntimeGuard>
        <GeminiServiceProvider client={aiServiceClient}>
          <App />
        </GeminiServiceProvider>
      </ProductionRuntimeGuard>
    </StrictMode>
  );
}

bootstrapApplication();
