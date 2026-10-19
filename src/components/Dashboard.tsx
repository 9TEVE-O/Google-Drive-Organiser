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
      {/* Overview & Export Actions — 8px Grid (p-6 = 24px, gap-4 = 16px) */}
      <section
        aria-labelledby="audit-overview-heading"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
      >
        <div className="space-y-1">
          <h2 id="audit-overview-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
            <span>Activity & Storage Audit</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Audited history of file operations, backup tasks, and storage distribution.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-export-logs-csv"
            type="button"
            onClick={exportCSV}
            disabled={filteredActivities.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            id="btn-export-logs-json"
            type="button"
            onClick={exportJSON}
            disabled={filteredActivities.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 min-h-[36px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <FileCode className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
            <span>Export JSON</span>
          </button>
        </div>
      </section>

      {/* Metric Summary Strip — 8px Grid (gap-4 = 16px, p-4 = 16px) */}
      <section aria-label="Workspace storage metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Total Files</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{totalFiles}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">files</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Files Backed Up</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{stats.backedUp}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">items</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Items Relocated</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{stats.moved}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">ops</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Storage Size</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{totalStorage}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">est.</span>
          </div>
        </div>
      </section>

      {/* Autonomous Decision System Audit — 8px Grid (p-6 = 24px, gap-4 = 16px) */}
      <section
        aria-labelledby="decision-audit-heading"
        className="rounded-2xl border border-indigo-200/90 dark:border-indigo-800/80 bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-slate-900/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-slate-900/60 p-4 sm:p-6 backdrop-blur-xl shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-xs shrink-0">
              <Zap className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="decision-audit-heading" className="font-bold text-xs tracking-tight text-slate-900 dark:text-slate-100 font-display">
                  Autonomous Decision System Audit
                </h3>
                <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
                <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  100% Decision-Indexed · 0 Unsorted
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Every resource is triaged into explicit relocation, archival, or verified governance directives.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Move className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" /> Relocations
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-display text-indigo-700 dark:text-indigo-300 tabular-nums">
                {decisionMetrics.relocationCandidatesCount}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">candidates</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <Archive className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Archivals
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-display text-amber-700 dark:text-amber-300 tabular-nums">
                {decisionMetrics.archiveCandidatesCount}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">stale (&gt;180d)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" /> High Urgency
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-display text-rose-700 dark:text-rose-300 tabular-nums">
                {decisionMetrics.highUrgencyCount}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">compliance</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Verified in Place
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-display text-emerald-700 dark:text-emerald-300 tabular-nums">
                {decisionMetrics.verifiedCount}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">catalogued</span>
            </div>
          </div>
        </div>
      </section>

      {/* Activity Log Table — 8px Grid */}
      <section
        aria-labelledby="activity-history-heading"
        className="rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl shadow-xs overflow-hidden"
      >
        <div className="border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-4">
            <h3 id="activity-history-heading" className="text-xs font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Activity History
            </h3>
            <div role="group" aria-label="Time range filter" className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(["daily", "weekly", "monthly"] as const).map(tr => (
                <button
                  key={tr}
                  type="button"
                  aria-pressed={timeRange === tr}
                  onClick={() => setTimeRange(tr)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    timeRange === tr
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60"
                  }`}
                >
                  {tr.charAt(0).toUpperCase() + tr.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="activity-type-filter" className="sr-only">
              Filter activity logs by action type
            </label>
            <select
              id="activity-type-filter"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 min-h-[36px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
            >
              {uniqueActionTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              {filteredActivities.length} logs
            </span>
          </div>
        </div>
        
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center text-slate-600 dark:text-slate-400 flex flex-col items-center gap-2">
            <Activity className="h-8 w-8 opacity-50" aria-hidden="true" />
            <p className="text-xs">No activity recorded for this filter.</p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[440px] overflow-y-auto">
            {filteredActivities.map((act, actIdx) => (
              <li key={`act-${act.id}-${actIdx}`} className="px-4 sm:px-6 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-4">
                <span className={`mt-0.5 shrink-0 text-xs font-mono font-medium ${
                  act.actionType === 'create' ? 'text-emerald-700 dark:text-emerald-300' :
                  act.actionType === 'move' ? 'text-indigo-700 dark:text-indigo-300' :
                  act.actionType === 'modify' ? 'text-amber-700 dark:text-amber-300' :
                  'text-slate-600 dark:text-slate-400'
                }`}>
                  [{act.actionType}]
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug">{act.message}</p>
                  {act.details && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono truncate">{act.details}</p>
                  )}
                </div>
                <time className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums shrink-0 pt-0.5">{act.timestamp}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
