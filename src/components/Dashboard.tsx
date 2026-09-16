import React, { useState, useMemo } from "react";
import { BarChart3, Download, Calendar, Activity, HardDrive, Target } from "lucide-react";
import { ActivityLog, DriveFile, BackupLog } from "../types";

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
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/50 to-emerald-100/30 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-slate-900 text-xl tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" /> Executive Analytics Dashboard
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Visualise key storage activities, track backup coverage, and generate custom performance reports across different time intervals.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
            >
              <Download className="h-3.5 w-3.5" /> Export Report (CSV)
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-max">
        <Calendar className="h-4 w-4 text-slate-400 ml-2 mr-1" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mr-2">Range:</span>
        {(["daily", "weekly", "monthly"] as const).map(tr => (
          <button
            key={tr}
            onClick={() => setTimeRange(tr)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              timeRange === tr ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {tr.charAt(0).toUpperCase() + tr.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="h-16 w-16" /></div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 relative z-10">Files Backed Up</p>
          <div className="flex items-end gap-2 relative z-10">
            <h4 className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.backedUp}</h4>
            <span className="text-xs text-emerald-500 font-semibold mb-1">units</span>
          </div>
        </div>
        
        {/* Metric 2 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Target className="h-16 w-16" /></div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 relative z-10">Items Relocated</p>
          <div className="flex items-end gap-2 relative z-10">
            <h4 className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.moved}</h4>
            <span className="text-xs text-indigo-500 font-semibold mb-1">ops</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><HardDrive className="h-16 w-16" /></div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 relative z-10">Storage Allocation</p>
          <div className="flex items-end gap-2 relative z-10">
            <h4 className="text-3xl font-extrabold text-slate-900 tracking-tight">{totalStorage}</h4>
            <span className="text-xs text-slate-400 font-semibold mb-1">est.</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="h-16 w-16" /></div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 relative z-10">Directories Built</p>
          <div className="flex items-end gap-2 relative z-10">
            <h4 className="text-3xl font-extrabold text-slate-900 tracking-tight">{stats.foldersCreated}</h4>
            <span className="text-xs text-indigo-500 font-semibold mb-1">new</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[300px]">
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">Detailed Activity Log ({timeRange})</h3>
          <div className="flex items-center gap-3">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {uniqueActionTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Actions' : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <span className="text-[10px] bg-white border border-slate-200 text-slate-500 rounded px-2 py-1 font-mono font-medium">Record Count: {filteredActivities.length}</span>
          </div>
        </div>
        
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <Activity className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">No activity recorded for the {timeRange} period.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {filteredActivities.map((act) => (
              <div key={act.id} className="p-4 hover:bg-slate-50 transition flex items-start gap-4">
                <div className={`mt-0.5 shrink-0 h-6 w-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white ${
                  act.actionType === 'create' ? 'bg-emerald-500' :
                  act.actionType === 'move' ? 'bg-indigo-500' :
                  act.actionType === 'modify' ? 'bg-amber-500' : 'bg-slate-400'
                }`}>
                  {act.actionType.substring(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-tight">{act.message}</p>
                  {act.details && <p className="text-[11px] text-slate-400 font-mono mt-1 w-full truncate">{act.details}</p>}
                </div>
                <time className="text-[10px] text-slate-400 font-mono shrink-0 pt-1">{act.timestamp}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
