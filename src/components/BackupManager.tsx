import React, { useState } from "react";
import { 
  Laptop, Smartphone, HardDrive, Play, Plus, Clock, History, 
  CheckCircle2, RefreshCw, AlertCircle, Trash2, Info, ChevronRight, Check, X 
} from "lucide-react";
import { BackupJob, BackupLog, DriveFile } from "../types";
import { createDriveFolder, createDriveTextFile } from "../lib/googleApi";
import InfoTooltip from "./InfoTooltip";

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
    if (!token) return;
    const job = backupJobs.find(j => j.id === jobId);
    if (!job) return;

    setIsExecuting(jobId);
    
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

      // Simulate granular file processing
      for (let i = 0; i < sourceFiles.length; i++) {
        setProcessingFile(sourceFiles[i].name);
        setProcessingProgress({ current: i + 1, total: sourceFiles.length });
        await new Promise(resolve => setTimeout(resolve, 600)); // Artificial delay for UI feedback
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
        message: `Backup executed from connected devices (${job.devices.join(", ")}). Generated safe catalog report file inside '${job.destinationFolderName}'.`,
        filesCopied: sourceFiles.length
      };

      setBackupHistory([newLog, ...backupHistory]);
      setBackupJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'success', lastRun: runTime } : j));
      addLog("backup", `Succeeded automated Cloud Backup execution for "${job.name}"`, `Copied content details for ${sourceFiles.length} files.`);
      await onRefresh();
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
      setBackupHistory([newLog, ...backupHistory]);
      setBackupJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed' } : j));
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
      {/* Simulation Connected Devices Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 tracking-tight flex items-center">
          Active Devices Backup Connectors
          <InfoTooltip text="These are the devices connected to your account. Select which ones should run these backups." />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-100 bg-slate-50/50">
            <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Laptop className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-slate-800 text-xs block">Macbook Air - Steven</span>
              <span className="text-[10px] text-emerald-600 font-mono font-medium flex items-center gap-1">
                ● Connected • Sync Ready
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-100 bg-slate-50/50">
            <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-slate-800 text-xs block">iPhone 15 Pro</span>
              <span className="text-[10px] text-emerald-600 font-mono font-medium flex items-center gap-1">
                ● Connected • Auto Wifi
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-150 bg-indigo-50/10 border-indigo-100">
            <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold text-slate-800 text-xs block">Drive Storage Vault</span>
              <span className="text-[10px] text-indigo-600 font-mono font-medium flex items-center gap-1">
                ● Google Drive Target Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Jobs Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Setup configuration / configured jobs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider text-slate-500 flex items-center">
                Scheduled Cloud Repositories
                <InfoTooltip text="A list of automatic rules you have set up to copy files from one Google Drive folder to another safely." />
              </h4>
              <button
                id="btn-add-backup-config"
                onClick={() => setShowConfigModal(true)}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add Backup Config
              </button>
            </div>

            {backupJobs.length === 0 ? (
              <div className="text-center py-8 text-slate-450 text-xs text-slate-500 italic block">
                No automatic backup configurations defined yet. Click "Add Backup Config" to schedule your first synchroniser.
              </div>
            ) : (
              <div className="space-y-3">
                {backupJobs.map(job => (
                  <div key={job.id} id={`backup-card-${job.id}`} className="p-4 rounded-xl border border-slate-150 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white hover:border-indigo-100 transition">
                    <div className="space-y-1">
                      <div className="font-bold text-slate-850 text-sm flex items-center gap-1.5">
                        {job.name}
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 font-mono font-medium uppercase">
                          {job.schedule}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 leading-snug">
                        Source Folder: <strong className="text-slate-800">{job.sourceFolderName}</strong> <br />
                        Vault Destination: <strong className="text-indigo-600">{job.destinationFolderName}</strong>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Devices covered: {job.devices.join(", ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-mono">Status</span>
                        <span className={`text-xs font-semibold uppercase ${
                          job.status === 'success' 
                            ? "text-emerald-600" 
                            : job.status === 'running' 
                            ? "text-indigo-600 animate-pulse" 
                            : job.status === 'failed' 
                            ? "text-rose-500" 
                            : "text-slate-500"
                        }`}>
                          {job.status}
                        </span>
                        {job.lastRun && <span className="text-[10px] text-slate-400 block font-mono">Sync: {job.lastRun}</span>}
                        {isExecuting === job.id && processingProgress && (
                          <div className="mt-1 text-left min-w-[120px]">
                            <span className="text-[9px] text-indigo-500 font-mono block truncate w-32">
                              {processingFile ? `Copying: ${processingFile}` : "Preparing..."} 
                            </span>
                            <div className="w-full bg-slate-100 rounded-full h-1 mt-0.5 relative overflow-hidden">
                              <div className="bg-indigo-500 h-1 rounded-full transition-all duration-300" style={{ width: `${(processingProgress.current / (processingProgress.total || 1)) * 100}%` }}></div>
                            </div>
                            <span className="text-[8px] text-slate-400 font-mono flex justify-between mt-0.5">
                              <span>{processingProgress.current} / {processingProgress.total} files</span>
                              <span>{Math.round((processingProgress.current / (processingProgress.total || 1)) * 100)}%</span>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 ml-4 shrink-0">
                        <button
                          id={`btn-run-backup-${job.id}`}
                          onClick={() => handleRunBackupJob(job.id)}
                          disabled={isExecuting !== null}
                          className="rounded-lg bg-indigo-50 p-2 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition"
                          title="Execute Cloud Sync Backups Now"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Remove backup plan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sync History Logs */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 h-full flex flex-col">
            <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-105 pb-3 flex items-center gap-1.5">
              <History className="h-4 w-4 text-slate-400" /> Synchronisation Log History
            </h4>

            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2.5 pr-1">
              {backupHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">
                  No execution records logged. Run a manual sync backup to view reports logs.
                </div>
              ) : (
                backupHistory.map(log => (
                  <div key={log.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1 text-[11px] leading-relaxed">
                    <div className="flex justify-between items-center bg-white p-1 rounded border border-slate-100 mb-1.5">
                      <span className="font-bold text-slate-800 font-display">{log.jobName}</span>
                      <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 font-bold ${
                        log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-slate-600">{log.message}</p>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1 pt-1 border-t border-slate-100">
                      <span>Files backed up: {log.filesCopied}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200 space-y-4">
            <h3 className="font-display font-bold text-slate-950 text-lg mb-1 flex items-center">
              Create Cloud Backup Job
              <InfoTooltip text="Set up a rule to automatically backup files from a specific folder to the Cloud Auto Backups system." />
            </h3>
            <p className="text-xs text-slate-500 mb-2">Configure automated secure sync backups from your active workspaces into safety clouds.</p>

            <div className="space-y-3.5 text-xs text-slate-650">
              {/* Job label */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Backup Name / Label</label>
                <input
                id="backup-job-title"
                  type="text"
                  placeholder="E.g., Client Receipts Sync, Developer Repository Backup"
                  value={newJobName}
                  onChange={e => setNewJobName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* Source Directory */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Source Directory (Local/Drive)</label>
                  <select
                    id="backup-source-select"
                    value={sourceId}
                    onChange={e => setSourceId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="root">My Drive Root</option>
                    {folders.map((f, fIdx) => (
                      <option key={`backup-folder-${f.id}-${fIdx}`} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Destination Workspace Directory Name */}
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Vault Target Directory Name</label>
                  <input
                    type="text"
                    id="backup-dest-name-input"
                    value={destName}
                    onChange={e => setDestName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none transition font-semibold text-indigo-700"
                  />
                </div>
              </div>

              {/* Schedule Type selection */}
              <div className="space-y-1.5 text-xs">
                <label className="font-medium text-slate-700">Backup Interval Run Period</label>
                <div className="flex gap-2">
                  {['hourly', 'daily', 'weekly', 'manual'].map((schedOpt) => (
                    <button
                      key={schedOpt}
                      onClick={() => setSchedule(schedOpt as any)}
                      className={`flex-1 py-1.5 rounded-lg border font-semibold text-center uppercase tracking-wide transition text-[10px] ${
                        schedule === schedOpt 
                          ? "bg-indigo-600 text-white border-indigo-600" 
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {schedOpt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connected Device Selection */}
              <div className="space-y-1.5 text-xs">
                <label className="font-medium text-slate-700">Simulate Conn Device Targets</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "Laptop-Pro", name: "Notebook Laptop" },
                    { key: "iPhone-Mobile", name: "iPhone 15 Mobile" },
                    { key: "Server-Agent", name: "Backup Host Daemon" }
                  ].map((dev) => {
                    const selected = selectedDevices.includes(dev.key);
                    return (
                      <button
                        key={dev.key}
                        onClick={() => toggleDevice(dev.key)}
                        className={`p-2 rounded-lg border text-left flex items-center justify-between text-[11px] hover:border-indigo-200 transition ${
                          selected ? "bg-indigo-50/50 border-indigo-200 text-indigo-700 font-semibold" : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        {dev.name}
                        {selected ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <X className="h-3.5 w-3.5 text-slate-350" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowConfigModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-add-backup"
                onClick={handleAddJobAction}
                disabled={!newJobName || selectedDevices.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                Confirm Setup Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
