import React from "react";
import { User } from "firebase/auth";
import { HardDrive, LogOut, CheckSquare, Bell, RefreshCw, Layers, Moon, Sun, Bot, Sparkles } from "lucide-react";

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
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md md:hidden" data-revert-dark="false">
      <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-100 data-preserve-color">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              DriveOrganiser
            </span>
            <span className="ml-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 font-mono">
              v2.5
            </span>
          </div>
        </div>

        {/* Dynamic Navigation Tabs */}
        {user && (
          <nav className="hidden md:flex space-x-1">
            <button
              id="nav-btn-drive"
              onClick={() => setActiveTab("drive")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "drive"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Google Drive
            </button>
            <button
              id="nav-btn-organizer"
              onClick={() => setActiveTab("organizer")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "organizer"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              High-Thinking Organiser
            </button>
            <button
              id="nav-btn-backup"
              onClick={() => setActiveTab("backup")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "backup"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Cloud Backups
            </button>
            <button
              id="nav-btn-tasks"
              onClick={() => setActiveTab("tasks")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "tasks"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Google Tasks
            </button>
            <button
              id="nav-btn-chat"
              onClick={() => setActiveTab("chat")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>AI Chat</span>
            </button>
          </nav>
        )}

        {/* User Stats & Controls */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* Sync Spinner */}
              {isSyncing && (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 data-preserve-color">
                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-600" />
                  <span className="font-mono text-[10px] hidden sm:inline">syncing</span>
                </div>
              )}

              {/* Task Alerts Indicator */}
              <div className="relative cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors">
                <CheckSquare className="h-5 w-5" />
                {taskAlertsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                  </span>
                )}
              </div>

              {/* User Profile Info */}
              <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
                <button
                  onClick={toggleTheme}
                  title="Toggle Light/Dark Mode"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                <div className="hidden lg:flex flex-col items-end pl-2 border-l border-slate-200">
                  <span className="text-xs font-semibold text-slate-850 max-w-[150px] truncate">
                    {user.displayName || "Drive Sync User"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                    {user.email}
                  </span>
                </div>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    referrerPolicy="no-referrer"
                    alt={user.displayName || "Avatar"}
                    className="h-8 w-8 rounded-full border border-indigo-200 shadow-inner"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs ring-1 ring-indigo-200">
                    {user.displayName?.charAt(0) || "U"}
                  </div>
                )}
                
                {/* Logout Button */}
                <button
                  id="header-logout-btn"
                  onClick={onLogout}
                  title="Sign out of Google"
                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                title="Toggle Light/Dark Mode"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors mr-2"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> Status: Unauthenticated
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Nav Bar */}
      {user && (
        <div className="flex md:hidden border-t border-slate-100 bg-slate-50 px-2 py-1 justify-around">
          <button
            onClick={() => setActiveTab("drive")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "drive" ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            Drive
          </button>
          <button
            onClick={() => setActiveTab("organizer")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "organizer" ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            Organiser
          </button>
          <button
            onClick={() => setActiveTab("backup")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "backup" ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            Backups
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "tasks" ? "text-indigo-600" : "text-slate-550"
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "reports" ? "text-indigo-600" : "text-slate-550"
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab("image_gen")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "image_gen" ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex flex-col items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium ${
              activeTab === "chat" ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            Chat
          </button>
        </div>
      )}
    </header>
  );
}
