import React, { useState, useMemo } from "react";
import { BarChart3, Download, Calendar, Activity, HardDrive, Target, FileCode, Zap, CheckCircle2, Archive, Move, ShieldAlert } from "lucide-react";
import { ActivityLog, DriveFile, BackupLog } from "../types";
import { getDecisionSystemMetrics } from "../lib/decisionEngine";

interface DashboardProps {
  files: DriveFile[];
  activities: ActivityLog[];
  backupHistory: BackupLog[];
}

export default function Dashboard({ files, activities, backupHistory }: DashboardProps) {
  const [timeRange, setTimeRange] = useState<"daily" | "weekly" | "monthly">("daily");
  const [filterAction, setFilterAction] = useState<string>("all");

  const uniqueActionTypes = useMemo(() => {
    const types = new Set(activities.map(a => a.actionType));
    return ["all", ...Array.from(types).sort()];
  }, [activities]);

  const filteredActivities = useMemo(() => {
    if (filterAction === "all") return activities;
    return activities.filter(a => a.actionType === filterAction);
  }, [activities, filterAction]);

  const totalFiles = files.length;
  // Calculate total size roughly
  const totalStorage = useMemo(() => {
    let sizeBytes = 0;
    files.forEach(f => {
      const match = f.size?.match(/([\d.]+)\s*(MB|KB|GB|B)/);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2];
        if (unit === 'KB') sizeBytes += val * 1024;
        else if (unit === 'MB') sizeBytes += val * 1024 * 1024;
        else if (unit === 'GB') sizeBytes += val * 1024 * 1024 * 1024;
        else sizeBytes += val;
      }
    });
    if (sizeBytes < 1024 * 1024) return (sizeBytes / 1024).toFixed(1) + " KB";
    if (sizeBytes < 1024 * 1024 * 1024) return (sizeBytes / (1024 * 1024)).toFixed(1) + " MB";
    return (sizeBytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }, [files]);

  // Aggregate stats
  const stats = useMemo(() => {
    let backedUp = 0;
    let created = 0;
    let moved = 0;
    let foldersCreated = 0;

    backupHistory.forEach(b => {
      if (b.status === "success") backedUp += b.filesCopied || 0;
    });

    activities.forEach(a => {
      if (a.actionType === "create" && a.message.includes("folder")) foldersCreated++;
      else if (a.actionType === "create") created++;
      else if (a.actionType === "move") moved++;
    });

    return { backedUp, created, moved, foldersCreated };
  }, [activities, backupHistory]);

  // Live Decision System operational metrics
  const decisionMetrics = useMemo(() => {
    return getDecisionSystemMetrics(files);
  }, [files]);

  const exportCSV = () => {
    let csv = "Timestamp,Action Type,Message,Details\n";
    filteredActivities.forEach(a => {
      csv += `${a.timestamp},${a.actionType},"${a.message.replace(/"/g, '""')}","${(a.details || "").replace(/"/g, '""')}"\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drive-report-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      timeRange,
      filterAction,
      totalCount: filteredActivities.length,
      logs: filteredActivities
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drive-report-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Activity & Storage Audit</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audited history of file operations, backup tasks, and storage distribution.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-export-logs-csv"
            onClick={exportCSV}
            disabled={filteredActivities.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            id="btn-export-logs-json"
            onClick={exportJSON}
            disabled={filteredActivities.length === 0}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileCode className="h-3.5 w-3.5 text-slate-500" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Metric Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Total Files</span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{totalFiles}</span>
            <span className="text-xs text-slate-400 font-mono">files</span>
          </div>
        </div>

        <div className="p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Files Backed Up</span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{stats.backedUp}</span>
            <span className="text-xs text-slate-400 font-mono">items</span>
          </div>
        </div>

        <div className="p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Items Relocated</span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{stats.moved}</span>
            <span className="text-xs text-slate-400 font-mono">ops</span>
          </div>
        </div>

        <div className="p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">Storage Size</span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{totalStorage}</span>
            <span className="text-xs text-slate-400 font-mono">est.</span>
          </div>
        </div>
      </div>

      {/* Autonomous Decision System Audit */}
      <div className="rounded-2xl border border-indigo-200/90 dark:border-indigo-800/80 bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-slate-900/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-slate-900/60 p-5 backdrop-blur-xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-xs shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-xs tracking-tight text-slate-900 dark:text-slate-100 font-display">
                  Autonomous Decision System Audit
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  100% Decision-Indexed · 0 Unsorted
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Every resource is triaged into explicit relocation, archival, or verified governance directives.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Move className="h-3 w-3 text-indigo-500" /> Relocations
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-display text-indigo-700 dark:text-indigo-300 tabular-nums">
                {decisionMetrics.relocationCandidatesCount}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">candidates</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Archive className="h-3 w-3 text-amber-500" /> Archivals
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-display text-amber-700 dark:text-amber-300 tabular-nums">
                {decisionMetrics.archiveCandidatesCount}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">stale (&gt;180d)</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-rose-500" /> High Urgency
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-display text-rose-700 dark:text-rose-300 tabular-nums">
                {decisionMetrics.highUrgencyCount}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">compliance</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Verified in Place
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-display text-emerald-700 dark:text-emerald-300 tabular-nums">
                {decisionMetrics.verifiedCount}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">catalogued</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs overflow-hidden">
        <div className="border-b border-slate-200/80 dark:border-slate-800/80 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
              Activity History
            </h3>
            <div className="flex items-center gap-1">
              {(["daily", "weekly", "monthly"] as const).map(tr => (
                <button
                  key={tr}
                  onClick={() => setTimeRange(tr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    timeRange === tr
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {tr.charAt(0).toUpperCase() + tr.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              {uniqueActionTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {filteredActivities.length} logs
            </span>
          </div>
        </div>
        
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs">No activity recorded for this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[440px] overflow-y-auto">
            {filteredActivities.map((act, actIdx) => (
              <div key={`act-${act.id}-${actIdx}`} className="px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3.5">
                <span className={`mt-0.5 shrink-0 text-[11px] font-mono font-medium ${
                  act.actionType === 'create' ? 'text-emerald-600 dark:text-emerald-400' :
                  act.actionType === 'move' ? 'text-indigo-600 dark:text-indigo-400' :
                  act.actionType === 'modify' ? 'text-amber-600 dark:text-amber-400' :
                  'text-slate-500 dark:text-slate-400'
                }`}>
                  [{act.actionType}]
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">{act.message}</p>
                  {act.details && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">{act.details}</p>
                  )}
                </div>
                <time className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums shrink-0 pt-0.5">{act.timestamp}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
