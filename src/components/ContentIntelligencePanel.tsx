import React, { useState, useEffect, useMemo } from "react";
import {
  FileSearch,
  FolderTree,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Sliders,
  Lock,
  FileText,
  ArrowRight,
  RefreshCw,
  History,
  Edit3,
  Check,
  X,
  AlertTriangle
} from "lucide-react";
import {
  DriveFile,
  DriveFolderNode,
  StagingDiffRow,
  TaxonomyCustomisationConfig,
  NamingConventionPattern,
  LedgerTransactionEntry,
  OrganizerRule
} from "../types";
import {
  DEFAULT_TAXONOMY_CONFIG,
  buildStagingDiff,
  extractDeepContentMetadata,
  isProtectedDirectory
} from "../lib/decisionEngine";
import {
  listDriveStructure,
  inspectDriveFile,
  commitStagedMoves,
  getOrganiserLedger,
  rollbackLastTransaction,
  generateConfirmationToken
} from "../lib/googleApi";

interface ContentIntelligencePanelProps {
  token: string | null;
  files: DriveFile[];
  rules: OrganizerRule[];
  onRefresh: () => Promise<void>;
  setFiles?: React.Dispatch<React.SetStateAction<DriveFile[]>>;
  addLog: (
    action: "create" | "move" | "modify" | "organize" | "backup" | "task" | "email",
    message: string,
    details?: string
  ) => void;
}

const DEMO_DEEP_CONTENT_FILES: DriveFile[] = [
  {
    id: "file_scan_042",
    name: "Scan_042.pdf",
    mimeType: "application/pdf",
    parents: ["root"],
    modifiedTime: "2025-07-15T09:30:00Z",
    content:
      "Australian Taxation Office (ATO) — Notice of Assessment for the income year ended 30 June 2025 (FY25). Date of issue: 2025-07-14. Taxpayer assessment summary and refundable tax offset schedule."
  },
  {
    id: "file_untitled_gdoc",
    name: "Untitled.gdoc",
    mimeType: "application/vnd.google-apps.document",
    parents: ["folder_drafts"],
    modifiedTime: "2025-08-20T14:15:00Z",
    content:
      "Title: Architecture Spec - Personal AI OS\nProject: Personal AI OS\nDate: 2025-08-20\nTechnical system specification covering local agent memory, fail-closed tool execution boundaries, and hybrid cloud taxonomy synchronisation."
  },
  {
    id: "file_scan_109",
    name: "Scan_109.pdf",
    mimeType: "application/pdf",
    parents: ["root"],
    modifiedTime: "2025-09-03T11:00:00Z",
    content:
      "Vendor: Telstra Corporation Ltd\nTax Invoice #TL-99412\nIssue Date: 03/09/2025\nSubject: Enterprise Fibre & Cloud Connectivity Monthly Billing Statement."
  },
  {
    id: "file_doc_008",
    name: "Document_008.pdf",
    mimeType: "application/pdf",
    parents: ["root"],
    modifiedTime: "2025-06-18T16:45:00Z",
    content:
      "Vendor: Bunnings Warehouse\nTax Invoice & Commercial Trade Receipt\nDate: 18/06/2025\nSubject: Office Fitout Hardware & Shelving Materials."
  }
];

const DEMO_EXISTING_FOLDERS: DriveFolderNode[] = [
  {
    id: "folder_fin_taxes_2025",
    name: "2025",
    path: "/Financial/Taxes/2025",
    parentId: "folder_fin_taxes",
    depth: 3,
    isProtected: false
  },
  {
    id: "folder_fin_invoices_2025",
    name: "2025",
    path: "/Financial/Invoices/2025",
    parentId: "folder_fin_invoices",
    depth: 3,
    isProtected: false
  },
  {
    id: "folder_drafts",
    name: "Drafts",
    path: "/Drafts",
    parentId: "root",
    depth: 1,
    isProtected: false
  },
  {
    id: "folder_archive_prot",
    name: "Archive",
    path: "/Archive",
    parentId: "root",
    depth: 1,
    isProtected: true
  },
  {
    id: "folder_templates_prot",
    name: "Templates",
    path: "/Templates",
    parentId: "root",
    depth: 1,
    isProtected: true
  }
];

export default function ContentIntelligencePanel({
  token,
  files,
  rules,
  onRefresh,
  setFiles,
  addLog
}: ContentIntelligencePanelProps) {
  const [config, setConfig] = useState<TaxonomyCustomisationConfig>(() => {
    try {
      const saved = localStorage.getItem("drive_taxonomy_customisation_config");
      if (saved) {
        return { ...DEFAULT_TAXONOMY_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_TAXONOMY_CONFIG;
  });

  const [folderHierarchy, setFolderHierarchy] = useState<DriveFolderNode[]>(DEMO_EXISTING_FOLDERS);
  const [stagingRows, setStagingRows] = useState<StagingDiffRow[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showCustomisation, setShowCustomisation] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerTransactionEntry[]>(() =>
    getOrganiserLedger()
  );

  // Inline path editing (Interactive Correction)
  const [editingRowFileId, setEditingRowFileId] = useState<string | null>(null);
  const [editingTargetPath, setEditingTargetPath] = useState("");
  const [confirmationInput, setConfirmationInput] = useState("");
  const [statusBanner, setStatusBanner] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
    details?: string[];
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("drive_taxonomy_customisation_config", JSON.stringify(config));
    } catch {
      // Ignore storage error
    }
  }, [config]);

  // Recompute staging diff whenever customisation rules or session overrides change
  const activeSourceFiles = useMemo(() => {
    const nonFolders = files.filter(f => f.mimeType !== "application/vnd.google-apps.folder");
    return nonFolders.length > 0 ? files : DEMO_DEEP_CONTENT_FILES;
  }, [files]);

  // Phase 1: Deep Content Ingestion & Read-Only Staging Diff
  const handleRunPhase1Staging = async (useDemoSamples = false) => {
    setIsInspecting(true);
    setStatusBanner({
      type: "info",
      message:
        "Phase 1 (Read-Only): Crawling Drive hierarchy and sampling up to 2,000 tokens per file to extract Primary Entity, Document Type, Canonical Date, and Core Subject..."
    });

    try {
      const targetFiles = useDemoSamples ? DEMO_DEEP_CONTENT_FILES : activeSourceFiles;
      const crawledFolders = await listDriveStructure(
        token,
        "root",
        config.maxFolderDepth,
        targetFiles,
        config.protectedPaths
      );
      const effectiveFolders =
        crawledFolders.length > 0
          ? [...crawledFolders, ...DEMO_EXISTING_FOLDERS.filter(df => !crawledFolders.some(cf => cf.path === df.path))]
          : DEMO_EXISTING_FOLDERS;
      setFolderHierarchy(effectiveFolders);

      // Deep inspect up to 15 non-folder files
      const enrichedFiles: DriveFile[] = [];
      const candidateFiles = targetFiles
        .filter(f => f.mimeType !== "application/vnd.google-apps.folder")
        .slice(0, 15);

      for (const file of candidateFiles) {
        if (token && !useDemoSamples) {
          const inspected = await inspectDriveFile(token, file.id, 2000, targetFiles);
          enrichedFiles.push({
            ...file,
            content: inspected.sampledText || file.content,
            contentMetadata: inspected.metadata
          });
        } else {
          const metadata = extractDeepContentMetadata(file, file.content, 2000);
          enrichedFiles.push({
            ...file,
            contentMetadata: metadata
          });
        }
      }

      const diffRows = buildStagingDiff(enrichedFiles, effectiveFolders, config, rules);
      setStagingRows(diffRows);

      addLog(
        "organize",
        `Phase 1 Staging Diff prepared for ${diffRows.length} file(s) (Read-Only)`,
        `Existing folders matched (≥${Math.round(config.reuseThreshold * 100)}%): ${
          diffRows.filter(r => r.matchType === "Existing Folder").length
        } · New folders proposed: ${diffRows.filter(r => r.matchType === "New Folder").length}`
      );

      setStatusBanner({
        type: "info",
        message:
          "Review the proposed moves below. Reply 'Confirm' or click 'Confirm & Execute Staged Moves' to commit, or click any target path to adjust."
      });
    } catch (err: any) {
      setStatusBanner({
        type: "error",
        message: `Content inspection failed: ${err?.message || "Unknown error"}`
      });
    } finally {
      setIsInspecting(false);
    }
  };

  // Interactive Correction: User overrides a target folder path
  const handleApplyPathOverride = (row: StagingDiffRow) => {
    const cleanedPath = "/" + editingTargetPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!cleanedPath || cleanedPath === "/") {
      setEditingRowFileId(null);
      return;
    }

    if (isProtectedDirectory(cleanedPath, config.protectedPaths)) {
      setStatusBanner({
        type: "error",
        message: `Protected Directory Policy: Cannot route files into protected path "${cleanedPath}".`
      });
      return;
    }

    const entityKey = row.detectedEntity.toLowerCase();
    const updatedConfig: TaxonomyCustomisationConfig = {
      ...config,
      sessionOverrides: {
        ...config.sessionOverrides,
        [row.fileId]: cleanedPath,
        [entityKey]: cleanedPath
      }
    };
    setConfig(updatedConfig);

    // Propagate override to all matching entity rows in current staging table
    const existsInHierarchy = folderHierarchy.some(
      f => f.path.toLowerCase() === cleanedPath.toLowerCase()
    );
    setStagingRows(prev =>
      prev.map(r =>
        r.fileId === row.fileId || r.detectedEntity.toLowerCase() === entityKey
          ? {
              ...r,
              proposedTargetFolder: cleanedPath,
              matchType: existsInHierarchy ? "Existing Folder" : "New Folder",
              confidence: 0.99,
              selected: true
            }
          : r
      )
    );

    setEditingRowFileId(null);
    setStatusBanner({
      type: "success",
      message: `Session Rule Recorded: All "${row.detectedEntity}" files in this session will route to ${cleanedPath}.`
    });
  };

  // Phase 2: Commit (Gated Mutation)
  const handleCommitPhase2 = async () => {
    const selectedRows = stagingRows.filter(
      r => r.selected !== false && r.matchType !== "Protected (Skipped)"
    );
    if (selectedRows.length === 0) return;

    setIsCommitting(true);
    try {
      const confirmationToken = generateConfirmationToken(selectedRows.length);
      const moves = selectedRows.map(r => ({
        file_id: r.fileId,
        from_folder_id: r.currentFolderId || "root",
        to_folder_id: r.proposedTargetFolderId || r.proposedTargetFolder,
        rename_to: r.proposedName,
        to_folder_path: r.proposedTargetFolder,
        from_folder_path: r.currentFolder,
        original_name: r.fileName
      }));

      const result = await commitStagedMoves(
        token,
        confirmationToken,
        moves,
        files,
        config.protectedPaths
      );

      if (!token && setFiles && result.updatedLocalFiles.length > 0) {
        setFiles(result.updatedLocalFiles);
      } else if (token) {
        await onRefresh();
      }

      setLedgerEntries(getOrganiserLedger());
      setStagingRows([]);
      setConfirmationInput("");

      addLog(
        "move",
        `Committed ${result.entries.length} staged move(s) [${result.transactionId}]`,
        `Recorded to .drive_organiser_ledger.json`
      );

      setStatusBanner({
        type: "success",
        message: `Committed ${result.entries.length} move(s) under transaction ${result.transactionId}. Recorded in .drive_organiser_ledger.json.`,
        details: result.entries.map(
          e => `${e.original_name || e.file_id} → ${e.destination_folder_path}/${e.applied_name}`
        )
      });
    } catch (err: any) {
      setStatusBanner({
        type: "error",
        message: err?.message || "Failed to commit staged moves."
      });
    } finally {
      setIsCommitting(false);
    }
  };

  // Section 5: Atomic Rollback & Undo
  const handleUndoLastBatch = async () => {
    setIsRollingBack(true);
    try {
      const result = await rollbackLastTransaction(token, files);
      if (!token && setFiles && result.updatedLocalFiles.length > 0) {
        setFiles(result.updatedLocalFiles);
      } else if (token) {
        await onRefresh();
      }

      setLedgerEntries(getOrganiserLedger());
      addLog(
        "move",
        `Reverted transaction batch ${result.transactionId} (${result.restoredFiles.length} file(s) restored)`,
        result.restoredFiles.map(f => `${f.fileName} ↩ ${f.restoredFolderPath}`).join(", ")
      );

      setStatusBanner({
        type: "warning",
        message: `Atomic Rollback Complete: Reverted transaction ${result.transactionId}. Restored ${result.restoredFiles.length} file(s) to original folders:`,
        details: result.restoredFiles.map(
          f => `${f.fileName} restored to ${f.restoredFolderPath} (parent ID: ${f.restoredParentId})`
        )
      });
    } catch (err: any) {
      setStatusBanner({
        type: "error",
        message: err?.message || "No active ledger transactions to undo."
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const activeLedgerCount = ledgerEntries.filter(e => !e.reverted).length;
  const selectedStagingCount = stagingRows.filter(
    r => r.selected !== false && r.matchType !== "Protected (Skipped)"
  ).length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
      {/* Top Engine Bar */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-800/30">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <FileSearch className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Content Intelligence & Two-Phase Taxonomy Engine
            </span>
            <span aria-hidden="true">·</span>
            <span>Fail-Closed Staging</span>
            <span aria-hidden="true">·</span>
            <span>Reuse Threshold ≥ {Math.round(config.reuseThreshold * 100)}%</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inspects raw document text and OCR tokens (ignoring opaque names like{" "}
            <code className="font-mono text-[11px]">Scan_042.pdf</code>), matches existing folders
            first, and stages reversible moves before any mutation.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleRunPhase1Staging(false)}
            disabled={isInspecting || isCommitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isInspecting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSearch className="h-3.5 w-3.5" />
            )}
            <span>Phase 1: Inspect Content & Stage Diff</span>
          </button>

          <button
            type="button"
            onClick={() => handleRunPhase1Staging(true)}
            disabled={isInspecting || isCommitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition cursor-pointer"
            title="Inspect opaque files (Scan_042.pdf, Untitled.gdoc) using deep content extraction"
          >
            <FileText className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Stage Opaque Sample Batch</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCustomisation(!showCustomisation)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition cursor-pointer ${
              showCustomisation
                ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Taxonomy Rules</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLedger(!showLedger)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition cursor-pointer"
          >
            <History className="h-3.5 w-3.5 text-slate-500" />
            <span>Ledger ({activeLedgerCount})</span>
          </button>

          {activeLedgerCount > 0 && (
            <button
              type="button"
              onClick={handleUndoLastBatch}
              disabled={isRollingBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50/80 dark:bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition cursor-pointer"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRollingBack ? "animate-spin" : ""}`} />
              <span>Undo Last Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* User Customisation Rules Drawer (Section 6) */}
      {showCustomisation && (
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Naming Convention
              </label>
              <select
                value={config.namingConvention}
                onChange={e =>
                  setConfig(prev => ({
                    ...prev,
                    namingConvention: e.target.value as NamingConventionPattern
                  }))
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="[YYYY-MM-DD] - [Entity] - [Subject]">
                  [YYYY-MM-DD] - [Entity] - [Subject]
                </option>
                <option value="[Subject]_[OriginalName]">[Subject]_[OriginalName]</option>
                <option value="[Entity] - [Subject] - [YYYY-MM-DD]">
                  [Entity] - [Subject] - [YYYY-MM-DD]
                </option>
                <option value="preserve_original">Preserve Original Filename</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Date Placement & Folder Depth Limit
              </label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
                  {(["prefix", "suffix"] as const).map(pos => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, datePlacement: pos }))}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition cursor-pointer ${
                        config.datePlacement === pos
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Date {pos}
                    </button>
                  ))}
                </div>

                <select
                  value={config.maxFolderDepth}
                  onChange={e =>
                    setConfig(prev => ({ ...prev, maxFolderDepth: Number(e.target.value) || 3 }))
                  }
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value={2}>Max Depth: 2 levels</option>
                  <option value={3}>Max Depth: 3 levels (Default)</option>
                  <option value={4}>Max Depth: 4 levels</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Protected Directories (Never Mutated)
              </label>
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                {config.protectedPaths.map((p, idx) => (
                  <React.Fragment key={p}>
                    <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                      {p}
                    </code>
                    {idx < config.protectedPaths.length - 1 && <span aria-hidden="true">·</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {Object.keys(config.sessionOverrides).length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs">
              <div className="text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Active Session Overrides:{" "}
                </span>
                {Object.entries(config.sessionOverrides)
                  .map(([k, v]) => `${k} → ${v}`)
                  .join(" · ")}
              </div>
              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, sessionOverrides: {} }))}
                className="text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
              >
                Clear Session Rules
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`px-5 py-3 border-b text-xs flex flex-col gap-1.5 ${
            statusBanner.type === "error"
              ? "bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
              : statusBanner.type === "warning"
              ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
              : statusBanner.type === "success"
              ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900/50 text-indigo-900 dark:text-indigo-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{statusBanner.message}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {statusBanner.details && statusBanner.details.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] opacity-90">
              {statusBanner.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Phase 1 Staging Diff Table */}
      {stagingRows.length > 0 && (
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Phase 1: Staging Diff (Read-Only)
              </span>
              <span aria-hidden="true">·</span>
              <span>{stagingRows.length} inspected</span>
              <span aria-hidden="true">·</span>
              <span>
                {stagingRows.filter(r => r.matchType === "Existing Folder").length} Existing Folder
                matches
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {stagingRows.filter(r => r.matchType === "New Folder").length} New Folders proposed
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click any Proposed Target Folder to override and teach session rules
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        selectedStagingCount > 0 &&
                        selectedStagingCount ===
                          stagingRows.filter(r => r.matchType !== "Protected (Skipped)").length
                      }
                      onChange={e => {
                        const checked = e.target.checked;
                        setStagingRows(prev =>
                          prev.map(r =>
                            r.matchType === "Protected (Skipped)" ? r : { ...r, selected: checked }
                          )
                        );
                      }}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Detected Entity &amp; Subject</th>
                  <th className="py-2.5 px-3">Current Folder</th>
                  <th className="py-2.5 px-3">Proposed Target Folder</th>
                  <th className="py-2.5 px-3">Match Type</th>
                  <th className="py-2.5 px-3 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {stagingRows.map((row, idx) => (
                  <tr
                    key={`${row.fileId}-${idx}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        disabled={row.matchType === "Protected (Skipped)"}
                        checked={row.selected !== false && row.matchType !== "Protected (Skipped)"}
                        onChange={e => {
                          const checked = e.target.checked;
                          setStagingRows(prev =>
                            prev.map(r => (r.fileId === row.fileId ? { ...r, selected: checked } : r))
                          );
                        }}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {row.fileName}
                      </div>
                      {row.proposedName !== row.fileName && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-xs">
                          Rename → {row.proposedName}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {row.detectedSubject}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{row.detectedEntity}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{row.documentType}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{row.canonicalDate}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {row.currentFolder}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {editingRowFileId === row.fileId ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingTargetPath}
                            onChange={e => setEditingTargetPath(e.target.value)}
                            className="rounded border border-indigo-400 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyPathOverride(row)}
                            className="p-1 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            title="Save path & apply to matching entity files"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRowFileId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRowFileId(row.fileId);
                            setEditingTargetPath(row.proposedTargetFolder);
                          }}
                          className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          title="Click to adjust target folder path"
                        >
                          <span>{row.proposedTargetFolder}</span>
                          <Edit3 className="h-3 w-3 opacity-60" />
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-medium ${
                          row.matchType === "Existing Folder"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : row.matchType === "New Folder"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-slate-500"
                        }`}
                      >
                        {row.matchType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                      {Math.round(row.confidence * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phase 2 Commit Gate */}
          <div className="p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Review the proposed moves above. Reply <span className="text-indigo-600 dark:text-indigo-400">Confirm</span> or click Commit to execute, or adjust paths inline.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Phase 2 Commit writes every move to <code className="font-mono">.drive_organiser_ledger.json</code> for atomic rollback.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={confirmationInput}
                onChange={e => setConfirmationInput(e.target.value)}
                placeholder="Type Confirm (optional)..."
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 w-40 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleCommitPhase2}
                disabled={isCommitting || selectedStagingCount === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isCommitting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>Confirm &amp; Commit ({selectedStagingCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Ledger (.drive_organiser_ledger.json) Drawer */}
      {showLedger && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                .drive_organiser_ledger.json
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-500">
                Append-Only Transaction Ledger ({ledgerEntries.length} total records)
              </span>
            </div>
            {activeLedgerCount > 0 && (
              <button
                type="button"
                onClick={handleUndoLastBatch}
                disabled={isRollingBack}
                className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Revert Most Recent Batch</span>
              </button>
            )}
          </div>

          {ledgerEntries.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              No transactions committed yet. Stage and confirm a diff to populate{" "}
              <code className="font-mono">.drive_organiser_ledger.json</code>.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-60 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2 px-2.5">transaction_id</th>
                    <th className="py-2 px-2.5">timestamp_utc</th>
                    <th className="py-2 px-2.5">file_id</th>
                    <th className="py-2 px-2.5">original_parent_id</th>
                    <th className="py-2 px-2.5">destination_parent_id</th>
                    <th className="py-2 px-2.5">applied_name</th>
                    <th className="py-2 px-2.5">status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                  {[...ledgerEntries].reverse().map(entry => (
                    <tr key={entry.transaction_id} className="bg-white dark:bg-slate-900">
                      <td className="py-1.5 px-2.5 text-indigo-600 dark:text-indigo-400">
                        {entry.transaction_id}
                      </td>
                      <td className="py-1.5 px-2.5 text-slate-500">
                        {entry.timestamp_utc.slice(0, 19)}Z
                      </td>
                      <td className="py-1.5 px-2.5">{entry.file_id}</td>
                      <td className="py-1.5 px-2.5">{entry.original_parent_id}</td>
                      <td className="py-1.5 px-2.5">{entry.destination_parent_id}</td>
                      <td className="py-1.5 px-2.5 text-slate-800 dark:text-slate-200">
                        {entry.applied_name}
                      </td>
                      <td className="py-1.5 px-2.5">
                        {entry.reverted ? (
                          <span className="text-amber-600 dark:text-amber-400">Reverted</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">Committed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
