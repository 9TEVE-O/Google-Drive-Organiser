import { geminiFetch } from "../lib/geminiApi";
import React, { useState } from "react";
import { 
  Play, Sparkles, FolderPlus, Compass, ArrowRight, CheckCircle2, 
  RefreshCw, ListChecks, HelpCircle, HardDrive, Cpu, AlertTriangle, Layers,
  Zap, FolderTree, ChevronRight, Check, ArrowUpRight, Folder, Sliders,
  Archive, ShieldAlert, Move, Send, Clock, RotateCcw, Undo2, CheckSquare, Square,
  AlertCircle, Info, X
} from "lucide-react";
import { createDriveFolder, createNestedDriveFolders, moveDriveFile, renameDriveFile, trashDriveFile } from "../lib/googleApi";
import { evaluateFileDecision, getDecisionSystemMetrics } from "../lib/decisionEngine";
import { 
  DriveFile, DriveAnalysisResult, OrganizationReport, OrganizerRule, 
  OrganizationPlan, ProposedAction, SmartTaskReminder,
  TriageDecision, TriagePlan, UndoSnapshot, UndoSnapshotMove, CanonicalCategory,
  TriageAction, TriageUrgency
} from "../types";
import InfoTooltip from "./InfoTooltip";
import OrganizerRulesSettings, { DEFAULT_ORGANIZER_RULES } from "./OrganizerRulesSettings";
import ContentIntelligencePanel from "./ContentIntelligencePanel";

interface SmartOrganizerProps {
  token: string | null;
  files: DriveFile[];
  onRefresh: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  onAnalysisApplied: (planData: { [key: string]: { category: string; tags: string[]; relevance: number } }) => void;
  setFiles?: React.Dispatch<React.SetStateAction<DriveFile[]>>;
  onNavigateToTab?: (tab: string) => void;
  onSaveReminders?: (reminders: SmartTaskReminder[]) => void;
}

export default function SmartOrganizer({
  token,
  files,
  onRefresh,
  addLog,
  onAnalysisApplied,
  setFiles,
  onNavigateToTab,
  onSaveReminders
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
  const [orgPlan, setOrgPlan] = useState<OrganizationPlan | null>(null);

  // Execution logs
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [executedCount, setExecutedCount] = useState({ total: 0, current: 0 });
  const [lastExecutionStats, setLastExecutionStats] = useState<{
    foldersCreated: number;
    filesMoved: number;
    timestamp: string;
    remindersCreated: number;
  } | null>(null);

  // Selection & Editing state for Governed Mutation (System 2)
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const [selectedReminderIds, setSelectedReminderIds] = useState<Set<string>>(new Set());
  const [editableActions, setEditableActions] = useState<{ [fileId: string]: ProposedAction }>({});
  const [editingActionId, setEditingActionId] = useState<string | null>(null);

  // Schema-locked Triage Plan & Staging State (Pipeline Step 2 & 3)
  const [triagePlan, setTriagePlan] = useState<TriagePlan | null>(null);
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<Set<string>>(new Set());

  // Pre-Commit Rollback Snapshot & Undo State (Pipeline Step 4)
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(() => {
    try {
      const saved = localStorage.getItem("drive_organizer_undo_snapshot");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [undoBanner, setUndoBanner] = useState<{ message: string; count: number } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [organizerAsyncState, setOrganizerAsyncState] = useState<{
    status: "idle" | "loading" | "success" | "empty" | "failed";
    message: string | null;
    retryFn: (() => Promise<any>) | null;
  }>({ status: "idle", message: null, retryFn: null });

  // Decisions grouped by Target Category for Step A: Grouped Interactive Staging Card
  const decisionsGroupedByCategory = React.useMemo(() => {
    if (!triagePlan?.decisions) return {};
    const groups: { [cat: string]: TriageDecision[] } = {};
    for (const d of triagePlan.decisions) {
      const cat = d.targetCategory || "Project Operations";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    }
    return groups;
  }, [triagePlan]);

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
    const targetFolder = meta.decision.targetFolder || "General";
    setOrganizerAsyncState({
      status: "loading",
      message: `Relocating "${file.name}" to /${targetFolder}...`,
      retryFn: null
    });
    try {
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
      setOrganizerAsyncState({
        status: "success",
        message: `Relocated "${file.name}" to /${targetFolder}.`,
        retryFn: null
      });
    } catch (err: any) {
      console.warn("Single triage notice:", err);
      addLog("move", `Triage notice for "${file.name}": ${err.message || "Failed"}`);
      setOrganizerAsyncState({
        status: "failed",
        message: `Failed to relocate "${file.name}" to /${targetFolder}: ${err.message || "Google Drive API error"}`,
        retryFn: () => handleExecuteSingleTriage(file)
      });
    } finally {
      setExecutingSingleId(null);
    }
  };

  // Convert all pending decisions into a structured plan and execute directly
  const handleExecuteAllTriageDecisions = async () => {
    if (pendingDecisions.length === 0) return;
    const actions: ProposedAction[] = pendingDecisions.map(f => {
      const target = f.decision?.targetFolder || "General";
      return {
        fileId: f.id,
        originalName: f.name,
        proposedName: f.name,
        currentParentId: f.parents?.[0] || "root",
        proposedFolderPath: target,
        actionType: f.decision?.decisionType === "archive" ? "ARCHIVE" : "MOVE",
        confidence: f.decision?.confidence || 0.8,
        rationale: f.decision?.rationale || `Relocate to /${target}`
      };
    });

    const triagePlan: OrganizationPlan = {
      summary: "Executing bulk triage decisions from the autonomous engine.",
      proposedActions: actions
    };

    await handleExecutePlanAction(triagePlan);
  };

  // Client-side fallback helpers if server response is non-JSON or API temporarily unavailable
  const generateClientFallbackPlan = (filesToPlan: DriveFile[]): { plan: OrganizationPlan; triage: TriagePlan } => {
    const activeRules = rules.filter(r => r.enabled !== false && r.keyword?.trim());
    
    let relocateCount = 0;
    let archiveCount = 0;
    let protectCount = 0;

    const decisions: TriageDecision[] = filesToPlan.map(f => {
      let dest: CanonicalCategory = "Project Operations";
      const name = (f.name || "").toLowerCase();
      const mime = (f.mimeType || "").toLowerCase();
      let action: TriageAction = "relocate";
      let urgency: TriageUrgency = "medium";
      let ruleMatched = false;
      let reason = `Classified into ${dest} based on file taxonomy.`;

      // Prioritize user-defined keyword rules
      for (const rule of activeRules) {
        const kw = rule.keyword.trim().toLowerCase();
        if (kw && name.includes(kw)) {
          dest = (rule.targetFolder || rule.targetCategory || "Project Operations") as CanonicalCategory;
          reason = `Prioritized by custom keyword rule: "${rule.keyword}" -> ${dest}.`;
          ruleMatched = true;
          break;
        }
      }

      if (!ruleMatched) {
        if (name.includes("invoice") || name.includes("tax") || name.includes("budget") || name.includes("receipt") || mime.includes("spreadsheet") || name.endsWith(".csv") || name.endsWith(".xlsx")) {
          dest = "Financials & Billing";
          urgency = "high";
          reason = "Financial transactional record identified.";
        } else if (name.includes("contract") || name.includes("agreement") || name.includes("legal") || name.includes("nda") || name.includes("policy")) {
          dest = "Legal & Contracts";
          action = "protect";
          urgency = "high";
          reason = "Legal contract flagged for protected review.";
        } else if (mime.includes("image") || name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".svg") || name.includes("brand") || name.includes("logo")) {
          dest = "Marketing & Assets";
          reason = "Brand or media graphic asset.";
        } else if (name.includes("resume") || name.includes("onboarding") || name.includes("hr")) {
          dest = "HR & Operations";
          reason = "HR or personnel documentation.";
        } else if (name.includes("archive") || name.includes("old") || name.includes("backup") || name.endsWith(".zip") || name.endsWith(".tar.gz")) {
          dest = "Archives & Backups";
          action = "archive";
          urgency = "low";
          reason = "Compressed archive or legacy backup file.";
        }
      }

      if (action === "relocate") relocateCount++;
      if (action === "archive") archiveCount++;
      if (action === "protect") protectCount++;

      return {
        fileId: f.id,
        fileName: f.name,
        targetCategory: dest,
        action,
        confidence: 0.9,
        urgency,
        rationale: reason,
        size: f.size,
        currentParentId: f.parents?.[0] || "root"
      };
    });

    const proposedActions: ProposedAction[] = decisions.map(d => ({
      fileId: d.fileId,
      originalName: d.fileName,
      proposedName: d.fileName,
      currentParentId: d.currentParentId || "root",
      proposedFolderPath: d.targetCategory,
      actionType: d.action === "archive" ? "ARCHIVE" : (d.action === "protect" ? "SKIP" : "MOVE"),
      confidence: d.confidence,
      rationale: d.rationale
    }));

    const triage: TriagePlan = {
      summary: {
        totalAnalyzed: filesToPlan.length,
        relocateCount,
        archiveCount,
        protectCount
      },
      decisions
    };

    const plan: OrganizationPlan = {
      summary: "Generated rule-based organization plan (client fallback).",
      proposedActions
    };

    return { plan, triage };
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
    if (files.length === 0) {
      setOrganizerAsyncState({
        status: "empty",
        message: "No Drive files available to analyse.",
        retryFn: null
      });
      return;
    }
    setIsClassifying(true);
    setOrganizerAsyncState({
      status: "loading",
      message: `Cataloguing and analysing ${Math.min(files.length, 30)} Drive file(s) with Gemini...`,
      retryFn: null
    });
    try {
      // Pick top files for smart analysis
      const filesToSend = files.slice(0, 30).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size
      }));

      let data: any = null;
      let upstreamError: string | null = null;
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
          upstreamError = `HTTP ${res.status} non-JSON response`;
          console.warn("API /api/gemini/analyze returned non-JSON response:", text.slice(0, 120));
        }
      } catch (fetchErr: any) {
        upstreamError = fetchErr?.message || "Network error";
        console.warn("Fetch /api/gemini/analyze network error:", fetchErr);
      }

      let analysisList: DriveAnalysisResult[] = [];
      if (data && data.success && Array.isArray(data.analysis)) {
        analysisList = data.analysis;
        setOrganizerAsyncState({
          status: analysisList.length === 0 ? "empty" : "success",
          message: `Completed AI cataloguing analysis for ${analysisList.length} file(s).`,
          retryFn: null
        });
      } else {
        analysisList = generateClientFallbackAnalysis(filesToSend);
        setOrganizerAsyncState({
          status: "failed",
          message: `AI analysis endpoint unreachable (${upstreamError || data?.error || "Fallback active"}). Applied deterministic rule-based classification to ${analysisList.length} file(s).`,
          retryFn: handleAnalyzeFiles
        });
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
      setOrganizerAsyncState({
        status: "failed",
        message: `File analysis failed: ${e.message || "Unexpected error"}`,
        retryFn: handleAnalyzeFiles
      });
    } finally {
      setIsClassifying(false);
    }
  };

  // Generate automated movement layout plan from Gemini (Pipeline Step 2: Gemini Triage)
  const handleGenerateSortPlan = async (limitCount = 25): Promise<OrganizationPlan | null> => {
    if (files.length === 0) {
      setOrganizerAsyncState({
        status: "empty",
        message: "No Drive files available to generate a triage sort plan.",
        retryFn: null
      });
      return null;
    }
    setIsPlanning(true);
    setOrganizerAsyncState({
      status: "loading",
      message: `Generating taxonomy organisation plan for up to ${limitCount} file(s)...`,
      retryFn: null
    });
    try {
      // Pick unfiled files or candidates bounded by limitCount
      const candidateFiles = files.filter(f => f.mimeType !== "application/vnd.google-apps.folder");
      const filesToSend = candidateFiles.length > 0 ? candidateFiles.slice(0, limitCount) : files.slice(0, limitCount);
      const filesFormatted = filesToSend.map(f => ({ 
        id: f.id, 
        name: f.name, 
        mimeType: f.mimeType, 
        parents: f.parents,
        size: f.size 
      }));
      const existingFolders = files
        .filter(f => f.mimeType === "application/vnd.google-apps.folder")
        .map(f => ({ id: f.id, name: f.name }));

      let data: any = null;
      let upstreamError: string | null = null;
      try {
        const res = await geminiFetch("/api/gemini/organize-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesFormatted, folders: existingFolders, rules })
        });

        const text = await res.text();
        if (text && text.includes("{")) {
          data = JSON.parse(text);
        } else {
          upstreamError = `HTTP ${res.status} non-JSON response`;
          console.warn("API /api/gemini/organize-plan returned non-JSON response:", text.slice(0, 120));
        }
      } catch (fetchErr: any) {
        upstreamError = fetchErr?.message || "Network error";
        console.warn("Fetch /api/gemini/organize-plan network error:", fetchErr);
      }

      if (data && data.success && data.plan) {
        setOrgPlan(data.plan);

        // Extract Schema-Locked Triage Plan (Pipeline Step 2 -> 3)
        const decisionsArray: TriageDecision[] = Array.isArray(data.plan.decisions)
          ? data.plan.decisions
          : (Array.isArray(data.decisions) ? data.decisions : []);

        if (decisionsArray.length > 0) {
          // H-03: Ensure we pick the correct summary object or derive it if missing
          const rawSummary = data.plan.summary || data.summary || {};
          const triage: TriagePlan = {
            summary: {
              totalAnalyzed: typeof rawSummary.totalAnalyzed === 'number' ? rawSummary.totalAnalyzed : decisionsArray.length,
              relocateCount: typeof rawSummary.relocateCount === 'number' ? rawSummary.relocateCount : decisionsArray.filter(d => d.action === "relocate").length,
              archiveCount: typeof rawSummary.archiveCount === 'number' ? rawSummary.archiveCount : decisionsArray.filter(d => d.action === "archive").length,
              protectCount: typeof rawSummary.protectCount === 'number' ? rawSummary.protectCount : decisionsArray.filter(d => d.action === "protect").length
            },
            decisions: decisionsArray.map(d => ({
              ...d,
              size: filesToSend.find(f => f.id === d.fileId)?.size || "Unknown",
              currentParentId: filesToSend.find(f => f.id === d.fileId)?.parents?.[0] || "root"
            }))
          };
          setTriagePlan(triage);
          setSelectedDecisionIds(new Set(triage.decisions.map(d => d.fileId)));
        }

        // Default select all high confidence actions
        const initialSelected = new Set<string>();
        (data.plan.proposedActions || []).forEach((a: ProposedAction) => {
          if (a.actionType !== 'SKIP' && a.confidence >= 0.6) {
            initialSelected.add(a.fileId);
          }
        });
        setSelectedActionIds(initialSelected);

        const initialReminders = new Set<string>();
        if (data.plan.proposedReminders) {
           data.plan.proposedReminders.forEach((r: any, idx: number) => {
             initialReminders.add(`rem-${r.fileId}-${idx}`);
           });
        }
        setSelectedReminderIds(initialReminders);

        addLog("organize", `Triage plan generated for ${filesToSend.length} files.`, `Bound to 6 canonical categories.`);
        setOrganizerAsyncState({
          status: "success",
          message: `Generated AI organisation plan for ${filesToSend.length} file(s). Review proposed actions below.`,
          retryFn: null
        });
        return data.plan;
      }

      // Resilient client-side fallback if server returns non-JSON or fails
      const fallbackResult = generateClientFallbackPlan(filesToSend);
      setOrgPlan(fallbackResult.plan);
      setTriagePlan(fallbackResult.triage);
      setSelectedDecisionIds(new Set(fallbackResult.triage.decisions.map(d => d.fileId)));
      setSelectedActionIds(new Set(fallbackResult.plan.proposedActions.map(a => a.fileId)));
      addLog("organize", `Proposed deterministic Drive Organisation plan (client fallback)`, fallbackResult.plan.summary);
      setOrganizerAsyncState({
        status: "failed",
        message: `AI planner service unavailable (${upstreamError || data?.error || "Fallback triggered"}). Generated deterministic rule-based plan for ${filesToSend.length} file(s).`,
        retryFn: () => handleGenerateSortPlan(limitCount)
      });
      return fallbackResult.plan;
    } catch (e: any) {
      console.warn("Plan generation fallback activated:", e);
      const fallbackResult = generateClientFallbackPlan(files.slice(0, limitCount));
      setOrgPlan(fallbackResult.plan);
      setTriagePlan(fallbackResult.triage);
      setSelectedDecisionIds(new Set(fallbackResult.triage.decisions.map(d => d.fileId)));
      setSelectedActionIds(new Set(fallbackResult.plan.proposedActions.map(a => a.fileId)));
      addLog("organize", "Proposed deterministic Drive Organisation plan (error fallback)", fallbackResult.plan.summary);
      setOrganizerAsyncState({
        status: "failed",
        message: `Plan generation encountered an error (${e.message || "Unexpected error"}). Loaded deterministic fallback plan.`,
        retryFn: () => handleGenerateSortPlan(limitCount)
      });
      return fallbackResult.plan;
    } finally {
      setIsPlanning(false);
    }
  };

  // Step 4: Snapshot & Move (Staged Batch Execution with Instant Snapshot Undo)
  const handleExecuteApprovedMoves = async () => {
    if (!triagePlan || triagePlan.decisions.length === 0) {
      if (orgPlan) return handleExecutePlanAction(orgPlan);
      return;
    }

    const decisionsToRun = triagePlan.decisions.filter(d => selectedDecisionIds.has(d.fileId));
    if (decisionsToRun.length === 0) return;

    setIsExecuting(true);
    setExecutionLog([]);
    setExecutedCount({ total: decisionsToRun.length + 6, current: 0 });

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

      // 1. Resolve canonical destination folders
      const uniqueCategories: CanonicalCategory[] = Array.from(new Set<CanonicalCategory>(decisionsToRun.map(d => d.targetCategory)));
      setExecutionLog(prev => [...prev, `[INIT] Preparing ${uniqueCategories.length} canonical destination folders...`]);

      for (const cat of uniqueCategories) {
        if (!folderIdCache[cat]) {
          try {
            if (token) {
              const created = await createDriveFolder(token, cat, "root");
              folderIdCache[cat] = created.id;
            } else {
              const simId = `folder_${cat.replace(/\s+/g, '_').toLowerCase()}`;
              folderIdCache[cat] = simId;
              localFilesState.push({
                id: simId,
                name: cat,
                mimeType: "application/vnd.google-apps.folder",
                parents: ["root"],
                createdTime: new Date().toISOString()
              });
            }
            setExecutionLog(prev => [...prev, `[DIR READY] /${cat}`]);
          } catch (folderErr: any) {
            console.warn(`Could not create folder "${cat}":`, folderErr);
            folderIdCache[cat] = "root";
          }
        }
        step++;
        setExecutedCount(prev => ({ ...prev, current: step }));
      }

      // Step B: The Pre-Commit Rollback Snapshot
      const movesForSnapshot: UndoSnapshotMove[] = decisionsToRun.map(d => {
        const origFile = files.find(f => f.id === d.fileId);
        return {
          fileId: d.fileId,
          fileName: d.fileName || origFile?.name || "file",
          originalParentId: d.currentParentId || origFile?.parents?.[0] || "root",
          newParentId: folderIdCache[d.targetCategory] || "root",
          targetCategory: d.targetCategory
        };
      });

      const snapshot: UndoSnapshot = {
        timestamp: new Date().toISOString(),
        moves: movesForSnapshot
      };
      localStorage.setItem("drive_organizer_undo_snapshot", JSON.stringify(snapshot));
      setUndoSnapshot(snapshot);
      setExecutionLog(prev => [...prev, `[SNAPSHOT] Pre-commit undo snapshot recorded for ${movesForSnapshot.length} files.`]);

      // 2. Dispatch file moves
      let successCount = 0;
      for (const move of movesForSnapshot) {
        setExecutionLog(prev => [...prev, `[MOVE] "${move.fileName}" ──> /${move.targetCategory}`]);
        try {
          if (token) {
            await moveDriveFile(token, move.fileId, move.newParentId, move.originalParentId);
          } else {
            localFilesState = localFilesState.map(f => {
              if (f.id === move.fileId) {
                return {
                  ...f,
                  parents: [move.newParentId],
                  category: move.targetCategory
                };
              }
              return f;
            });
          }
          successCount++;
        } catch (itemErr: any) {
          console.warn(`Could not move "${move.fileName}":`, itemErr);
          setExecutionLog(prev => [...prev, `⚠️ Error moving "${move.fileName}": ${itemErr.message || "Failed"}`]);
        } finally {
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      if (!token && setFiles) {
        setFiles(localFilesState);
      }

      setExecutionLog(prev => [...prev, `🎉 Staged Batch Completed: Moved ${successCount} files into canonical directories.`]);
      addLog("organize", `Executed batch triage for ${successCount} files.`, `Pre-commit undo snapshot active.`);

      setLastExecutionStats({
        foldersCreated: uniqueCategories.length,
        filesMoved: successCount,
        timestamp: new Date().toLocaleTimeString(),
        remindersCreated: 0
      });

      // Step C: Trigger Floating Undo Banner
      setUndoBanner({
        message: `Successfully organised ${successCount} files.`,
        count: successCount
      });

      setTriagePlan(null);
      setOrgPlan(null);
      await onRefresh();
      setOrganizerAsyncState({
        status: "success",
        message: `Staged batch complete: Moved ${successCount} file(s) into canonical directories.`,
        retryFn: null
      });
    } catch (e: any) {
      console.error("Batch execution failed:", e);
      setExecutionLog(prev => [...prev, `❌ Batch Execution Error: ${e.message}`]);
      addLog("organize", "Batch execution interrupted: " + e.message);
      setOrganizerAsyncState({
        status: "failed",
        message: `Staged batch execution failed: ${e.message || "Google Drive API error"}`,
        retryFn: handleExecuteApprovedMoves
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Step C: The "Undo Last Batch" Execution
  const handleUndoLastBatch = async () => {
    const snapshot = undoSnapshot || (() => {
      try {
        const saved = localStorage.getItem("drive_organizer_undo_snapshot");
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    })();

    if (!snapshot || !snapshot.moves || snapshot.moves.length === 0) {
      addLog("organize", "No previous undo snapshot found.");
      setOrganizerAsyncState({
        status: "empty",
        message: "No rollback snapshot is currently available to undo.",
        retryFn: null
      });
      return;
    }

    setIsUndoing(true);
    setOrganizerAsyncState({
      status: "loading",
      message: `Restoring ${snapshot.moves.length} file(s) to original locations...`,
      retryFn: null
    });
    setExecutionLog(prev => [...prev, `[UNDO INIT] Restoring ${snapshot.moves.length} files to original locations...`]);
    let restored = 0;
    let localFilesState = [...files];

    try {
      for (const move of snapshot.moves) {
        try {
          if (token) {
            await moveDriveFile(token, move.fileId, move.originalParentId || "root", move.newParentId);
          } else {
            localFilesState = localFilesState.map(f => {
              if (f.id === move.fileId) {
                return {
                  ...f,
                  parents: [move.originalParentId || "root"]
                };
              }
              return f;
            });
          }
          restored++;
          setExecutionLog(prev => [...prev, `[RESTORED] "${move.fileName || move.fileId}" returned to original location.`]);
        } catch (itemErr: any) {
          console.warn(`Could not restore file ${move.fileId}:`, itemErr);
          setExecutionLog(prev => [...prev, `⚠️ Restore notice for "${move.fileName || move.fileId}": ${itemErr.message}`]);
        }
      }

      if (!token && setFiles) {
        setFiles(localFilesState);
      }

      localStorage.removeItem("drive_organizer_undo_snapshot");
      setUndoSnapshot(null);
      setUndoBanner({
        message: `Rollback complete: Restored ${restored} file(s) to original location.`,
        count: restored
      });
      addLog("organize", `Rollback executed: Restored ${restored} files to original locations.`);
      await onRefresh();
      setOrganizerAsyncState({
        status: "success",
        message: `Rollback complete: Restored ${restored} file(s) to their original parent folders.`,
        retryFn: null
      });
    } catch (e: any) {
      console.error("Undo batch failed:", e);
      addLog("organize", "Undo batch interrupted: " + e.message);
      setOrganizerAsyncState({
        status: "failed",
        message: `Rollback interrupted: ${e.message || "Google Drive API error"}`,
        retryFn: handleUndoLastBatch
      });
    } finally {
      setIsUndoing(false);
    }
  };

  // Verification helper: Move 1 test file into Archives & Backups and test UndoSnapshot
  const handleTestMoveSingleFile = async () => {
    const fileToTest = files.find(f => f.mimeType !== "application/vnd.google-apps.folder") || files[0];
    if (!fileToTest) {
      setOrganizerAsyncState({
        status: "empty",
        message: "No eligible file available for single-file undo verification.",
        retryFn: null
      });
      return;
    }

    setIsExecuting(true);
    setOrganizerAsyncState({
      status: "loading",
      message: `Moving test file "${fileToTest.name}" to /Archives & Backups...`,
      retryFn: null
    });
    try {
      let archiveFolderId = "root";
      const existing = files.find(f => f.mimeType === "application/vnd.google-apps.folder" && f.name === "Archives & Backups");
      if (existing) {
        archiveFolderId = existing.id;
      } else if (token) {
        const created = await createDriveFolder(token, "Archives & Backups", "root");
        archiveFolderId = created.id;
      }

      const origParent = fileToTest.parents?.[0] || "root";
      const testSnapshot: UndoSnapshot = {
        timestamp: new Date().toISOString(),
        moves: [{
          fileId: fileToTest.id,
          fileName: fileToTest.name,
          originalParentId: origParent,
          newParentId: archiveFolderId,
          targetCategory: "Archives & Backups"
        }]
      };
      localStorage.setItem("drive_organizer_undo_snapshot", JSON.stringify(testSnapshot));
      setUndoSnapshot(testSnapshot);

      if (token) {
        await moveDriveFile(token, fileToTest.id, archiveFolderId, origParent);
      } else if (setFiles) {
        setFiles(prev => prev.map(f => f.id === fileToTest.id ? { ...f, parents: [archiveFolderId], category: "Archives & Backups" } : f));
      }

      addLog("move", `Verification Test: Moved "${fileToTest.name}" to /Archives & Backups. Undo snapshot saved.`);
      setUndoBanner({
        message: `Test move successful: "${fileToTest.name}" moved to Archives & Backups.`,
        count: 1
      });
      await onRefresh();
      setOrganizerAsyncState({
        status: "success",
        message: `Test move succeeded: "${fileToTest.name}" relocated to /Archives & Backups with active undo snapshot.`,
        retryFn: null
      });
    } catch (err: any) {
      console.error("Test move error:", err);
      addLog("move", `Test move error: ${err.message}`);
      setOrganizerAsyncState({
        status: "failed",
        message: `Test move failed for "${fileToTest.name}": ${err.message || "Google Drive API error"}`,
        retryFn: handleTestMoveSingleFile
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // One-Click Move Execution:
  // Plan layouts specify exact directions. Shifting directories performs actual drive transfers inside nested folders seamlessly.
  const handleExecutePlanAction = async (planToRun?: OrganizationPlan | null) => {
    if (triagePlan && triagePlan.decisions.length > 0) {
      return handleExecuteApprovedMoves();
    }
    const targetPlan = planToRun || orgPlan;
    if (!targetPlan) return;

    const actionsToRun = targetPlan.proposedActions.filter(a => selectedActionIds.has(a.fileId));
    if (actionsToRun.length === 0 && selectedReminderIds.size === 0) return;

    setIsExecuting(true);
    setExecutionLog([]);
    
    // Derive unique folders to create (only for selected actions)
    const foldersToResolve = Array.from(new Set<string>(actionsToRun.map(a => {
      const edited = editableActions[a.fileId];
      return (edited?.proposedFolderPath || a.proposedFolderPath);
    }).filter((p): p is string => !!p && p !== "root")));
    
    const totalSteps = foldersToResolve.length + actionsToRun.length + selectedReminderIds.size;
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
      setExecutionLog(prev => [...prev, `[INIT] Starting Taxonomy Execution for ${targetPlan.proposedActions.length} files...`]);

      for (const folderPath of foldersToResolve) {
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
          setExecutionLog(prev => [...prev, `[DIR READY] "${folderPath}" (ID: ${resolvedId.substring(0, 12)}...).`]);
        } catch (dirErr: any) {
          console.warn(`Could not prepare folder "${folderPath}":`, dirErr);
          setExecutionLog(prev => [...prev, `⚠️ Directory notice on "${folderPath}": ${dirErr.message || "Using root fallback"}`]);
          folderIdCache[folderPath] = "root";
        } finally {
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      // Pre-Commit Rollback Snapshot: record original parent IDs for all items to move
      const snapshotMoves: UndoSnapshotMove[] = [];
      for (const baseAction of actionsToRun) {
        const action = editableActions[baseAction.fileId] || baseAction;
        if (action.actionType === "SKIP") continue;
        const origFile = files.find(f => f.id === action.fileId);
        const destPath = action.proposedFolderPath || "General";
        snapshotMoves.push({
          fileId: action.fileId,
          fileName: action.originalName || origFile?.name,
          originalParentId: action.currentParentId || origFile?.parents?.[0] || "root",
          newParentId: folderIdCache[destPath] || "root",
          targetCategory: destPath
        });
      }

      const snapshot: UndoSnapshot = {
        timestamp: new Date().toISOString(),
        moves: snapshotMoves
      };
      localStorage.setItem("drive_organizer_undo_snapshot", JSON.stringify(snapshot));
      setUndoSnapshot(snapshot);

      // 2. Perform actual file actions (MOVE, RENAME, etc.)
      let successCount = 0;
      for (const baseAction of actionsToRun) {
        const action = editableActions[baseAction.fileId] || baseAction;
        
        if (action.actionType === "SKIP") {
          setExecutionLog(prev => [...prev, `[SKIP] "${action.originalName}"`]);
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
          continue;
        }

        const destPath = action.proposedFolderPath || "General";
        setExecutionLog(prev => [...prev, `[ACTION] ${action.actionType}: "${action.originalName}"...`]);
        
        let targetId = folderIdCache[destPath];
        if (!targetId && destPath !== "root") {
          if (token) {
            targetId = await createNestedDriveFolders(token, destPath, folderIdCache);
          } else {
            targetId = resolveLocalNestedFolder(destPath);
          }
          folderIdCache[destPath] = targetId;
        }

        try {
          if (token) {
            // Perform actual Drive actions
            if (action.actionType === "MOVE" || action.actionType === "MOVE_AND_RENAME" || action.actionType === "ARCHIVE") {
              await moveDriveFile(token, action.fileId, targetId || "root", action.currentParentId);
            }
            
            if (action.actionType === "RENAME" || action.actionType === "MOVE_AND_RENAME") {
              if (action.proposedName && action.proposedName !== action.originalName) {
                await renameDriveFile(token, action.fileId, action.proposedName);
              }
            }

            if (action.actionType === "TRASH_DUPLICATE") {
              await trashDriveFile(token, action.fileId);
            }
          } else {
            // Update local memory state
            localFilesState = localFilesState.map(f => {
              if (f.id === action.fileId) {
                let updated = { ...f };
                if (action.actionType === "MOVE" || action.actionType === "MOVE_AND_RENAME" || action.actionType === "ARCHIVE") {
                  updated.parents = [targetId || "root"];
                  updated.category = destPath;
                }
                if (action.actionType === "RENAME" || action.actionType === "MOVE_AND_RENAME") {
                  updated.name = action.proposedName;
                }
                return updated;
              }
              return f;
            });
            if (action.actionType === "TRASH_DUPLICATE") {
              localFilesState = localFilesState.filter(f => f.id !== action.fileId);
            }
          }

          successCount++;
          setExecutionLog(prev => [...prev, `[SUCCESS] Finished action for "${action.originalName}".`]);
        } catch (itemErr: any) {
          console.warn(`Could not execute action for "${action.originalName}":`, itemErr);
          setExecutionLog(prev => [...prev, `⚠️ Notice on "${action.originalName}": ${itemErr.message || "Failed"}`]);
        } finally {
          step++;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      // 3. Create selected reminders (System 3)
      let remindersCreated = 0;
      if (targetPlan.proposedReminders && onSaveReminders) {
        const selectedReminders = targetPlan.proposedReminders.filter((_, idx) => 
          selectedReminderIds.has(`rem-${targetPlan.proposedReminders![idx].fileId}-${idx}`)
        );
        
        if (selectedReminders.length > 0) {
          setExecutionLog(prev => [...prev, `[TASKS] Syncing ${selectedReminders.length} suggested reminders...`]);
          const newReminders: SmartTaskReminder[] = selectedReminders.map(r => ({
            id: "rem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            title: r.title,
            description: r.rationale,
            triggerDate: r.triggerDate,
            triggerTime: "09:00",
            recurrence: 'once',
            actionType: 'reminder_only',
            targetFileId: r.fileId,
            targetFileName: files.find(f => f.id === r.fileId)?.name,
            notifyInApp: true,
            notifyEmail: false,
            status: 'active',
            createdAt: new Date().toISOString()
          }));
          onSaveReminders(newReminders);
          remindersCreated = newReminders.length;
          setExecutionLog(prev => [...prev, `[SUCCESS] Created ${remindersCreated} follow-up reminders.`]);
          step += selectedReminders.length;
          setExecutedCount(prev => ({ ...prev, current: step }));
        }
      }

      // Update state
      if (!token && setFiles) {
        setFiles(localFilesState);
      }

      setExecutionLog(prev => [...prev, `🎉 Complete! Executed ${successCount} taxonomy actions.`]);
      addLog(
        "organize", 
        `One-Click Taxonomy Execution finished ${successCount} actions.`,
        `Resolved ${foldersToResolve.length} folders.`
      );

      setLastExecutionStats({
        foldersCreated: foldersToResolve.length,
        filesMoved: successCount,
        timestamp: new Date().toLocaleTimeString(),
        remindersCreated
      });

      // Trigger floating undo banner
      setUndoBanner({
        message: `Successfully organised ${successCount} files.`,
        count: successCount
      });

      setOrgPlan(null);
      setTriagePlan(null);
      await onRefresh();
      setOrganizerAsyncState({
        status: "success",
        message: `Executed ${successCount} taxonomy action(s) across ${foldersToResolve.length} directory path(s).`,
        retryFn: null
      });
    } catch (e: any) {
      setExecutionLog(prev => [...prev, `❌ Taxonomy Execution Error: ${e.message}`]);
      addLog("organize", "One-Click Taxonomy interrupted: " + e.message);
      console.error("One-Click Taxonomy interrupted:", e);
      setOrganizerAsyncState({
        status: "failed",
        message: `Taxonomy execution interrupted: ${e.message || "Google Drive API error"}`,
        retryFn: () => handleExecutePlanAction(targetPlan)
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Two-Phase Fail-Closed Trigger: Stages diff first if none is active; only commits if user has already staged & reviewed
  const handleOneClickMove = async () => {
    if (triagePlan) {
      await handleExecuteApprovedMoves();
    } else if (orgPlan) {
      await handleExecutePlanAction(orgPlan);
    } else {
      await handleGenerateSortPlan();
      setOrganizerAsyncState({
        status: "success",
        message: "Phase 1 Staging Diff ready. Review the proposed moves below and click Confirm to execute.",
        retryFn: null
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Content Intelligence & Two-Phase Taxonomy Engine */}
      <ContentIntelligencePanel
        token={token}
        files={files}
        rules={rules}
        onRefresh={onRefresh}
        setFiles={setFiles}
        addLog={addLog}
      />

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

          {/* Test Batch (5 Files) - Immediate Verification */}
          <button
            id="btn-test-5-files"
            onClick={() => handleGenerateSortPlan(5)}
            disabled={isPlanning || isExecuting || files.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/70 dark:bg-indigo-950/40 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-50 transition cursor-pointer shadow-xs"
            title="Run deterministic triage on a bounded 5-file test batch"
          >
            {isPlanning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            )}
            <span>Test Batch (5 Files)</span>
          </button>

          {/* Plan Folder Sort */}
          <button
            id="btn-generate-plan"
            onClick={() => handleGenerateSortPlan(25)}
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
                <span>Triage All Files</span>
              </>
            )}
          </button>

          {/* Verification: Test Move 1 File */}
          <button
            id="btn-test-move-1-file"
            onClick={() => handleTestMoveSingleFile()}
            disabled={isExecuting || files.length === 0}
            className="hidden xl:flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 transition cursor-pointer shadow-xs"
            title="Move 1 test file into Archives & Backups to verify instant undo"
          >
            <FolderPlus className="h-3.5 w-3.5 text-slate-400" />
            <span>Verify Undo (1 File)</span>
          </button>

          {/* Undo Last Batch Button in Header */}
          {undoSnapshot && (
            <button
              id="btn-header-undo"
              onClick={handleUndoLastBatch}
              disabled={isUndoing}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer shadow-xs"
              title="Revert previous batch of file moves"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
              <span>Undo Last Batch ({undoSnapshot.moves.length})</span>
            </button>
          )}

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

      {/* Inline Smart Organizer Async Status & Retry Feedback */}
      {organizerAsyncState.status !== "idle" && organizerAsyncState.message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
            organizerAsyncState.status === "failed"
              ? "border-rose-200 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200"
              : organizerAsyncState.status === "loading"
              ? "border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200"
              : organizerAsyncState.status === "empty"
              ? "border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
              : "border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {organizerAsyncState.status === "loading" && <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />}
            {organizerAsyncState.status === "failed" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
            {organizerAsyncState.status === "empty" && <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            {organizerAsyncState.status === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            <span className="font-mono uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
              {organizerAsyncState.status}
            </span>
            <span className="font-medium">{organizerAsyncState.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {organizerAsyncState.retryFn && (
              <button
                type="button"
                onClick={() => organizerAsyncState.retryFn?.()}
                disabled={isClassifying || isPlanning || isExecuting || isUndoing}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry Action</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setOrganizerAsyncState({ status: "idle", message: null, retryFn: null })}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

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
                <span className="font-semibold">{lastExecutionStats.foldersCreated} nested directories</span>{lastExecutionStats.remindersCreated > 0 ? ` and created ${lastExecutionStats.remindersCreated} reminders` : ''} at {lastExecutionStats.timestamp}.
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

          <button
            id="btn-generate-executive-digest"
            onClick={() => onNavigateToTab?.("tasks")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Compose Executive Digest</span>
          </button>
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
                  {orgPlan.proposedActions.length} actions proposed for organization
                </span>
              </div>
              <button
                id="btn-approve-plan"
                onClick={() => handleExecutePlanAction(orgPlan)}
                disabled={isExecuting || (selectedActionIds.size === 0 && selectedReminderIds.size === 0)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-50 cursor-pointer"
                title="Execute selected movements and reminders"
              >
                <Zap className="h-3.5 w-3.5 fill-white" />
                <span>Apply Selected ({selectedActionIds.size + selectedReminderIds.size})</span>
              </button>
            </div>

            {/* Folder Creations / Nested Hierarchies */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                  Taxonomy Structure
                </span>
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedActionIds.size === orgPlan.proposedActions.length} 
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedActionIds(new Set(orgPlan.proposedActions.map(a => a.fileId)));
                      } else {
                        setSelectedActionIds(new Set());
                      }
                    }}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  Select All Actions
                </label>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {Array.from(new Set<string>(orgPlan.proposedActions.map(a => a.proposedFolderPath).filter((p): p is string => !!p && p !== "root"))).map((fold, idx) => {
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
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block pb-1 border-t border-slate-100 dark:border-slate-800 pt-3">
                Proposed Actions ({orgPlan.proposedActions.length})
              </span>
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {orgPlan.proposedActions.map((baseAction: ProposedAction, idx: number) => {
                  const action = editableActions[baseAction.fileId] || baseAction;
                  const targetDir = action.proposedFolderPath || "General";
                  const dirParts = targetDir.split("/").map((s: string) => s.trim());
                  const isSelected = selectedActionIds.has(action.fileId);
                  
                  return (
                    <div key={`plan-move-${action.fileId || idx}-${idx}`} className={`rounded-lg p-3 border transition ${isSelected ? 'bg-slate-50 dark:bg-slate-800/40 border-indigo-200 dark:border-indigo-900/60' : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                      <div className="flex items-start gap-2">
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={(e) => {
                            const next = new Set(selectedActionIds);
                            if (e.target.checked) next.add(action.fileId);
                            else next.delete(action.fileId);
                            setSelectedActionIds(next);
                          }}
                          className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 shrink-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-xs">{action.originalName}</div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${ action.actionType === 'SKIP' ? 'bg-slate-200 text-slate-600' : action.actionType === 'TRASH_DUPLICATE' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700' }`}>
                              {action.actionType}
                            </span>
                          </div>
                          
                          {action.actionType !== 'SKIP' && (
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                              <span className="text-slate-400 shrink-0">Diff:</span>
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="line-through opacity-50">{action.originalName}</span>
                                <ArrowRight className="h-3 w-3 text-indigo-500 shrink-0" />
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{action.proposedName}</span>
                              </div>
                            </div>
                          )}

                          {action.actionType !== 'SKIP' && (
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                              <span className="text-slate-400 shrink-0">To:</span>
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
                          )}

                          {action.rationale && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic leading-snug">
                              {action.rationale}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Suggested Reminders (System 3) */}
            {orgPlan.proposedReminders && orgPlan.proposedReminders.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block pb-1">
                  Suggested Reminders ({orgPlan.proposedReminders.length})
                </span>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {orgPlan.proposedReminders.map((rem, rIdx) => {
                    const remId = `rem-${rem.fileId}-${rIdx}`;
                    const isSelected = selectedReminderIds.has(remId);
                    return (
                      <div key={remId} className={`rounded-lg p-3 border transition ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40' : 'bg-slate-50/30 dark:bg-slate-900/10 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                        <div className="flex items-start gap-2">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => {
                              const next = new Set(selectedReminderIds);
                              if (e.target.checked) next.add(remId);
                              else next.delete(remId);
                              setSelectedReminderIds(next);
                            }}
                            className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 text-[11px]">{rem.title}</span>
                              <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300 font-mono">
                                <Clock className="h-2.5 w-2.5" /> {rem.triggerDate}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">{rem.rationale}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
