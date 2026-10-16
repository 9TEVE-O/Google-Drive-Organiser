import React, { useState, useEffect } from "react";
import { 
  Table, Plus, Search, ExternalLink, RefreshCw, FileSpreadsheet, 
  Calendar, Folder, ArrowUpRight, Check, AlertCircle, Eye, 
  Download, Edit3, Save, X, PlusCircle, Sparkles, Layers, Shield
} from "lucide-react";
import { DriveFile, SheetMetadata } from "../types";
import { evaluateFileDecision } from "../lib/decisionEngine";
import { 
  listSpreadsheets, getSpreadsheetMetadata, getSpreadsheetValues, 
  createSpreadsheet, updateSpreadsheetValues, appendSpreadsheetValues, 
  exportDriveInventoryToSheet 
} from "../lib/googleApi";

interface SheetsManagerProps {
  token: string | null;
  files: DriveFile[];
  onRefreshDrive: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email' | 'sheet', message: string, details?: string) => void;
}

function colIndexToA1(index: number): string {
  let col = "";
  let temp = index;
  while (temp >= 0) {
    col = String.fromCharCode((temp % 26) + 65) + col;
    temp = Math.floor(temp / 26) - 1;
  }
  return col;
}

export default function SheetsManager({
  token,
  files,
  onRefreshDrive,
  addLog
}: SheetsManagerProps) {
  const [sheetsList, setSheetsList] = useState<DriveFile[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active Sheet Viewer state
  const [selectedSheet, setSelectedSheet] = useState<DriveFile | null>(null);
  const [sheetMetadata, setSheetMetadata] = useState<SheetMetadata | null>(null);
  const [activeTabTitle, setActiveTabTitle] = useState<string>("Sheet1");
  const [gridValues, setGridValues] = useState<string[][]>([]);
  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  // Cell editing & new row state
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number; val: string } | null>(null);
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<(() => Promise<void>) | null>(null);
  const [pendingSaveDescription, setPendingSaveDescription] = useState<string>("");
  const [isSavingGrid, setIsSavingGrid] = useState(false);

  // Add row modal
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRowValues, setNewRowValues] = useState<string[]>([]);

  // Create Sheet Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<"blank" | "inventory" | "tasks" | "finances">("blank");
  const [selectedParentFolder, setSelectedParentFolder] = useState<string>("root");
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  // Export inventory state
  const [isExportingInventory, setIsExportingInventory] = useState(false);
  const [successNotification, setSuccessNotification] = useState<string | null>(null);

  // Fetch all spreadsheets from Google Drive
  const loadSpreadsheets = async () => {
    if (!token) return;
    setIsLoadingSheets(true);
    setErrorMsg(null);
    try {
      const sheets = await listSpreadsheets(token);
      setSheetsList(sheets);
    } catch (err: any) {
      console.error("Error loading spreadsheets:", err);
      setErrorMsg(err.message || "Failed to load Google Sheets from Drive.");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  useEffect(() => {
    loadSpreadsheets();
  }, [token]);

  // Load grid when selectedSheet or activeTabTitle changes
  const loadSheetGrid = async (sheet: DriveFile, tabTitle: string) => {
    if (!token) return;
    setIsLoadingGrid(true);
    setGridError(null);
    try {
      // 1. Fetch metadata if not loaded
      let meta = sheetMetadata;
      if (!meta || meta.spreadsheetId !== sheet.id) {
        meta = await getSpreadsheetMetadata(token, sheet.id);
        setSheetMetadata(meta);
      }

      // Determine valid tab title
      const validTab = meta?.sheets?.find(s => s.title === tabTitle)?.title 
        || meta?.sheets?.[0]?.title 
        || "Sheet1";
      
      setActiveTabTitle(validTab);

      // 2. Fetch grid values
      const values = await getSpreadsheetValues(token, sheet.id, validTab);
      setGridValues(values);
    } catch (err: any) {
      console.error("Error loading sheet values:", err);
      setGridError(err.message || "Failed to retrieve sheet cell values.");
      setGridValues([]);
    } finally {
      setIsLoadingGrid(false);
    }
  };

  const handleSelectSheet = (sheet: DriveFile) => {
    setSelectedSheet(sheet);
    setSheetMetadata(null);
    setGridValues([]);
    loadSheetGrid(sheet, "Sheet1");
  };

  // List folders for destination dropdown
  const folderList = React.useMemo(() => {
    const seen = new Set<string>();
    return files.filter(f => {
      if (f.mimeType !== "application/vnd.google-apps.folder") return false;
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [files]);

  // Handle Quick Create Sheet
  const handleCreateSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newSheetTitle.trim()) return;

    setIsCreatingSheet(true);
    setErrorMsg(null);

    try {
      let initialRows: string[][] | undefined;
      let sheetTab = "Sheet1";

      if (selectedTemplate === "inventory") {
        sheetTab = "Decision Matrix & Audit";
        initialRows = [
          ["File Name", "Category", "Triage Decision", "Decision Type", "Target Folder", "Urgency", "Confidence", "Decision Rationale", "Status", "Size", "Last Modified", "Google Drive Link"]
        ];
        for (const rawFile of files.slice(0, 50)) {
          const f = (!rawFile.category || rawFile.category === "Unsorted" || !rawFile.decision)
            ? evaluateFileDecision(rawFile)
            : rawFile;
          const dec = f.decision;

          initialRows.push([
            f.name,
            f.category || "General Documents",
            dec ? dec.action : "Review in Place",
            dec ? dec.decisionType : "verified",
            dec ? dec.targetFolder : "Root",
            dec ? dec.urgency.toUpperCase() : "MEDIUM",
            dec ? `${dec.confidence}%` : "85%",
            dec ? dec.rationale : "Indexed by Decision Engine",
            dec ? dec.status : "recommended",
            f.size || "-",
            f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : "-",
            f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
          ]);
        }
      } else if (selectedTemplate === "tasks") {
        sheetTab = "Task Tracker";
        initialRows = [
          ["Task ID", "Task Title", "Priority", "Status", "Due Date", "Notes"],
          ["TSK-101", "Audit financial files in Work folder", "High", "In Progress", new Date().toISOString().slice(0, 10), "AI classification complete"],
          ["TSK-102", "Archive 2025 tax forms", "Medium", "Pending", "", "Move to Archives folder"]
        ];
      } else if (selectedTemplate === "finances") {
        sheetTab = "Monthly Log";
        initialRows = [
          ["Date", "Description", "Category", "Amount ($)", "Payment Method", "Status"],
          [new Date().toISOString().slice(0, 10), "Cloud Storage Subscription", "Software", "9.99", "Card", "Paid"],
          [new Date().toISOString().slice(0, 10), "Annual Filing Expense", "Legal", "150.00", "Bank Transfer", "Pending"]
        ];
      }

      const created = await createSpreadsheet(
        token, 
        newSheetTitle.trim(), 
        sheetTab, 
        initialRows, 
        selectedParentFolder
      );

      addLog('sheet', `Created Google Sheet '${newSheetTitle.trim()}'`, `Spreadsheet ID: ${created.spreadsheetId}`);
      setSuccessNotification(`Google Sheet "${newSheetTitle.trim()}" created successfully!`);
      setShowCreateModal(false);
      setNewSheetTitle("");
      setSelectedTemplate("blank");
      
      await loadSpreadsheets();
      await onRefreshDrive();
    } catch (err: any) {
      console.error("Create sheet error:", err);
      setErrorMsg(err.message || "Failed to create Google Sheet.");
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Handle Export Complete Drive Inventory to Sheet
  const handleExportFullInventory = async () => {
    if (!token) return;
    setIsExportingInventory(true);
    setErrorMsg(null);

    const title = `Drive Organizer - Inventory (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
    try {
      const result = await exportDriveInventoryToSheet(token, title, files);
      addLog('sheet', `Exported Drive inventory (${files.length} items) to Google Sheet`, `Spreadsheet ID: ${result.spreadsheetId}`);
      setSuccessNotification(`Inventory successfully exported to "${title}"!`);
      await loadSpreadsheets();
      await onRefreshDrive();
    } catch (err: any) {
      console.error("Export inventory error:", err);
      setErrorMsg(err.message || "Failed to export Drive inventory to Google Sheet.");
    } finally {
      setIsExportingInventory(false);
    }
  };

  // Save modified cell with mandatory user confirmation
  const handleSaveCellWithConfirmation = () => {
    if (!token || !selectedSheet || !editingCell) return;
    const { rowIdx, colIdx, val } = editingCell;

    // Build confirmation prompt
    const colLetter = colIndexToA1(colIdx);
    const cellRef = `${activeTabTitle}!${colLetter}${rowIdx + 1}`;
    
    setPendingSaveDescription(`Update cell ${cellRef} to "${val}" in spreadsheet "${selectedSheet.name}"`);
    setPendingSaveAction(() => async () => {
      setIsSavingGrid(true);
      try {
        const nextGrid = gridValues.map(r => [...r]);
        while (nextGrid.length <= rowIdx) nextGrid.push([]);
        while (nextGrid[rowIdx].length <= colIdx) nextGrid[rowIdx].push("");
        nextGrid[rowIdx][colIdx] = val;

        await updateSpreadsheetValues(token, selectedSheet.id, cellRef, [[val]]);
        setGridValues(nextGrid);
        setEditingCell(null);
        addLog('sheet', `Updated cell ${cellRef} in '${selectedSheet.name}'`, `New value: "${val}"`);
        setSuccessNotification(`Cell ${cellRef} updated successfully.`);
      } catch (err: any) {
        console.error("Save cell error:", err);
        setGridError(err.message || "Failed to update cell value in Google Sheets.");
      } finally {
        setIsSavingGrid(false);
        setShowConfirmSaveModal(false);
      }
    });

    setShowConfirmSaveModal(true);
  };

  // Append new row with mandatory user confirmation
  const handleAppendRowWithConfirmation = () => {
    if (!token || !selectedSheet || newRowValues.length === 0) return;

    setPendingSaveDescription(`Append new row with ${newRowValues.length} columns into "${selectedSheet.name}" (${activeTabTitle})`);
    setPendingSaveAction(() => async () => {
      setIsSavingGrid(true);
      try {
        await appendSpreadsheetValues(token, selectedSheet.id, activeTabTitle, [newRowValues]);
        setGridValues(prev => [...prev, newRowValues]);
        setShowAddRowModal(false);
        setNewRowValues([]);
        addLog('sheet', `Appended new row to '${selectedSheet.name}' (${activeTabTitle})`, JSON.stringify(newRowValues));
        setSuccessNotification(`Row appended to ${activeTabTitle} successfully.`);
      } catch (err: any) {
        console.error("Append row error:", err);
        setGridError(err.message || "Failed to append row in Google Sheets.");
      } finally {
        setIsSavingGrid(false);
        setShowConfirmSaveModal(false);
      }
    });

    setShowConfirmSaveModal(true);
  };

  // Filtered sheets list
  const filteredSheets = sheetsList.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
            Google Sheets
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Browse spreadsheets in your Drive, view and edit cells inline, or export your drive inventory.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            id="btn-new-sheet"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Spreadsheet</span>
          </button>
          <button
            id="btn-export-inventory"
            onClick={handleExportFullInventory}
            disabled={isExportingInventory}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 transition cursor-pointer shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>{isExportingInventory ? "Exporting..." : "Export Inventory"}</span>
          </button>
          <button
            onClick={loadSpreadsheets}
            disabled={isLoadingSheets}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition cursor-pointer shadow-xs"
            title="Refresh Sheets"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSheets ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successNotification && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <span className="font-medium flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {successNotification}
          </span>
          <button onClick={() => setSuccessNotification(null)} className="text-emerald-700 dark:text-emerald-400 hover:opacity-75 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-300">
          <span className="font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-700 dark:text-rose-400 hover:opacity-75 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Spreadsheets in Drive */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Spreadsheets ({filteredSheets.length})
            </h3>
          </div>

          {/* Search box */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative w-full">
              <Search className="absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search spreadsheets..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* List items */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
            {isLoadingSheets ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>Loading spreadsheets...</span>
              </div>
            ) : filteredSheets.length === 0 ? (
              <div className="p-8 text-center">
                <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">No sheets found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Create your first spreadsheet or export inventory.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Sheet</span>
                </button>
              </div>
            ) : (
              filteredSheets.map((sheet, idx) => {
                const isSelected = selectedSheet?.id === sheet.id;
                return (
                  <div 
                    key={`sheet-item-${sheet.id}-${idx}`}
                    onClick={() => handleSelectSheet(sheet)}
                    className={`p-3 cursor-pointer transition-colors flex flex-col gap-1 ${
                      isSelected 
                        ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-l-2 border-indigo-600 dark:border-indigo-500" 
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet className={`h-4 w-4 shrink-0 ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
                        <span className={`text-xs font-medium truncate ${isSelected ? "text-indigo-950 dark:text-indigo-200 font-semibold" : "text-slate-800 dark:text-slate-200"}`} title={sheet.name}>
                          {sheet.name}
                        </span>
                      </div>
                      <a
                        href={sheet.webViewLink || `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition shrink-0"
                        title="Open in Google Sheets"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pl-6">
                      <span>
                        {sheet.modifiedTime ? new Date(sheet.modifiedTime).toLocaleDateString() : "-"}
                      </span>
                      {isSelected && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Interactive Grid Viewer */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col min-h-[500px]">
          {selectedSheet ? (
            <div className="flex flex-col h-full">
              {/* Sheet Viewer Header */}
              <div className="p-3.5 px-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={selectedSheet.name}>
                    {selectedSheet.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Modified: {selectedSheet.modifiedTime ? new Date(selectedSheet.modifiedTime).toLocaleString() : "-"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const numCols = (gridValues[0] || []).length || 5;
                      setNewRowValues(new Array(numCols).fill(""));
                      setShowAddRowModal(true);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition cursor-pointer shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Row</span>
                  </button>

                  <a
                    href={selectedSheet.webViewLink || `https://docs.google.com/spreadsheets/d/${selectedSheet.id}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700/60 transition cursor-pointer shadow-xs"
                  >
                    <span>Open in Sheets</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                  </a>

                  <button
                    onClick={() => loadSheetGrid(selectedSheet, activeTabTitle)}
                    disabled={isLoadingGrid}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition cursor-pointer shadow-xs"
                    title="Reload sheet data"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGrid ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Tab navigation (Sheet1, Sheet2, etc.) */}
              {sheetMetadata?.sheets && sheetMetadata.sheets.length > 0 && (
                <div className="px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1 overflow-x-auto">
                  {sheetMetadata.sheets.map((s, idx) => {
                    const isActive = s.title === activeTabTitle;
                    return (
                      <button
                        key={`tab-${s.sheetId}-${idx}`}
                        onClick={() => {
                          setActiveTabTitle(s.title);
                          loadSheetGrid(selectedSheet, s.title);
                        }}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                          isActive 
                            ? "border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold" 
                            : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        {s.title}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Grid Content Area */}
              <div className="flex-1 p-4 overflow-auto max-h-[480px]">
                {isLoadingGrid ? (
                  <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>Loading sheet values...</span>
                  </div>
                ) : gridError ? (
                  <div className="py-12 text-center text-xs text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900 p-6">
                    <AlertCircle className="h-5 w-5 text-rose-500 mx-auto mb-2" />
                    <p className="font-semibold">Unable to load spreadsheet values</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{gridError}</p>
                    <button
                      onClick={() => loadSheetGrid(selectedSheet, activeTabTitle)}
                      className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 underline cursor-pointer"
                    >
                      Try again
                    </button>
                  </div>
                ) : gridValues.length === 0 ? (
                  <div className="py-20 text-center text-slate-400">
                    <Table className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">This sheet tab has no data</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Click "Add Row" above to enter new data.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          <th className="p-2 w-10 text-center border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-medium">
                            #
                          </th>
                          {Array.from({ length: gridValues.length > 0 ? Math.max(...gridValues.map(r => r.length), 1) : 1 }).map((_, colIdx) => (
                            <th key={`col-hdr-${colIdx}`} className="p-2 px-3 font-medium border-r border-slate-200 dark:border-slate-700 min-w-[120px]">
                              {colIndexToA1(colIdx)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                        {gridValues.map((row, rowIdx) => {
                          const isHeader = rowIdx === 0;
                          return (
                            <tr 
                              key={`row-${rowIdx}`}
                              className={`transition-colors ${
                                isHeader 
                                  ? "bg-slate-50/60 dark:bg-slate-800/40 font-semibold text-slate-900 dark:text-slate-100 border-b-2 border-slate-200 dark:border-slate-700" 
                                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                              }`}
                            >
                              <td className="p-2 text-center font-mono text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50/80 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 select-none">
                                {rowIdx + 1}
                              </td>

                              {Array.from({ length: Math.max(...gridValues.map(r => r.length), 1) }).map((_, colIdx) => {
                                const cellValue = row[colIdx] ?? "";
                                const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx;

                                return (
                                  <td 
                                    key={`cell-${rowIdx}-${colIdx}`}
                                    className="p-2 px-3 border-r border-slate-100 dark:border-slate-800 relative group cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
                                    onClick={() => {
                                      if (!isEditing) {
                                        setEditingCell({ rowIdx, colIdx, val: cellValue });
                                      }
                                    }}
                                  >
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          autoFocus
                                          value={editingCell.val}
                                          onChange={e => setEditingCell({ ...editingCell, val: e.target.value })}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") handleSaveCellWithConfirmation();
                                            if (e.key === "Escape") setEditingCell(null);
                                          }}
                                          className="w-full text-xs p-1 border border-indigo-500 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                                        />
                                        <button
                                          onClick={handleSaveCellWithConfirmation}
                                          className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                                          title="Save (requires confirmation)"
                                        >
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => setEditingCell(null)}
                                          className="p-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer"
                                          title="Cancel"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="truncate max-w-[200px]" title={cellValue}>
                                          {cellValue || <span className="text-slate-300 dark:text-slate-600 italic">-</span>}
                                        </span>
                                        <Edit3 className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Grid Footer */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Click any cell to edit. Edits require confirmation.</span>
                <span className="font-mono text-[10px]">
                  {gridValues.length} rows × {gridValues[0]?.length || 0} cols
                </span>
              </div>
            </div>
          ) : (
            <div className="p-16 text-center m-auto">
              <Table className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Select a spreadsheet to view</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Choose a sheet from the list on the left, or create a new one.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 cursor-pointer shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Spreadsheet</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CREATE SPREADSHEET MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create Google Spreadsheet</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSheetSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Spreadsheet Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Financials or File Audit"
                  value={newSheetTitle}
                  onChange={e => setNewSheetTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Template Preset
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate("blank")}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition cursor-pointer ${
                      selectedTemplate === "blank" 
                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold" 
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span>Blank Sheet</span>
                    <span className="text-[10px] text-slate-400">Clean grid</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate("inventory")}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition cursor-pointer ${
                      selectedTemplate === "inventory" 
                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold" 
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span>Drive Inventory</span>
                    <span className="text-[10px] text-slate-400">Auto file catalog</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate("tasks")}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition cursor-pointer ${
                      selectedTemplate === "tasks" 
                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold" 
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span>Task Tracker</span>
                    <span className="text-[10px] text-slate-400">Status & deadlines</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate("finances")}
                    className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition cursor-pointer ${
                      selectedTemplate === "finances" 
                        ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold" 
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span>Financial Log</span>
                    <span className="text-[10px] text-slate-400">Ledger & invoices</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Save in Folder
                </label>
                <select
                  value={selectedParentFolder}
                  onChange={e => setSelectedParentFolder(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-700 dark:text-slate-300 focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="root">My Drive (Root)</option>
                  {folderList.map((folder, idx) => (
                    <option key={`fld-${folder.id}-${idx}`} value={folder.id}>
                      📁 {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSheet}
                  className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingSheet ? "Creating..." : "Create Spreadsheet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ROW MODAL */}
      {showAddRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Append New Row into "{selectedSheet?.name}"
                </h3>
              </div>
              <button onClick={() => setShowAddRowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto pr-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter values for each column in {activeTabTitle}. An explicit confirmation will be requested before appending.
              </p>

              {newRowValues.map((val, idx) => {
                const colLetter = colIndexToA1(idx);
                const colHeader = gridValues[0]?.[idx] || `Column ${colLetter}`;
                return (
                  <div key={`input-col-${idx}`}>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {colHeader} ({colLetter})
                    </label>
                    <input
                      type="text"
                      value={val}
                      onChange={e => {
                        const next = [...newRowValues];
                        next[idx] = e.target.value;
                        setNewRowValues(next);
                      }}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddRowModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAppendRowWithConfirmation}
                className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 cursor-pointer"
              >
                Continue to Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR WORKSPACE MUTATION */}
      {showConfirmSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Confirm Spreadsheet Update</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Explicit human authorization required</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                You are about to modify data in your live Google Spreadsheet:
              </p>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs font-mono text-slate-800 dark:text-slate-200 break-words">
                {pendingSaveDescription}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                This operation directly updates the Google Sheets file stored in your Google Drive.
              </p>
            </div>

            <div className="mt-6 pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isSavingGrid}
                onClick={() => {
                  setShowConfirmSaveModal(false);
                  setPendingSaveAction(null);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingGrid}
                onClick={async () => {
                  if (pendingSaveAction) {
                    await pendingSaveAction();
                  }
                }}
                className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isSavingGrid && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{isSavingGrid ? "Saving..." : "Confirm & Save"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
