import React, { useState } from "react";
import { 
  Laptop, Smartphone, HardDrive, Play, Plus, Clock, History, 
  CheckCircle2, RefreshCw, AlertCircle, Trash2, Info, ChevronRight, Check, X 
} from "lucide-react";
import { BackupJob, BackupLog, DriveFile } from "../types";
import { createDriveFolder, createDriveTextFile, copyDriveFile } from "../lib/googleApi";
import InfoTooltip from "./InfoTooltip";
import ContextualActionToolbar from "./ContextualActionToolbar";

interface BackupManagerProps {
  token: string | null;
  files: DriveFile[];
  onRefresh: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  backupJobs: BackupJob[];
  setBackupJobs: React.Dispatch<React.SetStateAction<BackupJob[]>>;
  backupHistory: BackupLog[];
  setBackupHistory: React.Dispatch<React.SetStateAction<BackupLog[]>>;
}

export default function BackupManager({
  token,
  files,
  onRefresh,
  addLog,
  backupJobs,
  setBackupJobs,
  backupHistory,
  setBackupHistory,
}: BackupManagerProps) {
  // Config state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [newJobName, setNewJobName] = useState("");
  const [sourceId, setSourceId] = useState("root");
  const [destName, setDestName] = useState("Cloud_Auto_Backups");
  const [schedule, setSchedule] = useState<'hourly' | 'daily' | 'weekly' | 'manual'>("daily");
  const [selectedDevices, setSelectedDevices] = useState<string[]>(["Laptop-Pro"]);

  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<{current: number, total: number} | null>(null);
  const [backupAsyncState, setBackupAsyncState] = useState<{
    status: "idle" | "loading" | "success" | "empty" | "failed";
    message: string | null;
    retryJobId: string | null;
  }>({ status: "idle", message: null, retryJobId: null });

  // Available client folders for sources (strictly deduplicated by ID)
  const folders = React.useMemo(() => {
    const seen = new Set<string>();
    return files.filter(f => {
      if (f.mimeType !== "application/vnd.google-apps.folder") return false;
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [files]);

  // Toggle device selections
  const toggleDevice = (dev: string) => {
    if (selectedDevices.includes(dev)) {
      setSelectedDevices(selectedDevices.filter(d => d !== dev));
    } else {
      setSelectedDevices([...selectedDevices, dev]);
    }
  };

  // Add the Configured backup
  const handleAddJobAction = () => {
    if (!newJobName) return;
    const sourceFolder = files.find(f => f.id === sourceId);
    const sourceName = sourceId === "root" ? "My Drive Root" : (sourceFolder?.name || "Folder");

    const newJob: BackupJob = {
      id: "job_" + Math.random().toString(36).substr(2, 9),
      name: newJobName,
      sourceFolderId: sourceId,
      sourceFolderName: sourceName,
      destinationFolderId: "auto-gen",
      destinationFolderName: destName,
      schedule,
      status: "idle",
      devices: selectedDevices
    };

    setBackupJobs([...backupJobs, newJob]);
    addLog("backup", `Configured new Cloud Backup job: "${newJobName}"`, `Schedule: ${schedule}`);
    
    // Clear & close
    setNewJobName("");
    setSourceId("root");
    setDestName("Cloud_Auto_Backups");
    setSchedule("daily");
    setShowConfigModal(false);
  };

  // Run the backup job (Real Integration)
  const handleRunBackupJob = async (jobId: string) => {
    const job = backupJobs.find(j => j.id === jobId);
    if (!job) return;

    if (!token) {
      setBackupAsyncState({
        status: "failed",
        message: `Backup "${job.name}" blocked: Google Drive authentication token is missing.`,
        retryJobId: jobId
      });
      return;
    }

    setIsExecuting(jobId);
    setBackupAsyncState({
      status: "loading",
      message: `Executing backup routine "${job.name}" to /${job.destinationFolderName}...`,
      retryJobId: null
    });
    
    // Set status to running
    setBackupJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'running' } : j));

    try {
      // 1. Create a "Cloud_Auto_Backups" folder if needed
      const backupDirName = job.destinationFolderName;
      const backupFolderMeta = await createDriveFolder(token, backupDirName);

      // 2. Fetch files in selected source folder
      const sourceFiles = files.filter(f => {
        if (f.mimeType === "application/vnd.google-apps.folder") return false;
        if (job.sourceFolderId === "root") {
          return f.parents.length === 0 || f.parents.includes("root") || !files.some(parent => f.parents.includes(parent.id));
        }
        return f.parents.includes(job.sourceFolderId);
      });

      setProcessingProgress({ current: 0, total: sourceFiles.length });

      // H-04: Perform actual file copying for backup
      let copiedCount = 0;
      const copyFailures: string[] = [];
      for (let i = 0; i < sourceFiles.length; i++) {
        const fileToCopy = sourceFiles[i];
        setProcessingFile(fileToCopy.name);
        setProcessingProgress({ current: i + 1, total: sourceFiles.length });
        
        try {
          // Create the copy in the destination folder
          await copyDriveFile(token, fileToCopy.id, backupFolderMeta.id, `Backup_${fileToCopy.name}`);
          copiedCount++;
        } catch (copyErr: any) {
          console.warn(`Failed to copy file ${fileToCopy.name}:`, copyErr);
          copyFailures.push(fileToCopy.name);
        }
      }

      setProcessingFile(null);

      // 3. Compose a backup log detailing devices and files backed up
      const reportHeadersString = [
        `===========================================`,
        `CLOUD AUTOMATED BACKUP LOG REPORT`,
        `Job Name: ${job.name}`,
        `Executed At: ${new Date().toISOString()}`,
        `Connected Devices Backed Up: ${job.devices.join(", ")}`,
        `===========================================`,
        `Files Copied:`,
        sourceFiles.map((sf, index) => `- [${index + 1}] FileName: "${sf.name}" (ID: ${sf.id})`).join("\n") || "No nested files found in active path"
      ].join("\n");

      // Save the backup log directly inside the newly created Google Drive Destination Folder
      const textFileName = `${job.name.replace(/\s+/g, "_")}_BackupLog_${Date.now()}.txt`;
      await createDriveTextFile(token, textFileName, reportHeadersString, backupFolderMeta.id);

      // Update statuses and insert logs
      const runTime = new Date().toLocaleTimeString();
      const newLog: BackupLog = {
        id: "log_" + Date.now(),
        timestamp: new Date().toLocaleString(),
        jobId,
        jobName: job.name,
        status: "success",
        message: `Backup executed from connected devices (${job.devices.join(", ")}). Created ${copiedCount} copies and generated safe catalog report file inside '${job.destinationFolderName}'.`,
        filesCopied: copiedCount
      };

      setBackupHistory(prev => [newLog, ...prev]);
      setBackupJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success', lastRun: runTime } : j));
      addLog("backup", `Succeeded automated Cloud Backup execution for "${job.name}"`, `Copied content details for ${sourceFiles.length} files.`);
      await onRefresh();

      if (sourceFiles.length === 0) {
        setBackupAsyncState({
          status: "empty",
          message: `Backup "${job.name}" completed: Source folder "${job.sourceFolderName}" contained 0 files. Catalog log written to /${job.destinationFolderName}.`,
          retryJobId: null
        });
      } else if (copyFailures.length > 0) {
        setBackupAsyncState({
          status: "failed",
          message: `Backup "${job.name}" partially completed (${copiedCount}/${sourceFiles.length} copied; ${copyFailures.length} failed: ${copyFailures.slice(0, 3).join(", ")}).`,
          retryJobId: jobId
        });
      } else {
        setBackupAsyncState({
          status: "success",
          message: `Backup "${job.name}" succeeded: Copied ${copiedCount} file(s) and saved audit log to /${job.destinationFolderName}.`,
          retryJobId: null
        });
      }
    } catch (e: any) {
      console.error(e);
      const newLog: BackupLog = {
        id: "log_" + Date.now(),
        timestamp: new Date().toLocaleString(),
        jobId,
        jobName: job.name,
        status: "failed",
        message: `Automated backup failed. Detail: ${e.message}`,
        filesCopied: 0
      };
      setBackupHistory(prev => [newLog, ...prev]);
      setBackupJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed' } : j));
      setBackupAsyncState({
        status: "failed",
        message: `Backup routine "${job.name}" failed: ${e.message || "Google Drive API error"}`,
        retryJobId: jobId
      });
      console.error("Backup failed:", e);
    } finally {
      setIsExecuting(null);
      setProcessingFile(null);
      setProcessingProgress(null);
    }
  };

  // Delete configured job
  const handleDeleteJob = (id: string) => {
    setBackupJobs(backupJobs.filter(j => j.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Cloud Backup Routines</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automate snapshot backups from active Google Drive folders to dedicated cloud archives.
          </p>
        </div>

        <button
          id="btn-add-backup-config"
          onClick={() => setShowConfigModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition cursor-pointer shadow-xs shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Backup Job</span>
        </button>
      </div>

      {/* Inline Backup Async Status & Retry Feedback */}
      {backupAsyncState.status !== "idle" && backupAsyncState.message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
            backupAsyncState.status === "failed"
              ? "border-rose-200 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200"
              : backupAsyncState.status === "loading"
              ? "border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200"
              : backupAsyncState.status === "empty"
              ? "border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
              : "border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {backupAsyncState.status === "loading" && <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />}
            {backupAsyncState.status === "failed" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
            {backupAsyncState.status === "empty" && <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            {backupAsyncState.status === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            <span className="font-mono uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
              {backupAsyncState.status}
            </span>
            <span className="font-medium">{backupAsyncState.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {backupAsyncState.retryJobId && (
              <button
                type="button"
                onClick={() => handleRunBackupJob(backupAsyncState.retryJobId!)}
                disabled={isExecuting !== null}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isExecuting ? "animate-spin" : ""}`} />
                <span>Retry Backup</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setBackupAsyncState({ status: "idle", message: null, retryJobId: null })}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Backup Jobs Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Setup configuration / configured jobs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <span>Configured Jobs</span>
                <span className="text-slate-400 dark:text-slate-500 font-normal">({backupJobs.length})</span>
              </h4>
            </div>

            <div className="p-5">
              {backupJobs.length === 0 ? (
                <ContextualActionToolbar
                  activeTab="backup"
                  isEmptyState={true}
                  emptyTitle="No backup jobs configured"
                  emptyDescription="Automate continuous folder synchronization to Google Drive with custom schedules and multi-device support."
                  onActionSelect={(actionId) => {
                    if (actionId === 'new-backup-job') setShowConfigModal(true);
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {backupJobs.map(job => (
                    <div 
                      key={job.id} 
                      id={`backup-card-${job.id}`} 
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-2">
                          <span className="truncate">{job.name}</span>
                          <span className="rounded bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300 font-mono uppercase shrink-0">
                            {job.schedule}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug truncate">
                          Source: <strong className="text-slate-700 dark:text-slate-300 font-medium">{job.sourceFolderName}</strong> → Target: <strong className="text-slate-700 dark:text-slate-300 font-medium">{job.destinationFolderName}</strong>
                        </div>
                        {job.lastRun && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            Last sync: {job.lastRun}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className={`text-[11px] font-semibold uppercase ${
                            job.status === 'success' 
                              ? "text-emerald-600 dark:text-emerald-400" 
                              : job.status === 'running' 
                              ? "text-indigo-600 dark:text-indigo-400 animate-pulse" 
                              : job.status === 'failed' 
                              ? "text-rose-500 dark:text-rose-400" 
                              : "text-slate-500 dark:text-slate-400"
                          }`}>
                            {job.status}
                          </span>
                          {isExecuting === job.id && processingProgress && (
                            <div className="mt-1 text-left min-w-[110px]">
                              <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-mono block truncate w-28">
                                {processingFile ? processingFile : "Syncing..."} 
                              </span>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1 mt-0.5 overflow-hidden">
                                <div className="bg-indigo-600 h-1 rounded-full transition-all duration-300" style={{ width: `${(processingProgress.current / (processingProgress.total || 1)) * 100}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            id={`btn-run-backup-${job.id}`}
                            onClick={() => handleRunBackupJob(job.id)}
                            disabled={isExecuting !== null}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                            title="Run Backup Now"
                          >
                            <Play className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteJob(job.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                            title="Delete configuration"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sync History Logs */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs h-full flex flex-col overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-slate-400" />
                <span>Execution History</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">{backupHistory.length} logs</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[380px] p-5 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800">
              {backupHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
                  No execution logs recorded yet.
                </div>
              ) : (
                backupHistory.map(log => (
                  <div key={log.id} className="pt-2.5 first:pt-0 space-y-1 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{log.jobName}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                        log.status === "success" 
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" 
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{log.message}</p>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                      <span>{log.filesCopied} file(s) copied</span>
                      <span>{log.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CONFIG MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                Create Cloud Backup Routine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Define the source folder and target destination for automatic file preservation.
              </p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-slate-700 dark:text-slate-300">Routine Name</label>
                <input
                  id="backup-job-title"
                  type="text"
                  placeholder="e.g. Weekly Invoices Snapshot"
                  value={newJobName}
                  onChange={e => setNewJobName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Source Folder</label>
                  <select
                    id="backup-source-select"
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="root">My Drive Root</option>
                    {folders.map((f, fIdx) => (
                      <option key={`backup-folder-${f.id}-${fIdx}`} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Vault Target Folder</label>
                  <input
                    type="text"
                    id="backup-dest-name-input"
                    value={destName}
                    onChange={e => setDestName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-medium text-slate-700 dark:text-slate-300">Schedule Frequency</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['hourly', 'daily', 'weekly', 'manual'] as const).map((schedOpt) => (
                    <button
                      key={schedOpt}
                      type="button"
                      onClick={() => setSchedule(schedOpt)}
                      className={`py-1.5 rounded-lg border text-xs font-medium text-center uppercase tracking-wide transition cursor-pointer ${
                        schedule === schedOpt 
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent font-semibold" 
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {schedOpt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowConfigModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-add-backup"
                onClick={handleAddJobAction}
                disabled={!newJobName}
                className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Save Routine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
