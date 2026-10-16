import { geminiFetch } from "../lib/geminiApi";
import React, { useState, useEffect } from "react";
import { 
  CheckSquare, Calendar, Bell, Send, Trash2, Plus, Clock, 
  Mail, Settings, ChevronRight, CheckCircle2, RefreshCw, Layers, Eye,
  FolderPlus, FileEdit, Move, Play, Filter, Check
} from "lucide-react";
import { TaskItem, ActivityLog, SmartTaskReminder, DriveFile, EmailApprovalRequest } from "../types";
import { 
  listTaskLists, createTaskList, listTasks, createGoogleTask, 
  updateGoogleTask, deleteGoogleTask, sendGmailReport 
} from "../lib/googleApi";
import InfoTooltip from "./InfoTooltip";
import ContextualActionToolbar from "./ContextualActionToolbar";
import EmailApprovalModal from "./EmailApprovalModal";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface TaskManagerProps {
  token: string | null;
  addLog: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  userEmail: string;
  activities: ActivityLog[];
  onTriggerNotification: (title: string, message: string) => void;
  reminders: SmartTaskReminder[];
  setReminders: React.Dispatch<React.SetStateAction<SmartTaskReminder[]>>;
  files?: DriveFile[];
  onOpenScheduleModal?: (file?: DriveFile) => void;
  onExecuteReminderAction?: (reminder: SmartTaskReminder) => void;
  onEmailApprovalRequest?: (request: EmailApprovalRequest) => void;
}

export default function TaskManager({
  token,
  addLog,
  userEmail,
  activities,
  onTriggerNotification,
  reminders,
  setReminders,
  files = [],
  onOpenScheduleModal,
  onExecuteReminderAction,
  onEmailApprovalRequest
}: TaskManagerProps) {
  const [reminderFilter, setReminderFilter] = useState<'all' | 'active' | 'actions' | 'completed'>('all');
  // Google Tasks category state
  const [taskLists, setTaskLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isTaskLoading, setIsTaskLoading] = useState(false);

  // New task forms
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderTime, setNewReminderTime] = useState("");

  // Email report flows
  const [isComposingReport, setIsComposingReport] = useState(false);
  const [composedSubject, setComposedSubject] = useState("");
  const [composedHtml, setComposedHtml] = useState("");
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [localPendingApproval, setLocalPendingApproval] = useState<EmailApprovalRequest | null>(null);

  // Fetch Task Lists & tasks on mount
  useEffect(() => {
    if (token) {
      loadTaskLists();
    }
  }, [token]);

  // Load parent categories
  const loadTaskLists = async () => {
    if (!token) return;
    try {
      setIsTaskLoading(true);
      const lists = await listTaskLists(token);
      setTaskLists(lists);
      if (lists.length > 0) {
        setSelectedListId(lists[0].id);
        await loadTasksForList(lists[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTaskLoading(false);
    }
  };

  // Load target tasks
  const loadTasksForList = async (listId: string) => {
    if (!token || !listId) return;
    try {
      setIsTaskLoading(true);
      const items = await listTasks(token, listId);
      setTasks(items);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTaskLoading(false);
    }
  };

  // Switch categories Selection
  const handleSelectCategory = async (listId: string) => {
    setSelectedListId(listId);
    await loadTasksForList(listId);
  };

  // Create new task list category
  const handleAddCategoryAction = async () => {
    if (!token || !newListTitle) return;
    try {
      setIsTaskLoading(true);
      const newList = await createTaskList(token, newListTitle);
      addLog("task", `Created new Task category list: "${newListTitle}"`, `List ID: ${newList.id}`);
      setNewListTitle("");
      setIsCreatingList(false);
      await loadTaskLists();
    } catch (e: any) {
      console.error("Error adding task category:", e);
    } finally {
      setIsTaskLoading(false);
    }
  };

  // Create Google Task Item
  const handleAddTaskItem = async () => {
    if (!token || !selectedListId || !newTitle) return;
    try {
      setIsTaskLoading(true);
      const isoDue = newDueDate ? new Date(newDueDate).toISOString() : undefined;
      await createGoogleTask(token, selectedListId, {
        title: newTitle,
        notes: newNotes,
        due: isoDue
      });

      addLog("task", `Created task: "${newTitle}"`, `Category ID: ${selectedListId}`);
      setNewTitle("");
      setNewNotes("");
      setNewDueDate("");
      await loadTasksForList(selectedListId);
    } catch (e: any) {
      console.error("Error adding task:", e);
    } finally {
      setIsTaskLoading(false);
    }
  };

  // Complete/Uncomplete Google Task
  const handleToggleTaskStatus = async (task: TaskItem) => {
    if (!token || !selectedListId) return;
    try {
      const targetStatus = task.status === "needsAction" ? "completed" : "needsAction";
      await updateGoogleTask(token, selectedListId, task.id, {
        status: targetStatus
      });
      addLog("task", `Marked task "${task.title}" as ${targetStatus === 'completed' ? 'Done' : 'In-Progress'}`, `ID: ${task.id}`);
      await loadTasksForList(selectedListId);
    } catch (e: any) {
      console.error("Error updating task state:", e);
    }
  };

  // Delete Google Task
  const handleDeleteTaskAction = async (taskId: string, title: string) => {
    if (!token || !selectedListId) return;
    const confirmDel = window.confirm(`Are you sure you want to delete task "${title}"? This cannot be undone.`);
    if (!confirmDel) return;

    try {
      setIsTaskLoading(true);
      await deleteGoogleTask(token, selectedListId, taskId);
      addLog("task", `Deleted Google Task item "${title}"`, `ID: ${taskId}`);
      await loadTasksForList(selectedListId);
    } catch (e: any) {
      console.error("Error deleting task:", e);
    } finally {
      setIsTaskLoading(false);
    }
  };

  // Configuration schedules
  const handleAddReminder = () => {
    if (!newReminderTitle || !newReminderTime) return;
    const now = new Date();
    const item: SmartTaskReminder = {
      id: "rem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      title: newReminderTitle.trim(),
      triggerDate: now.toISOString().slice(0, 10),
      triggerTime: newReminderTime,
      recurrence: 'once',
      actionType: 'reminder_only',
      notifyInApp: true,
      notifyEmail: false,
      status: 'active',
      notified: false,
      executed: false,
      createdAt: new Date().toISOString()
    };
    setReminders([item, ...reminders]);
    addLog("task", `Scheduled alarm reminder: "${newReminderTitle}"`, `Alarm Time: ${newReminderTime}`);
    onTriggerNotification("Reminder Created", `"${newReminderTitle}" set for ${newReminderTime}`);
    setNewReminderTitle("");
    setNewReminderTime("");
  };

  // Remove alert job
  const handleRemoveReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
  };

  // Create Beautiful Custom report using Gemini Server route
  const handleComposeSummaryReport = async () => {
    setIsComposingReport(true);
    try {
      // Package last activities list limit to 8
      const eventsListText = activities.slice(0, 10).map(act => `[${act.timestamp}] ${act.message}`);

      let data: any = null;
      try {
        const res = await geminiFetch("/api/gemini/compose-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: eventsListText,
            summary: `Drive count active metrics: ${activities.length} total operations logged. Account active user: ${userEmail}`,
            userEmail
          })
        });

        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/compose-report error:", fetchErr);
      }

      if (data && data.success && data.report) {
        setComposedSubject(data.report.subject);
        setComposedHtml(data.report.htmlBody);
        setShowReportPreview(true);
      } else {
        // Fallback report
        const safeUser = escapeHtml(userEmail || 'Active User');
        setComposedSubject("Drive Companion: Automated Organization & Task Report");
        setComposedHtml(`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
          <h2 style="color: #4f46e5; margin-top: 0;">Drive Companion Activity Summary</h2>
          <p style="font-size: 14px; color: #64748b;">Report for <strong>${safeUser}</strong></p>
          <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 13px; font-weight: 600; color: #334155;">Drive Statistics</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">${activities.length} total operations logged.</p>
          </div>
          <h3 style="font-size: 14px; color: #0f172a; margin-top: 20px;">Recent Operations</h3>
          <ul style="font-size: 13px; color: #334155; padding-left: 20px; line-height: 1.6;">
            ${eventsListText.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>`);
        setShowReportPreview(true);
      }
    } catch (e: any) {
      console.error("Composing report error:", e);
    } finally {
      setIsComposingReport(false);
    }
  };

  // Push actual email out to Gmail Send API! (MANDATORY Notification & Human Approval Gate)
  const handleSendEmailReportNow = async () => {
    if (!token || !composedHtml || !composedSubject) return;

    const approvalReq: EmailApprovalRequest = {
      id: "email_appr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      recipientEmail: userEmail,
      subject: composedSubject,
      triggerReason: `User requested activity report digest (${activities.length} operations)`,
      htmlBody: composedHtml,
      timestamp: new Date().toISOString()
    };

    // Always send a notification for human approval before sending any emails
    if (onTriggerNotification) {
      onTriggerNotification(
        "Human Approval Required",
        `Human approval is required before delivering activity report email to ${userEmail}.`
      );
    }
    addLog("email", `Outbound email queued awaiting human approval: "${composedSubject}"`);

    // Enforce human approval modal gate (via parent if provided, or local modal)
    if (onEmailApprovalRequest) {
      onEmailApprovalRequest(approvalReq);
      setShowReportPreview(false);
      return;
    }

    setLocalPendingApproval(approvalReq);
    setShowReportPreview(false);
  };

  const handleLocalApproveEmail = async (req: EmailApprovalRequest) => {
    if (!token) return;
    setIsSendingMail(true);
    try {
      await sendGmailReport(token, req.recipientEmail, req.subject, req.htmlBody);
      addLog("email", `Human approved email delivered to ${req.recipientEmail}`, `Subject: ${req.subject}`);
      if (onTriggerNotification) {
        onTriggerNotification("Email Delivered", `Successfully delivered report to ${req.recipientEmail}`);
      }
      setLocalPendingApproval(null);
    } catch (e: any) {
      console.error("Error sending approved email:", e);
      if (onTriggerNotification) {
        onTriggerNotification("Email Delivery Failed", e?.message || "Failed to deliver email through Gmail API.");
      }
    } finally {
      setIsSendingMail(false);
    }
  };

  const handleLocalDeclineEmail = (req: EmailApprovalRequest) => {
    addLog("email", `Email delivery declined by user: "${req.subject}"`, "Notification kept in-app only.");
    if (onTriggerNotification) {
      onTriggerNotification("Email Delivery Cancelled", "The notification was kept in-app only.");
    }
    setLocalPendingApproval(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT PANEL: Google Tasks List and creation */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="space-y-0.5">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Google Tasks Synchronization</span>
                </h3>
              </div>

              {/* List switch selectors */}
              <div className="flex items-center gap-2">
                {isCreatingList ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      id="new-list-title-input"
                      value={newListTitle}
                      onChange={e => setNewListTitle(e.target.value)}
                      placeholder="Category name..."
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none"
                    />
                    <button 
                      onClick={handleAddCategoryAction} 
                      className="px-2.5 py-1 text-xs font-medium bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition cursor-pointer"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => setIsCreatingList(false)} 
                      className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-1 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      id="select-task-list"
                      value={selectedListId}
                      onChange={e => handleSelectCategory(e.target.value)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      {taskLists.map((list, lIdx) => (
                        <option key={`task-list-${list.id}-${lIdx}`} value={list.id}>{list.title}</option>
                      ))}
                    </select>
                    <button
                      id="btn-create-taskset"
                      onClick={() => setIsCreatingList(true)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                    >
                      + New List
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Form to add item */}
              <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    id="input-task-title"
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Task title..."
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="date"
                    id="input-task-due"
                    value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="input-task-notes"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Notes or description (optional)..."
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    id="btn-confirm-add-task"
                    onClick={handleAddTaskItem}
                    disabled={!newTitle}
                    className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-40 transition cursor-pointer shadow-xs shrink-0"
                  >
                    Add Task
                  </button>
                </div>
              </div>

              {/* Task Checklist list items */}
              {isTaskLoading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400 mb-2" />
                  <span className="text-xs text-slate-400 dark:text-slate-500">Loading tasks...</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {tasks.map((task, tIdx) => (
                    <div 
                      key={`task-item-${task.id}-${tIdx}`} 
                      id={`task-item-${task.id}`}
                      className={`flex items-center justify-between p-3 rounded-lg border transition ${
                        task.status === "completed" 
                          ? "bg-slate-50/50 dark:bg-slate-800/20 border-slate-100 dark:border-slate-800/50 opacity-60 line-through" 
                          : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={task.status === "completed"}
                          onChange={() => handleToggleTaskStatus(task)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <span className="text-slate-800 dark:text-slate-200 text-xs font-medium block truncate">
                            {task.title}
                          </span>
                          {task.notes && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                              {task.notes}
                            </span>
                          )}
                          {task.due && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300 font-mono mt-1">
                              <Calendar className="h-2.5 w-2.5" /> Due: {new Date(task.due).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteTaskAction(task.id, task.title)}
                        className="rounded p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition shrink-0 cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {tasks.length === 0 && (
                    <div className="py-4">
                      <ContextualActionToolbar
                        activeTab="tasks"
                        isEmptyState={true}
                        emptyTitle="No tasks found in this list"
                        emptyDescription="Create action items and deadlines, or generate automated summary executive reports."
                        onActionSelect={(actionId) => {
                          if (actionId === 'new-task') {
                            document.getElementById('input-task-title')?.focus();
                          } else if (actionId === 'send-report') {
                            handleComposeSummaryReport();
                          } else if (actionId === 'sync-tasks' && selectedListId) {
                            loadTasksForList(selectedListId);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Smart Task Reminders & Scheduled Actions Engine */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Smart Task Reminders & Actions Console */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                    Smart Reminders & Scheduled Actions
                  </h3>
                  <p className="text-[10px] text-slate-400">Automated file operations & recurring alarms</p>
                </div>
              </div>

              {onOpenScheduleModal && (
                <button
                  type="button"
                  onClick={() => onOpenScheduleModal()}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium flex items-center gap-1 shadow-xs transition cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Schedule</span>
                </button>
              )}
            </div>

            {/* Quick in-line alarm adder */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <input
                id="reminder-title-input"
                type="text"
                value={newReminderTitle}
                onChange={e => setNewReminderTitle(e.target.value)}
                placeholder="Quick reminder title..."
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 bg-white dark:bg-slate-800"
              />
              <div className="flex gap-1.5">
                <input
                  id="reminder-time-input"
                  type="time"
                  value={newReminderTime}
                  onChange={e => setNewReminderTime(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 focus:outline-none focus:border-indigo-500 bg-white dark:bg-slate-800 flex-1 text-slate-700 dark:text-slate-200 text-xs"
                />
                <button
                  id="btn-add-reminder"
                  onClick={handleAddReminder}
                  disabled={!newReminderTitle || !newReminderTime}
                  className="rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-medium text-xs px-3 py-1.5 hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-40 transition cursor-pointer shadow-xs shrink-0"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              {(['all', 'active', 'actions', 'completed'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setReminderFilter(tab)}
                  className={`px-2 py-0.5 rounded-md font-medium capitalize transition cursor-pointer ${
                    reminderFilter === tab
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Listing active reminders */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {reminders
                .filter(rem => {
                  if (reminderFilter === 'active') return rem.status === 'active';
                  if (reminderFilter === 'actions') return rem.actionType && rem.actionType !== 'reminder_only';
                  if (reminderFilter === 'completed') return rem.status === 'completed' || rem.status === 'fired';
                  return true;
                })
                .map((rem, rIdx) => (
                  <div 
                    key={`taskmgr-rem-${rem.id}-${rIdx}`} 
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-xs transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{rem.title}</span>
                          
                          {/* Recurrence badge */}
                          {rem.recurrence && rem.recurrence !== 'once' && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium">
                              {rem.recurrence}
                            </span>
                          )}

                          {/* Action badge */}
                          {rem.actionType === 'create_folder' && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-100/70 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                              <FolderPlus className="h-2.5 w-2.5" /> Folder
                            </span>
                          )}
                          {rem.actionType === 'edit_doc' && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-100/70 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
                              <FileEdit className="h-2.5 w-2.5" /> Doc Note
                            </span>
                          )}
                          {rem.actionType === 'relocate_file' && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-purple-100/70 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1">
                              <Move className="h-2.5 w-2.5" /> Move
                            </span>
                          )}
                        </div>

                        {rem.targetFileName && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Target: {rem.targetFileName}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {rem.actionType && rem.actionType !== 'reminder_only' && onExecuteReminderAction && (
                          <button
                            type="button"
                            title="Run action now"
                            onClick={() => onExecuteReminderAction(rem)}
                            className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition cursor-pointer"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveReminder(rem.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <span>Trigger: {rem.triggerDate ? `${rem.triggerDate} ` : ''}{rem.triggerTime}</span>
                      <div className="flex items-center gap-1.5">
                        {rem.notifyInApp && <span title="In-App Alert">🔔 App</span>}
                        {rem.notifyEmail && <span title="Email Notice">📧 Mail</span>}
                        <span className={`px-1 py-0.2 rounded ${
                          rem.status === 'completed' 
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium' 
                            : rem.status === 'fired' 
                            ? 'text-amber-600 dark:text-amber-400 font-medium' 
                            : 'text-slate-500'
                        }`}>
                          {rem.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

              {reminders.length === 0 && (
                <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs">
                  No reminders scheduled yet. Add one above or schedule with file actions.
                </div>
              )}
            </div>
          </div>

          {/* Email Automated reports via Gemini styling (Desktop Power Feature) */}
          <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>Activity Digest Mailer</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Compile recent Google Drive activities, sync runs, and checklist statuses into a formatted email report sent to your connected account.
            </p>

            <button
              id="btn-compose-digest"
              onClick={handleComposeSummaryReport}
              disabled={isComposingReport || activities.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-500 py-2 px-3 text-xs font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition disabled:opacity-40 cursor-pointer shadow-xs"
            >
              {isComposingReport ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Composing Report...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Generate & Preview Email Digest</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* REPORT MODAL PREVIEW */}
      {showReportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">Activity Report Preview</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Review the digest before sending to your inbox.</p>
              </div>
              <button 
                onClick={() => setShowReportPreview(false)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Email Subject preview */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700/60 text-xs font-medium text-slate-800 dark:text-slate-200 mb-3">
              <span className="text-slate-400 font-normal">Subject: </span>{composedSubject}
            </div>

            {/* Structured Report Preview */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 p-4 mb-4 space-y-3 max-h-72">
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-indigo-600 dark:text-indigo-400">Report Status</span>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Digest Ready for Dispatch</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Ready
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Logged Operations</span>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{activities.length} recorded</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Delivery Format</span>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">HTML via Gmail API</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Included Operations</span>
                  <span className="text-[10px] text-slate-400 font-mono">Latest {Math.min(activities.length, 5)}</span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  {activities.slice(0, 5).map((act, i) => (
                    <li key={`act-summary-${act.id}-${i}`} className="py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-slate-700 dark:text-slate-300">{act.message}</span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">{act.timestamp.split(" ")[1] || act.timestamp}</span>
                    </li>
                  ))}
                  {activities.length === 0 && (
                    <li className="py-2 text-[11px] text-slate-400 text-center">No recent operations logged.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Footer controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Recipient: <strong className="text-slate-800 dark:text-slate-200 font-medium">{userEmail}</strong>
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-send-email-confirm"
                  onClick={handleSendEmailReportNow}
                  disabled={isSendingMail}
                  className="rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSendingMail ? "Sending..." : "Send Report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local Human Email Approval Security Gate */}
      <EmailApprovalModal
        request={localPendingApproval}
        onApprove={handleLocalApproveEmail}
        onDecline={handleLocalDeclineEmail}
        isSending={isSendingMail}
      />
    </div>
  );
}
