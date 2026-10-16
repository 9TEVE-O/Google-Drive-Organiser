import React, { useState, useEffect } from "react";
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
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

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

  // Modal and Approval states
  const [isScheduleReminderModalOpen, setIsScheduleReminderModalOpen] = useState(false);
  const [scheduleReminderFile, setScheduleReminderFile] = useState<DriveFile | null>(null);
  const [pendingEmailApproval, setPendingEmailApproval] = useState<EmailApprovalRequest | null>(null);
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
      return;
    }
    setIsSyncing(true);
    let count = 0;
    try {
      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i];
        await uploadDriveBlob(token, file);
        count++;
      }
      addLog("create", `Uploaded ${count} file(s) via Contextual Toolbar.`);
      await loadDriveContents(token);
    } catch (err: any) {
      console.error("Header file drop upload error:", err);
      addLog("create", `Upload failed: ${err.message || 'Network error'}`);
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
        setPendingEmailApproval(approvalReq);
        triggerNotification("Human Approval Required", `Approval requested before sending email for: "${reminder.title}".`);
        addLog("email", `Email notification awaiting human approval for: "${reminder.title}"`);
      }

      setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, executed: true, status: 'completed' } : r));
    } catch (err: any) {
      console.error("Scheduled action execution error:", err);
      addLog("modify", `Failed to execute action for "${reminder.title}": ${err.message || 'Error'}`);
      triggerNotification("Action Failed", `Could not complete scheduled action: ${err.message || 'Unknown error'}`);
    }
  };

  const handleApproveEmail = async (req: EmailApprovalRequest) => {
    if (!token) {
      triggerNotification("Cannot Send Email", "Please connect your Google Workspace account.");
      return;
    }
    setIsSendingApprovedEmail(true);
    try {
      await sendGmailReport(token, req.recipientEmail, req.subject, req.htmlBody);
      addLog("email", `Human approved email delivered to ${req.recipientEmail}`, `Subject: ${req.subject}`);
      triggerNotification("Email Delivered", `Successfully sent to ${req.recipientEmail}`);
      setPendingEmailApproval(null);
    } catch (err: any) {
      console.error("Failed to send approved email:", err);
      addLog("email", `Failed to send email: ${err.message || 'Error'}`);
      triggerNotification("Email Send Failed", err.message || "Failed to dispatch email");
    } finally {
      setIsSendingApprovedEmail(false);
    }
  };

  const handleDeclineEmail = (req: EmailApprovalRequest) => {
    addLog("email", `Email delivery declined by user: "${req.subject}"`, "Notification kept in-app only.");
    triggerNotification("Email Delivery Cancelled", "The notification was kept in-app only.");
    setPendingEmailApproval(null);
  };

  // Background Smart Reminder & Scheduled Action Evaluation Engine
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentDateStr = now.toISOString().slice(0, 10);
      const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      setReminders(prev => {
        let hasChanges = false;
        const updated = prev.map(rem => {
          // Check if due: matches today's date (or earlier overdue date) and time
          const isDateDue = !rem.triggerDate || rem.triggerDate <= currentDateStr;
          const isTimeDue = rem.triggerTime === currentHourMin || (rem.triggerDate ? rem.triggerDate < currentDateStr : false);

          if (rem.status === 'active' && !rem.notified && isDateDue && isTimeDue) {
            hasChanges = true;

            // 1. In-App notification
            if (rem.notifyInApp) {
              triggerNotification(`Scheduled Task Due: ${rem.title}`, rem.description || `Scheduled alert triggered at ${rem.triggerTime}`);
              addLog("task", `Automated reminder alarm fired: "${rem.title}"`, `Trigger Time: ${rem.triggerTime}`);
            }

            // 2. Automated Action execution (if scheduled)
            if (rem.actionType && rem.actionType !== 'reminder_only' && !rem.executed) {
              handleExecuteReminderAction(rem);
            } else if (rem.notifyEmail) {
              // 3. MANDATORY HUMAN APPROVAL ENFORCEMENT BEFORE SENDING ANY EMAIL
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
              setPendingEmailApproval(approvalReq);
              triggerNotification("Human Approval Required", `Approval requested before sending email for: "${rem.title}".`);
              addLog("email", `Email notification awaiting human approval for: "${rem.title}"`);
            }

            // 4. Advance recurrence
            if (rem.recurrence === 'daily') {
              const nextD = new Date(now.getTime() + 86400000);
              return {
                ...rem,
                triggerDate: nextD.toISOString().slice(0, 10),
                notified: false,
                executed: false,
                lastFiredAt: now.toISOString()
              };
            } else if (rem.recurrence === 'weekly') {
              const nextD = new Date(now.getTime() + 7 * 86400000);
              return {
                ...rem,
                triggerDate: nextD.toISOString().slice(0, 10),
                notified: false,
                executed: false,
                lastFiredAt: now.toISOString()
              };
            } else if (rem.recurrence === 'monthly') {
              const nextD = new Date(now);
              nextD.setMonth(nextD.getMonth() + 1);
              return {
                ...rem,
                triggerDate: nextD.toISOString().slice(0, 10),
                notified: false,
                executed: false,
                lastFiredAt: now.toISOString()
              };
            } else {
              return {
                ...rem,
                status: 'fired',
                notified: true,
                executed: true,
                lastFiredAt: now.toISOString()
              };
            }
          }
          return rem;
        });
        return hasChanges ? updated : prev;
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
          <div className="absolute inset-0 ambient-glow pointer-events-none"></div>

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
          <main className="flex-1 flex items-center justify-center p-6 relative z-10">
            <div className="w-full max-w-md glass-panel rounded-3xl p-8 sm:p-10 space-y-7 text-center shadow-xl ring-1 ring-slate-200/80 dark:ring-slate-800/80">
              {/* Intelligent AI Hologram Icon Lockup */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-xl"></div>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-lg ring-1 ring-white/30">
                    <Layers className="h-7 w-7" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
                    Drive Organizer
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                    AI-native companion for autonomous filing, smart tagging, scheduled backups, and Google Workspace intelligence.
                  </p>
                </div>
              </div>

              {/* Feature capability highlights with Zero-Pill unboxed typography */}
              <div className="pt-1 pb-1 border-y border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 flex-wrap">
                <span>Smart Categorization</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span>Scheduled Sync</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span>Google Sheets</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span>Gemini Assistant</span>
              </div>

              <div className="pt-1 flex flex-col items-center">
                <button 
                  id="gsi-login-button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button hover:shadow-md transition active:scale-98 cursor-pointer"
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
                  <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-mono mt-3">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Authenticating Workspace session...
                  </div>
                )}

                {authNotice && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 text-xs text-amber-800 dark:text-amber-300 mt-3 text-left">
                    {authNotice}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                Direct client-side OAuth · Tokens remain in ephemeral memory · Zero remote file caching
              </p>
            </div>
          </main>
        </div>
      ) : (
        /* MAIN WORKSPACE INTERFACE */
        <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 relative animate-warp-in">
          
          {/* DESKTOP SIDEBAR */}
          <aside className="hidden md:flex w-64 bg-white/90 dark:bg-slate-900/90 border-r border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl flex-col justify-between p-4 h-screen sticky top-0 shrink-0 z-30">
            <div className="space-y-6">
              {/* Brand identity */}
              <div className="flex items-center gap-3 px-2 pt-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-white shadow-xs ring-1 ring-white/20 shrink-0">
                  <Layers className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 font-display">
                      Drive Organizer
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Active"></span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tracking-tight">
                    Workspace Synapse v0.9.1
                  </p>
                </div>
              </div>

              {/* Navigation Actions */}
              <nav className="space-y-1">
                <button
                  id="nav-btn-drive"
                  onClick={() => setActiveTab("drive")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "drive"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HardDrive className={`h-4 w-4 ${activeTab === "drive" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>Google Drive</span>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                    activeTab === "drive" ? "bg-indigo-100/80 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    {files.length}
                  </span>
                </button>

                {/* <button
                  id="sidebar-nav-sheets"
                  onClick={() => setActiveTab("sheets")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "sheets"
                      ? "bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200 font-semibold border-l-2 border-emerald-600 dark:border-emerald-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Google Sheets</span>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                    activeTab === "sheets" ? "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    {files.filter(f => f.mimeType === "application/vnd.google-apps.spreadsheet" || f.name.endsWith(".csv")).length}
                  </span>
                </button> */}

                <button
                  id="sidebar-nav-organizer"
                  onClick={() => setActiveTab("organizer")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "organizer"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderKanban className={`h-4 w-4 ${activeTab === "organizer" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>Smart Organizer</span>
                  </div>
                  {Object.keys(filesInPlan).length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse"></span>
                  )}
                </button>

                {/* <button
                  id="sidebar-nav-backup"
                  onClick={() => setActiveTab("backup")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "backup"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
                    <span>Cloud Backups</span>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                    activeTab === "backup" ? "bg-indigo-100/80 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    {backupJobs.length}
                  </span>
                </button> */}

                {/* <button
                  id="sidebar-nav-tasks"
                  onClick={() => setActiveTab("tasks")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "tasks"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ListTodo className={`h-4 w-4 ${activeTab === "tasks" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>Google Tasks</span>
                  </div>
                  {reminders.filter(r => r.status === 'active').length > 0 && (
                    <span className="text-[10px] font-mono tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">
                      {reminders.filter(r => r.status === 'active').length}
                    </span>
                  )}
                </button> */}

                <button
                  id="sidebar-nav-reports"
                  onClick={() => setActiveTab("reports")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "reports"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className={`h-4 w-4 ${activeTab === "reports" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>Reports</span>
                  </div>
                </button>

                {/* <button
                  id="sidebar-nav-chat"
                  onClick={() => setActiveTab("chat")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    activeTab === "chat"
                      ? "bg-indigo-50/90 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200 font-semibold border-l-2 border-indigo-600 dark:border-indigo-400 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bot className={`h-4 w-4 ${activeTab === "chat" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
                    <span>Gemini Assistant</span>
                  </div>
                </button> */}
              </nav>
            </div>

            {/* Profile and Logout Section */}
            <div className="border-t border-slate-200/80 dark:border-slate-800/80 pt-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 px-1">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    referrerPolicy="no-referrer"
                    alt={user.displayName || "Avatar"}
                    className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold text-xs shrink-0 shadow-xs">
                    {user?.displayName?.charAt(0) || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user?.displayName || "Connected User"}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={toggleTheme}
                  title="Toggle Theme"
                  className="flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  id="sidebar-logout-btn"
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* WORKSPACE HEADER WITH INTEGRATED CONTEXTUAL ACTION TOOLBAR */}
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
            />

            {/* MAIN VIEW CONTAINER */}
            <main id="main-dashboard-scroll" className="flex-1 p-3.5 sm:p-6 md:p-8 overflow-y-auto pb-24 md:pb-8">
              <div className="max-w-6xl w-full mx-auto space-y-4 sm:space-y-6">
                
                {/* CALM VIEW HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 sm:pb-4 border-b border-slate-200/70 dark:border-slate-800">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`view-header-${activeTab}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
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
                      <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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

                  <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 self-end sm:self-auto">
                    {activeTab === "drive" && (
                      <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mr-1">
                        {files.length} {files.length === 1 ? "file" : "files"}
                      </span>
                    )}

                    {(activeTab === "drive" || activeTab === "organizer") && (
                      <button
                        onClick={() => setShowNeuralTopology(!showNeuralTopology)}
                        className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                          showNeuralTopology
                            ? "border-indigo-500/40 bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-500/30"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        }`}
                        title="Toggle Generative Neural Drive Topology"
                      >
                        <Cpu className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Topology {showNeuralTopology ? "On" : "Off"}</span>
                      </button>
                    )}

                    <button
                      id="btn-sync-drive-top"
                      onClick={handleManualRefresh}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
                      <span>{isSyncing ? "Syncing..." : "Refresh"}</span>
                    </button>
                  </div>
                </div>

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
                    {/* <NeuralSynapseCanvas 
                        files={files} 
                        isSyncing={isSyncing} 
                        filesInPlan={filesInPlan} 
                      /> */}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ACTIVE TAB SCREEN WITH FRAMER-MOTION TRANSITION */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`view-content-${activeTab}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ 
                      duration: 0.22, 
                      ease: [0.16, 1, 0.3, 1] 
                    }}
                    className="w-full"
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

                    {/* {activeTab === "sheets" && (
                      <SheetsManager 
                        token={token} 
                        files={files} 
                        onRefreshDrive={handleManualRefresh} 
                        addLog={addLog}
                      />
                    )} */}

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

                    {/* {activeTab === "backup" && (
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
                    )} */}

                    {/* {activeTab === "tasks" && (
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
                        onEmailApprovalRequest={(req) => setPendingEmailApproval(req)}
                      />
                    )} */}

                    {activeTab === "reports" && (
                      <Dashboard 
                        files={files}
                        activities={activities}
                        backupHistory={backupHistory}
                      />
                    )}

                    {/* {activeTab === "chat" && (
                      <GeminiChatbot 
                        files={files}
                        clearTrigger={chatClearTrigger}
                        exportTrigger={chatExportTrigger}
                      />
                    )} */}
                  </motion.div>
                </AnimatePresence>

              </div>
            </main>

            {/* MOBILE BOTTOM NAVIGATION BAR (PHONE APP FRIENDLY VERSION) */}
            <nav 
              aria-label="Mobile app navigation"
              className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-lg"
            >
              <button
                type="button"
                id="mobile-nav-drive"
                onClick={() => { setActiveTab("drive"); setIsMobileMoreOpen(false); }}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors cursor-pointer ${
                  activeTab === "drive"
                    ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Folder className="h-5 w-5" />
                <span className="text-[10px] mt-0.5">Drive</span>
              </button>

              <button
                type="button"
                id="mobile-nav-organizer"
                onClick={() => { setActiveTab("organizer"); setIsMobileMoreOpen(false); }}
                className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors cursor-pointer ${
                  activeTab === "organizer"
                    ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <FolderKanban className="h-5 w-5" />
                <span className="text-[10px] mt-0.5">Organize</span>
                {Object.keys(filesInPlan).length > 0 && (
                  <span className="absolute top-1 right-3 h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              <button
                type="button"
                id="mobile-nav-reports"
                onClick={() => { setActiveTab("reports"); setIsMobileMoreOpen(false); }}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-colors cursor-pointer ${
                  activeTab === "reports"
                    ? "text-indigo-600 dark:text-indigo-400 font-semibold"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <BarChart3 className="h-5 w-5" />
                <span className="text-[10px] mt-0.5">Reports</span>
              </button>
            </nav>

            {/* Mobile "More" Drawer / Sheet */}
            <AnimatePresence>
              {isMobileMoreOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsMobileMoreOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs md:hidden"
                  />
                  <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed bottom-14 left-0 right-0 z-50 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl p-4 shadow-2xl space-y-2"
                  >
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 pb-1">
                      Additional Workspaces
                    </p>

                    <button
                      type="button"
                      id="mobile-more-sheets"
                      onClick={() => { setActiveTab("sheets"); setIsMobileMoreOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs font-medium transition cursor-pointer ${
                        activeTab === "sheets" ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Google Sheets</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {files.filter(f => f.mimeType === "application/vnd.google-apps.spreadsheet" || f.name.endsWith(".csv")).length}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="mobile-more-backup"
                      onClick={() => { setActiveTab("backup"); setIsMobileMoreOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs font-medium transition cursor-pointer ${
                        activeTab === "backup" ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <RefreshCw className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Cloud Backups</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{backupJobs.length}</span>
                    </button>

                    <button
                      type="button"
                      id="mobile-more-reports"
                      onClick={() => { setActiveTab("reports"); setIsMobileMoreOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs font-medium transition cursor-pointer ${
                        activeTab === "reports" ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Activity Reports</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">{activities.length}</span>
                    </button>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={toggleTheme}
                        className="flex items-center gap-2 p-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 p-2 text-xs text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

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
        request={pendingEmailApproval}
        onApprove={handleApproveEmail}
        onDecline={handleDeclineEmail}
        isSending={isSendingApprovedEmail}
      />
    </div>
  );
}
