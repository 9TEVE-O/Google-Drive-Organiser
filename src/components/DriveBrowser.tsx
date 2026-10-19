import React, { useState, useEffect } from "react";
import { 
  Folder, File, FileText, Plus, Search, ArrowLeft, Edit3, 
  ExternalLink, Move, ChevronRight, Filter, PlusCircle, Check, X, RefreshCw, Eye,
  FileSpreadsheet, Zap, CheckCircle2, Archive, ShieldAlert, Layers, Bell,
  FolderSearch, AlertCircle, Info
} from "lucide-react";
import { DriveFile, ActivityLog } from "../types";
import { 
  createDriveFolder, createDriveTextFile, updateDriveTextFile, 
  getDriveTextFileContent, moveDriveFile, createSpreadsheet,
  uploadDriveBlob, createGoogleDoc, openGooglePicker, getGoogleDoc
} from "../lib/googleApi";
import { evaluateFileDecision, getDecisionSystemMetrics, DecisionSystemMetrics } from "../lib/decisionEngine";
import FilePreviewModal from "./FilePreviewModal";
import ContextualActionToolbar from "./ContextualActionToolbar";
import GoogleDocViewerModal from "./GoogleDocViewerModal";

interface DriveBrowserProps {
  token: string | null;
  files: DriveFile[];
  onRefresh: () => Promise<void>;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email' | 'sheet', message: string, details?: string) => void;
  // Let parents/tabs communicate
  filesInPlan?: { [key: string]: { category: string; tags: string[]; relevance: number } };
  externalSearchQuery?: string;
  onClearExternalSearch?: () => void;
  onScheduleReminder?: (file?: DriveFile) => void;
}

export default function DriveBrowser({
  token,
  files,
  onRefresh,
  addLog,
  filesInPlan = {},
  externalSearchQuery = "",
  onClearExternalSearch,
  onScheduleReminder
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
  const [newDocFormat, setNewDocFormat] = useState<'google_doc' | 'text'>('google_doc');

  // Google Docs Viewer Modal state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState<string>("");
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);

  // Google Picker state
  const [isLaunchingPicker, setIsLaunchingPicker] = useState(false);

  const [showSheetModal, setShowSheetModal] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");

  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [movingFile, setMovingFile] = useState<DriveFile | null>(null);
  const [isExecutingMove, setIsExecutingMove] = useState(false);


  const [tagInputId, setTagInputId] = useState<string | null>(null);
  const [newTagVal, setNewTagVal] = useState("");

  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [browserAsyncState, setBrowserAsyncState] = useState<{
    status: "idle" | "loading" | "success" | "empty" | "failed";
    message: string | null;
    retryFn: (() => Promise<void>) | null;
  }>({ status: "idle", message: null, retryFn: null });
  const [editLoadError, setEditLoadError] = useState<string | null>(null);

  const handleUploadFiles = async (fileList: FileList) => {
    if (!token) {
      setBrowserAsyncState({
        status: "failed",
        message: "Upload failed: Please connect your Google Drive account first.",
        retryFn: null
      });
      return;
    }
    if (fileList.length === 0) {
      setBrowserAsyncState({
        status: "empty",
        message: "No files were selected for upload.",
        retryFn: null
      });
      return;
    }
    setIsUploading(true);
    setBrowserAsyncState({
      status: "loading",
      message: `Uploading ${fileList.length} file(s) to Google Drive...`,
      retryFn: null
    });
    try {
      let count = 0;
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        await uploadDriveBlob(token, f, currentFolderId === "root" ? undefined : currentFolderId);
        count++;
      }
      addLog("create", `Uploaded ${count} file${count === 1 ? "" : "s"} to Drive`, `Folder: ${breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive'}`);
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Uploaded ${count} file${count === 1 ? "" : "s"} to "${breadcrumbs[breadcrumbs.length - 1]?.name || "My Drive"}".`,
        retryFn: null
      });
    } catch (err: any) {
      addLog("modify", `Upload failed: ${err.message || "Unknown error"}`);
      setBrowserAsyncState({
        status: "failed",
        message: `File upload failed: ${err.message || "Google Drive API error"}`,
        retryFn: () => handleUploadFiles(fileList)
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleActionSelect = (actionId: string) => {
    switch (actionId) {
      case 'google-picker':
        handleLaunchGooglePicker();
        break;
      case 'new-doc':
        setShowDocModal(true);
        break;
      case 'new-sheet':
        setShowSheetModal(true);
        break;
      case 'new-folder':
        setShowFolderModal(true);
        break;
      case 'upload-file':
        fileInputRef.current?.click();
        break;
      default:
        break;
    }
  };

  const handleBulkExecuteSelectedDecisions = async () => {
    if (selectedFileIds.size === 0) {
      setBrowserAsyncState({
        status: "empty",
        message: "No files selected for batch decision execution.",
        retryFn: null
      });
      return;
    }
    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    setIsBatchExecuting(true);
    setBrowserAsyncState({
      status: "loading",
      message: `Executing recommended actions on ${selectedFiles.length} selected file(s)...`,
      retryFn: null
    });
    try {
      const folderCache: { [name: string]: string } = {};
      files.forEach(f => {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          folderCache[f.name.toLowerCase()] = f.id;
        }
      });
      let moved = 0;
      const failedNames: string[] = [];
      for (const file of selectedFiles) {
        const meta = getFileMetadata(file);
        const targetFolderName = meta.decision?.targetFolder || "General";
        let targetId = folderCache[targetFolderName.toLowerCase()];
        if (!targetId && token) {
          try {
            const created = await createDriveFolder(token, targetFolderName, "root");
            targetId = created.id;
            folderCache[targetFolderName.toLowerCase()] = targetId;
          } catch {
            targetId = "root";
          }
        }
        if (token && targetId) {
          try {
            await moveDriveFile(token, file.id, targetId, file.parents?.[0]);
            moved++;
          } catch (e) {
            console.warn(`Could not relocate ${file.name}:`, e);
            failedNames.push(file.name);
          }
        } else {
          moved++;
        }
      }
      addLog("organize", `Executed decisions on ${moved} selected file${moved === 1 ? '' : 's'}.`);
      setSelectedFileIds(new Set());
      await onRefresh();
      if (failedNames.length > 0) {
        setBrowserAsyncState({
          status: "failed",
          message: `Batch execution finished with errors (${moved}/${selectedFiles.length} succeeded; failed: ${failedNames.slice(0, 3).join(", ")}).`,
          retryFn: handleBulkExecuteSelectedDecisions
        });
      } else {
        setBrowserAsyncState({
          status: "success",
          message: `Successfully executed decisions on ${moved} selected file(s).`,
          retryFn: null
        });
      }
    } catch (e: any) {
      console.error("Bulk execute error:", e);
      setBrowserAsyncState({
        status: "failed",
        message: `Bulk decision execution failed: ${e.message || "Google Drive API error"}`,
        retryFn: handleBulkExecuteSelectedDecisions
      });
    } finally {
      setIsBatchExecuting(false);
    }
  };

  const handleBulkExportSelected = () => {
    const selectedFiles = files.filter(f => selectedFileIds.has(f.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedFiles, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `selected_drive_files_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addLog("modify", `Exported metadata for ${selectedFiles.length} selected files`);
  };

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

  // Decision System quick triage filter & execution states
  const [decisionQuickFilter, setDecisionQuickFilter] = useState<'all' | 'pending' | 'archive' | 'relocate' | 'high-urgency' | 'verified'>('all');
  const [executingFileId, setExecutingFileId] = useState<string | null>(null);
  const [isBatchExecuting, setIsBatchExecuting] = useState(false);

  // Compute live operational metrics for the Autonomous Decision System
  const decisionMetrics = React.useMemo(() => {
    return getDecisionSystemMetrics(files);
  }, [files]);

  // Resolve localized tags / categories merging Gemini classifications and manual ones
  const getFileMetadata = (f: DriveFile) => {
    const fromPlan = filesInPlan[f.id] || { category: undefined, tags: [] as string[], relevance: undefined };
    const fromManual = manualMetadata[f.id] || { category: undefined, tags: [] as string[], relevance: undefined };
    
    // Evaluate dynamic decision if not present
    const dynamicEval = (!f.category || !f.decision) ? evaluateFileDecision(f) : f;

    // Merge plan tags, manual tags, and any defaults
    const combinedTags = Array.from(new Set([
      ...(f.tags || []),
      ...(dynamicEval.tags || []),
      ...(fromPlan.tags || []),
      ...(fromManual.tags || [])
    ]));

    const category = fromManual.category || fromPlan.category || f.category || dynamicEval.category || "General Documents";
    const relevance = fromManual.relevance !== undefined 
      ? fromManual.relevance 
      : (fromPlan.relevance !== undefined ? fromPlan.relevance : (f.relevance !== undefined ? f.relevance : (dynamicEval.relevance || 75)));

    const decision = f.decision || dynamicEval.decision;

    return { tags: combinedTags, category, relevance, decision };
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

      // Decision quick filters
      if (decisionQuickFilter === "pending") {
        const isPending = meta.decision && (meta.decision.decisionType === "relocate" || meta.decision.decisionType === "archive");
        if (!isPending) return false;
      } else if (decisionQuickFilter === "archive") {
        if (meta.decision?.decisionType !== "archive") return false;
      } else if (decisionQuickFilter === "relocate") {
        if (meta.decision?.decisionType !== "relocate") return false;
      } else if (decisionQuickFilter === "high-urgency") {
        if (meta.decision?.urgency !== "high") return false;
      } else if (decisionQuickFilter === "verified") {
        if (meta.decision?.decisionType !== "verified" && meta.decision?.status !== "applied") return false;
      }

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
  }, [files, searchQuery, externalSearchQuery, currentFolderId, selectedTag, selectedCategory, decisionQuickFilter, minRelevance, filterType, dateRangeStr, sortBy, filesInPlan, manualMetadata]);

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
    if (!token || !newFolderName.trim()) return;
    const folderToCreate = newFolderName.trim();
    try {
      setIsSavingEdit(true);
      setBrowserAsyncState({
        status: "loading",
        message: `Creating folder "${folderToCreate}" in Google Drive...`,
        retryFn: null
      });
      const parentDir = currentFolderId === "root" ? undefined : currentFolderId;
      const result = await createDriveFolder(token, folderToCreate, parentDir);
      
      addLog("create", `Created folder named "${folderToCreate}"`, `Folder ID: ${result.id}`);
      setNewFolderName("");
      setShowFolderModal(false);
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Created folder "${folderToCreate}" successfully.`,
        retryFn: null
      });
    } catch (e: any) {
      addLog("modify", "Error creating folder: " + e.message);
      console.error("Error creating folder:", e);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to create folder "${folderToCreate}": ${e.message || "Google Drive API error"}`,
        retryFn: handleCreateFolderAction
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Creating a new document (supports Google Docs API and text documents)
  const handleCreateDocumentAction = async () => {
    if (!token || !newDocName.trim()) return;
    const docNameToCreate = newDocName.trim();
    try {
      setIsSavingEdit(true);
      setBrowserAsyncState({
        status: "loading",
        message: `Creating ${newDocFormat === "google_doc" ? "Google Doc" : "text document"} "${docNameToCreate}"...`,
        retryFn: null
      });
      const parentDir = currentFolderId === "root" ? undefined : currentFolderId;

      if (newDocFormat === "google_doc") {
        const result = await createGoogleDoc(token, docNameToCreate, newDocContent, parentDir);
        addLog("create", `Created Google Doc "${result.title}" via Docs API`, `Document ID: ${result.documentId}`);
        setNewDocName("");
        setNewDocContent("");
        setShowDocModal(false);
        await onRefresh();
        setBrowserAsyncState({
          status: "success",
          message: `Created Google Doc "${result.title}" successfully.`,
          retryFn: null
        });

        // Immediately open the newly created Google Doc in the viewer modal
        setSelectedDocId(result.documentId);
        setSelectedDocTitle(result.title);
        setIsDocViewerOpen(true);
      } else {
        const result = await createDriveTextFile(token, docNameToCreate, newDocContent, parentDir);
        addLog("create", `Created direct text document "${docNameToCreate}"`, `Document ID: ${result.id}`);
        setNewDocName("");
        setNewDocContent("");
        setShowDocModal(false);
        await onRefresh();
        setBrowserAsyncState({
          status: "success",
          message: `Created text document "${docNameToCreate}" successfully.`,
          retryFn: null
        });
      }
    } catch (e: any) {
      addLog("modify", "Error creating document: " + e.message);
      console.error("Error creating document:", e);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to create document "${docNameToCreate}": ${e.message || "Google Drive API error"}`,
        retryFn: handleCreateDocumentAction
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Launch Google Picker client modal
  const handleLaunchGooglePicker = async () => {
    if (!token) {
      setBrowserAsyncState({
        status: "failed",
        message: "Cannot open Google Picker: Please connect your Google Workspace account.",
        retryFn: null
      });
      return;
    }
    setIsLaunchingPicker(true);
    setBrowserAsyncState({
      status: "loading",
      message: "Opening Google Picker...",
      retryFn: null
    });
    try {
      await openGooglePicker({
        token,
        onPick: (picked) => {
          addLog("create", `Selected file via Google Picker: "${picked.name}"`, `ID: ${picked.id} · MIME: ${picked.mimeType}`);
          setBrowserAsyncState({
            status: "success",
            message: `Selected "${picked.name}" via Google Picker.`,
            retryFn: null
          });
          if (picked.mimeType === "application/vnd.google-apps.document") {
            setSelectedDocId(picked.id);
            setSelectedDocTitle(picked.name);
            setIsDocViewerOpen(true);
          } else {
            setSearchQuery(picked.name);
          }
        },
        onCancel: () => {
          setBrowserAsyncState({ status: "idle", message: null, retryFn: null });
        }
      });
    } catch (err: any) {
      console.warn("Google Picker launch notice:", err);
      addLog("modify", `Google Picker status: ${err?.message || "Unavailable"}`);
      setBrowserAsyncState({
        status: "failed",
        message: `Google Picker error: ${err?.message || "Unable to initialize Google Picker widget."}`,
        retryFn: handleLaunchGooglePicker
      });
    } finally {
      setIsLaunchingPicker(false);
    }
  };

  // Handle Creating a new spreadsheet
  const handleCreateSheetAction = async () => {
    if (!token || !newSheetTitle.trim()) return;
    const titleToCreate = newSheetTitle.trim();
    try {
      setIsSavingEdit(true);
      setBrowserAsyncState({
        status: "loading",
        message: `Creating Google Sheet "${titleToCreate}"...`,
        retryFn: null
      });
      const parentDir = currentFolderId === "root" ? undefined : currentFolderId;
      const result = await createSpreadsheet(token, titleToCreate, "Sheet1", undefined, parentDir);

      addLog("sheet", `Created Google Sheet "${titleToCreate}"`, `Spreadsheet ID: ${result.spreadsheetId}`);
      setNewSheetTitle("");
      setShowSheetModal(false);
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Created Google Sheet "${titleToCreate}" successfully.`,
        retryFn: null
      });
    } catch (e: any) {
      addLog("sheet", "Error creating Google Sheet: " + e.message);
      console.error("Error creating sheet:", e);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to create Google Sheet "${titleToCreate}": ${e.message || "Google Sheets API error"}`,
        retryFn: handleCreateSheetAction
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Trigger Edit modal and fetch live file content
  const handleStartEdit = async (file: DriveFile) => {
    if (!token) {
      setBrowserAsyncState({
        status: "failed",
        message: `Cannot edit "${file.name}": Google Drive token is missing.`,
        retryFn: null
      });
      return;
    }
    setEditingFile(file);
    setEditLoadError(null);
    setIsLoadingContent(true);
    try {
      const content = await getDriveTextFileContent(token, file.id);
      setEditContent(content);
    } catch (e: any) {
      setEditContent("");
      setEditLoadError(e?.message || "Could not retrieve document text from Google Drive.");
      console.error("Couldn't retrieve document contents.", e);
    } finally {
      setIsLoadingContent(false);
    }
  };

  // Save edited document contents on Google Drive
  const handleSaveEditAction = async () => {
    if (!token || !editingFile) return;
    const targetFile = editingFile;
    try {
      setIsSavingEdit(true);
      setEditLoadError(null);
      await updateDriveTextFile(token, targetFile.id, editContent);
      addLog("modify", `Edited content of file "${targetFile.name}"`, `File ID: ${targetFile.id}`);
      setEditingFile(null);
      setEditContent("");
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Saved changes to "${targetFile.name}".`,
        retryFn: null
      });
    } catch (e: any) {
      addLog("modify", "Error saving edits: " + e.message);
      console.error("Error saving edits:", e);
      setEditLoadError(`Failed to save changes: ${e.message || "Google Drive API error"}`);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to save changes to "${targetFile.name}": ${e.message || "API error"}`,
        retryFn: handleSaveEditAction
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Moving a file
  const handleMoveFileAction = async (targetFolderId: string) => {
    if (!token || !movingFile) return;
    const fileToMove = movingFile;
    try {
      setIsExecutingMove(true);
      const targetFolder = files.find(f => f.id === targetFolderId);
      const targetName = targetFolderId === "root" ? "My Drive Root" : (targetFolder?.name || "Folder");
      setBrowserAsyncState({
        status: "loading",
        message: `Moving "${fileToMove.name}" into "${targetName}"...`,
        retryFn: null
      });

      // Check current parent
      const currentParent = fileToMove.parents?.[0];

      await moveDriveFile(token, fileToMove.id, targetFolderId, currentParent);
      addLog("move", `Moved file "${fileToMove.name}" into "${targetName}"`, `File ID: ${fileToMove.id}`);
      setMovingFile(null);
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Moved "${fileToMove.name}" into "${targetName}".`,
        retryFn: null
      });
    } catch (e: any) {
      addLog("move", "Error moving file: " + e.message);
      console.error("Error moving file:", e);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to move "${fileToMove.name}": ${e.message || "Google Drive API error"}`,
        retryFn: () => handleMoveFileAction(targetFolderId)
      });
    } finally {
      setIsExecutingMove(false);
    }
  };

  // Autonomous Decision System: Execute a single file recommendation directly
  const handleExecuteSingleDecision = async (file: DriveFile, decision?: any) => {
    if (!decision || decision.decisionType === "verified") return;
    setExecutingFileId(file.id);
    const targetFolderName = decision.targetFolder || "General";
    setBrowserAsyncState({
      status: "loading",
      message: `Executing decision for "${file.name}" → /${targetFolderName}...`,
      retryFn: null
    });
    try {
      let targetFolderId = "root";

      // Look up target folder or create it
      const existingFolder = files.find(
        f => f.mimeType === "application/vnd.google-apps.folder" && f.name.toLowerCase() === targetFolderName.toLowerCase()
      );

      if (existingFolder) {
        targetFolderId = existingFolder.id;
      } else if (token) {
        const newFolder = await createDriveFolder(token, targetFolderName, "root");
        targetFolderId = newFolder.id;
      }

      if (token) {
        await moveDriveFile(token, file.id, targetFolderId, file.parents?.[0]);
      }

      // Mark applied in local state
      setManualMetadata(prev => ({
        ...prev,
        [file.id]: {
          ...(prev[file.id] || {}),
          tags: prev[file.id]?.tags || file.tags || [],
          category: decision.targetFolder,
          decision: { ...decision, status: "applied", action: "Verified in Location" }
        }
      }));

      addLog("move", `Autonomous Decision Executed: Relocated "${file.name}" to /${targetFolderName}`, decision.rationale);
      await onRefresh();
      setBrowserAsyncState({
        status: "success",
        message: `Relocated "${file.name}" to /${targetFolderName}.`,
        retryFn: null
      });
    } catch (err: any) {
      console.warn("Single decision execution notice:", err);
      addLog("move", `Decision notice for "${file.name}": ${err.message || "Failed to relocate"}`);
      setBrowserAsyncState({
        status: "failed",
        message: `Failed to relocate "${file.name}" to /${targetFolderName}: ${err.message || "Google Drive API error"}`,
        retryFn: () => handleExecuteSingleDecision(file, decision)
      });
    } finally {
      setExecutingFileId(null);
    }
  };

  // Autonomous Decision System: Batch execute all pending AI decisions
  const handleBatchExecuteDecisions = async () => {
    setIsBatchExecuting(true);
    try {
      const pendingFiles = files.filter(f => {
        const meta = getFileMetadata(f);
        return meta.decision && (meta.decision.decisionType === "relocate" || meta.decision.decisionType === "archive");
      });

      if (pendingFiles.length === 0) {
        setBrowserAsyncState({
          status: "empty",
          message: "No pending relocation or archival decisions require execution.",
          retryFn: null
        });
        return;
      }

      setBrowserAsyncState({
        status: "loading",
        message: `Executing batch decisions across ${pendingFiles.length} file(s)...`,
        retryFn: null
      });

      const folderCache: { [name: string]: string } = {};
      files.forEach(f => {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          folderCache[f.name.toLowerCase()] = f.id;
        }
      });

      let moved = 0;
      const failedNames: string[] = [];
      for (const file of pendingFiles) {
        const meta = getFileMetadata(file);
        const targetFolderName = meta.decision?.targetFolder || "General";
        let targetId = folderCache[targetFolderName.toLowerCase()];

        if (!targetId && token) {
          try {
            const created = await createDriveFolder(token, targetFolderName, "root");
            targetId = created.id;
            folderCache[targetFolderName.toLowerCase()] = targetId;
          } catch {
            targetId = "root";
          }
        }

        if (token && targetId) {
          try {
            await moveDriveFile(token, file.id, targetId, file.parents?.[0]);
            moved++;
          } catch (e) {
            console.warn(`Could not relocate ${file.name}:`, e);
            failedNames.push(file.name);
          }
        } else {
          moved++;
        }
      }

      addLog("organize", `Autonomous Decision Batch Executed: Organized ${moved} files into structured directories.`, `Processed ${pendingFiles.length} decision recommendations.`);
      await onRefresh();
      if (failedNames.length > 0) {
        setBrowserAsyncState({
          status: "failed",
          message: `Batch triage partially completed (${moved}/${pendingFiles.length} moved; failed: ${failedNames.slice(0, 3).join(", ")}).`,
          retryFn: handleBatchExecuteDecisions
        });
      } else {
        setBrowserAsyncState({
          status: "success",
          message: `Organised ${moved} file(s) into structured directories.`,
          retryFn: null
        });
      }
    } catch (err: any) {
      console.error("Batch decision execution error:", err);
      setBrowserAsyncState({
        status: "failed",
        message: `Batch decision execution failed: ${err.message || "Google Drive API error"}`,
        retryFn: handleBatchExecuteDecisions
      });
    } finally {
      setIsBatchExecuting(false);
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
    <div className="space-y-4">
      {/* Inline Drive Browser Async Status & Retry Feedback */}
      {browserAsyncState.status !== "idle" && browserAsyncState.message && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
            browserAsyncState.status === "failed"
              ? "border-rose-200 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200"
              : browserAsyncState.status === "loading"
              ? "border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200"
              : browserAsyncState.status === "empty"
              ? "border-amber-200 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
              : "border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {browserAsyncState.status === "loading" && <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />}
            {browserAsyncState.status === "failed" && <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
            {browserAsyncState.status === "empty" && <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            {browserAsyncState.status === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
            <span className="font-mono uppercase text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 shrink-0">
              {browserAsyncState.status}
            </span>
            <span className="font-medium">{browserAsyncState.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {browserAsyncState.retryFn && (
              <button
                type="button"
                onClick={() => browserAsyncState.retryFn?.()}
                disabled={isUploading || isSavingEdit || isExecutingMove || isBatchExecuting}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Retry Action</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setBrowserAsyncState({ status: "idle", message: null, retryFn: null })}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Autonomous Decision System Control Bar */}
      <div className="rounded-2xl border border-indigo-500/20 dark:border-indigo-500/30 bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-slate-900/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-slate-900/50 p-4 backdrop-blur-xl shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-xs shrink-0">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs tracking-tight text-slate-900 dark:text-slate-100 font-display">
                  Autonomous Decision Engine
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  100% Classified · 0 Unsorted
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tracking-tight mt-0.5">
                {decisionMetrics.pendingActionsCount} Actions Recommended · {decisionMetrics.relocationCandidatesCount} Relocations · {decisionMetrics.archiveCandidatesCount} Archive Candidates
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick decision filter pills */}
            <div className="flex items-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 p-0.5 border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-medium flex-wrap">
              <button
                onClick={() => setDecisionQuickFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  decisionQuickFilter === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                All ({files.length})
              </button>
              <button
                onClick={() => setDecisionQuickFilter("pending")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  decisionQuickFilter === "pending"
                    ? "bg-indigo-600 text-white shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Zap className="h-3 w-3" />
                Pending ({decisionMetrics.pendingActionsCount})
              </button>
              <button
                onClick={() => setDecisionQuickFilter("relocate")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  decisionQuickFilter === "relocate"
                    ? "bg-violet-600 text-white shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Move className="h-3 w-3" />
                Relocate ({decisionMetrics.relocationCandidatesCount})
              </button>
              <button
                onClick={() => setDecisionQuickFilter("archive")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  decisionQuickFilter === "archive"
                    ? "bg-amber-600 text-white shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Archive className="h-3 w-3" />
                Archive ({decisionMetrics.archiveCandidatesCount})
              </button>
              <button
                onClick={() => setDecisionQuickFilter("high-urgency")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  decisionQuickFilter === "high-urgency"
                    ? "bg-rose-600 text-white shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                High Urgency ({decisionMetrics.highUrgencyCount})
              </button>
              <button
                onClick={() => setDecisionQuickFilter("verified")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  decisionQuickFilter === "verified"
                    ? "bg-emerald-600 text-white shadow-xs font-semibold"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                Verified ({decisionMetrics.verifiedCount})
              </button>
            </div>

            {/* Execute All Decisions Button */}
            {decisionMetrics.pendingActionsCount > 0 && (
              <button
                onClick={handleBatchExecuteDecisions}
                disabled={isBatchExecuting}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-3.5 py-2 text-xs font-semibold shadow-xs hover:shadow-md transition-all active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isBatchExecuting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Executing ({decisionMetrics.pendingActionsCount})...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    <span>Execute Decisions ({decisionMetrics.pendingActionsCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search and Action Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-lg">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500 pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            <input
              id="search-docs-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files and folders..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 py-2 pl-10 pr-12 text-xs md:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[10px] font-mono text-slate-400 dark:text-slate-500">
              ⌘K
            </span>
          </div>

          {/* Mobile Category Quick Filter Chips (Phone App Experience) */}
          <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar w-full">
            {["All", ...allUniqueCategories.filter(c => c && c !== "Unsorted").slice(0, 5)].map((cat, idx) => (
              <button
                key={`m-cat-${cat}-${idx}`}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-indigo-600 text-white shadow-2xs font-semibold"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={e => { if (e.target.files) handleUploadFiles(e.target.files); e.target.value = ''; }} 
              className="hidden" 
              multiple 
            />

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                showAdvancedFilters || selectedCategory !== "All" || selectedTag !== "All" || filterType !== "All" || minRelevance > 0 || dateRangeStr !== "all-time"
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-xs"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </button>

            <button
              id="btn-sync-drive-top"
              onClick={onRefresh}
              title="Synchronize Google Drive items"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-750 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-indigo-500" />
              <span>Sync</span>
            </button>

            <button
              id="btn-open-google-picker"
              onClick={handleLaunchGooglePicker}
              disabled={isLaunchingPicker}
              title="Pick files or upload with Google Picker"
              className="flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-2 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <FolderSearch className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{isLaunchingPicker ? "Opening..." : "Google Picker"}</span>
            </button>

            <ContextualActionToolbar
              activeTab="drive"
              onActionSelect={handleActionSelect}
              onFileDrop={handleUploadFiles}
              selectedCount={selectedFileIds.size}
              onClearSelection={() => setSelectedFileIds(new Set())}
              onBulkExecuteDecisions={handleBulkExecuteSelectedDecisions}
              onBulkApplyTag={() => setShowBulkTagModal(true)}
              onBulkExport={handleBulkExportSelected}
            />
          </div>
        </div>

        {/* Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-end gap-3 animate-in fade-in duration-150">
            {/* Category selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Category</label>
              <select
                id="filter-category"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 min-w-[130px]"
              >
                <option value="All">All Categories</option>
                {allUniqueCategories.filter(c => c && c !== "Unsorted").map((cat, idx) => (
                  <option key={`cat-${cat}-${idx}`} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Tags selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tag</label>
              <select
                id="filter-tag"
                value={selectedTag}
                onChange={e => setSelectedTag(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 min-w-[120px]"
              >
                <option value="All">All Tags</option>
                {allUniqueTags.map((tag, idx) => (
                  <option key={`tag-${tag}-${idx}`} value={tag}>#{tag}</option>
                ))}
              </select>
            </div>

            {/* File Type */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">File Type</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 min-w-[120px]"
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
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Date Range</label>
              <select
                value={dateRangeStr}
                onChange={e => setDateRangeStr(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 min-w-[120px]"
              >
                <option value="all-time">All Time</option>
                <option value="last-30">Last 30 Days</option>
                <option value="last-7">Last 7 Days</option>
              </select>
            </div>

            {/* Relevance */}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400">
                <span>Min Relevance</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{minRelevance}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" step="5"
                value={minRelevance}
                onChange={e => setMinRelevance(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            
            {/* Sort Mode */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sort</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 min-w-[110px]"
              >
                <option value="name">Name (A-Z)</option>
                <option value="relevance">Relevance</option>
              </select>
            </div>

            {/* Reset filters */}
            {(selectedCategory !== "All" || selectedTag !== "All" || filterType !== "All" || minRelevance > 0 || dateRangeStr !== "all-time") && (
              <button
                onClick={() => {
                  setSelectedCategory("All");
                  setSelectedTag("All");
                  setFilterType("All");
                  setMinRelevance(0);
                  setDateRangeStr("all-time");
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 py-1.5 px-2 transition cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Directory Browser Stage */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {/* Breadcrumb and count bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800/80 px-4 py-3 gap-2 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
            {breadcrumbs.map((crumb, idx) => (
              <span key={`crumb-${crumb.id}-${idx}`} className="flex items-center">
                {idx > 0 && <ChevronRight className="h-3 w-3 mx-1 text-slate-400 dark:text-slate-600" />}
                <button
                  onClick={() => handleNavigateBreadcrumb(idx)}
                  className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer ${
                    idx === breadcrumbs.length - 1 ? "font-semibold text-slate-900 dark:text-slate-100" : ""
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Active filter chips */}
            {(externalSearchQuery || searchQuery || selectedCategory !== "All" || selectedTag !== "All" || filterType !== "All" || minRelevance > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {externalSearchQuery && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    Search: "{externalSearchQuery}"
                    {onClearExternalSearch && <X className="h-3 w-3 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100" onClick={onClearExternalSearch} />}
                  </span>
                )}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    "{searchQuery}" <X className="h-3 w-3 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100" onClick={() => setSearchQuery("")} />
                  </span>
                )}
                {selectedCategory !== "All" && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300">
                    {selectedCategory} <X className="h-3 w-3 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100" onClick={() => setSelectedCategory("All")} />
                  </span>
                )}
              </div>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {filteredFiles.length} item{filteredFiles.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Browser List/Table */}
        {filteredFiles.length === 0 ? (
          <div className="p-4 md:p-6">
            <ContextualActionToolbar
              activeTab="drive"
              isEmptyState={true}
              emptyTitle={externalSearchQuery || searchQuery ? `No files matching query` : "No items found in this directory"}
              emptyDescription={externalSearchQuery || searchQuery 
                ? "Try a different keyword or clear the active search and filters." 
                : "This folder is currently empty. Drop files here to upload or use the actions below to create records."}
              onActionSelect={handleActionSelect}
              onFileDrop={handleUploadFiles}
            />
            {(externalSearchQuery || searchQuery) && (
              <div className="text-center mt-3">
                <button
                  onClick={() => {
                    setSearchQuery("");
                    if (onClearExternalSearch) onClearExternalSearch();
                  }}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Clear search filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* PHONE APP FRIENDLY LIST (MOBILE VIEW) */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 block md:hidden">
              {filteredFiles.map((file, fileIdx) => {
                const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                const isSheet = file.mimeType === "application/vnd.google-apps.spreadsheet" || file.mimeType === "text/csv" || file.name.endsWith(".csv") || file.name.endsWith(".xlsx");
                const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
                const meta = getFileMetadata(file);

                return (
                  <div 
                    key={`mobile-file-${file.id}-${fileIdx}`}
                    onClick={() => {
                      if (isFolder) {
                        handleOpenFolder(file);
                      } else if (isGoogleDoc) {
                        setSelectedDocId(file.id);
                        setSelectedDocTitle(file.name);
                        setIsDocViewerOpen(true);
                      } else {
                        setPreviewFile(file);
                      }
                    }}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800">
                        {isFolder ? (
                          <Folder className="h-5 w-5 text-amber-500 fill-amber-500/20" />
                        ) : isSheet ? (
                          <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                        ) : isGoogleDoc ? (
                          <FileText className="h-5 w-5 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          <span className="truncate">{meta.category}</span>
                          <span>·</span>
                          <span>{file.size || (isFolder ? "Folder" : "File")}</span>
                          {file.createdTime && (
                            <>
                              <span>·</span>
                              <span>{new Date(file.createdTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                            </>
                          )}
                        </div>

                        {/* Mobile Suggested Action Badge */}
                        {meta.decision && meta.decision.decisionType !== "verified" && meta.decision.status !== "applied" && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate">
                              ↳ {meta.decision.action}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExecuteSingleDecision(file, meta.decision);
                              }}
                              disabled={executingFileId === file.id}
                              className="px-2 py-0.5 text-[9px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded active:scale-95 transition cursor-pointer shrink-0"
                            >
                              {executingFileId === file.id ? "Moving..." : "Move"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onScheduleReminder && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onScheduleReminder(file);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          title="Schedule Reminder / Action"
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP POWER TABLE (DESKTOP VIEW) */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-4 text-center w-10">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.size === filteredFiles.length && filteredFiles.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Decision & Action</th>
                  <th className="py-2.5 px-3">Tags</th>
                  <th className="py-2.5 px-3">Relevance</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
                {filteredFiles.map((file, fileIdx) => {
                  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
                  const isSheet = file.mimeType === "application/vnd.google-apps.spreadsheet" || file.mimeType === "text/csv" || file.name.endsWith(".csv") || file.name.endsWith(".xlsx");
                  const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
                  const isEditableText = file.mimeType === "text/plain" || file.mimeType === "text/markdown";
                  const meta = getFileMetadata(file);

                  return (
                    <tr key={`file-${file.id}-${fileIdx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-4 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.has(file.id)}
                          onChange={() => toggleSelection(file.id)}
                          className="rounded border-slate-300 dark:border-slate-600 text-slate-900 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      {/* Name Col */}
                      <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-2.5">
                          {isFolder ? (
                            <Folder className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                          ) : isSheet ? (
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0" />
                          ) : isGoogleDoc ? (
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-500 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                          )}
                          
                          <div className="min-w-0">
                            {isFolder ? (
                              <button
                                onClick={() => handleOpenFolder(file)}
                                className="font-medium text-slate-900 dark:text-slate-100 hover:underline text-left block max-w-xs sm:max-w-md truncate cursor-pointer"
                              >
                                {file.name}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  id={`file-name-btn-${file.id}`}
                                  onClick={() => {
                                    if (isGoogleDoc) {
                                      setSelectedDocId(file.id);
                                      setSelectedDocTitle(file.name);
                                      setIsDocViewerOpen(true);
                                    } else {
                                      setPreviewFile(file);
                                    }
                                  }}
                                  className="text-slate-900 dark:text-slate-100 hover:underline font-medium text-left truncate max-w-xs sm:max-w-md cursor-pointer"
                                  title={isGoogleDoc ? "Click to view Google Doc" : "Click to view file details"}
                                >
                                  {file.name}
                                </button>
                                {file.webViewLink && (
                                  <a
                                    href={file.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    title="Open in Google Drive"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                              {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'Unknown date'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category Col */}
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {meta.category}
                        </span>
                      </td>

                      {/* Decision & Action Col */}
                      <td className="py-2.5 px-3">
                        {meta.decision ? (
                          <div className="flex flex-col gap-1 min-w-[160px] max-w-[220px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                meta.decision.decisionType === 'relocate'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800'
                                  : meta.decision.decisionType === 'archive'
                                  ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800'
                                  : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800'
                              }`}>
                                {meta.decision.decisionType === 'relocate' && <Zap className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                                {meta.decision.decisionType === 'archive' && <Archive className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                {meta.decision.decisionType === 'verified' && <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                <span className="truncate">{meta.decision.action}</span>
                              </span>

                              {/* Quick One-Click Execution Action */}
                              {meta.decision.decisionType !== 'verified' && meta.decision.status !== 'applied' && (
                                <button
                                  id={`btn-exec-dec-${file.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExecuteSingleDecision(file, meta.decision);
                                  }}
                                  disabled={executingFileId === file.id}
                                  title={`Execute: ${meta.decision.action}`}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                  {executingFileId === file.id ? (
                                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <Zap className="h-2.5 w-2.5 fill-white" />
                                  )}
                                  <span>Execute</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                meta.decision.urgency === 'high' ? 'bg-rose-500 animate-pulse' : meta.decision.urgency === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                              }`} />
                              <span>{meta.decision.urgency.toUpperCase()}</span>
                              <span>·</span>
                              <span>{meta.decision.confidence}% conf</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono italic">Indexed</span>
                        )}
                      </td>

                      {/* Tags Col */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-[180px]">
                          {meta.tags.map((tag, tagIdx) => (
                            <span key={`tag-${tag}-${tagIdx}`} className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
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
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-800 dark:text-slate-200 focus:outline-none"
                                placeholder="tag..."
                                autoFocus
                              />
                              <button onClick={() => handleAddTag(file.id)} className="text-emerald-600 hover:text-emerald-700">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => { setTagInputId(null); setNewTagVal(""); }} className="text-slate-400 hover:text-slate-600">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setTagInputId(file.id)}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                            >
                              + tag
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Relevance Col */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" 
                              style={{ width: `${meta.relevance}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums w-8 text-right">
                            {meta.relevance}%
                          </span>
                        </div>
                      </td>

                      {/* Size Col */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {isFolder ? "—" : (file.size || "0 B")}
                      </td>

                      {/* Actions Col */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            id={`action-preview-file-${file.id}`}
                            onClick={() => setPreviewFile(file)}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title="Preview file"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {isSheet && file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="Open in Google Sheets"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {isGoogleDoc && (
                            <button
                              id={`action-open-doc-${file.id}`}
                              onClick={() => {
                                setSelectedDocId(file.id);
                                setSelectedDocTitle(file.name);
                                setIsDocViewerOpen(true);
                              }}
                              className="rounded p-1 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              title="Open in Google Docs Viewer"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isEditableText && (
                            <button
                              onClick={() => handleStartEdit(file)}
                              className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="Edit text"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setMovingFile(file)}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title="Move file"
                          >
                            <Move className="h-3.5 w-3.5" />
                          </button>
                          {onScheduleReminder && (
                            <button
                              onClick={() => onScheduleReminder(file)}
                              className="rounded p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="Schedule reminder / action"
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        )}
      </div>

      {/* MODAL: Create Folder */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">Create Folder</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Creates a new folder inside the current location on Google Drive.</p>
            
            <input
              type="text"
              id="new-folder-name"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFolderModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-new-folder"
                onClick={handleCreateFolderAction}
                disabled={isSavingEdit || !newFolderName.trim()}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition disabled:opacity-50 cursor-pointer"
              >
                {isSavingEdit ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Document */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
              Create New Document
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Create a document directly in {currentFolderId === "root" ? "My Drive" : "the current folder"}.
            </p>

            {/* Document Format Selector */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setNewDocFormat("google_doc")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  newDocFormat === "google_doc"
                    ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-2xs"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    Google Doc
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                    Docs v1
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Full Google Docs API document with rich text support.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setNewDocFormat("text")}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  newDocFormat === "text"
                    ? "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-2xs"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <File className="h-3.5 w-3.5 text-slate-500" />
                    Plain Text
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    .txt
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Standard plain text file stored in Google Drive.
                </p>
              </button>
            </div>
            
            <input
              type="text"
              id="new-doc-name"
              placeholder={newDocFormat === "google_doc" ? "Google Doc title (e.g. Project Brief)..." : "File name (e.g. notes.txt)..."}
              value={newDocName}
              onChange={e => setNewDocName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition mb-2.5"
              autoFocus
            />

            <textarea
              placeholder={newDocFormat === "google_doc" ? "Initial document content (optional)..." : "Type text content here..."}
              rows={5}
              value={newDocContent}
              onChange={e => setNewDocContent(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDocModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-new-doc"
                onClick={handleCreateDocumentAction}
                disabled={isSavingEdit || !newDocName.trim()}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isSavingEdit ? "Creating..." : newDocFormat === "google_doc" ? "Create Google Doc" : "Create File"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Spreadsheet */}
      {showSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">New Spreadsheet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Create a Google Sheet in {currentFolderId === "root" ? "My Drive" : "the current folder"}.
            </p>
            
            <input
              type="text"
              id="new-sheet-title-input"
              placeholder="Spreadsheet title..."
              value={newSheetTitle}
              onChange={e => setNewSheetTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSheetModal(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-new-sheet"
                onClick={handleCreateSheetAction}
                disabled={isSavingEdit || !newSheetTitle.trim()}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition disabled:opacity-50 cursor-pointer"
              >
                {isSavingEdit ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Live Editor Plain Text */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">
              <h3 className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate pr-2">Editing: {editingFile.name}</h3>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {isLoadingContent ? (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mb-2" />
                <span>Loading content...</span>
              </div>
            ) : (
              <>
                {editLoadError && (
                  <div className="mb-3 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>{editLoadError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(editingFile)}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer shrink-0"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry Load</span>
                    </button>
                  </div>
                )}
                <textarea
                  rows={10}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition mb-4"
                />

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingFile(null)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    id="btn-save-doc"
                    onClick={handleSaveEditAction}
                    disabled={isSavingEdit}
                    className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Move File Picker */}
      {movingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">Move File</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
              Destination for "{movingFile.name}":
            </p>

            <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 space-y-1 mb-4">
              <button
                onClick={() => handleMoveFileAction("root")}
                className="w-full text-left text-xs py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <Folder className="h-3.5 w-3.5 text-slate-500 shrink-0" /> My Drive (Root)
              </button>
              {folderList.filter(fold => fold.id !== movingFile.id).map((fold, fIdx) => (
                <button
                  key={`fold-move-${fold.id}-${fIdx}`}
                  onClick={() => handleMoveFileAction(fold.id)}
                  className="w-full text-left text-xs py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 pl-4 text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <Folder className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0" /> {fold.name}
                </button>
              ))}
              {folderList.length === 0 && (
                <span className="text-slate-400 text-xs text-center py-3 block">No other folders available.</span>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setMovingFile(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK TAG MODAL */}
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl animate-in fade-in duration-150">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">Apply Tag</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Add a tag to {selectedFileIds.size} selected item{selectedFileIds.size === 1 ? "" : "s"}.
            </p>

            <div className="space-y-3">
              <input
                type="text"
                value={bulkTagValue}
                onChange={e => setBulkTagValue(e.target.value)}
                placeholder="Tag name (e.g. Invoices)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition"
                autoFocus
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowBulkTagModal(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyBulkTag}
                  disabled={!bulkTagValue.trim()}
                  className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 transition cursor-pointer"
                >
                  Apply
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
          onExecuteDecision={handleExecuteSingleDecision}
        />
      )}

      {/* MODAL: Google Doc Interactive Viewer & Editor */}
      <GoogleDocViewerModal
        isOpen={isDocViewerOpen}
        onClose={() => {
          setIsDocViewerOpen(false);
          setSelectedDocId(null);
        }}
        documentId={selectedDocId}
        documentTitle={selectedDocTitle}
        token={token}
        addLog={addLog}
        onRefresh={onRefresh}
      />
    </div>
  );
}
