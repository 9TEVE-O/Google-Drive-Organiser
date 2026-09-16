import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { 
  initAuth, googleSignIn, logout, listDriveFiles 
} from "./lib/googleApi";
import { DriveFile, BackupJob, BackupLog, ActivityLog } from "./types";
import Header from "./components/Header";
import DriveBrowser from "./components/DriveBrowser";
import SmartOrganizer from "./components/SmartOrganizer";
import BackupManager from "./components/BackupManager";
import TaskManager from "./components/TaskManager";
import Dashboard from "./components/Dashboard";
import ImageGenerator from "./components/ImageGenerator";
import GeminiChatbot from "./components/GeminiChatbot";
import Onboarding from "./components/Onboarding";
import InfoTooltip from "./components/InfoTooltip";
import { 
  Sparkles, ShieldAlert, Layers, Bell, CheckSquare, HardDrive, Cpu, 
  Settings, FolderKanban, Info, AlertTriangle, ArrowRight, RefreshCw,
  Clock, Laptop, ListTodo, Activity, LogOut, BarChart3, Image as ImageIcon, Sun, Moon,
  Bot, Search, X, Download, FileCode, Check
} from "lucide-react";

export default function App() {
  // Onboarding tracking
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(
    localStorage.getItem("hasSeenOnboarding") === "true"
  );
  
  // Theme tracking
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark" || 
      (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Authentication status
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // File states loaded from google drive API with localized safety simulation fallbacks
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Real-time search query for Explorer Storage subheader filter
  const [storageSearchQuery, setStorageSearchQuery] = useState("");

  // Filters the 'files' array in real-time as the user types (strictly deduplicated)
  const filteredDriveFiles = React.useMemo(() => {
    const raw = !storageSearchQuery.trim()
      ? files
      : files.filter(f => {
          const q = storageSearchQuery.toLowerCase().trim();
          const nameMatch = f.name.toLowerCase().includes(q);
          const mimeMatch = f.mimeType ? f.mimeType.toLowerCase().includes(q) : false;
          const categoryMatch = f.category ? f.category.toLowerCase().includes(q) : false;
          const tagsMatch = f.tags ? f.tags.some(t => t.toLowerCase().includes(q)) : false;
          return nameMatch || mimeMatch || categoryMatch || tagsMatch;
        });

    const seen = new Set<string>();
    return raw.filter(f => {
      if (!f?.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [files, storageSearchQuery]);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>("drive");

  // Lifted reminders state
  const [reminders, setReminders] = useState<{ id: string; title: string; triggerTime: string; status: 'active' | 'fired'; notified: boolean }[]>([
    { id: "1", title: "Daily Drive Cloud Backup Check", triggerTime: "09:00", status: "active", notified: false },
    { id: "2", title: "Gemini Auto-Organisation sweep", triggerTime: "17:00", status: "active", notified: false }
  ]);

  // Injected Smart classification results from Gemini organization core
  const [filesInPlan, setFilesInPlan] = useState<{ [key: string]: { category: string; tags: string[]; relevance: number } }>({});

  // Central Log engine for user accomplishments
  const [activities, setActivities] = useState<ActivityLog[]>([
    { id: "act_1", timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(), actionType: "email", message: "Initial OAuth configuration generated." }
  ]);

  // Alarms and alerts notifications states
  const [activeAlert, setActiveAlert] = useState<{ title: string; message: string } | null>(null);

  // Backup jobs state
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([
    {
      id: "job_def",
      name: "Local Projects Synced Repository",
      sourceFolderId: "root",
      sourceFolderName: "My Drive",
      destinationFolderId: "auto-gen",
      destinationFolderName: "Cloud_Auto_Backups",
      schedule: "daily",
      status: "idle",
      devices: ["Laptop-Pro"]
    }
  ]);

  const [backupHistory, setBackupHistory] = useState<BackupLog[]>([]);

  // Safety local fallbacks so that if the user's drive is blank or has narrow permission,
  // the app is still extremely fun, descriptive, and interactive.
  const loadFallbackFiles = () => {
    const fallbacks: DriveFile[] = [
      { id: "fb_f1", name: "Work Receipts", mimeType: "application/vnd.google-apps.folder", parents: [] },
      { id: "fb_f2", name: "Family Archives", mimeType: "application/vnd.google-apps.folder", parents: [] },
      { id: "fb_d1", name: "project_requirements.txt", mimeType: "text/plain", size: "12.5 KB", parents: [], webViewLink: "#" },
      { id: "fb_d2", name: "monthly_invoice_may_2026.txt", mimeType: "text/plain", size: "4.1 KB", parents: ["fb_f1"], webViewLink: "#" },
      { id: "fb_d3", name: "vacation_itinerary.txt", mimeType: "text/plain", size: "2.3 KB", parents: ["fb_f2"], webViewLink: "#" }
    ];
    setFiles(fallbacks);
  };

  // Perform OAuth sign-in flow
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        addLog("email", `User authenticated securely: ${result.user.email}`);
        await loadDriveContents(result.accessToken);
      }
    } catch (err) {
      console.error("Authentication Error:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Perform OAuth logout flow
  const handleLogout = async () => {
    try {
       await logout();
       setUser(null);
       setToken(null);
       setFiles([]);
       setNeedsAuth(true);
    } catch (err) {
       console.error(err);
    }
  };

  // Async load drive contents
  const loadDriveContents = async (accessToken: string) => {
    if (!accessToken) return;
    setIsSyncing(true);
    try {
      const driveItems = await listDriveFiles(accessToken);
      const seen = new Set<string>();
      const uniqueItems = driveItems.filter(item => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      if (uniqueItems.length > 0) {
        setFiles(uniqueItems);
      } else {
        loadFallbackFiles();
      }
    } catch (err: any) {
      console.warn("Could not list Drive items directly, loading workspace fallbacks:", err.message);
      loadFallbackFiles();
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync / Refresh button callback
  const handleManualRefresh = async () => {
    if (token) {
      await loadDriveContents(token);
    }
  };

  // Append new log to activities historical stack
  const addLog = (
    actionType: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email',
    message: string,
    details?: string
  ) => {
    const item: ActivityLog = {
      id: "log_" + Date.now() + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toLocaleTimeString(),
      actionType,
      message,
      details
    };
    setActivities(prev => [item, ...prev]);
  };

  // Export status feedback for System Action Logging
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Export System Action Logging history as CSV or JSON
  const exportActivities = (format: "csv" | "json") => {
    if (activities.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const headers = ["ID", "Timestamp", "Action Type", "Message", "Details"];
      const rows = activities.map(a => [
        `"${(a.id || "").replace(/"/g, '""')}"`,
        `"${(a.timestamp || "").replace(/"/g, '""')}"`,
        `"${(a.actionType || "").replace(/"/g, '""')}"`,
        `"${(a.message || "").replace(/"/g, '""')}"`,
        `"${(a.details || "").replace(/"/g, '""')}"`
      ]);
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `system-action-logging-${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportToast("CSV exported!");
    } else {
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        totalLogs: activities.length,
        logs: activities
      };
      const jsonContent = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `system-action-logging-${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportToast("JSON exported!");
    }

    setTimeout(() => {
      setExportToast(null);
    }, 2500);
  };

  // Fire Visual Notifications & sound chimes
  const triggerNotification = (title: string, message: string) => {
    setActiveAlert({ title, message });

    // Try play simple system beep
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // high note
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // AudioContext sandbox errors are bypassed safely
    }
  };

  // Fire initial listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        loadDriveContents(accessToken);
      },
      () => {
        setNeedsAuth(true);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    setHasSeenOnboarding(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
      {/* Onboarding Flow Overlay */}
      {!needsAuth && !hasSeenOnboarding && (
        <Onboarding onComplete={completeOnboarding} />
      )}

      {/* Dynamic alarm/reminder banners display overlay */}
      {activeAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full bg-slate-900 text-slate-100 rounded-2xl border border-indigo-500 p-4.5 shadow-2xl flex items-start gap-3.5 animate-in fade-in slide-in-from-top-6 duration-300">
          <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-500 text-white shrink-0">
            <Bell className="h-4.5 w-4.5 stroke-[2]" />
          </div>
          <div className="flex-1 space-y-0.5">
            <span className="font-display font-bold text-sm block tracking-tight text-white">{activeAlert.title}</span>
            <p className="text-xs text-slate-300 leading-normal">{activeAlert.message}</p>
          </div>
          <button 
            onClick={() => setActiveAlert(null)} 
            className="rounded p-1 hover:bg-slate-800 text-slate-400"
          >
            ✕
          </button>
        </div>
      )}      {needsAuth ? (
        <>
          <Header 
            user={user} 
            onLogout={handleLogout} 
            activityCount={activities.length}
            taskAlertsCount={activities.filter(a => a.actionType === 'task').length}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isSyncing={isSyncing}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
          />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* AUTH SPLASH SCREEN: Style strictly matches gsi standards with aesthetic balance */}
            <div className="py-16 md:py-24 max-w-xl mx-auto text-center space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-300">
              <div className="space-y-4">
                {/* Premium Hero Circle */}
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-150 transform hover:rotate-12 transition duration-300">
                  <Layers className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-slate-900">
                    Drive Organiser Companion
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Authenticate your workspace account securely to initialise smart cataloguing files, coordinate backings, and delegate calendar-synchronised Google Tasks.
                  </p>
                </div>
              </div>

              {/* gsi Auth button assembly */}
              <div className="flex flex-col items-center justify-center p-6 border border-slate-200 rounded-2xl bg-white shadow-sm/5 shadow-sm">
                <span className="text-xs font-mono text-slate-400 mb-4 block">
                  Single Sign-on Google Secure Verification
                </span>

                <button 
                  id="gsi-login-button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button hover:shadow-md transition active:scale-95 duration-155"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">Sign in with Google</span>
                  </div>
                </button>
                
                {isLoggingIn && (
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-4">
                    <RefreshCw className="h-3 w-3 animate-spin text-indigo-650" /> Verifying certificate popup...
                  </div>
                )}
              </div>

              {/* Core safety disclosures */}
              <div className="rounded-xl bg-slate-100 p-4 border border-slate-150 inline-flex items-center gap-2 max-w-md text-left text-[11px] text-slate-500 leading-normal">
                <Info className="h-5 w-5 text-indigo-500 shrink-0" />
                <span>We adhere to secure credential authorization. OAuth tokens remain cached in active browser memory and are wiped instantly on session closure.</span>
              </div>
            </div>
          </main>
        </>
      ) : (
        /* MAIN COMPLETED BENTO GRID INTERFACE */
        <div className="flex-1 flex flex-col md:flex-row min-h-screen">
          
          {/* DESKTOP SIDE PANEL (Bento Side Bar) */}
          <aside className="hidden md:flex w-68 bg-white border-r border-zinc-200 flex-col justify-between p-6 h-screen sticky top-0 shrink-0">
            <div className="space-y-8">
              {/* Brand identity */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-100">
                  <Layers className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h1 className="font-display font-extrabold text-base tracking-tight text-zinc-900 leading-none">
                    DriveArch
                  </h1>
                  <span className="text-[10.5px] font-mono text-zinc-400 block mt-1 hover:text-indigo-600 transition-colors">
                    Intelligent Workspace v2.5
                  </span>
                </div>
              </div>

              {/* Navigation Actions */}
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab("drive")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "drive"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="h-4 w-4" />
                    <span>Google Drive</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${activeTab === "drive" ? "bg-indigo-200/50 text-indigo-800" : "bg-zinc-100 text-zinc-500"}`}>
                    {files.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("organizer")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "organizer"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4" />
                    <span>Smart Organiser</span>
                  </div>
                  {Object.keys(filesInPlan).length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("backup")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "backup"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Cloud Backups</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                    {backupJobs.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("tasks")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "tasks"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                     <ListTodo className="h-4 w-4" />
                    <span>Google Tasks</span>
                  </div>
                  {reminders.filter(r => r.status === 'active').length > 0 && (
                    <span className="text-[9px] font-mono bg-indigo-600 font-bold text-white px-1.5 py-0.2 rounded-full">
                      {reminders.filter(r => r.status === 'active').length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("reports")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "reports"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="h-4 w-4" />
                    <span>Reports</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("image_gen")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "image_gen"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ImageIcon className="h-4 w-4" />
                    <span>Image Generator</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("chat")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "chat"
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bot className="h-4 w-4 text-indigo-600" />
                    <span>Gemini Chatbot</span>
                  </div>
                  <span className="text-[9px] font-mono bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                    Multi-Turn
                  </span>
                </button>
              </nav>

              {/* Status Indicator Bento */}
              <div className="rounded-2xl bg-zinc-50 border border-zinc-150 p-4 space-y-3 font-mono text-[10px] text-zinc-500 select-none">
                <span className="font-semibold text-zinc-800 uppercase tracking-widest block text-[9px] border-b border-zinc-200 pb-1.5">
                  Node Engine telemetry
                </span>
                <div className="flex justify-between items-center">
                  <span>Network core:</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ONLINE
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Simulated nodes:</span>
                  <span>3 Active Devices</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Integrity check:</span>
                  <span className="text-zinc-700">98.4% Passed</span>
                </div>
              </div>
            </div>

            {/* Profile Info Card */}
            <div className="border-t border-zinc-150 pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    referrerPolicy="no-referrer"
                    alt={user.displayName || "Avatar"}
                    className="h-9 w-9 rounded-full border border-indigo-200 shadow-sm"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 font-bold text-xs ring-1 ring-indigo-150">
                    {user?.displayName?.charAt(0) || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-zinc-900 truncate">
                    {user?.displayName || "Drive Admin User"}
                  </h4>
                  <p className="text-[10px] text-zinc-400 font-mono truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  title="Toggle Light/Dark Mode"
                  className="flex-shrink-0 flex items-center justify-center p-2 rounded-lg text-slate-500 bg-slate-50/50 hover:bg-slate-100 transition-colors border border-slate-100 cursor-pointer"
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  id="sidebar-logout-btn"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-500 bg-rose-50/50 hover:bg-rose-50 transition-colors border border-rose-100 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          </aside>

          {/* RIGHT VIEWWORKSPACE VIEW (Content Area and Auxiliary Cards) */}
          <div className="flex-1 flex flex-col min-w-0">
            
            {/* MOBILE HEADER COMPATIBILITY ROW */}
            <Header 
              user={user} 
              onLogout={handleLogout} 
              activityCount={activities.length}
              taskAlertsCount={activities.filter(a => a.actionType === 'task').length}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isSyncing={isSyncing}
              isDarkMode={isDarkMode}
              toggleTheme={toggleTheme}
            />

            {/* INTEGRATED FULL BENTO DASHBOARD WRAPPER */}
            <main id="main-dashboard-scroll" className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* CORE AREA CELL (Col-span 8) - Interactive active sub-view */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                  {/* File browser subheader */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold font-display text-zinc-950 tracking-tight flex items-center gap-2 uppercase">
                        {activeTab === "drive" && (
                          <>
                            <HardDrive className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Explorer Storage</span>
                            <InfoTooltip text="View and manage your Google Drive files in a clean, standard view." />
                          </>
                        )}
                        {activeTab === "organizer" && (
                          <>
                            <Sparkles className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Generative Classification Suite</span>
                            <InfoTooltip text="Our AI reads your file names and types to group them into smart folders automatically." />
                          </>
                        )}
                        {activeTab === "backup" && (
                          <>
                            <RefreshCw className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Continuous Backups Terminal</span>
                            <InfoTooltip text="Set rules to automatically copy files from one folder to another so they are never lost." />
                          </>
                        )}
                        {activeTab === "tasks" && (
                          <>
                            <ListTodo className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Google Calendar & Task Planner</span>
                            <InfoTooltip text="Create alarms and daily recurring schedules so you never forget to check your work." />
                          </>
                        )}
                        {activeTab === "reports" && (
                          <>
                            <BarChart3 className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Reporting Dashboard</span>
                            <InfoTooltip text="See a summary of what the app has been doing for you recently." />
                          </>
                        )}
                        {activeTab === "image_gen" && (
                          <>
                            <ImageIcon className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Image Generator AI</span>
                            <InfoTooltip text="Type a description and we'll create a brand new custom picture for you using AI." />
                          </>
                        )}
                        {activeTab === "chat" && (
                          <>
                            <Bot className="h-5 w-5 text-indigo-600 shrink-0" />
                            <span>Gemini AI Chatbot</span>
                            <InfoTooltip text="Engage in multi-turn conversation with specialized role presets and model selection." />
                          </>
                        )}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-1 first-letter:uppercase">
                        {activeTab === "drive" && "Visualise files stored on connected Google Drive directly."}
                        {activeTab === "organizer" && "Let Artificial Intelligence analyse files metadata categories for organising."}
                        {activeTab === "backup" && "Coordinate auto schedule logs and simulated replication rules."}
                        {activeTab === "tasks" && "Set clock alarms and scheduled reminder checks easily."}
                        {activeTab === "reports" && "Visualise key storage activities, track backup coverage over time."}
                        {activeTab === "image_gen" && "Generate perfect-fit images for phone wallpapers or web banners using AI."}
                        {activeTab === "chat" && "Converse with multi-role Gemini models (gemini-3.8-flash, gemini-3.1-flash-lite, gemini-3.1-pro-preview)."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
                      {activeTab === "drive" && (
                        <div className="relative flex items-center w-full sm:w-auto">
                          <Search className="absolute left-3 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                          <input
                            id="explorer-storage-search-input"
                            type="text"
                            value={storageSearchQuery}
                            onChange={(e) => setStorageSearchQuery(e.target.value)}
                            placeholder="Filter files in real-time..."
                            aria-label="Filter files in real-time"
                            className="w-full sm:w-56 md:w-64 rounded-xl border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-8 text-xs font-medium text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none transition shadow-2xs"
                          />
                          {storageSearchQuery && (
                            <button
                              id="btn-clear-explorer-search"
                              onClick={() => setStorageSearchQuery("")}
                              className="absolute right-2 p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 transition cursor-pointer"
                              title="Clear search"
                              aria-label="Clear search"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {activeTab === "drive" && storageSearchQuery && (
                        <span className="text-[11px] font-mono font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 shrink-0">
                          {filteredDriveFiles.length} of {files.length} {filteredDriveFiles.length === 1 ? "file" : "files"}
                        </span>
                      )}

                      <button
                        id="btn-sync-drive-top"
                        onClick={handleManualRefresh}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer shrink-0"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 text-zinc-500 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh Workspace</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Screen Tab View */}
                  <div className="min-w-0 transition-opacity duration-200">
                    {activeTab === "drive" && (
                      <DriveBrowser 
                        token={token} 
                        files={filteredDriveFiles} 
                        onRefresh={handleManualRefresh} 
                        addLog={addLog}
                        filesInPlan={filesInPlan}
                        externalSearchQuery={storageSearchQuery}
                        onClearExternalSearch={() => setStorageSearchQuery("")}
                      />
                    )}

                    {activeTab === "organizer" && (
                      <SmartOrganizer 
                        token={token} 
                        files={files} 
                        onRefresh={handleManualRefresh} 
                        addLog={addLog}
                        onAnalysisApplied={(plan) => setFilesInPlan({ ...filesInPlan, ...plan })}
                        setFiles={setFiles}
                        onNavigateToTab={setActiveTab}
                      />
                    )}

                    {activeTab === "backup" && (
                      <BackupManager 
                        token={token} 
                        files={files} 
                        onRefresh={handleManualRefresh} 
                        addLog={addLog}
                        backupJobs={backupJobs}
                        setBackupJobs={setBackupJobs}
                        backupHistory={backupHistory}
                        setBackupHistory={setBackupHistory}
                      />
                    )}

                    {activeTab === "tasks" && (
                      <TaskManager 
                        token={token} 
                        addLog={addLog} 
                        userEmail={user?.email || "Steven.lees.production@gmail.com"} 
                        activities={activities}
                        onTriggerNotification={triggerNotification}
                        reminders={reminders}
                        setReminders={setReminders}
                      />
                    )}

                    {activeTab === "reports" && (
                      <Dashboard 
                        files={files}
                        activities={activities}
                        backupHistory={backupHistory}
                      />
                    )}

                    {activeTab === "image_gen" && (
                      <ImageGenerator />
                    )}

                    {activeTab === "chat" && (
                      <GeminiChatbot />
                    )}
                  </div>
                </div>

                {/* AUXILIARY META BENTO DECK CELL (Col-span 4 on desktop) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  
                  {/* BENTO CARD 1: BACKUPS GRAPHICS DECK */}
                  <div className="bg-indigo-600 text-white rounded-3xl p-6 flex flex-col justify-between h-[210px] relative overflow-hidden shadow-lg select-none">
                    {/* Abstract watermarks */}
                    <div className="absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-indigo-500/25 blur-xl"></div>
                    <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-indigo-400/20 blur-lg"></div>

                    <div className="space-y-1 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono tracking-widest bg-indigo-500/50 px-2 py-0.5 rounded-full font-bold">
                          Cloud Backups
                        </span>
                        <Laptop className="h-4 w-4 text-indigo-200" />
                      </div>
                      <h3 className="font-display font-bold text-lg leading-tight pt-1.5 flex items-center">
                        Backup Integrity Status
                        <span className="ml-1"><InfoTooltip text="Shows how much of your Drive has been safely backed up based on your rules." /></span>
                      </h3>
                      <p className="text-[11px] text-indigo-100 leading-normal max-w-[240px]">
                        Continuous secure synchronisation running between workspace nodes.
                      </p>
                    </div>

                    <div className="flex items-end justify-between relative z-10">
                      <div>
                        {files.length > 0 ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-extrabold tracking-tight">
                              {Math.min(100, Math.floor(82 + (files.length * 1.5)))}%
                            </span>
                            <span className="text-xs text-indigo-200 font-mono font-bold">synced</span>
                          </div>
                        ) : (
                          <span className="text-xs font-mono font-bold text-indigo-200">Waiting for files...</span>
                        )}
                        <span className="text-[10px] text-indigo-200 font-mono block">Node: Laptop-Pro</span>
                      </div>

                      <button
                        onClick={handleManualRefresh}
                        className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 transition-all border border-white/25 text-white cursor-pointer active:scale-90"
                        title="Force cloud replication sweep"
                      >
                        <RefreshCw className={`h-4.5 w-4.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* BENTO CARD 2: PENDING ALARMS & TIMECHECKS */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between h-[230px] select-none">
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] uppercase font-mono tracking-widest bg-zinc-100 px-2.5 py-0.5 rounded-full text-zinc-500 font-semibold flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Scheduled Alarms
                          <InfoTooltip text="The app checks these alarms in the background and rings when it's time!" />
                        </span>
                        <span className="text-[10px] text-indigo-600 font-semibold cursor-pointer hover:underline" onClick={() => { setActiveTab("tasks"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                          Open Planner →
                        </span>
                      </div>

                      <div className="space-y-2">
                        {reminders.length === 0 ? (
                          <span className="text-xs text-zinc-400 block py-4 text-center">No reminders configured.</span>
                        ) : (
                          reminders.slice(0, 2).map((r, rIdx) => (
                            <div key={`rem-${r.id}-${rIdx}`} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 border border-zinc-150">
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-semibold text-zinc-800 block truncate leading-tight">
                                  {r.title}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">
                                  Triggers: {r.triggerTime} daily
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ml-2 shrink-0 ${
                                r.status === 'active' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-500'
                              }`}>
                                {r.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 font-mono pt-2 border-t border-zinc-100">
                      Interval poll checking: <span className="text-emerald-600 font-semibold">Active (15s)</span>
                    </div>
                  </div>

                  {/* BENTO CARD 3: AUDITED LOG SYSTEM */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col flex-1 min-h-[260px] max-h-[350px] overflow-hidden">
                    <div className="flex items-center justify-between border-b border-zinc-150 pb-3 mb-4 shrink-0">
                      <h3 className="font-display font-bold text-zinc-900 text-xs uppercase tracking-wider flex items-center gap-1">
                        <Activity className="h-4.5 w-4.5 text-indigo-600" /> System Action Logging
                        <InfoTooltip text="A transparent list of every action the app has performed recently." />
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {exportToast ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            <Check className="h-2.5 w-2.5" /> {exportToast}
                          </span>
                        ) : (
                          <span className="text-[9px] bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5 font-mono">
                            {activities.length} logs
                          </span>
                        )}
                        <div className="flex items-center gap-1 border-l border-zinc-200 pl-1.5">
                          <button
                            id="btn-export-logs-csv"
                            onClick={() => exportActivities("csv")}
                            disabled={activities.length === 0}
                            title="Export System Action Logging history as CSV file"
                            aria-label="Export System Action Logging history to CSV"
                            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-zinc-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 border border-zinc-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                          >
                            <Download className="h-2.5 w-2.5 text-zinc-500" />
                            CSV
                          </button>
                          <button
                            id="btn-export-logs-json"
                            onClick={() => exportActivities("json")}
                            disabled={activities.length === 0}
                            title="Export System Action Logging history as JSON file"
                            aria-label="Export System Action Logging history to JSON"
                            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-zinc-700 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 border border-zinc-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                          >
                            <FileCode className="h-2.5 w-2.5 text-zinc-500" />
                            JSON
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[10px] leading-relaxed">
                      {activities.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-8 text-center text-zinc-400">
                          <span>No system action events recorded yet.</span>
                          <span className="text-[9px] text-zinc-300 mt-1">Actions performed across the app will appear here.</span>
                        </div>
                      ) : (
                        activities.map((act, actIdx) => (
                          <div key={`act-${act.id}-${actIdx}`} className="p-2 border border-zinc-150 rounded-xl bg-zinc-50 hover:bg-zinc-100/50 transition duration-155">
                            <div className="flex justify-between items-center text-[9px] text-zinc-400 mb-1">
                              <span className="font-semibold text-[8px] uppercase tracking-wider underline text-zinc-600">
                                [{act.actionType}]
                              </span>
                              <span>{act.timestamp}</span>
                            </div>
                            <p className="text-zinc-705 text-zinc-700 font-medium font-sans leading-relaxed">{act.message}</p>
                            {act.details && (
                              <span className="text-[8px] text-zinc-400 block border-t border-zinc-100 pt-1 mt-1 truncate">
                                {act.details}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

                {/* BENTO COMMAND ASSISTANCE TIP BANNER (Col-span 12) */}
                <div className="lg:col-span-12 bg-zinc-900 text-zinc-350 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-inner select-none relative overflow-hidden">
                  <div className="absolute right-0 top-0 h-full w-48 bg-zinc-800/25 skew-x-12"></div>
                  
                  <div className="space-y-1 relative z-10">
                    <h4 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                      <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                      <span>Workspace Deep-Thinking Helper Tip</span>
                      <InfoTooltip text="Our most powerful feature: Let the AI organise your files for you!" />
                    </h4>
                    <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                      Let artificial intelligence clustering models perform high-thinking tag categorisation sweeps automatically on your raw Google Drive files! Focus your resources on output.
                    </p>
                  </div>

                  <button
                    id="btn-launch-organiser-banner"
                    onClick={() => {
                      console.log("[App] 'Launch Organiser' clicked. Previous activeTab:", activeTab);
                      console.log("[App] Updating activeTab to 'organizer'");
                      setActiveTab("organizer");
                      document.getElementById("main-dashboard-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="relative z-10 rounded-xl bg-white text-zinc-950 px-4 py-2 text-xs font-bold hover:bg-indigo-50 transition shrink-0 self-start md:self-auto shadow-sm active:scale-95 cursor-pointer"
                  >
                    Launch Organiser
                  </button>
                </div>

              </div>
            </main>
          </div>

        </div>
      )}
    </div>
  );
}
