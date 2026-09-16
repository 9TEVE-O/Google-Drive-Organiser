import React, { useState, useEffect } from "react";
import { 
  Folder, File, FileText, Plus, Search, ArrowLeft, Trash2, Edit3, 
  ExternalLink, Move, ChevronRight, Filter, PlusCircle, Check, X, ShieldAlert, RefreshCw, Eye
} from "lucide-react";
import { DriveFile, ActivityLog } from "../types";
import { 
  createDriveFolder, createDriveTextFile, updateDriveTextFile, 
  getDriveTextFileContent, moveDriveFile, deleteDriveFile 
} from "../lib/googleApi";
import FilePreviewModal from "./FilePreviewModal";

interface DriveBrowserProps {
  token: string | null;
  files: DriveFile[];
  onRefresh: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  // Let parents/tabs communicate
  filesInPlan?: { [key: string]: { category: string; tags: string[]; relevance: number } };
  externalSearchQuery?: string;
  onClearExternalSearch?: () => void;
}

export default function DriveBrowser({
  token,
  files,
  onRefresh,
  addLog,
  filesInPlan = {},
  externalSearchQuery = "",
  onClearExternalSearch
}: DriveBrowserProps) {
  // Navigation & Folder structure
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([
    { id: "root", name: "My Drive" }
  ]);

  // Auto-reset folder to root if external search is active so user sees matching files across all folders
  useEffect(() => {
    if (externalSearchQuery.trim() && currentFolderId !== "root") {
      setCurrentFolderId("root");
      setBreadcrumbs([{ id: "root", name: "My Drive" }]);
    }
  }, [externalSearchQuery]);

  // Search, tagging & filtering states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  
  // Advanced filters
  const [filterType, setFilterType] = useState("All"); // All, PDF, DOCX, JPG, Text, Folder
  const [minRelevance, setMinRelevance] = useState(0); 
  const [dateRangeStr, setDateRangeStr] = useState("all-time"); // all-time, last-30, last-7
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "relevance">("name");

  // Local state for interactive tags injected by Smart Organizer or manual edits
  const [manualMetadata, setManualMetadata] = useState<{ [id: string]: { tags: string[]; category?: string; relevance?: number } }>({});

  // Modals & Forms
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [showDocModal, setShowDocModal] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocContent, setNewDocContent] = useState("");

  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [movingFile, setMovingFile] = useState<DriveFile | null>(null);
  const [isExecutingMove, setIsExecutingMove] = useState(false);

  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DriveFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [newTagVal, setNewTagVal] = useState("");

  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");

  // File Preview Modal with Gemini AI Summary
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);

  // List folders for Move Destination selection (strictly deduplicated by ID)
  const folderList = React.useMemo(() => {
    const seen = new Set<string>();
    return files.filter(f => {
      if (f.mimeType !== "application/vnd.google-apps.folder") return false;
      if (!f.id || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }, [files]);

  // Resolve localized tags / categories merging Gemini classifications and manual ones
  const getFileMetadata = (f: DriveFile) => {
    const fromPlan = filesInPlan[f.id] || { category: undefined, tags: [] as string[], relevance: undefined };
    const fromManual = manualMetadata[f.id] || { category: undefined, tags: [] as string[], relevance: undefined };
    
    // Merge plan tags, manual tags, and any defaults
    const combinedTags = Array.from(new Set([
      ...(f.tags || []),
      ...(fromPlan.tags || []),
      ...(fromManual.tags || [])
    ]));

    const category = fromManual.category || fromPlan.category || f.category || "Unsorted";
    const relevance = fromManual.relevance !== undefined 
      ? fromManual.relevance 
      : (fromPlan.relevance !== undefined ? fromPlan.relevance : (f.relevance !== undefined ? f.relevance : 40));

    return { tags: combinedTags, category, relevance };
  };

  // Get current active folder files (with strict deduplication)
  const filteredFiles = React.useMemo(() => {
    const rawMatches = files.filter(f => {
      // If external or internal search is active, show all matching items directly
      const isSearching = Boolean(searchQuery.trim() || externalSearchQuery.trim());

      // Parent matches
      const isChild = isSearching
        ? true
        : (currentFolderId === "root" 
            ? (f.parents.length === 0 || f.parents.includes("root") || !files.some(parent => f.parents.includes(parent.id)))
            : f.parents.includes(currentFolderId));

      if (!isChild) return false;

      // Search matches
      const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Filter selections
      const meta = getFileMetadata(f);
      const matchesTag = selectedTag === "All" || meta.tags.includes(selectedTag);
      const matchesCategory = selectedCategory === "All" || meta.category === selectedCategory;

      // Advanced filters
      const matchesRelevance = meta.relevance >= minRelevance;
      
      let matchesType = true;
      if (filterType !== "All") {
        const mime = f.mimeType.toLowerCase();
        if (filterType === "Folder") matchesType = mime === "application/vnd.google-apps.folder";
        else if (filterType === "Text") matchesType = mime.includes("text/");
        else if (filterType === "PDF") matchesType = mime.includes("pdf");
        else if (filterType === "Image") matchesType = mime.includes("image/");
        else matchesType = f.name.toLowerCase().endsWith("." + filterType.toLowerCase());
      }

      let matchesDate = true;
      if (dateRangeStr !== "all-time" && f.createdTime) {
        const createdDate = new Date(f.createdTime);
        const now = new Date();
        const diffDays = (now.getTime() - createdDate.getTime()) / (1000 * 3600 * 24);
        if (dateRangeStr === "last-30") matchesDate = diffDays <= 30;
        else if (dateRangeStr === "last-7") matchesDate = diffDays <= 7;
      }

      return matchesTag && matchesCategory && matchesRelevance && matchesType && matchesDate;
    }).sort((a, b) => {
      if (sortBy === "relevance") {
        const metaA = getFileMetadata(a);
        const metaB = getFileMetadata(b);
        return metaB.relevance - metaA.relevance;
      }
      return 0; // fallback to default (name etc)
    });

    const seen = new Set<string>();
    return rawMatches.filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [files, searchQuery, externalSearchQuery, currentFolderId, selectedTag, selectedCategory, minRelevance, filterType, dateRangeStr, sortBy, filesInPlan, manualMetadata]);

  // Extract all unique categories and tags across all files
  const allUniqueTags = Array.from(new Set(
    files.flatMap(f => getFileMetadata(f).tags)
  ));

  const allUniqueCategories = Array.from(new Set(
    files.map(f => getFileMetadata(f).category).filter(Boolean)
  ));

  // Handle folder opening
  const handleOpenFolder = (folder: DriveFile) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
  };

  // Handle breadcrumb navigation
  const handleNavigateBreadcrumb = (index: number) => {
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(nextBreadcrumbs[nextBreadcrumbs.length - 1].id);
    setSelectedFileIds(new Set()); // Reset selections on navigate
  };

  const toggleSelection = (fileId: string) => {
    const newSelection = new Set(selectedFileIds);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFileIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
    }
  };

  const handleApplyBulkTag = () => {
    if (!bulkTagValue.trim() || selectedFileIds.size === 0) return;
    const tag = bulkTagValue.trim();
    
    setManualMetadata(prev => {
      const next = { ...prev };
      selectedFileIds.forEach(id => {
        if (!next[id]) {
          next[id] = { tags: [tag] };
        } else {
          const currentTags = next[id].tags || [];
          if (!currentTags.includes(tag)) {
            next[id].tags = [...currentTags, tag];
          }
        }
      });
      return next;
    });

    addLog("modify", `Applied bulk tag "#${tag}" to ${selectedFileIds.size} files`);
    setBulkTagValue("");
    setShowBulkTagModal(false);
    setSelectedFileIds(new Set());
  };

  // Handle Creating a new folder
  const handleCreateFolderAction = async () => {
    if (!token || !newFolderName) return;
    try {
      setIsSavingEdit(true);
      const parentDir = currentFolderId === "root" ? undefined : currentFolderId;
      const result = await createDriveFolder(token, newFolderName, parentDir);
      
      addLog("create", `Created folder named "${newFolderName}"`, `Folder ID: ${result.id}`);
      setNewFolderName("");
      setShowFolderModal(false);
      await onRefresh();
    } catch (e: any) {
      addLog("modify", "Error creating folder: " + e.message);
      console.error("Error creating folder:", e);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Creating a new document
  const handleCreateDocumentAction = async () => {
    if (!token || !newDocName) return;
    try {
      setIsSavingEdit(true);
      const parentDir = currentFolderId === "root" ? undefined : currentFolderId;
      const result = await createDriveTextFile(token, newDocName, newDocContent, parentDir);

      addLog("create", `Created direct text document "${newDocName}"`, `Document ID: ${result.id}`);
      setNewDocName("");
      setNewDocContent("");
      setShowDocModal(false);
      await onRefresh();
    } catch (e: any) {
      addLog("modify", "Error creating Google Drive text document: " + e.message);
      console.error("Error creating document:", e);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Trigger Edit modal and fetch live file content
  const handleStartEdit = async (file: DriveFile) => {
    if (!token) return;
    setEditingFile(file);
    setIsLoadingContent(true);
    try {
      const content = await getDriveTextFileContent(token, file.id);
      setEditContent(content);
    } catch (e: any) {
      setEditContent("");
      console.error("Couldn't retrieve document contents. Editing as blank text.", e);
    } finally {
      setIsLoadingContent(false);
    }
  };

  // Save edited document contents on Google Drive
  const handleSaveEditAction = async () => {
    if (!token || !editingFile) return;
    try {
      setIsSavingEdit(true);
      await updateDriveTextFile(token, editingFile.id, editContent);
      addLog("modify", `Edited content of file "${editingFile.name}"`, `File ID: ${editingFile.id}`);
      setEditingFile(null);
      setEditContent("");
      await onRefresh();
    } catch (e: any) {
      addLog("modify", "Error saving edits: " + e.message);
      console.error("Error saving edits:", e);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Moving a file
  const handleMoveFileAction = async (targetFolderId: string) => {
    if (!token || !movingFile) return;
    try {
      setIsExecutingMove(true);
      const targetFolder = files.find(f => f.id === targetFolderId);
      const targetName = targetFolderId === "root" ? "My Drive Root" : (targetFolder?.name || "Folder");

      // Check current parent
      const currentParent = movingFile.parents?.[0];

      await moveDriveFile(token, movingFile.id, targetFolderId, currentParent);
      addLog("move", `Moved file "${movingFile.name}" into "${targetName}"`, `File ID: ${movingFile.id}`);
      setMovingFile(null);
      await onRefresh();
    } catch (e: any) {
      addLog("move", "Error moving file: " + e.message);
      console.error("Error moving file:", e);
    } finally {
      setIsExecutingMove(false);
    }
  };

  // Handle safe file deletion (CRITICAL: Requires explicit user action)
  const handleDeleteFileAction = async () => {
    if (!token || !confirmDeleteFile) return;
    try {
      setIsDeleting(true);
      await deleteDriveFile(token, confirmDeleteFile.id);
      addLog("modify", `Deleted file "${confirmDeleteFile.name}" from Google Drive`, `File ID: ${confirmDeleteFile.id}`);
      setConfirmDeleteFile(null);
      await onRefresh();
    } catch (e: any) {
      addLog("modify", "Error cleaning up document: " + e.message);
      console.error("Error cleaning up document:", e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Add tag manually
  const handleAddTag = (fileId: string) => {
    if (!newTagVal.trim()) return;
    const current = manualMetadata[fileId] || { tags: [] };
    if (!current.tags.includes(newTagVal.trim().toLowerCase())) {
      const tags = [...current.tags, newTagVal.trim().toLowerCase()];
      setManualMetadata({
        ...manualMetadata,
        [fileId]: { ...current, tags }
      });
      addLog("modify", `Added manual tag '${newTagVal}' to file ID: ${fileId}`);
    }
    setNewTagVal("");
    setTagInputId(null);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Hub */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Top Row: Quick Creator Operations */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-sync-drive-top"
                onClick={onRefresh}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 px-3.5 py-2 text-xs font-semibold hover:bg-emerald-100 transition"
              >
                <RefreshCw className="h-4 w-4" /> Sync Drive
              </button>
              <button
                id="btn-new-folder"
                onClick={() => setShowFolderModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
              >
                <Plus className="h-4 w-4" /> New Folder
              </button>
              <button
                id="btn-new-doc"
                onClick={() => setShowDocModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <PlusCircle className="h-4 w-4" /> New Document
              </button>
            </div>
          </div>

          {/* Bottom Row: Filtering controls */}
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-3 border-t border-slate-100">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                id="search-docs-input"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search filenames..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
              />
            </div>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition shrink-0 px-2 py-2"
            >
              <Filter className="h-4 w-4" /> 
              {showAdvancedFilters ? "Hide Filters" : "Advanced Filters"}
            </button>
          </div>
        </div>

        {/* Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-4 animate-in fade-in slide-in-from-top-2">
            
            {/* Category selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Category</label>
              <select
                id="filter-category"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-500 min-w-[120px]"
              >
                <option value="All">All Categories</option>
                <option value="Unsorted">Unsorted</option>
                {allUniqueCategories.filter(c => c !== "Unsorted").map((cat, idx) => (
                  <option key={`cat-${cat}-${idx}`} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Tags selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tag</label>
              <select
                id="filter-tag"
                value={selectedTag}
                onChange={e => setSelectedTag(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-500 min-w-[120px]"
              >
                <option value="All">All Tags</option>
                {allUniqueTags.map((tag, idx) => (
                  <option key={`tag-${tag}-${idx}`} value={tag}>#{tag}</option>
                ))}
              </select>
            </div>

            {/* File Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">File Type</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-500 min-w-[120px]"
              >
                <option value="All">All Types</option>
                <option value="Folder">Folders</option>
                <option value="Text">Documents (Text)</option>
                <option value="PDF">PDFs</option>
                <option value="Image">Images</option>
                <option value="csv">CSV Spreadsheets</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Date Created</label>
              <select
                value={dateRangeStr}
                onChange={e => setDateRangeStr(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-500 min-w-[120px]"
              >
                <option value="all-time">All Time</option>
                <option value="last-30">Last 30 Days</option>
                <option value="last-7">Last 7 Days</option>
              </select>
            </div>

            {/* Relevance */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <div className="flex justify-between pl-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Min Relevance Score</label>
                <span className="text-[10px] font-mono font-semibold text-indigo-600">{minRelevance}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" step="5"
                value={minRelevance}
                onChange={e => setMinRelevance(Number(e.target.value))}
                className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-1"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Sort Mode</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:outline-none focus:border-indigo-500 min-w-[120px] font-bold"
              >
                <option value="name">A-Z Name</option>
                <option value="relevance">By Relevance</option>
              </select>
            </div>

          </div>
        )}
      </div>


      {/* Directory Browser Stage */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Breadcrumb controls */}
        <div className="flex flex-col border-b border-slate-150 bg-slate-50/50 px-5 py-3 gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-slate-600 flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <span key={`crumb-${crumb.id}-${idx}`} className="flex items-center">
                  {idx > 0 && <ChevronRight className="h-3.5 w-3.5 mx-1 text-slate-350" />}
                  <button
                    onClick={() => handleNavigateBreadcrumb(idx)}
                    className={`hover:text-indigo-600 transition-colors ${
                      idx === breadcrumbs.length - 1 ? "font-semibold text-slate-800" : ""
                    }`}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>

            <span className="text-xs font-mono text-slate-400">
              {filteredFiles.length} file(s) matched
            </span>
          </div>

          {/* Active Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mr-1">Active Criteria:</span>
            {externalSearchQuery && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Explorer Search: "{externalSearchQuery}" {onClearExternalSearch && <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={onClearExternalSearch} />}
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Search: "{searchQuery}" <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setSearchQuery("")} />
              </span>
            )}
            {selectedCategory !== "All" && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Cat: {selectedCategory} <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setSelectedCategory("All")} />
              </span>
            )}
            {selectedTag !== "All" && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Tag: #{selectedTag} <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setSelectedTag("All")} />
              </span>
            )}
            {filterType !== "All" && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Type: {filterType} <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setFilterType("All")} />
              </span>
            )}
            {dateRangeStr !== "all-time" && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Date: {dateRangeStr} <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setDateRangeStr("all-time")} />
              </span>
            )}
            {minRelevance > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-medium">
                Relevance &gt;= {minRelevance}% <X className="h-3 w-3 cursor-pointer hover:text-indigo-900" onClick={() => setMinRelevance(0)} />
              </span>
            )}
            {!externalSearchQuery && !searchQuery && selectedCategory === "All" && selectedTag === "All" && filterType === "All" && dateRangeStr === "all-time" && minRelevance === 0 && (
              <span className="text-[10px] font-mono text-slate-400 italic">None (Showing all within folder)</span>
            )}
          </div>
        </div>

        {/* Browser List/Table */}
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Folder className="h-12 w-12 text-slate-300 stroke-[1.5] mb-3" />
            <h3 className="font-semibold text-slate-800 text-sm">
              {externalSearchQuery ? `No files matching "${externalSearchQuery}"` : "No items found"}
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              {externalSearchQuery 
                ? "Try searching for a different keyword or file type, or clear the search field in the Explorer Storage subheader." 
                : "This folder is blank, or the filters applied hidden all contents. Create a document or adjust search parameters."}
            </p>
            {externalSearchQuery && onClearExternalSearch && (
              <button
                onClick={onClearExternalSearch}
                className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
              >
                Clear Explorer search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {selectedFileIds.size > 0 && (
              <div className="bg-indigo-50 border-b border-indigo-100 p-2.5 px-5 flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-700">
                  {selectedFileIds.size} file(s) selected
                </span>
                <button
                  onClick={() => setShowBulkTagModal(true)}
                  className="bg-indigo-600 text-white rounded px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 shadow-sm transition"
                >
                  Apply Bulk Tag
                </button>
              </div>
            )}
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/20 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-5 text-center w-12">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="py-3 px-5">Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Tags</th>
                  <th className="py-3 px-4">Relevance</th>
                  <th className="py-3 px-4 font-mono text-right">Size</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                {filteredFiles.map((file, fileIdx) => {
                  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                  const isEditableText = file.mimeType === "text/plain" || file.mimeType === "text/markdown";
                  const meta = getFileMetadata(file);

                  return (
                    <tr key={`file-${file.id}-${fileIdx}`} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-5 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(file.id)}
                          onChange={() => toggleSelection(file.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      {/* Name Col */}
                      <td className="py-3 px-5 font-medium text-slate-800">
                        <div className="flex items-center gap-2.5">
                          {isFolder ? (
                            <Folder className="h-4 w-4 text-amber-500 fill-amber-100 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                          )}
                          
                          <div className="min-w-0">
                            {isFolder ? (
                              <button
                                onClick={() => handleOpenFolder(file)}
                                className="font-semibold text-indigo-600 hover:underline text-left block max-w-xs sm:max-w-md truncate"
                              >
                                {file.name}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  id={`file-name-btn-${file.id}`}
                                  onClick={() => setPreviewFile(file)}
                                  className="text-slate-800 hover:text-indigo-600 hover:underline font-medium text-left truncate max-w-xs sm:max-w-md cursor-pointer transition-colors"
                                  title="Click to view file details and AI summary"
                                >
                                  {file.name}
                                </button>
                                {file.webViewLink && (
                                  <a
                                    href={file.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-slate-400 hover:text-indigo-600"
                                    title="Open directly in Google Workspace"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                            <span className="text-[10px] text-slate-400 font-mono italic block">
                              Created: {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category Col */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                          meta.category === "Unsorted" 
                            ? "bg-slate-100 text-slate-600"
                            : "bg-indigo-55 bg-indigo-50 text-indigo-700"
                        }`}>
                          {meta.category}
                        </span>
                      </td>

                      {/* Tags Col */}
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                          {meta.tags.map((tag, tagIdx) => (
                            <span key={`tag-${tag}-${tagIdx}`} className="rounded bg-slate-150 px-1 py-0.5 text-[10px] text-slate-600 font-mono">
                              #{tag}
                            </span>
                          ))}
                          {tagInputId === file.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                size={6}
                                value={newTagVal}
                                onChange={e => setNewTagVal(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleAddTag(file.id)}
                                className="rounded border border-slate-200 px-1 py-0.5 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="tag..."
                                autoFocus
                              />
                              <button onClick={() => handleAddTag(file.id)} className="text-emerald-600">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => { setTagInputId(null); setNewTagVal(""); }} className="text-rose-500">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setTagInputId(file.id)}
                              className="rounded border border-dashed border-slate-300 px-1 py-0.5 text-[10px] text-slate-400 hover:border-slate-500 hover:text-slate-600 font-mono transition"
                            >
                              + tag
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Relevance Col */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 w-24 group">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-semibold text-slate-500">
                              {meta.relevance}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 relative overflow-hidden group-hover:hidden">
                            <div 
                              className={`h-1.5 rounded-full ${
                                meta.relevance > 75 ? "bg-emerald-500" : meta.relevance > 40 ? "bg-indigo-500" : "bg-amber-400"
                              }`} 
                              style={{ width: `${meta.relevance}%` }}
                            ></div>
                          </div>
                          {/* Relevance Adjustment Feedback UI */}
                          <div className="hidden group-hover:flex items-center justify-between gap-1 w-full flex-wrap">
                            <button 
                              title="Increase Relevance Score"
                              onClick={() => {
                                const newRel = Math.min(100, meta.relevance + 10);
                                setManualMetadata({
                                  ...manualMetadata,
                                  [file.id]: { ...(manualMetadata[file.id] || { tags: [] }), relevance: newRel }
                                });
                                addLog("modify", `Increased AI relevance score feedback for "${file.name}" to ${newRel}%`);
                              }}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                            >
                              +
                            </button>
                            <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold">Feedback</span>
                            <button 
                              title="Decrease Relevance Score"
                              onClick={() => {
                                const newRel = Math.max(0, meta.relevance - 10);
                                setManualMetadata({
                                  ...manualMetadata,
                                  [file.id]: { ...(manualMetadata[file.id] || { tags: [] }), relevance: newRel }
                                });
                                addLog("modify", `Decreased AI relevance score feedback for "${file.name}" to ${newRel}%`);
                              }}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
                            >
                              -
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Size Col */}
                      <td className="py-3 px-4 text-right font-mono text-[10px] text-slate-500">
                        {isFolder ? "-" : (file.size || "0 B")}
                      </td>

                      {/* Actions Col */}
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`action-preview-file-${file.id}`}
                            onClick={() => setPreviewFile(file)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
                            title="Preview file details & AI summary"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {isEditableText && (
                            <button
                              onClick={() => handleStartEdit(file)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                              title="Edit text content"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setMovingFile(file)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                            title="Move file"
                          >
                            <Move className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteFile(file)}
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition"
                            title="Delete file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Create Folder */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display font-bold text-slate-950 text-lg mb-1">Create Folder</h3>
            <p className="text-xs text-slate-500 mb-4">Creates a new folder category inside current path on Google Drive.</p>
            
            <input
              type="text"
              id="new-folder-name"
              placeholder="E.g., Financial Invoices, Personal Archive"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none transition mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowFolderModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-new-folder"
                onClick={handleCreateFolderAction}
                disabled={isSavingEdit || !newFolderName}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {isSavingEdit ? "Creating..." : "Create Folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Document */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display font-bold text-slate-950 text-lg mb-1">New Text Document</h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">Create a raw text document directly synced on Google Drive.</p>
            
            <input
              type="text"
              id="new-doc-name"
              placeholder="Filename (e.g., project_overview, notes)"
              value={newDocName}
              onChange={e => setNewDocName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none transition mb-3"
              autoFocus
            />

            <textarea
              placeholder="Type document content here..."
              rows={6}
              value={newDocContent}
              onChange={e => setNewDocContent(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono focus:border-indigo-500 focus:bg-white focus:outline-none transition mb-4"
            />

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setShowDocModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-new-doc"
                onClick={handleCreateDocumentAction}
                disabled={isSavingEdit || !newDocName}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {isSavingEdit ? "Saving..." : "Create & Synchronize"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Live Editor Plain Text */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in' fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-display font-medium text-slate-950 text-base">Editing: {editingFile.name}</h3>
                <span className="text-[10px] text-slate-400 font-mono">ID: {editingFile.id}</span>
              </div>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {isLoadingContent ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent animate-spin rounded-full mb-2"></div>
                <span className="text-xs font-mono text-slate-400">Loading document details...</span>
              </div>
            ) : (
              <>
                <textarea
                  rows={10}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono focus:border-indigo-500 focus:bg-white focus:outline-none transition mb-4"
                />

                <div className="flex justify-end gap-2.5">
                  <button
                    onClick={() => setEditingFile(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Discard Changes
                  </button>
                  <button
                    id="btn-save-doc"
                    onClick={handleSaveEditAction}
                    disabled={isSavingEdit}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {isSavingEdit ? "Saving..." : "Commit Changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Move File Picker */}
      {movingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in fade-in duration-200">
            <h3 className="font-display font-bold text-slate-950 text-lg mb-1">Move File</h3>
            <p className="text-xs text-slate-500 mb-4 text-slate-800">
              Select destination folder to move <strong className="text-slate-900">"{movingFile.name}"</strong>:
            </p>

            {/* List folders including parent level */}
            <div className="max-h-60 overflow-y-auto border border-slate-150 rounded-lg p-2.5 space-y-1 mb-4">
              <button
                onClick={() => handleMoveFileAction("root")}
                className="w-full text-left font-semibold text-xs font-mono py-2 px-3 hover:bg-indigo-50/50 rounded-lg flex items-center gap-2"
              >
                <Folder className="h-4 w-4 text-indigo-550 shrink-0" /> My Drive Root
              </button>
              {folderList.filter(fold => fold.id !== movingFile.id).map((fold, fIdx) => (
                <button
                  key={`fold-move-${fold.id}-${fIdx}`}
                  onClick={() => handleMoveFileAction(fold.id)}
                  className="w-full text-left font-mono text-xs py-2 px-3 hover:bg-indigo-50/50 rounded-lg flex items-center gap-2 border-l-2 border-slate-200 pl-4"
                >
                  <Folder className="h-4 w-4 text-amber-500 shrink-0" /> {fold.name}
                </button>
              ))}
              {folderList.length === 0 && (
                <span className="text-slate-400 text-xs text-center py-4 block">No other custom folders detected! Create one.</span>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setMovingFile(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED CONFIRMATION DIALOG: Destructive Deletions (CRITICAL USER MANDATE FOR MUTATIONS) */}
      {confirmDeleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-650 text-rose-600 mb-3">
              <ShieldAlert className="h-6 w-6 shrink-0" />
              <h3 className="font-display font-bold text-slate-950 text-lg">Confirm File Deletion</h3>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              You are about to permanently delete <strong className="text-slate-950">"{confirmDeleteFile.name}"</strong> from your connected Google Drive storage. This action <strong>cannot</strong> be undone.
            </p>

            <div className="rounded-lg bg-slate-50 p-3 mb-4 border border-slate-100 font-mono text-[10px] space-y-1 text-slate-500">
              <div>Type: {confirmDeleteFile.mimeType}</div>
              {confirmDeleteFile.size && <div>Size: {confirmDeleteFile.size}</div>}
              <div>File ID: {confirmDeleteFile.id}</div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setConfirmDeleteFile(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete"
                onClick={handleDeleteFileAction}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* BULK TAG MODAL */}
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="font-display font-bold text-slate-950 text-lg mb-1">Apply Bulk Tag</h3>
            <p className="text-xs text-slate-500 mb-4">
              Add a tag to all {selectedFileIds.size} selected files simultaneously.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Common Tag Name</label>
                <input
                  type="text"
                  value={bulkTagValue}
                  onChange={e => setBulkTagValue(e.target.value)}
                  placeholder="e.g. Invoices-2023"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowBulkTagModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyBulkTag}
                  disabled={!bulkTagValue.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  Apply to {selectedFileIds.size} Files
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: File Preview Modal with AI Gemini Summary */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          token={token}
          onClose={() => setPreviewFile(null)}
          metadata={getFileMetadata(previewFile)}
          onStartEdit={handleStartEdit}
          onStartMove={setMovingFile}
          onStartDelete={setConfirmDeleteFile}
        />
      )}
    </div>
  );
}
