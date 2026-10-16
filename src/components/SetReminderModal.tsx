import React, { useState, useEffect } from "react";
import { 
  X, Bell, Clock, Calendar, FolderPlus, FileEdit, Move, 
  Check, AlertCircle, FileText, Folder, Mail, Volume2, Sparkles
} from "lucide-react";
import { DriveFile, SmartTaskReminder } from "../types";

interface SetReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: DriveFile[];
  initialFile?: DriveFile | null;
  onSaveReminder: (reminder: SmartTaskReminder) => void;
  token?: string | null;
  userEmail?: string;
}

export default function SetReminderModal({
  isOpen,
  onClose,
  files,
  initialFile,
  onSaveReminder,
  userEmail
}: SetReminderModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [actionType, setActionType] = useState<SmartTaskReminder["actionType"]>("reminder_only");
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("root");
  const [appendContent, setAppendContent] = useState("");
  const [targetDestinationFolderId, setTargetDestinationFolderId] = useState("");
  const [triggerDate, setTriggerDate] = useState("");
  const [triggerTime, setTriggerTime] = useState("");
  const [recurrence, setRecurrence] = useState<SmartTaskReminder["recurrence"]>("once");
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [fileSearch, setFileSearch] = useState("");

  // Initialize or reset form on open
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      // Set default date to today
      const dateStr = now.toISOString().slice(0, 10);
      setTriggerDate(dateStr);

      // Set default time to 30 mins ahead
      const future = new Date(now.getTime() + 30 * 60 * 1000);
      const hours = String(future.getHours()).padStart(2, "0");
      const minutes = String(future.getMinutes()).padStart(2, "0");
      setTriggerTime(`${hours}:${minutes}`);

      if (initialFile) {
        setSelectedFileId(initialFile.id);
        setTitle(`Review "${initialFile.name}"`);
        setDescription(`Automated check on ${initialFile.name}`);
        if (initialFile.mimeType.includes("document") || initialFile.mimeType.includes("text")) {
          setActionType("edit_doc");
          setAppendContent("Reviewed and verified on scheduled time.");
        } else {
          setActionType("reminder_only");
        }
      } else {
        setSelectedFileId("");
        setTitle("Workspace Maintenance Check");
        setDescription("Scheduled routine Drive review");
        setActionType("reminder_only");
      }
      setFolderName("");
      setParentFolderId("root");
      setRecurrence("once");
      setNotifyInApp(true);
      setNotifyEmail(true);
      setFileSearch("");
    }
  }, [isOpen, initialFile]);

  if (!isOpen) return null;

  const folders = files.filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder"
  );
  const filteredFiles = files.filter(
    (f) =>
      !fileSearch ||
      f.name.toLowerCase().includes(fileSearch.toLowerCase()) ||
      (f.category && f.category.toLowerCase().includes(fileSearch.toLowerCase()))
  );

  const selectedFile = files.find((f) => f.id === selectedFileId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !triggerTime) return;

    const newReminder: SmartTaskReminder = {
      id: "rem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      description: description.trim() || undefined,
      triggerDate: triggerDate || undefined,
      triggerTime,
      recurrence,
      actionType,
      targetFileId: selectedFileId || undefined,
      targetFileName: selectedFile?.name || (initialFile ? initialFile.name : undefined),
      actionPayload: {
        folderName: actionType === "create_folder" ? folderName.trim() : undefined,
        parentFolderId: actionType === "create_folder" ? parentFolderId : undefined,
        appendContent: actionType === "edit_doc" ? appendContent.trim() : undefined,
        targetDestinationFolderId: actionType === "relocate_file" ? targetDestinationFolderId : undefined,
      },
      notifyInApp,
      notifyEmail,
      status: "active",
      notified: false,
      executed: false,
      createdAt: new Date().toISOString(),
    };

    onSaveReminder(newReminder);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/60">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Schedule Task Reminder & Action
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Automated file reminders, recurring alerts, and scheduled Drive tasks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* TITLE & DESCRIPTION */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reminder Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Follow up on Q4 Budget Proposal"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Context / Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details or reason for this reminder..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* TARGET FILE / FOLDER LINK */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5 text-indigo-500" />
                <span>Link to Specific File or Folder</span>
              </label>
              {selectedFileId && (
                <button
                  type="button"
                  onClick={() => setSelectedFileId("")}
                  className="text-[10px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                >
                  Clear link
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {files.length > 5 && (
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Filter available files..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              )}
              <select
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">No file attached (Standalone reminder)</option>
                {filteredFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.mimeType.includes("folder") ? "📁" : "📄"} {file.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SCHEDULED ACTION TYPE */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Automated Action on Due Time
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActionType("reminder_only")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  actionType === "reminder_only"
                    ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs mb-0.5">
                  <Bell className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Reminder Only</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Notify without modifying any files
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActionType("create_folder")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  actionType === "create_folder"
                    ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs mb-0.5">
                  <FolderPlus className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Create Folder</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Generate new Drive directory
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActionType("edit_doc")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  actionType === "edit_doc"
                    ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs mb-0.5">
                  <FileEdit className="h-3.5 w-3.5 text-amber-500" />
                  <span>Append Doc Note</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Append text to document
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActionType("relocate_file")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  actionType === "relocate_file"
                    ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium text-xs mb-0.5">
                  <Move className="h-3.5 w-3.5 text-purple-500" />
                  <span>Relocate File</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Move to target folder
                </p>
              </button>
            </div>

            {/* CONDITIONAL ACTION PAYLOAD FIELDS */}
            {actionType === "create_folder" && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    New Folder Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="e.g. Q4 Archive or Project Alpha"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Parent Location
                  </label>
                  <select
                    value={parentFolderId}
                    onChange={(e) => setParentFolderId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="root">My Drive (Root)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {actionType === "edit_doc" && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Content to Append <span className="text-rose-500">*</span>
                  </label>
                  {!selectedFileId && (
                    <span className="text-[10px] text-amber-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Select a target document above
                    </span>
                  )}
                </div>
                <textarea
                  rows={2}
                  required
                  value={appendContent}
                  onChange={(e) => setAppendContent(e.target.value)}
                  placeholder="Automated status note or reminder text to append..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 resize-none"
                />
              </div>
            )}

            {actionType === "relocate_file" && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Destination Target Folder <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={targetDestinationFolderId}
                  onChange={(e) => setTargetDestinationFolderId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="">Select target destination...</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* DATE, TIME & RECURRENCE */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                required
                value={triggerDate}
                onChange={(e) => setTriggerDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Time (HH:MM)</span>
              </label>
              <input
                type="time"
                required
                value={triggerTime}
                onChange={(e) => setTriggerTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Recurrence
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="once">Once (No Repeat)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* NOTIFICATION CHANNELS & MANDATORY HUMAN APPROVAL NOTICE */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Notification Delivery Channels
            </label>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyInApp}
                  onChange={(e) => setNotifyInApp(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <Volume2 className="h-3.5 w-3.5 text-indigo-500" />
                <span>In-App Alert Banner & Audio Chime</span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <Mail className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Email Notification ({userEmail || "Connected account"})</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Security Policy: Every email requires interactive human approval prior to delivery.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Save & Schedule Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
