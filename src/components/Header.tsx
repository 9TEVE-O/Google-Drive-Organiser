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

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const count = navItems.length;
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % count;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + count) % count;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const targetItem = navItems[nextIndex];
      setActiveTab(targetItem.id);
      const desktopBtn = document.getElementById(targetItem.testId);
      const mobileBtn = document.getElementById(`mobile-${targetItem.testId}`);
      if (desktopBtn && desktopBtn.offsetParent !== null) {
        desktopBtn.focus();
      } else if (mobileBtn) {
        mobileBtn.focus();
      }
    }
  };

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xs transition-colors"
    >
      {/* Primary Top Bar Row — 8px Grid Aligned (min-h-16 = 64px, px-4 = 16px, sm:px-6 = 24px, py-2 = 8px, gap-2/gap-4 = 8px/16px) */}
      <div className="mx-auto flex max-w-7xl min-h-16 items-center justify-between px-4 sm:px-6 py-2 gap-2 sm:gap-4">
        {/* Zone 1: Brand & Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <button 
            type="button"
            onClick={() => setActiveTab("drive")}
            aria-label="Drive Organizer Home - Switch to Google Drive view"
            className="flex items-center gap-2 text-left group cursor-pointer rounded-xl p-1 transition-all hover:bg-slate-100/70 dark:hover:bg-slate-800/70 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Drive Organizer Home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Drive Organizer
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-600 dark:text-slate-400 font-mono tracking-tight">
                AI Workspace Companion
              </span>
            </div>
          </button>

          {isSyncing && (
            <span
              role="status"
              aria-live="polite"
              className="hidden sm:flex items-center gap-2 text-xs font-mono text-indigo-700 dark:text-indigo-300 pl-2 border-l border-slate-200 dark:border-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Syncing</span>
            </span>
          )}
        </div>

        {/* Zone 2: Persistent Top Navigation Tabs (Tablet 768px & Desktop 1280px+) */}
        {user && (
          <nav 
            aria-label="Primary Workspace Views"
            className="hidden md:flex items-center overflow-x-auto no-scrollbar"
          >
            <div
              role="tablist"
              aria-orientation="horizontal"
              className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl border border-slate-200/70 dark:border-slate-700/70"
            >
              {navItems.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={item.testId}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    aria-controls={`panel-${item.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(item.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`relative flex items-center gap-2 px-3 py-2 min-h-[36px] text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-98 ${
                      isActive
                        ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs ring-1 ring-slate-200/80 dark:ring-slate-700/80"
                        : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-700/60"
                    }`}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`h-4 w-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}
                    />
                    <span>{item.shortLabel}</span>
                    {item.badge !== undefined && (
                      <span
                        aria-label={`${item.badge} items`}
                        className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                          isActive 
                            ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200"
                            : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.hasDot && (
                      <span
                        aria-label="Active organization plan ready"
                        className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {/* Zone 3: Actions & Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* In-Flow Header Actions (Desktop 1280px+ Normal State) */}
          {user && !isEmptyState && (
            <div className="hidden xl:flex items-center gap-2">
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

          {/* Sync indicator for mobile (375px) */}
          {isSyncing && (
            <div
              role="status"
              aria-label="Synchronising workspace"
              className="flex sm:hidden items-center p-2 text-xs text-indigo-600 dark:text-indigo-400 font-mono"
            >
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
          )}

          {/* Theme Switcher — 40px touch target */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-pressed={isDarkMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 dark:active:bg-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {isDarkMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>

          {/* Authenticated User Status & Logout */}
          {user && (
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  referrerPolicy="no-referrer"
                  alt={user.displayName ? `${user.displayName} avatar` : "User avatar"}
                  className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-semibold text-xs shrink-0 shadow-xs"
                >
                  {user.displayName?.charAt(0) || "U"}
                </div>
              )}

              <button
                type="button"
                id="header-logout-btn"
                onClick={onLogout}
                title="Sign out of Google Workspace"
                aria-label="Sign out of Google Workspace"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 py-2 text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden xl:inline text-xs font-medium">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Mobile Top Tab Bar (375px - 767px) — 8px Grid Aligned */}
      {user && (
        <nav 
          aria-label="Mobile workspace navigation"
          className="flex md:hidden items-center border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/80"
        >
          <div
            role="tablist"
            aria-orientation="horizontal"
            className="flex items-center gap-1 px-2 py-2 overflow-x-auto no-scrollbar w-full"
          >
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={`mobile-${item.id}`}
                  id={`mobile-${item.testId}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(item.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-98 ${
                    isActive
                      ? "bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs border border-indigo-200 dark:border-indigo-700/70"
                      : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`h-4 w-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}
                  />
                  <span>{item.shortLabel}</span>
                  {item.badge !== undefined && (
                    <span className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                      isActive 
                        ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200"
                        : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}>
                      {item.badge}
                    </span>
                  )}
                  {item.hasDot && (
                    <span
                      aria-label="Active organization plan ready"
                      className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
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
