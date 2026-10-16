import React from "react";
import { User } from "firebase/auth";
import { RefreshCw, Layers, Moon, Sun, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ContextualActionToolbar, { DashboardTab } from "./ContextualActionToolbar";

interface HeaderProps {
  user: User | null;
  onLogout: () => Promise<void>;
  activityCount: number;
  taskAlertsCount: number;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSyncing: boolean;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isEmptyState?: boolean;
  onActionSelect?: (actionId: string) => void;
  onFileDrop?: (files: FileList) => void;
}

export default function Header({
  user,
  onLogout,
  activityCount,
  taskAlertsCount,
  activeTab,
  setActiveTab,
  isSyncing,
  isDarkMode,
  toggleTheme,
  isEmptyState = false,
  onActionSelect,
  onFileDrop,
}: HeaderProps) {
  const tabKey: DashboardTab = (
    ["drive", "sheets", "organizer", "backup", "tasks", "reports", "chat"].includes(activeTab)
      ? activeTab
      : "drive"
  ) as DashboardTab;

  const getTabLabel = (id: string) => {
    switch (id) {
      case "drive": return "Google Drive";
      case "sheets": return "Google Sheets";
      case "organizer": return "Smart Organizer";
      case "backup": return "Cloud Backups";
      case "tasks": return "Google Tasks";
      case "reports": return "Activity Reports";
      case "chat": return "Gemini Assistant";
      default: return id;
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl min-h-14 items-center justify-between px-4 sm:px-6 py-2 gap-3 flex-wrap">
        {/* Brand Logo (Mobile) & Breadcrumb (Desktop) */}
        <div className="flex items-center gap-3">
          {/* Mobile Brand Logo */}
          <div className="flex md:hidden items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xs">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Drive Organizer
            </span>
          </div>

          {/* Desktop Breadcrumb & View Status */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xs">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-medium text-slate-500 dark:text-slate-400">Workspace</span>
              <span className="text-slate-400 dark:text-slate-600">/</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`breadcrumb-${activeTab}`}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="font-semibold text-slate-900 dark:text-slate-100"
                >
                  {getTabLabel(activeTab)}
                </motion.span>
              </AnimatePresence>
            </div>
            {isSyncing && (
              <span className="flex items-center gap-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 ml-2">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Syncing...</span>
              </span>
            )}
          </div>
        </div>

        {/* In-Flow Header Actions (Normal State) */}
        {!isEmptyState && (
          <div className="flex items-center gap-2 order-3 sm:order-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`header-actions-${tabKey}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2"
              >
                <ContextualActionToolbar
                  activeTab={tabKey}
                  isEmptyState={false}
                  onActionSelect={onActionSelect || (() => {})}
                  onFileDrop={onFileDrop}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* User Controls */}
        <div className="flex items-center gap-2 order-2 sm:order-3">
          {user ? (
            <>
              {isSyncing && (
                <div className="flex md:hidden items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                </div>
              )}

              <button
                onClick={toggleTheme}
                title="Toggle Theme"
                className="rounded-lg p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  referrerPolicy="no-referrer"
                  alt={user.displayName || "Avatar"}
                  className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold text-xs">
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}

              <button
                id="header-logout-btn"
                onClick={onLogout}
                title="Sign out"
                className="md:hidden rounded-lg p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={toggleTheme}
              title="Toggle Theme"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* In-Flow Empty State Intent */}
      <AnimatePresence mode="wait">
        {isEmptyState && (
          <motion.div
            key={`header-empty-${tabKey}`}
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-4 bg-slate-50/40 dark:bg-slate-900/40"
          >
            <ContextualActionToolbar
              activeTab={tabKey}
              isEmptyState={true}
              onActionSelect={onActionSelect || (() => {})}
              onFileDrop={onFileDrop}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
