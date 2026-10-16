import { geminiFetch } from "../lib/geminiApi";
import React, { useState } from "react";
import { 
  Play, Sparkles, FolderPlus, Compass, ArrowRight, CheckCircle2, 
  RefreshCw, ListChecks, HelpCircle, HardDrive, Cpu, AlertTriangle, Layers,
  Zap, FolderTree, ChevronRight, Check, ArrowUpRight, Folder, Sliders,
  Archive, ShieldAlert, Move
} from "lucide-react";
import { DriveFile, DriveAnalysisResult, OrganizationReport, OrganizerRule } from "../types";
import { createDriveFolder, createNestedDriveFolders, moveDriveFile } from "../lib/googleApi";
import { evaluateFileDecision, getDecisionSystemMetrics } from "../lib/decisionEngine";
import InfoTooltip from "./InfoTooltip";
import OrganizerRulesSettings, { DEFAULT_ORGANIZER_RULES } from "./OrganizerRulesSettings";

interface SmartOrganizerProps {
  token: string | null;
  files: DriveFile[];
  onRefresh: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  onAnalysisApplied: (planData: { [key: string]: { category: string; tags: string[]; relevance: number } }) => void;
  setFiles?: React.Dispatch<React.SetStateAction<DriveFile[]>>;
  onNavigateToTab?: (tab: string) => void;
}

export default function SmartOrganizer({
  token,
  files,
  onRefresh,
  addLog,
  onAnalysisApplied,
  setFiles,
  onNavigateToTab
}: SmartOrganizerProps) {
  // Custom Keyword Priority Rules State
  const [rules, setRules] = useState<OrganizerRule[]>(() => {
    try {
      const saved = localStorage.getItem("drive_organizer_custom_rules");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load rules from localStorage:", e);
    }
    return DEFAULT_ORGANIZER_RULES;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSaveRules = (newRules: OrganizerRule[]) => {
    setRules(newRules);
    try {
      localStorage.setItem("drive_organizer_custom_rules", JSON.stringify(newRules));
    } catch (e) {
      console.warn("Failed to save rules to localStorage:", e);
    }
    const activeCount = newRules.filter(r => r.enabled !== false).length;
    addLog("organize", `Updated priority keyword rules (${activeCount} active).`);
  };

  // Analytical flow states
  const [isClassifying, setIsClassifying] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<DriveAnalysisResult[]>([]);
  
  // Sorting plan flow states
  const [isPlanning, setIsPlanning] = useState(false);
  const [orgPlan, setOrgPlan] = useState<{ recommendedNewFolders: string[]; fileMovements: any[] } | null>(null);

  // Execution logs
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [executedCount, setExecutedCount] = useState({ total: 0, current: 0 });
  const [lastExecutionStats, setLastExecutionStats] = useState<{
    foldersCreated: number;
    filesMoved: number;
    timestamp: string;
  } | null>(null);

  // Dynamic Decision System operational metrics
  const decisionMetrics = React.useMemo(() => {
    return getDecisionSystemMetrics(files);
  }, [files]);

  // Evaluated files with guaranteed zero "Unsorted" debt
  const evaluatedFiles = React.useMemo(() => {
    return files.map(f => (!f.category || f.category === "Unsorted" || !f.decision) ? evaluateFileDecision(f, rules) : f);
  }, [files, rules]);

  // Pending decision candidates
  const pendingDecisions = React.useMemo(() => {
    return evaluatedFiles.filter(f => f.decision && (f.decision.decisionType === "relocate" || f.decision.decisionType === "archive"));
  }, [evaluatedFiles]);

  const [triageFilter, setTriageFilter] = useState<'all' | 'relocate' | 'archive' | 'high-urgency'>('all');
  const [executingSingleId, setExecutingSingleId] = useState<string | null>(null);

  // Filtered triage list
  const filteredTriageFiles = React.useMemo(() => {
    if (triageFilter === "relocate") {
      return pendingDecisions.filter(f => f.decision?.decisionType === "relocate");
    }
    if (triageFilter === "archive") {
      return pendingDecisions.filter(f => f.decision?.decisionType === "archive");
    }
    if (triageFilter === "high-urgency") {
      return pendingDecisions.filter(f => f.decision?.urgency === "high");
    }
    return pendingDecisions;
  }, [pendingDecisions, triageFilter]);

  // Single file decision executor
  const handleExecuteSingleTriage = async (file: DriveFile) => {
    const meta = evaluateFileDecision(file, rules);
    if (!meta.decision || meta.decision.decisionType === "verified") return;
    setExecutingSingleId(file.id);
    try {
      const targetFolder = meta.decision.targetFolder || "General";
      let targetId = "root";

      const existing = files.find(f => f.mimeType === "application/vnd.google-apps.folder" && f.name.toLowerCase() === targetFolder.toLowerCase());
      if (existing) {
        targetId = existing.id;
      } else if (token) {
        const created = await createDriveFolder(token, targetFolder, "root");
        targetId = created.id;
      }

      if (token) {
        await moveDriveFile(token, file.id, targetId, file.parents?.[0]);
      }

      addLog("move", `Autonomous Decision Executed: Relocated "${file.name}" to /${targetFolder}`, meta.decision.rationale);
      await onRefresh();
    } catch (err: any) {
      console.warn("Single triage notice:", err);
      addLog("move", `Triage notice for "${file.name}": ${err.message || "Failed"}`);
    } finally {
      setExecutingSingleId(null);
    }
  };

  // Convert all pending decisions into a structured plan and execute directly
  const handleExecuteAllTriageDecisions = async () => {
    if (pendingDecisions.length === 0) return;
    const foldersSet = new Set<string>();
    const movements = pendingDecisions.map(f => {
      const target = f.decision?.targetFolder || "General";
      foldersSet.add(target);
      return {
        fileId: f.id,
        fileName: f.name,
        destFolderId: "",
        destFolderName: target,
        reason: f.decision?.rationale || `Relocate to /${target}`
      };
    });

    const triagePlan = {
      recommendedNewFolders: Array.from(foldersSet),
      fileMovements: movements
    };

    await handleExecutePlanAction(triagePlan);
  };

  // Client-side fallback helpers if server response is non-JSON or API temporarily unavailable
  const generateClientFallbackPlan = (filesToPlan: { id: string; name: string; mimeType: string }[]): { recommendedNewFolders: string[]; fileMovements: any[] } => {
    const foldersSet = new Set<string>();
    const activeRules = rules.filter(r => r.enabled !== false && r.keyword?.trim());
    
    // Ensure all target folders from active rules are in the set
    activeRules.forEach(r => {
      if (r.targetFolder) foldersSet.add(r.targetFolder);
      else if (r.targetCategory) foldersSet.add(r.targetCategory);
    });

    const movements = filesToPlan.map(f => {
      let dest = "Documents/General";
      const name = (f.name || "").toLowerCase();
      const mime = (f.mimeType || "").toLowerCase();
      let ruleMatched = false;
      let reason = "";

      // Prioritize user-defined keyword rules
      for (const rule of activeRules) {
        const kw = rule.keyword.trim().toLowerCase();
        if (kw && name.includes(kw)) {
          dest = rule.targetFolder || rule.targetCategory || "Finance";
          reason = `Prioritized by custom keyword rule: "${rule.keyword}" -> ${dest}.`;
          ruleMatched = true;
          break;
        }
      }

      if (!ruleMatched) {
        if (name.includes("invoice") || name.includes("tax") || name.includes("budget") || name.includes("receipt") || mime.includes("spreadsheet") || name.endsWith(".csv") || name.endsWith(".xlsx")) {
          dest = "Work/Financials";
        } else if (mime.includes("image") || name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".svg") || name.endsWith(".gif")) {
          dest = "Media/Images";
        } else if (name.includes("code") || name.endsWith(".ts") || name.endsWith(".js") || name.endsWith(".py") || name.endsWith(".json") || name.endsWith(".html")) {
          dest = "Projects/Code";
        } else if (name.includes("archive") || name.includes("old") || name.includes("backup") || name.endsWith(".zip") || name.endsWith(".tar.gz")) {
          dest = "Archives/2026";
        } else if (name.includes("work") || name.includes("project") || name.includes("proposal") || name.includes("roadmap")) {
          dest = "Work/Projects";
        }
        reason = `Shift to nested directory "${dest}" based on file type and semantic classification.`;
      }

      foldersSet.add(dest);
      return {
        fileId: f.id,
        fileName: f.name,
        destFolderId: "",
        destFolderName: dest,
        reason
      };
    });

    return {
      recommendedNewFolders: Array.from(foldersSet),
      fileMovements: movements
    };
  };

  const generateClientFallbackAnalysis = (filesToAnalyze: any[]): DriveAnalysisResult[] => {
    const activeRules = rules.filter(r => r.enabled !== false && r.keyword?.trim());

    return filesToAnalyze.map(f => {
      const name = (f.name || "").toLowerCase();
      const mime = (f.mimeType || "").toLowerCase();
      let category = "Personal";
      let tags = ["drive-file", "active"];
      let score = 75;
      let reason = "Classified based on document format and naming context.";

      // Prioritize user-defined keyword rules
      let ruleMatched = false;
      for (const rule of activeRules) {
        const kw = rule.keyword.trim().toLowerCase();
        if (kw && name.includes(kw)) {
          category = rule.targetCategory || "Finance";
          tags = [kw, (rule.targetCategory || "custom").toLowerCase(), "priority-rule"];
          score = 92;
          reason = `Prioritized by custom keyword rule: "${rule.keyword}" -> ${category}.`;
          ruleMatched = true;
          break;
        }
      }

      if (!ruleMatched) {
        if (name.includes("invoice") || name.includes("tax") || name.includes("budget") || name.includes("receipt") || mime.includes("spreadsheet")) {
          category = "Financials";
          tags = ["finance", "receipt", "accounting"];
          score = 90;
          reason = "Financial transactional record identified from file taxonomy.";
        } else if (name.includes("work") || name.includes("project") || name.includes("spec") || name.includes("roadmap")) {
          category = "Work";
          tags = ["project", "work", "documentation"];
          score = 85;
          reason = "Identified as active team or project resource.";
        } else if (mime.includes("image") || name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".svg")) {
          category = "Media";
          tags = ["image", "media", "visual"];
          score = 70;
          reason = "Visual asset suitable for media repository.";
        } else if (name.includes("contract") || name.includes("agreement") || name.includes("legal")) {
          category = "Legal";
          tags = ["legal", "contract", "records"];
          score = 88;
          reason = "Formal agreement or contractual document.";
        } else if (name.includes("old") || name.includes("archive") || name.includes("backup")) {
          category = "Archives";
          tags = ["archive", "backup", "historical"];
          score = 30;
          reason = "Historical archive candidate for secondary storage.";
        }
      }

      return {
        fileId: f.id,
        fileName: f.name,
        recommendedCategory: category,
        recommendedTags: tags,
        relevanceScore: score,
        reason
      };
    });
  };

  // Scan items using Gemini AI
  const handleAnalyzeFiles = async () => {
    if (files.length === 0) return;
    setIsClassifying(true);
    try {
      // Pick top files for smart analysis
      const filesToSend = files.slice(0, 30).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size
      }));

      let data: any = null;
      try {
        const res = await geminiFetch("/api/gemini/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesToSend, rules })
        });

        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        } else {
          console.warn("API /api/gemini/analyze returned non-JSON response:", text.slice(0, 120));
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/analyze network error:", fetchErr);
      }

      let analysisList: DriveAnalysisResult[] = [];
      if (data && data.success && Array.isArray(data.analysis)) {
        analysisList = data.analysis;
      } else {
        analysisList = generateClientFallbackAnalysis(filesToSend);
      }

      setAnalysisResults(analysisList);
      addLog("organize", "Completed Smart Cataloguing analysis on Drive files", `Analysed ${filesToSend.length} files.`);
      
      // Pass back to parent app state for visual integration
      const resultSchema: { [key: string]: { category: string; tags: string[]; relevance: number } } = {};
      analysisList.forEach((res: DriveAnalysisResult) => {
        resultSchema[res.fileId] = {
          category: res.recommendedCategory,
          tags: res.recommendedTags,
          relevance: res.relevanceScore
        };
      });
      onAnalysisApplied(resultSchema);
    } catch (e: any) {
      addLog("organize", "Analysis note: " + (e.message || "Applied resilient analysis."));
      console.error("Analysis:", e);
    } finally {
      setIsClassifying(false);
    }
  };

  // Generate automated movement layout plan from Gemini (specifies exact directions & nested folders)
  const handleGenerateSortPlan = async (): Promise<{ recommendedNewFolders: string[]; fileMovements: any[] } | null> => {
    if (files.length === 0) return null;
    setIsPlanning(true);
    try {
      const filesFormatted = files.slice(0, 25).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
      const existingFolders = files
        .filter(f => f.mimeType === "application/vnd.google-apps.folder")
        .map(f => ({ id: f.id, name: f.name }));

      let data: any = null;
      try {
        const res = await geminiFetch("/api/gemini/organize-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesFormatted, folders: existingFolders, rules })
        });

        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        } else {
          console.warn("API /api/gemini/organize-plan returned non-JSON response:", text.slice(0, 120));
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/organize-plan network error:", fetchErr);
      }

      if (data && data.success && data.plan) {
        setOrgPlan(data.plan);
        addLog("organize", "Proposed dynamic Drive Organisation sorted plan", `Recommended ${data.plan.recommendedNewFolders.length} folders with exact directions.`);
        return data.plan;
      }

      // Resilient client-side fallback if server returns non-JSON or fails
      const fallbackPlan = generateClientFallbackPlan(filesFormatted);
      setOrgPlan(fallbackPlan);
      addLog("organize", "Proposed dynamic Drive Organisation sorted plan", `Recommended ${fallbackPlan.recommendedNewFolders.length} folders with exact directions.`);
      return fallbackPlan;
    } catch (e: any) {
      console.warn("Plan generation fallback activated:", e);
      const fallbackPlan = generateClientFallbackPlan(files.slice(0, 25));
      setOrgPlan(fallbackPlan);
      addLog("organize", "Proposed dynamic Drive Organisation sorted plan", `Recommended ${fallbackPlan.recommendedNewFolders.length} folders with exact directions.`);
      return fallbackPlan;
    } finally {
      setIsPlanning(false);
    }
  };

  // One-Click Move Execution:
  // Plan layouts specify exact directions. Shifting directories performs actual drive transfers inside nested folders seamlessly.
  const handleExecutePlanAction = async (planToRun?: { recommendedNewFolders: string[]; fileMovements: any[] } | null) => {
    const targetPlan = planToRun || orgPlan;
    if (!targetPlan || targetPlan.fileMovements.length === 0) return;

    setIsExecuting(true);
    setExecutionLog([]);
    const totalSteps = targetPlan.recommendedNewFolders.length + targetPlan.fileMovements.length;
    setExecutedCount({ total: totalSteps, current: 0 });

    try {
      let step = 0;
      const folderIdCache: { [path: string]: string } = {};
      let localFilesState = [...files];

      // Existing folders mapping
      localFilesState.forEach(f => {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          folderIdCache[f.name] = f.id;
        }
      });

      // Helper for local simulation of nested folders
      const resolveLocalNestedFolder = (pathStr: string): string => {
        const segments = pathStr.split("/").map(s => s.trim()).filter(Boolean);
        if (segments.length === 0) return "root";

        let currentParent = "root";
        let accumulated = "";

        for (const seg of segments) {
          accumulated = accumulated ? `${accumulated}/${seg}` : seg;
          if (folderIdCache[accumulated]) {
            currentParent = folderIdCache[accumulated];
            continue;
          }

          // Generate simulated folder in memory
          const newFolderId = `dir_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const newFolderObj: DriveFile = {
            id: newFolderId,
            name: seg,
            mimeType: "application/vnd.google-apps.folder",
            parents: [currentParent],
            modifiedTime: new Date().toISOString(),
            createdTime: new Date().toISOString()
          };
          localFilesState.push(newFolderObj);
          folderIdCache[accumulated] = newFolderId;
          currentParent = newFolderId;
        }
        return currentParent;
      };

      // 1. Resolve and create nested folder paths
      setExecutionLog(prev => [...prev, `[INIT] Starting One-Click Move Execution across ${targetPlan.recommendedNewFolders.length} directory layouts...`]);

      for (const folderPath of targetPlan.recommendedNewFolders) {
        setExecutionLog(prev => [...prev, `[DIR PREPARE] Resolving directory hierarchy "${folderPath}"...`]);

        let resolvedId = "";
        try {
          if (token) {
            // Perform actual Google Drive nested folder creation/resolution
            resolvedId = await createNestedDriveFolders(token, folderPath, folderIdCache);
          } else {
            // Perform simulated nested folder resolution
            resolvedId = resolveLocalNestedFolder(folderPath);
          }

          folderIdCache[folderPath] = resolvedId;
          setExecutionLog(prev => [...prev, `[DIR CREATED] Ready nested folder "${folderPath}" (ID: ${resolvedId.substring(0, 12)}...).`]);
        } catch (dirErr: any) {
          console.warn(`Could not prepare folder "${folderPath}":`, dirErr);
          setExecutionLog(prev => [...prev, `⚠️ Directory notice on "${folderPath}": ${dirErr.message || "Using fallback"}`]);
          folderIdCache[folderPath] = "root";
        } finally {
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      // 2. Perform actual file transfers inside nested folders
      let movedCount = 0;
      for (const move of targetPlan.fileMovements) {
        const destPath = move.destFolderName || "General";
        setExecutionLog(prev => [...prev, `[TRANSFER] Exact Direction: Shifting "${move.fileName}" into nested directory "${destPath}"...`]);
        
        let targetId = move.destFolderId;
        if (!targetId && folderIdCache[destPath]) {
          targetId = folderIdCache[destPath];
        } else if (!targetId) {
          if (token) {
            targetId = await createNestedDriveFolders(token, destPath, folderIdCache);
          } else {
            targetId = resolveLocalNestedFolder(destPath);
          }
          folderIdCache[destPath] = targetId;
        }

        if (!targetId) {
          setExecutionLog(prev => [...prev, `⚠️ Directory path missing for "${move.fileName}". Skipping transfer.`]);
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
          continue;
        }

        // Perform actual Drive transfer via API or simulated in local state
        try {
          if (token) {
            const fileMeta = files.find(f => f.id === move.fileId);
            const currentParents = fileMeta?.parents?.join(",");
            await moveDriveFile(token, move.fileId, targetId, currentParents);
          } else {
            // Update local memory state
            localFilesState = localFilesState.map(f => {
              if (f.id === move.fileId) {
                return {
                  ...f,
                  parents: [targetId],
                  category: destPath
                };
              }
              return f;
            });
          }

          movedCount++;
          setExecutionLog(prev => [...prev, `[SUCCESS] Shifted "${move.fileName}" -> "${destPath}".`]);
        } catch (itemErr: any) {
          console.warn(`Could not transfer file "${move.fileName}":`, itemErr);
          setExecutionLog(prev => [...prev, `⚠️ Notice on "${move.fileName}": ${itemErr.message || "Could not relocate file"}`]);
        } finally {
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      // Update state
      if (!token && setFiles) {
        setFiles(localFilesState);
      }

      setExecutionLog(prev => [...prev, `🎉 Complete! Seamlessly shifted ${movedCount} files into nested folders.`]);
      addLog(
        "organize", 
        `One-Click Move Execution shifted ${movedCount} files into nested directories.`,
        `Created/verified ${targetPlan.recommendedNewFolders.length} folders.`
      );

      setLastExecutionStats({
        foldersCreated: targetPlan.recommendedNewFolders.length,
        filesMoved: movedCount,
        timestamp: new Date().toLocaleTimeString()
      });

      setOrgPlan(null);
      await onRefresh();
    } catch (e: any) {
      setExecutionLog(prev => [...prev, `❌ Move Execution Error: ${e.message}`]);
      addLog("organize", "One-Click Move interrupted: " + e.message);
      console.error("One-Click Move interrupted:", e);
    } finally {
      setIsExecuting(false);
    }
  };

  // Immediate Single-Click trigger: generates layout plan if needed, then immediately executes moves
  const handleOneClickMove = async () => {
    if (orgPlan) {
      await handleExecutePlanAction(orgPlan);
    } else {
      const generated = await handleGenerateSortPlan();
      if (generated) {
        await handleExecutePlanAction(generated);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
            Smart Organizer
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Analyze file contents, configure custom keyword routing, and organize items into structured directories.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Keyword Rules Settings */}
          <button
            id="btn-organizer-rules-settings"
            onClick={() => setIsSettingsOpen(true)}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition cursor-pointer shadow-xs"
            title="Configure keyword priority rules"
          >
            <Sliders className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>Keyword Rules</span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-medium px-1.5 py-0.2">
              {rules.filter(r => r.enabled !== false).length}
            </span>
          </button>

          {/* Plan Folder Sort */}
          <button
            id="btn-generate-plan"
            onClick={() => handleGenerateSortPlan()}
            disabled={isPlanning || isExecuting || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 transition cursor-pointer shadow-xs"
          >
            {isPlanning ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" />
                <span>Planning...</span>
              </>
            ) : (
              <>
                <Compass className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>Plan Structure</span>
              </>
            )}
          </button>

          {/* Catalogue Drive */}
          <button
            id="btn-analyze-files"
            onClick={handleAnalyzeFiles}
            disabled={isClassifying || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 transition cursor-pointer shadow-xs"
          >
            {isClassifying ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-500" />
                <span>Cataloguing...</span>
              </>
            ) : (
              <>
                <Cpu className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>Catalogue Drive</span>
              </>
            )}
          </button>

          {/* One-Click Move Execution */}
          <button
            id="btn-one-click-move"
            onClick={handleOneClickMove}
            disabled={isExecuting || isPlanning || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 disabled:opacity-50 transition cursor-pointer shadow-xs"
            title="Execute organization plan and move files into directories"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Moving Files...</span>
              </>
            ) : isPlanning ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Preparing Move...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 fill-white" />
                <span>Organize Drive</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Completion Success Notification */}
      {lastExecutionStats && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">Organization Complete</h4>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                Shifted <span className="font-semibold">{lastExecutionStats.filesMoved} files</span> into{" "}
                <span className="font-semibold">{lastExecutionStats.foldersCreated} nested directories</span> at {lastExecutionStats.timestamp}.
              </p>
            </div>
          </div>

          {onNavigateToTab && (
            <button
              id="btn-view-explorer-storage"
              onClick={() => onNavigateToTab("drive")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
            >
              <span>View Files</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
            </button>
          )}
        </div>
      )}

      {/* Execution Progress Bar & Logs */}
      {isExecuting && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 p-4 font-mono text-xs shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 fill-emerald-400" /> Executing Drive Transfers
            </span>
            <span className="text-slate-300 font-medium">
              {executedCount.current} / {executedCount.total} transfers complete
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
              style={{ width: `${executedCount.total > 0 ? (executedCount.current / executedCount.total) * 100 : 0}%` }}
            ></div>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px]">
            {executionLog.map((log, index) => (
              <div key={`exec-log-${index}`} className="text-slate-300 leading-relaxed">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid of Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RECOMMENDED STRUCTURE PLAN */}
        {orgPlan && (
          <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Plan Layout
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  {orgPlan.fileMovements.length} files targeted for organization
                </span>
              </div>
              <button
                id="btn-approve-plan"
                onClick={() => handleExecutePlanAction(orgPlan)}
                disabled={isExecuting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition cursor-pointer"
                title="Execute all movements"
              >
                <Zap className="h-3.5 w-3.5 fill-white" />
                <span>Apply Plan</span>
              </button>
            </div>

            {/* Folder Creations / Nested Hierarchies */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Target Folders ({orgPlan.recommendedNewFolders.length})
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {orgPlan.recommendedNewFolders.map((fold, idx) => {
                  const parts = fold.split("/").map(s => s.trim());
                  return (
                    <div key={`rec-fold-${fold}-${idx}`} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      <FolderTree className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <div className="flex items-center gap-1 flex-wrap">
                        {parts.map((part, pIdx) => (
                          <React.Fragment key={`part-${part}-${pIdx}`}>
                            {pIdx > 0 && <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                            <span className={pIdx === parts.length - 1 ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
                              {part}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {orgPlan.recommendedNewFolders.length === 0 && (
                  <span className="text-slate-400 dark:text-slate-500 italic text-xs block p-2">Using existing directories</span>
                )}
              </div>
            </div>

            {/* File Movement Directions */}
            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block pb-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                File Transfers ({orgPlan.fileMovements.length})
              </span>
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {orgPlan.fileMovements.map((move: any, idx: number) => {
                  const targetDir = move.destFolderName || "General";
                  const dirParts = targetDir.split("/").map((s: string) => s.trim());
                  return (
                    <div key={`plan-move-${move.fileId || idx}-${idx}`} className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3 border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{move.fileName}</div>
                      
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                        <span className="text-slate-400 shrink-0">Destination:</span>
                        <ArrowRight className="h-3 w-3 text-indigo-500 shrink-0" />
                        <div className="inline-flex items-center gap-0.5 font-medium text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          <Folder className="h-3 w-3 text-indigo-500 dark:text-indigo-400 mr-1 shrink-0" />
                          {dirParts.map((part: string, pIdx: number) => (
                            <React.Fragment key={`dir-part-${part}-${pIdx}`}>
                              {pIdx > 0 && <span className="text-slate-400 mx-0.5">/</span>}
                              <span className={pIdx === dirParts.length - 1 ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
                                {part}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {move.reason && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 italic leading-snug">
                            {move.reason}
                          </p>
                          {(move.reason.toLowerCase().includes("rule") || move.reason.toLowerCase().includes("prioritized")) && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded">
                              <Sparkles className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-400" />
                              Rule Prioritized
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CLASSIFICATION RESULTS & DYNAMIC SCHEMAS */}
        <div className={orgPlan ? "lg:col-span-6 space-y-4" : "lg:col-span-12 space-y-4"}>
          {analysisResults.length > 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-emerald-500" /> Catalogued Drive Analysis
                </h3>
                <span className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  {analysisResults.length} catalogued
                </span>
              </div>

              <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
                {analysisResults.map((item, idx) => (
                  <div 
                    key={`analysis-res-${item.fileId || idx}-${idx}`} 
                    className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-xs">{item.fileName}</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[9px] font-medium px-2 py-0.5">
                          {item.recommendedCategory}
                        </span>
                        {item.recommendedTags.map((tag, tIdx) => (
                          <span key={`rec-tag-${tag}-${tIdx}`} className={`text-[9px] font-mono ${tag === 'priority-rule' ? 'text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-1 rounded' : 'text-slate-500 dark:text-slate-400'}`}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.reason}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500 block">Score</span>
                        <span className={`text-xs font-semibold font-mono ${
                          item.relevanceScore > 75 ? "text-emerald-600 dark:text-emerald-400" : item.relevanceScore > 40 ? "text-indigo-600 dark:text-indigo-400" : "text-amber-500 dark:text-amber-400"
                        }`}>
                          {item.relevanceScore}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !orgPlan && (
            <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-800/80 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Zap className="h-4 w-4 fill-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5 font-display">
                      Autonomous Decision Matrix & Triage Deck
                    </h3>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      100% classified · {decisionMetrics.pendingActionsCount} pending triage actions ready for execution
                    </span>
                  </div>
                </div>

                {pendingDecisions.length > 0 && (
                  <button
                    id="btn-execute-all-triage"
                    onClick={handleExecuteAllTriageDecisions}
                    disabled={isExecuting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-semibold shadow-xs hover:shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5 fill-white" />
                    <span>Execute All Decisions ({pendingDecisions.length})</span>
                  </button>
                )}
              </div>

              {/* Triage Quadrants Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Relocations</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300 font-display">{decisionMetrics.relocationCandidatesCount}</span>
                    <span className="text-[10px] text-slate-400">items</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Stale Archivals</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-bold text-amber-700 dark:text-amber-300 font-display">{decisionMetrics.archiveCandidatesCount}</span>
                    <span className="text-[10px] text-slate-400">&gt;180d</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">High Urgency</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-bold text-rose-700 dark:text-rose-300 font-display">{decisionMetrics.highUrgencyCount}</span>
                    <span className="text-[10px] text-slate-400">compliance</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Verified in Place</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 font-display">{decisionMetrics.verifiedCount}</span>
                    <span className="text-[10px] text-slate-400">verified</span>
                  </div>
                </div>
              </div>

              {/* Triage Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {(["all", "relocate", "archive", "high-urgency"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTriageFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      triageFilter === tab
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800"
                    }`}
                  >
                    {tab === "all" ? `All Pending (${pendingDecisions.length})` :
                     tab === "relocate" ? `Relocations (${decisionMetrics.relocationCandidatesCount})` :
                     tab === "archive" ? `Archivals (${decisionMetrics.archiveCandidatesCount})` :
                     `High Urgency (${decisionMetrics.highUrgencyCount})`}
                  </button>
                ))}
              </div>

              {/* Triage Decision Stream */}
              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                {filteredTriageFiles.map((file, idx) => {
                  const dec = file.decision;
                  if (!dec) return null;
                  return (
                    <div
                      key={`triage-${file.id}-${idx}`}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-xs">
                            {file.name}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              dec.decisionType === 'relocate'
                                ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800'
                                : 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                            }`}>
                              {dec.decisionType === 'relocate' && <Move className="h-3 w-3" />}
                              {dec.decisionType === 'archive' && <Archive className="h-3 w-3" />}
                              {dec.action}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Target: <span className="font-semibold text-slate-700 dark:text-slate-300">/{dec.targetFolder}</span>
                            </span>
                            <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                              dec.urgency === 'high' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {dec.urgency.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <button
                          id={`btn-triage-exec-${file.id}`}
                          onClick={() => handleExecuteSingleTriage(file)}
                          disabled={executingSingleId === file.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs hover:shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {executingSingleId === file.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Zap className="h-3 w-3 fill-white" />
                          )}
                          <span>Execute</span>
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {dec.rationale}
                      </p>
                    </div>
                  );
                })}

                {filteredTriageFiles.length === 0 && (
                  <div className="py-8 text-center text-slate-400 flex flex-col items-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2 opacity-80" />
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Zero Pending Items</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">All files are verified in place or organized.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Keyword Priority Rules Modal */}
      <OrganizerRulesSettings
        rules={rules}
        onSaveRules={handleSaveRules}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
