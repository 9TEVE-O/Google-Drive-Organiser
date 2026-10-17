import React from "react";
import { User } from "firebase/auth";
import { 
  RefreshCw, Layers, Moon, Sun, LogOut, HardDrive, 
  FolderKanban, ListTodo, BarChart3, Bot, FileSpreadsheet, Folder
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ContextualActionToolbar, { DashboardTab } from "./ContextualActionToolbar";

interface HeaderProps {
  user: User | null;
  onLogout: () => Promise<void>;
  activityCount?: number;
  taskAlertsCount?: number;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSyncing: boolean;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isEmptyState?: boolean;
  onActionSelect?: (actionId: string) => void;
  onFileDrop?: (files: FileList) => void;
  fileCount?: number;
  activeRemindersCount?: number;
  backupJobsCount?: number;
  hasPlan?: boolean;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  hasDot?: boolean;
  testId: string;
}

export default function Header({
  user,
  onLogout,
  activityCount = 0,
  taskAlertsCount = 0,
  activeTab,
  setActiveTab,
  isSyncing,
  isDarkMode,
  toggleTheme,
  isEmptyState = false,
  onActionSelect,
  onFileDrop,
  fileCount = 0,
  activeRemindersCount = 0,
  backupJobsCount = 0,
  hasPlan = false,
}: HeaderProps) {
  const tabKey: DashboardTab = (
    ["drive", "sheets", "organizer", "backup", "tasks", "reports", "chat"].includes(activeTab)
      ? activeTab
      : "drive"
  ) as DashboardTab;

  const navItems: NavItem[] = [
    {
      id: "drive",
      label: "Google Drive",
      shortLabel: "Drive",
      icon: HardDrive,
      badge: fileCount > 0 ? fileCount : undefined,
      testId: "nav-btn-drive"
    },
    {
      id: "organizer",
      label: "Smart Organizer",
      shortLabel: "Organizer",
      icon: FolderKanban,
      hasDot: hasPlan,
      testId: "nav-btn-organizer"
    },
    {
      id: "backup",
      label: "Cloud Backups",
      shortLabel: "Backups",
      icon: RefreshCw,
      badge: backupJobsCount > 0 ? backupJobsCount : undefined,
      testId: "nav-btn-backup"
    },
    {
      id: "tasks",
      label: "Google Tasks",
      shortLabel: "Tasks",
      icon: ListTodo,
      badge: activeRemindersCount > 0 ? activeRemindersCount : undefined,
      testId: "nav-btn-tasks"
    },
    {
      id: "reports",
      label: "Activity Reports",
      shortLabel: "Reports",
      icon: BarChart3,
      testId: "nav-btn-reports"
    },
    {
      id: "chat",
      label: "Gemini Assistant",
      shortLabel: "Assistant",
      icon: Bot,
      testId: "nav-btn-chat"
    },
    {
      id: "sheets",
      label: "Google Sheets",
      shortLabel: "Sheets",
      icon: FileSpreadsheet,
      testId: "nav-btn-sheets"
    }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xs transition-colors">
      {/* Primary Top Bar Row */}
      <div className="mx-auto flex max-w-7xl min-h-14 items-center justify-between px-3 sm:px-6 py-2 gap-2 sm:gap-4">
        {/* Zone 1: Brand & Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <button 
            type="button"
            onClick={() => setActiveTab("drive")}
            className="flex items-center gap-2.5 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl p-0.5"
            title="Drive Organizer Home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Drive Organizer
              </span>
              <span className="hidden sm:inline-block text-[10px] text-slate-400 dark:text-slate-500 font-mono tracking-tight -mt-0.5">
                AI Workspace Companion
              </span>
            </div>
          </button>

          {isSyncing && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400 pl-1 border-l border-slate-200 dark:border-slate-800">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Syncing</span>
            </span>
          )}
        </div>

        {/* Zone 2: Persistent Top Navigation Tabs (Desktop & Tablet) */}
        {user && (
          <nav 
            aria-label="Workspace navigation"
            className="hidden md:flex items-center gap-1 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={item.testId}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 font-semibold shadow-xs ring-1 ring-slate-200/60 dark:ring-slate-700/60"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                  <span>{item.shortLabel}</span>
                  {item.badge !== undefined && (
                    <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-md ${
                      isActive 
                        ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                        : "bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                    }`}>
                      {item.badge}
                    </span>
                  )}
                  {item.hasDot && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Actions & Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* In-Flow Header Actions (Normal State) */}
          {user && !isEmptyState && (
            <div className="hidden lg:flex items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`header-actions-${tabKey}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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

          {/* Sync indicator for mobile */}
          {isSyncing && (
            <div className="flex sm:hidden items-center text-xs text-indigo-600 dark:text-indigo-400 font-mono">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            </div>
          )}

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle color theme"
            className="rounded-lg p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Authenticated User Status & Logout */}
          {user && (
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  referrerPolicy="no-referrer"
                  alt={user.displayName || "Avatar"}
                  className="h-7 w-7 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold text-xs shrink-0 shadow-xs">
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}

              <button
                type="button"
                id="header-logout-btn"
                onClick={onLogout}
                title="Sign out of Google Workspace"
                aria-label="Sign out"
                className="flex items-center gap-1 rounded-lg p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden xl:inline text-xs font-medium">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Mobile Top Tab Bar (Replaces bottom navigation bar with persistent top tabs) */}
      {user && (
        <nav 
          aria-label="Mobile workspace navigation"
          className="flex md:hidden items-center gap-1 px-2.5 py-1.5 overflow-x-auto no-scrollbar border-t border-slate-200/70 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-900/60"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={`mobile-${item.id}`}
                id={`mobile-${item.testId}`}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs border border-indigo-200 dark:border-indigo-700/60"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`} />
                <span>{item.shortLabel}</span>
                {item.badge !== undefined && (
                  <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-md ${
                    isActive 
                      ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                      : "bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                  }`}>
                    {item.badge}
                  </span>
                )}
                {item.hasDot && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      )}

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
