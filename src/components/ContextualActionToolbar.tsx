import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Plus, 
  FileText, 
  FileSpreadsheet, 
  FolderPlus, 
  Compass, 
  Zap, 
  Cpu, 
  Sliders, 
  Play, 
  PlusCircle, 
  Send, 
  RefreshCw, 
  Download, 
  FileCode, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  Tag,
  Move,
  X,
  Sparkles,
  FolderSearch
} from 'lucide-react';

export type DashboardTab = 'drive' | 'sheets' | 'organizer' | 'backup' | 'tasks' | 'reports' | 'chat';

export interface ActionItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

interface ContextualActionToolbarProps {
  activeTab: DashboardTab;
  isEmptyState?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onActionSelect: (actionId: string) => void;
  onFileDrop?: (files: FileList) => void;
  selectedCount?: number;
  onClearSelection?: () => void;
  onBulkExecuteDecisions?: () => void;
  onBulkApplyTag?: () => void;
  onBulkMove?: () => void;
  onBulkExport?: () => void;
  customActions?: ActionItem[];
}

export const ContextualActionToolbar: React.FC<ContextualActionToolbarProps> = ({
  activeTab,
  isEmptyState = false,
  emptyTitle,
  emptyDescription,
  onActionSelect,
  onFileDrop,
  selectedCount = 0,
  onClearSelection,
  onBulkExecuteDecisions,
  onBulkApplyTag,
  onBulkMove,
  onBulkExport,
  customActions
}) => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Monitor drag-and-drop events globally across the active viewport
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDraggingFile(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingFile(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingFile(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        if (onFileDrop) {
          onFileDrop(e.dataTransfer.files);
        } else {
          onActionSelect('upload-file');
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onFileDrop, onActionSelect]);

  const handleNativeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onFileDrop) {
        onFileDrop(e.target.files);
      }
      e.target.value = '';
    }
  };

  // Standard tab action configurations
  const defaultTabActions: Record<DashboardTab, ActionItem[]> = {
    drive: [
      { id: 'google-picker', label: 'Google Picker', icon: FolderSearch, onClick: () => onActionSelect('google-picker') },
      { id: 'new-doc', label: 'New Doc', icon: PlusCircle, onClick: () => onActionSelect('new-doc') },
      { id: 'new-sheet', label: 'New Sheet', icon: FileSpreadsheet, onClick: () => onActionSelect('new-sheet') },
      { id: 'new-folder', label: 'New Folder', icon: FolderPlus, onClick: () => onActionSelect('new-folder') },
      { id: 'upload-file', label: 'Upload File', icon: Upload, onClick: () => onActionSelect('upload-file'), primary: true },
    ],
    sheets: [
      { id: 'new-sheet', label: 'New Sheet', icon: FileSpreadsheet, onClick: () => onActionSelect('new-sheet'), primary: true },
      { id: 'export-csv', label: 'Export Inventory', icon: Download, onClick: () => onActionSelect('export-csv') },
    ],
    organizer: [
      { id: 'keyword-rules', label: 'Keyword Rules', icon: Sliders, onClick: () => onActionSelect('keyword-rules') },
      { id: 'plan-structure', label: 'Plan Structure', icon: Compass, onClick: () => onActionSelect('plan-structure') },
      { id: 'catalogue-drive', label: 'Catalogue Drive', icon: Cpu, onClick: () => onActionSelect('catalogue-drive') },
      { id: 'organize-all', label: 'Organize Drive', icon: Zap, onClick: () => onActionSelect('organize-all'), primary: true },
    ],
    backup: [
      { id: 'new-backup-job', label: 'New Backup Job', icon: Plus, onClick: () => onActionSelect('new-backup-job'), primary: true },
      { id: 'run-all-backups', label: 'Run All Backups', icon: Play, onClick: () => onActionSelect('run-all-backups') },
    ],
    tasks: [
      { id: 'new-task', label: 'Add Task', icon: Plus, onClick: () => onActionSelect('new-task'), primary: true },
      { id: 'send-report', label: 'Email Report', icon: Send, onClick: () => onActionSelect('send-report') },
      { id: 'sync-tasks', label: 'Sync Tasks', icon: RefreshCw, onClick: () => onActionSelect('sync-tasks') },
    ],
    reports: [
      { id: 'export-csv', label: 'Export CSV', icon: Download, onClick: () => onActionSelect('export-csv'), primary: true },
      { id: 'export-json', label: 'Export JSON', icon: FileCode, onClick: () => onActionSelect('export-json') },
    ],
    chat: [
      { id: 'generate-ideas', label: 'Ideas', icon: Sparkles, onClick: () => onActionSelect('generate-ideas') },
      { id: 'clear-chat', label: 'Clear', icon: Trash2, onClick: () => onActionSelect('clear-chat') },
    ],
  };

  const actions = customActions || defaultTabActions[activeTab] || defaultTabActions.drive;

  // 1. Transient Intent State: File Drag-and-Drop Active across Viewport
  if (isDraggingFile) {
    return (
      <>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleNativeFileSelect} 
          className="hidden" 
          multiple 
        />
        <aside 
          aria-live="polite"
          className="fixed inset-x-6 bottom-6 z-50 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-indigo-400 dark:border-indigo-500 bg-slate-950/95 dark:bg-[#080d1a]/95 px-6 py-4.5 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-200 ring-2 ring-indigo-500/30"
        >
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
              <Upload className="h-5 w-5 animate-bounce text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100 font-display">
                Drop files to upload & autonomously classify into <span className="capitalize text-indigo-400">{activeTab === 'drive' ? 'My Drive' : activeTab}</span>
              </p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Files will be analyzed by the Autonomous Decision Engine upon ingestion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow hover:bg-slate-100 transition active:scale-95 cursor-pointer"
            >
              Select from disk instead
            </button>
            <button
              type="button"
              onClick={() => setIsDraggingFile(false)}
              className="rounded-lg border border-slate-700 hover:bg-slate-800 p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
              title="Cancel drag"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </>
    );
  }

  // 2. Transient Intent State: Multi-Row Inline Selection Active
  if (selectedCount > 0) {
    return (
      <aside
        aria-live="polite"
        className="fixed inset-x-6 bottom-6 z-40 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-indigo-500/40 dark:border-indigo-500/50 bg-slate-900/95 dark:bg-slate-950/95 px-5 py-3 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-3 duration-150"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-mono font-bold text-white">
            {selectedCount}
          </span>
          <span className="text-xs font-semibold text-slate-200">
            {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onBulkExecuteDecisions && (
            <button
              type="button"
              onClick={onBulkExecuteDecisions}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Zap className="h-3.5 w-3.5 fill-white" />
              <span>Execute Decisions</span>
            </button>
          )}

          {onBulkApplyTag && (
            <button
              type="button"
              onClick={onBulkApplyTag}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              <span>Apply Tag</span>
            </button>
          )}

          {onBulkMove && (
            <button
              type="button"
              onClick={onBulkMove}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              <Move className="h-3.5 w-3.5 text-slate-400" />
              <span>Move</span>
            </button>
          )}

          {onBulkExport && (
            <button
              type="button"
              onClick={onBulkExport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              <span>Export</span>
            </button>
          )}

          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg border border-slate-700 hover:bg-slate-800 p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    );
  }

  // 3. In-Flow State: View is Empty (Incomplete State without occlusion)
  if (isEmptyState) {
    return (
      <section 
        aria-label="Empty view actions"
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-12 text-center shadow-xs space-y-3"
      >
        <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-1">
          <AlertCircle className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">
          {emptyTitle || `No records found in ${activeTab}`}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
          {emptyDescription || "Get started by creating your first entry or importing existing workspace resources."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 pt-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50 ${
                  action.primary
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // 4. Normal State: Integrated Header Actions (No Viewport Occlusion, In-Flow)
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      {actions.map((action, idx) => {
        const Icon = action.icon;
        // On phone app view, only show the primary action or first 2 actions to prevent wrapping
        const isPriorityAction = action.primary || idx === 0;
        return (
          <button
            key={action.id}
            id={`btn-action-${action.id}`}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={`items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs ${
              isPriorityAction ? 'flex' : 'hidden sm:flex'
            } ${
              action.primary
                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-semibold'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
            }`}
          >
            <Icon className="h-3.5 w-3.5 text-current shrink-0" />
            <span className={action.primary ? 'inline' : 'hidden sm:inline'}>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ContextualActionToolbar;
