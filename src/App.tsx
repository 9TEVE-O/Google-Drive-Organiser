import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { 
  initAuth, googleSignIn, logout, listDriveFiles, isPopupDismissedError, uploadDriveBlob,
  createDriveFolder, updateDriveTextFile, getDriveTextFileContent, moveDriveFile, sendGmailReport
} from "./lib/googleApi";
import { DriveFile, BackupJob, BackupLog, ActivityLog, SmartTaskReminder, EmailApprovalRequest } from "./types";
import Header from "./components/Header";
import DriveBrowser from "./components/DriveBrowser";
import SmartOrganizer from "./components/SmartOrganizer";
import BackupManager from "./components/BackupManager";
import TaskManager from "./components/TaskManager";
import Dashboard from "./components/Dashboard";
import GeminiChatbot from "./components/GeminiChatbot";
import SheetsManager from "./components/SheetsManager";
import Onboarding from "./components/Onboarding";
import InfoTooltip from "./components/InfoTooltip";
import NeuralSynapseCanvas from "./components/NeuralSynapseCanvas";
import SetReminderModal from "./components/SetReminderModal";
import EmailApprovalModal from "./components/EmailApprovalModal";
import { AuthTransitionPortal, AuthPortalPhase } from "./components/AuthTransitionPortal";
import { evaluateFilesBatch } from "./lib/decisionEngine";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, ShieldAlert, Layers, Bell, CheckSquare, HardDrive, Cpu, 
  Settings, FolderKanban, Info, AlertTriangle, ArrowRight, RefreshCw,
  Clock, Laptop, ListTodo, Activity, LogOut, BarChart3, Sun, Moon,
  Bot, Search, X, Download, FileCode, Check, FileSpreadsheet, Folder
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
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authPhase, setAuthPhase] = useState<AuthPortalPhase>("idle");

  // File states loaded from google drive API with localized safety simulation fallbacks
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [workspaceAsyncState, setWorkspaceAsyncState] = useState<{
    status: "idle" | "loading" | "success" | "empty" | "failed";
    message: string | null;
    retryFn: (() => Promise<void>) | null;
  }>({ status: "idle", message: null, retryFn: null });

  // Filters the 'files' array in real-time as the user types (strictly deduplicated)
  const filteredDriveFiles = React.useMemo(() => {
    const seen = new Set<string>();
    return files.filter(f => {
      if (!f?.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [files]);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<string>("drive");

  // Lifted smart reminders state
  const [reminders, setReminders] = useState<SmartTaskReminder[]>([
    { 
      id: "rem_1", 
      title: "Daily Drive Cloud Backup Check", 
      description: "Verify automated backup jobs and cloud sync integrity.",
      actionType: "reminder_only",
      triggerDate: new Date().toISOString().slice(0, 10),
      triggerTime: "09:00", 
      recurrence: "daily",
      notifyInApp: true,
      notifyEmail: false,
      status: "active", 
      notified: false,
      executed: false,
      createdAt: new Date().toISOString()
    },
    { 
      id: "rem_2", 
      title: "Quarterly Invoices Folder Sweep", 
      description: "Ensure Q2 and Q3 invoice receipts are archived.",
      actionType: "create_folder",
      actionPayload: { folderName: "Invoices_2026_Archived" },
      triggerDate: new Date().toISOString().slice(0, 10),
      triggerTime: "17:00", 
      recurrence: "monthly",
      notifyInApp: true,
      notifyEmail: true,
      status: "active", 
      notified: false,
      executed: false,
      createdAt: new Date().toISOString()
    }
  ]);

  // Ref tracking current reminders state for thread-safe background interval evaluations
  const remindersRef = useRef<SmartTaskReminder[]>(reminders);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  // Modal and Approval states
  const [isScheduleReminderModalOpen, setIsScheduleReminderModalOpen] = useState(false);
  const [scheduleReminderFile, setScheduleReminderFile] = useState<DriveFile | null>(null);
  // H-01: Use a FIFO queue for email approvals to prevent overwrites
  const [pendingEmailApprovals, setPendingEmailApprovals] = useState<EmailApprovalRequest[]>([]);
  const [isSendingApprovedEmail, setIsSendingApprovedEmail] = useState(false);

  // Injected Smart classification results from Gemini organization core
  const [filesInPlan, setFilesInPlan] = useState<{ [key: string]: { category: string; tags: string[]; relevance: number } }>({});

  // Generative Neural Topology view toggle - DISABLED
  const [showNeuralTopology, setShowNeuralTopology] = useState<boolean>(false);

  // Chatbot external trigger synchronization
  const [chatClearTrigger, setChatClearTrigger] = useState(0);
  const [chatExportTrigger, setChatExportTrigger] = useState(0);

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

  // Autonomous Decision System: Pre-evaluate fallbacks so zero files remain Unsorted
  const loadFallbackFiles = () => {
    const rawFallbacks: DriveFile[] = [
      { id: "fb_f1", name: "Work Receipts", mimeType: "application/vnd.google-apps.folder", parents: [] },
      { id: "fb_f2", name: "Family Archives", mimeType: "application/vnd.google-apps.folder", parents: [] },
      { id: "fb_d1", name: "project_requirements.txt", mimeType: "text/plain", size: "12.5 KB", parents: [], webViewLink: "#" },
      { id: "fb_d2", name: "monthly_invoice_may_2026.txt", mimeType: "text/plain", size: "4.1 KB", parents: ["fb_f1"], webViewLink: "#" },
      { id: "fb_d3", name: "vacation_itinerary.txt", mimeType: "text/plain", size: "2.3 KB", parents: ["fb_f2"], webViewLink: "#" },
      { id: "fb_d4", name: "consulting_agreement_2026.pdf", mimeType: "application/pdf", size: "114 KB", parents: [], webViewLink: "#" },
      { id: "fb_d5", name: "q2_revenue_forecast.csv", mimeType: "text/csv", size: "38.2 KB", parents: [], webViewLink: "#" },
      { id: "fb_d6", name: "cloud_architecture_spec.md", mimeType: "text/markdown", size: "24.6 KB", parents: [], webViewLink: "#" },
      { id: "fb_d7", name: "brand_logo_master.svg", mimeType: "image/svg+xml", size: "18.4 KB", parents: [], webViewLink: "#" },
      { id: "fb_d8", name: "legacy_backup_dump_2021.zip", mimeType: "application/zip", size: "14.2 MB", parents: [], webViewLink: "#" }
    ];
    const classified = evaluateFilesBatch(rawFallbacks);
    setFiles(classified);

    const seedPlan: { [key: string]: { category: string; tags: string[]; relevance: number } } = {};
    classified.forEach(f => {
      if (f.category) {
        seedPlan[f.id] = {
          category: f.category,
          tags: f.tags || [],
          relevance: f.relevance || 75
        };
      }
    });
    setFilesInPlan(prev => ({ ...seedPlan, ...prev }));
  };

  // Perform OAuth sign-in flow with futuristic dual-phase transitions
  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthNotice(null);
    setAuthPhase("initiating");

    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        addLog("email", `User authenticated securely: ${result.user.email}`);
        
        // Concurrently preload Drive contents while synthesis portal runs
        loadDriveContents(result.accessToken);

        // Transition seamlessly to the futuristic Workspace Synthesis phase
        setAuthPhase("synthesizing");
      } else {
        setAuthPhase("idle");
        setAuthNotice("Sign-in window was closed before completion. Click below when you are ready to connect.");
      }
    } catch (err: any) {
      setAuthPhase("idle");
      if (isPopupDismissedError(err)) {
        setAuthNotice("Sign-in window was closed before completion. Click below when you are ready to connect.");
        return;
      }
      console.error("Authentication Error:", err);
      setAuthNotice("Authentication was interrupted. Please try clicking again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAuthTransitionComplete = () => {
    setNeedsAuth(false);
    setAuthPhase("idle");
  };

  const handleAuthCancel = () => {
    setAuthPhase("idle");
    setIsLoggingIn(false);
    setAuthNotice("Authentication handshake was cancelled. Click below to reconnect.");
  };

  // Perform OAuth logout flow
  const handleLogout = async () => {
    setWorkspaceAsyncState({ status: "loading", message: "Signing out of Google Workspace...", retryFn: null });
    try {
       await logout();
       setUser(null);
       setToken(null);
       setFiles([]);
       setNeedsAuth(true);
       setWorkspaceAsyncState({ status: "idle", message: null, retryFn: null });
    } catch (err: any) {
       console.error(err);
       setWorkspaceAsyncState({
         status: "failed",
         message: `Sign-out failed: ${err?.message || "Unable to terminate session."}`,
         retryFn: handleLogout
       });
    }
  };

  // Async load drive contents
  const loadDriveContents = async (accessToken: string) => {
    if (!accessToken) return;
    setIsSyncing(true);
    setWorkspaceAsyncState({
      status: "loading",
      message: "Synchronising Google Drive inventory...",
      retryFn: null
    });
    try {
      const driveItems = await listDriveFiles(accessToken);
      const seen = new Set<string>();
      const uniqueItems = driveItems.filter(item => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      if (uniqueItems.length > 0) {
        // Run full autonomous Decision Engine across live Drive items
        const classified = evaluateFilesBatch(uniqueItems);
        setFiles(classified);

        // Pre-populate decision plan mapping for seamless cross-component sync
        const seedPlan: { [key: string]: { category: string; tags: string[]; relevance: number } } = {};
        classified.forEach(f => {
          if (f.category) {
            seedPlan[f.id] = {
              category: f.category,
              tags: f.tags || [],
              relevance: f.relevance || 75
            };
          }
        });
        setFilesInPlan(prev => ({ ...seedPlan, ...prev }));
        setWorkspaceAsyncState({
          status: "success",
          message: `Synchronised ${classified.length} Google Drive item(s) successfully.`,
          retryFn: null
        });
      } else {
        loadFallbackFiles();
        setWorkspaceAsyncState({
          status: "empty",
          message: "No live Google Drive files found in root; loaded sample workspace catalog.",
          retryFn: () => loadDriveContents(accessToken)
        });
      }
    } catch (err: any) {
      console.warn("Could not list Drive items directly, loading workspace fallbacks:", err.message);
      loadFallbackFiles();
      setWorkspaceAsyncState({
        status: "failed",
        message: `Google Drive sync error (${err.message || "Network or token error"}). Displaying offline fallback catalog.`,
        retryFn: () => loadDriveContents(accessToken)
      });
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

  // Dynamically compute whether the active workspace view is currently empty based on data length
  const isCurrentViewEmpty = React.useMemo(() => {
    switch (activeTab) {
      case "drive":
        return files.length === 0;
      case "sheets":
        return files.filter(f => 
          f.mimeType?.includes("spreadsheet") || 
          f.mimeType?.includes("csv") || 
          f.name?.endsWith(".csv") || 
          f.name?.endsWith(".xlsx") || 
          f.name?.endsWith(".sheet")
        ).length === 0;
      case "organizer":
        return files.length === 0;
      case "backup":
        return backupJobs.length === 0;
      case "tasks":
        return reminders.length === 0;
      case "reports":
        return activities.length === 0;
      case "chat":
        return false;
      default:
        return false;
    }
  }, [activeTab, files, backupJobs, reminders, activities]);

  // Central dispatcher for contextual actions triggered from the workspace Header
  const handleHeaderActionSelect = (actionId: string) => {
    switch (actionId) {
      case "upload-file": {
        const fileInput = document.getElementById("drive-browser-file-input") as HTMLInputElement | null;
        if (fileInput) {
          fileInput.click();
        } else {
          setActiveTab("drive");
          setTimeout(() => {
            const el = document.getElementById("drive-browser-file-input") as HTMLInputElement | null;
            if (el) el.click();
          }, 150);
        }
        break;
      }
      case "new-doc": {
        setActiveTab("drive");
        window.open("https://docs.google.com/document/create", "_blank");
        break;
      }
      case "new-sheet": {
        setActiveTab("sheets");
        window.open("https://sheets.google.com/create", "_blank");
        break;
      }
      case "new-folder": {
        setActiveTab("drive");
        const folderBtn = document.getElementById("btn-new-folder");
        if (folderBtn) {
          folderBtn.click();
        }
        break;
      }
      case "keyword-rules":
      case "plan-structure":
      case "catalogue-drive":
      case "organize-all": {
        setActiveTab("organizer");
        break;
      }
      case "new-backup-job":
      case "run-all-backups": {
        setActiveTab("backup");
        break;
      }
      case "new-task":
      case "send-report":
      case "sync-tasks": {
        setActiveTab("tasks");
        break;
      }
      case "schedule-reminder": {
        handleOpenScheduleModal();
        break;
      }
      case "export-csv": {
        const csvContent = "data:text/csv;charset=utf-8," + 
          ["Name,Size,Type,Created", ...files.map(f => `"${(f.name || '').replace(/"/g, '""')}","${f.size || 'N/A'}","${f.mimeType || 'file'}","${f.createdTime || ''}"`)].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `drive_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog("create", "Exported Drive inventory to CSV.");
        break;
      }
      case "export-json": {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(files, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", dataStr);
        link.setAttribute("download", `drive_export_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog("create", "Exported Drive files metadata to JSON.");
        break;
      }
      case "generate-ideas": {
        setActiveTab("chat");
        window.dispatchEvent(new CustomEvent("drive-organizer:generate-ideas"));
        addLog("create", "Generated contextual AI chat prompt suggestions.");
        break;
      }
      case "clear-chat": {
        setActiveTab("chat");
        setChatClearTrigger(prev => prev + 1);
        window.dispatchEvent(new CustomEvent("drive-organizer:clear-chat"));
        addLog("modify", "Cleared AI conversation history.");
        break;
      }
      case "export-chat": {
        setActiveTab("chat");
        setChatExportTrigger(prev => prev + 1);
        window.dispatchEvent(new CustomEvent("drive-organizer:export-chat"));
        addLog("create", "Exported AI chat transcript.");
        break;
      }
      default:
        console.log(`Header contextual action selected: ${actionId}`);
    }
  };

  // Global file drop handler for workspace Header
  const handleHeaderFileDrop = async (droppedFiles: FileList) => {
    if (!token) {
      addLog("email", "Please connect to Google Drive before dropping files to upload.");
      setWorkspaceAsyncState({
        status: "failed",
        message: "Upload blocked: Please connect your Google Drive account before uploading files.",
        retryFn: null
      });
      return;
    }
    if (droppedFiles.length === 0) {
      setWorkspaceAsyncState({
        status: "empty",
        message: "No files were detected in the drop payload.",
        retryFn: null
      });
      return;
    }
    setIsSyncing(true);
    setWorkspaceAsyncState({
      status: "loading",
      message: `Uploading ${droppedFiles.length} file(s) to Google Drive...`,
      retryFn: null
    });
    let count = 0;
    try {
      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i];
        await uploadDriveBlob(token, file);
        count++;
      }
      addLog("create", `Uploaded ${count} file(s) via Contextual Toolbar.`);
      await loadDriveContents(token);
      setWorkspaceAsyncState({
        status: "success",
        message: `Successfully uploaded ${count} file(s) to Google Drive.`,
        retryFn: null
      });
    } catch (err: any) {
      console.error("Header file drop upload error:", err);
      addLog("create", `Upload failed: ${err.message || 'Network error'}`);
      setWorkspaceAsyncState({
        status: "failed",
        message: `File upload failed (${count}/${droppedFiles.length} completed): ${err.message || "Network error"}`,
        retryFn: () => handleHeaderFileDrop(droppedFiles)
      });
    } finally {
      setIsSyncing(false);
    }
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

  // Helper to sanitize HTML for human email approval previews
  function escapeHtml(str: string): string {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Fire Visual Notifications & sound chimes with auto-dismiss
  const triggerNotification = (title: string, message: string) => {
    setActiveAlert({ title, message });

    setTimeout(() => {
      setActiveAlert(prev => prev && prev.title === title ? null : prev);
    }, 6000);

    // M-01: Ensure AudioContext is closed to prevent resource exhaustion
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
      osc.onended = () => {
        audioCtx.close().catch(() => {});
      };
    } catch (e) {
      // AudioContext sandbox errors are bypassed safely
    }
  };

  const handleOpenScheduleModal = (file?: DriveFile) => {
    setScheduleReminderFile(file || null);
    setIsScheduleReminderModalOpen(true);
  };

  const handleSaveReminder = (newReminder: SmartTaskReminder) => {
    setReminders(prev => [newReminder, ...prev]);
    addLog(
      "task",
      `Scheduled smart reminder: "${newReminder.title}"`,
      `Scheduled: ${newReminder.triggerDate} ${newReminder.triggerTime} (${newReminder.recurrence})`
    );
    if (newReminder.notifyEmail) {
      triggerNotification("Human Approval Policy Active", `"${newReminder.title}" scheduled. A notification for human approval will be sent before any email is dispatched.`);
    } else if (newReminder.notifyInApp) {
      triggerNotification("Reminder Scheduled", `"${newReminder.title}" scheduled for ${newReminder.triggerDate} at ${newReminder.triggerTime}`);
    }
  };

  const handleExecuteReminderAction = async (reminder: SmartTaskReminder) => {
    try {
      if (reminder.actionType === "create_folder") {
        const folderName = reminder.actionPayload?.folderName || "Scheduled Folder";
        if (token) {
          await createDriveFolder(token, folderName, reminder.actionPayload?.parentFolderId || "root");
          await loadDriveContents(token);
        }
        addLog("create", `Automated action executed: Created Drive folder "${folderName}"`, `Reminder: ${reminder.title}`);
      } else if (reminder.actionType === "edit_doc") {
        if (token && reminder.targetFileId && reminder.actionPayload?.appendContent) {
          const currentText = await getDriveTextFileContent(token, reminder.targetFileId);
          const updateStamp = `\n\n[Automated Task Update ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}]:\n${reminder.actionPayload.appendContent}`;
          await updateDriveTextFile(token, reminder.targetFileId, currentText + updateStamp);
          await loadDriveContents(token);
        }
        addLog("modify", `Automated action executed: Appended text note to "${reminder.targetFileName || 'document'}"`, `Reminder: ${reminder.title}`);
      } else if (reminder.actionType === "relocate_file") {
        if (token && reminder.targetFileId && reminder.actionPayload?.targetDestinationFolderId) {
          await moveDriveFile(token, reminder.targetFileId, reminder.actionPayload.targetDestinationFolderId);
          await loadDriveContents(token);
        }
        addLog("move", `Automated action executed: Relocated "${reminder.targetFileName || 'file'}" to target folder`, `Reminder: ${reminder.title}`);
      }

      if (reminder.notifyInApp) {
        triggerNotification(`Scheduled Action Completed`, `"${reminder.title}" executed successfully.`);
      }

      // Check if email notification was requested: MANDATORY Human Approval Check
      if (reminder.notifyEmail) {
        const approvalReq: EmailApprovalRequest = {
          id: "email_appr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          reminderId: reminder.id,
          recipientEmail: user?.email || "Steven.lees.production@gmail.com",
          subject: `[Drive Organizer] Scheduled Action Completed: ${reminder.title}`,
          triggerReason: `Scheduled task executed (${reminder.actionType}) on ${new Date().toLocaleDateString()}`,
          htmlBody: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="color: #4f46e5; margin-top: 0; font-size: 18px;">Automated Action Completed</h2>
            <p style="font-size: 14px; color: #334155; margin-bottom: 12px;"><strong>Task:</strong> ${escapeHtml(reminder.title)}</p>
            ${reminder.description ? `<p style="font-size: 13px; color: #64748b;">${escapeHtml(reminder.description)}</p>` : ''}
            <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin: 16px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #475569;"><strong>Action Type:</strong> ${escapeHtml(reminder.actionType)}</p>
              ${reminder.targetFileName ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #475569;"><strong>Target:</strong> ${escapeHtml(reminder.targetFileName)}</p>` : ''}
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #059669;"><strong>Status:</strong> Successfully Executed</p>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 20px;">Sent via Google Workspace API · Human approval required before delivery</p>
          </div>`,
          timestamp: new Date().toISOString()
        };
        // H-01: Add to queue
        setPendingEmailApprovals(prev => [...prev, approvalReq]);
        triggerNotification("Human Approval Required", `Approval requested before sending email for: "${reminder.title}".`);
        addLog("email", `Email notification awaiting human approval for: "${reminder.title}"`);
      }

      setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, executed: true, status: 'completed' } : r));
      setWorkspaceAsyncState({
        status: "success",
        message: `Scheduled action "${reminder.title}" (${reminder.actionType}) completed.`,
        retryFn: null
      });
    } catch (err: any) {
      console.error("Scheduled action execution error:", err);
      addLog("modify", `Failed to execute action for "${reminder.title}": ${err.message || 'Error'}`);
      triggerNotification("Action Failed", `Could not complete scheduled action: ${err.message || 'Unknown error'}`);
      setWorkspaceAsyncState({
        status: "failed",
        message: `Scheduled action "${reminder.title}" failed: ${err.message || "Unknown error"}`,
        retryFn: () => handleExecuteReminderAction(reminder)
      });
    }
  };

  const handleApproveEmail = async (req: EmailApprovalRequest) => {
    if (!token) {
      triggerNotification("Cannot Send Email", "Please connect your Google Workspace account.");
      setWorkspaceAsyncState({
        status: "failed",
        message: "Cannot dispatch approved email: Google Workspace OAuth token is missing.",
        retryFn: null
      });
      return;
    }
    setIsSendingApprovedEmail(true);
    setWorkspaceAsyncState({
      status: "loading",
      message: `Dispatching approved email to ${req.recipientEmail}...`,
      retryFn: null
    });
    try {
      await sendGmailReport(token, req.recipientEmail, req.subject, req.htmlBody);
      addLog("email", `Human approved email delivered to ${req.recipientEmail}`, `Subject: ${req.subject}`);
      triggerNotification("Email Delivered", `Successfully sent to ${req.recipientEmail}`);
      // H-01: Remove approved item from queue by exact ID
      setPendingEmailApprovals(prev => prev.filter(item => item.id !== req.id));
      setWorkspaceAsyncState({
        status: "success",
        message: `Approved email "${req.subject}" delivered to ${req.recipientEmail}.`,
        retryFn: null
      });
    } catch (err: any) {
      console.error("Failed to send approved email:", err);
      addLog("email", `Failed to send email: ${err.message || 'Error'}`);
      triggerNotification("Email Send Failed", err.message || "Failed to dispatch email");
      setWorkspaceAsyncState({
        status: "failed",
        message: `Email delivery to ${req.recipientEmail} failed: ${err.message || "Gmail API error"}`,
        retryFn: () => handleApproveEmail(req)
      });
    } finally {
      setIsSendingApprovedEmail(false);
    }
  };

  const handleDeclineEmail = (req: EmailApprovalRequest) => {
    addLog("email", `Email delivery declined by user: "${req.subject}"`, "Notification kept in-app only.");
    triggerNotification("Email Delivery Cancelled", "The notification was kept in-app only.");
    // Remove declined item from queue by exact ID
    setPendingEmailApprovals(prev => prev.filter(item => item.id !== req.id));
  };

  // C-03: Background Smart Reminder & Scheduled Action Evaluation Engine (Pure refactor)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentDateStr = now.toISOString().slice(0, 10);
      const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // 1. Identify due reminders using current ref snapshot to prevent duplicate side-effects
      const currentReminders = remindersRef.current;
      const dueReminders = currentReminders.filter(rem => {
        const isDateDue = !rem.triggerDate || rem.triggerDate <= currentDateStr;
        const isTimeDue = rem.triggerTime === currentHourMin || (rem.triggerDate ? rem.triggerDate < currentDateStr : false);
        return rem.status === 'active' && !rem.notified && isDateDue && isTimeDue;
      });

      if (dueReminders.length === 0) return;

      // 2. Purely transition reminder state for due items
      setReminders(prev => prev.map(rem => {
        const isDue = dueReminders.some(d => d.id === rem.id);
        if (!isDue) return rem;

        // Advance recurrence or mark fired
        if (rem.recurrence === 'daily') {
          const nextD = new Date(now.getTime() + 86400000);
          return { ...rem, triggerDate: nextD.toISOString().slice(0, 10), notified: false, executed: false, lastFiredAt: now.toISOString() };
        } else if (rem.recurrence === 'weekly') {
          const nextD = new Date(now.getTime() + 7 * 86400000);
          return { ...rem, triggerDate: nextD.toISOString().slice(0, 10), notified: false, executed: false, lastFiredAt: now.toISOString() };
        } else if (rem.recurrence === 'monthly') {
          const nextD = new Date(now);
          nextD.setMonth(nextD.getMonth() + 1);
          return { ...rem, triggerDate: nextD.toISOString().slice(0, 10), notified: false, executed: false, lastFiredAt: now.toISOString() };
        } else {
          return { ...rem, status: 'fired', notified: true, executed: true, lastFiredAt: now.toISOString() };
        }
      }));

      // 3. Dispatch side effects for identified due reminders
      dueReminders.forEach(rem => {
        if (rem.notifyInApp) {
          triggerNotification(`Scheduled Task Due: ${rem.title}`, rem.description || `Scheduled alert triggered at ${rem.triggerTime}`);
          addLog("task", `Automated reminder alarm fired: "${rem.title}"`, `Trigger Time: ${rem.triggerTime}`);
        }

        if (rem.actionType && rem.actionType !== 'reminder_only' && !rem.executed) {
          handleExecuteReminderAction(rem);
        } else if (rem.notifyEmail) {
          const approvalReq: EmailApprovalRequest = {
            id: "email_appr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            reminderId: rem.id,
            recipientEmail: user?.email || "Steven.lees.production@gmail.com",
            subject: `[Drive Organizer] Reminder Due: ${rem.title}`,
            triggerReason: `Scheduled Reminder reached at ${rem.triggerTime} (${rem.recurrence})`,
            htmlBody: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
              <h2 style="color: #4f46e5; margin-top: 0; font-size: 18px;">Smart Task Reminder: ${escapeHtml(rem.title)}</h2>
              <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">This automated notification was scheduled in your Drive Organizer workspace.</p>
              ${rem.description ? `<p style="font-size: 14px; color: #334155; background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 3px solid #6366f1;">${escapeHtml(rem.description)}</p>` : ''}
              ${rem.targetFileName ? `<p style="font-size: 13px; color: #475569;"><strong>Linked Item:</strong> ${escapeHtml(rem.targetFileName)}</p>` : ''}
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 11px; color: #94a3b8;">Sent via Google Workspace API · Human approval required before delivery</p>
            </div>`,
            timestamp: new Date().toISOString()
          };
          setPendingEmailApprovals(prev => [...prev, approvalReq]);
          triggerNotification("Human Approval Required", `Approval requested before sending email for: "${rem.title}".`);
          addLog("email", `Email notification awaiting human approval for: "${rem.title}"`);
        }
      });
    }, 10000);

    return () => clearInterval(timer);
  }, [token, user]);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
      {/* Keyboard Skip Navigation Link (WCAG 2.1 AA) */}
      <a
        href="#main-dashboard-scroll"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main workspace content
      </a>

      {/* Onboarding Flow Overlay */}
      {!needsAuth && !hasSeenOnboarding && (
        <Onboarding onComplete={completeOnboarding} />
      )}

      {/* Dynamic alarm/reminder banners display overlay — 8px Grid Aligned */}
      {activeAlert && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-full bg-slate-900 text-slate-100 rounded-2xl border border-indigo-500 p-4 shadow-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top-6 duration-300"
        >
          <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0">
            <Bell className="h-4 w-4 stroke-[2]" aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-1 min-w-0">
            <span className="font-display font-bold text-sm block tracking-tight text-white">{activeAlert.title}</span>
            <p className="text-xs text-slate-200 leading-normal break-words">{activeAlert.message}</p>
          </div>
          <button 
            type="button"
            aria-label="Dismiss alert notification"
            onClick={() => setActiveAlert(null)} 
            className="rounded-lg p-2 hover:bg-slate-800 active:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Futuristic AI Auth Transition Portal (Pre-Auth Gateway Handshake & Post-Auth Mesh Synthesis) */}
      <AuthTransitionPortal 
        phase={authPhase} 
        user={user} 
        onComplete={handleAuthTransitionComplete} 
        onCancel={handleAuthCancel} 
      />

      {needsAuth ? (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 relative overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute inset-0 ambient-glow pointer-events-none" aria-hidden="true"></div>

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
          <main id="main-dashboard-scroll" className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 relative z-10">
            <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 md:p-10 space-y-6 text-center shadow-xl ring-1 ring-slate-200/80 dark:ring-slate-800/80">
              {/* Intelligent AI Hologram Icon Lockup */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-xl" aria-hidden="true"></div>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-lg ring-1 ring-white/30">
                    <Layers className="h-7 w-7" aria-hidden="true" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
                    Drive Organizer
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto leading-relaxed">
                    AI-native companion for autonomous filing, smart tagging, scheduled backups, and Google Workspace intelligence.
                  </p>
                </div>
              </div>

              {/* Feature capability highlights with Zero-Pill unboxed typography */}
              <div className="py-2 border-y border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 flex-wrap">
                <span>Smart Categorization</span>
                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
                <span>Scheduled Sync</span>
                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
                <span>Google Sheets</span>
                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
                <span>Gemini Assistant</span>
              </div>

              <div className="pt-2 flex flex-col items-center">
                <button 
                  id="gsi-login-button"
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  aria-busy={isLoggingIn}
                  className="gsi-material-button hover:shadow-md transition active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon" aria-hidden="true">
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
                  <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-mono mt-4">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Authenticating Workspace session...
                  </div>
                )}

                {authNotice && (
                  <div role="alert" className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-4 text-xs text-amber-900 dark:text-amber-200 mt-4 text-left">
                    {authNotice}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                Direct client-side OAuth · Tokens remain in ephemeral memory · Zero remote file caching
              </p>
            </div>
          </main>
        </div>
      ) : (
        /* MAIN WORKSPACE INTERFACE WITH PERSISTENT TOP NAVIGATION BAR */
        <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 relative animate-warp-in">
          {/* PERSISTENT TOP NAVIGATION BAR (Always visible and easily accessible) */}
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
            isEmptyState={isCurrentViewEmpty}
            onActionSelect={handleHeaderActionSelect}
            onFileDrop={handleHeaderFileDrop}
            fileCount={files.length}
            activeRemindersCount={reminders.filter(r => r.status === 'active').length}
            backupJobsCount={backupJobs.length}
            hasPlan={Object.keys(filesInPlan).length > 0}
          />

          {/* MAIN VIEW CONTAINER — 8px Grid System (p-4 = 16px on 375px mobile, md:p-6 = 24px on 768px tablet, xl:p-8 = 32px on 1280px+ desktop) */}
          <main id="main-dashboard-scroll" className="flex-1 p-4 md:p-6 xl:p-8 overflow-y-auto">
              <div className="max-w-7xl w-full mx-auto space-y-4 md:space-y-6">
                
                {/* CALM VIEW HEADER — 8px Grid Aligned */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`view-header-${activeTab}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-1"
                    >
                      <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                        {activeTab === "drive" && "Google Drive"}
                        {activeTab === "sheets" && "Google Sheets"}
                        {activeTab === "organizer" && "Smart Organizer"}
                        {activeTab === "backup" && "Cloud Backups"}
                        {activeTab === "tasks" && "Google Tasks"}
                        {activeTab === "reports" && "Activity Reports"}
                        {activeTab === "chat" && "Gemini Assistant"}
                      </h1>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {activeTab === "drive" && "Browse, preview, search, and manage files in your connected Drive."}
                        {activeTab === "sheets" && "Inspect sheets, edit cell values inline, and export drive inventories."}
                        {activeTab === "organizer" && "Plan and execute folder organization using custom rules and AI assistance."}
                        {activeTab === "backup" && "Configure automated folder backups and review synchronization history."}
                        {activeTab === "tasks" && "Track tasks, set recurring reminders, and send summary email reports."}
                        {activeTab === "reports" && "Review audited file operations, storage distribution, and export logs."}
                        {activeTab === "chat" && "Consult Gemini models for drive analysis, categorization advice, and assistance."}
                      </p>
                    </motion.div>
                  </AnimatePresence>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    {activeTab === "drive" && (
                      <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mr-2">
                        {files.length} {files.length === 1 ? "file" : "files"}
                      </span>
                    )}

                    {(activeTab === "drive" || activeTab === "organizer") && (
                      <button
                        type="button"
                        aria-pressed={showNeuralTopology}
                        onClick={() => setShowNeuralTopology(!showNeuralTopology)}
                        className={`hidden sm:inline-flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[36px] text-xs font-medium transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          showNeuralTopology
                            ? "border-indigo-500/50 bg-indigo-50/90 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-500/40"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                        title="Toggle Generative Neural Drive Topology"
                      >
                        <Cpu className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                        <span>Topology {showNeuralTopology ? "On" : "Off"}</span>
                      </button>
                    )}

                    <button
                      id="btn-sync-drive-top"
                      type="button"
                      onClick={handleManualRefresh}
                      disabled={isSyncing}
                      aria-busy={isSyncing}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-slate-600 dark:text-slate-400 ${isSyncing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} aria-hidden="true" />
                      <span>{isSyncing ? "Syncing..." : "Refresh"}</span>
                    </button>
                  </div>
                </div>

                {/* Inline Workspace Async Status & Retry Feedback Banner */}
                {workspaceAsyncState.status !== "idle" && workspaceAsyncState.message && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`rounded-xl border p-4 text-xs flex flex-wrap items-center justify-between gap-4 transition-all ${
                      workspaceAsyncState.status === "failed"
                        ? "border-rose-300 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200"
                        : workspaceAsyncState.status === "loading"
                        ? "border-indigo-300 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200"
                        : workspaceAsyncState.status === "empty"
                        ? "border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                        : "border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {workspaceAsyncState.status === "loading" && <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />}
                      {workspaceAsyncState.status === "failed" && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />}
                      {workspaceAsyncState.status === "empty" && <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
                      {workspaceAsyncState.status === "success" && <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                      <span className="font-mono uppercase text-[10px] font-semibold px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
                        {workspaceAsyncState.status}
                      </span>
                      <span className="truncate font-medium">{workspaceAsyncState.message}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {workspaceAsyncState.retryFn && (
                        <button
                          type="button"
                          onClick={() => workspaceAsyncState.retryFn?.()}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-3 py-1.5 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} aria-hidden="true" />
                          <span>Retry Now</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setWorkspaceAsyncState({ status: "idle", message: null, retryFn: null })}
                        aria-label="Dismiss status notice"
                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                        title="Dismiss status notice"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Generative Neural Drive Synapse Canvas (Desktop Power Feature) */}
                <AnimatePresence>
                  {(activeTab === "drive" || activeTab === "organizer") && showNeuralTopology && (
                    <motion.div
                      key="neural-canvas-container"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="hidden md:block"
                    >
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ACTIVE TAB SCREEN WITH FRAMER-MOTION TRANSITION & TABPANEL SEMANTICS */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`view-content-${activeTab}`}
                    id={`panel-${activeTab}`}
                    role="tabpanel"
                    aria-labelledby={`nav-btn-${activeTab}`}
                    tabIndex={0}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ 
                      duration: 0.22, 
                      ease: [0.16, 1, 0.3, 1] 
                    }}
                    className="w-full focus:outline-none"
                  >
                    {activeTab === "drive" && (
                      <DriveBrowser 
                        token={token} 
                        files={files} 
                        onRefresh={handleManualRefresh} 
                        addLog={addLog}
                        filesInPlan={filesInPlan}
                        onScheduleReminder={handleOpenScheduleModal}
                      />
                    )}

                    {activeTab === "sheets" && (
                      <SheetsManager 
                        token={token} 
                        files={files} 
                        onRefreshDrive={handleManualRefresh} 
                        addLog={addLog}
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
                        onSaveReminders={(newRems) => setReminders(prev => [...newRems, ...prev])}
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
                        files={files}
                        onOpenScheduleModal={handleOpenScheduleModal}
                        onExecuteReminderAction={handleExecuteReminderAction}
                        onEmailApprovalRequest={(req) => setPendingEmailApprovals(prev => [...prev, req])}
                      />
                    )}

                    {activeTab === "reports" && (
                      <Dashboard 
                        files={files}
                        activities={activities}
                        backupHistory={backupHistory}
                      />
                    )}

                    {activeTab === "chat" && (
                      <GeminiChatbot 
                        files={files}
                        clearTrigger={chatClearTrigger}
                        exportTrigger={chatExportTrigger}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

              </div>
            </main>
        </div>
      )}

      {/* Smart Task Reminder & Scheduled Action Modal */}
      <SetReminderModal
        isOpen={isScheduleReminderModalOpen}
        onClose={() => setIsScheduleReminderModalOpen(false)}
        files={files}
        initialFile={scheduleReminderFile}
        onSaveReminder={handleSaveReminder}
        token={token}
        userEmail={user?.email || "Steven.lees.production@gmail.com"}
      />

      {/* Mandatory Human Email Approval Security Modal */}
      <EmailApprovalModal
        request={pendingEmailApprovals[0] || null}
        onApprove={handleApproveEmail}
        onDecline={handleDeclineEmail}
        isSending={isSendingApprovedEmail}
        pendingCount={pendingEmailApprovals.length}
      />
    </div>
  );
}
