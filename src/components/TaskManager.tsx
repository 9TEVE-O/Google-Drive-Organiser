import React, { useState, useEffect } from "react";
import { 
  CheckSquare, Calendar, Bell, Send, Trash2, Plus, Clock, 
  Mail, Settings, ChevronRight, CheckCircle2, RefreshCw, Layers, Eye 
} from "lucide-react";
import { TaskItem, ActivityLog } from "../types";
import { 
  listTaskLists, createTaskList, listTasks, createGoogleTask, 
  updateGoogleTask, deleteGoogleTask, sendGmailReport 
} from "../lib/googleApi";
import InfoTooltip from "./InfoTooltip";

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
  reminders: { id: string; title: string; triggerTime: string; status: 'active' | 'fired'; notified: boolean }[];
  setReminders: React.Dispatch<React.SetStateAction<{ id: string; title: string; triggerTime: string; status: 'active' | 'fired'; notified: boolean }[]>>;
}

export default function TaskManager({
  token,
  addLog,
  userEmail,
  activities,
  onTriggerNotification,
  reminders,
  setReminders
}: TaskManagerProps) {
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
    const item = {
      id: "rem_" + Date.now(),
      title: newReminderTitle,
      triggerTime: newReminderTime,
      status: 'active' as const,
      notified: false
    };
    setReminders([...reminders, item]);
    addLog("task", `Scheduled alarm reminder: "${newReminderTitle}"`, `Alarm Time: ${newReminderTime}`);
    setNewReminderTitle("");
    setNewReminderTime("");
  };

  // Remove alert job
  const handleRemoveReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
  };

  // Trigger scanning clocks periodically in the background (Simulate reminder fire checks)
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      setReminders(prev => prev.map(rem => {
        if (rem.triggerTime === currentHourMin && !rem.notified) {
          // Play classic visual notification + trigger system alerts chime
          onTriggerNotification("Task Alarm Executed!", rem.title);
          addLog("task", `Automated reminder alarm fired: "${rem.title}"`, `Trigger Time: ${rem.triggerTime}`);
          return { ...rem, status: 'fired', notified: true };
        }
        return rem;
      }));
    }, 15000); // Check every 15s

    return () => clearInterval(clockInterval);
  }, [reminders, onTriggerNotification]);

  // Create Beautiful Custom report using Gemini Server route
  const handleComposeSummaryReport = async () => {
    setIsComposingReport(true);
    try {
      // Package last activities list limit to 8
      const eventsListText = activities.slice(0, 10).map(act => `[${act.timestamp}] ${act.message}`);

      let data: any = null;
      try {
        const res = await fetch("/api/gemini/compose-report", {
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

  // Push actual email out to Gmail Send API! (MANDATORY Permission Check)
  const handleSendEmailReportNow = async () => {
    if (!token || !composedHtml || !composedSubject) return;
    const confirmSend = window.confirm(`Confirm permission to deliver automated activity report directly to email address: ${userEmail}?`);
    if (!confirmSend) return;

    setIsSendingMail(true);
    try {
      await sendGmailReport(token, userEmail, composedSubject, composedHtml);
      addLog("email", `Delivered automated HTML activity report to ${userEmail}`, `Subject: ${composedSubject}`);
      addLog("email", `Automated Email Report delivered successfully to ${userEmail}!`);
      setShowReportPreview(false);
    } catch (e: any) {
       console.error("Error sending email:", e);
    } finally {
       setIsSendingMail(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT PANEL: Google Tasks List and creation */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <CheckSquare className="h-4.5 w-4.5 text-indigo-600" /> Google Tasks Sync
                  <InfoTooltip text="Manage your actual Google Tasks directly from this panel." />
                </h3>
                <p className="text-[11px] text-slate-400">Integrated categories and items inside Google Tasks platform.</p>
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
                      placeholder="Category..."
                      className="rounded border border-slate-200 px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button onClick={handleAddCategoryAction} className="p-1 px-2 text-[10px] font-bold bg-indigo-600 text-white rounded">
                      Add
                    </button>
                    <button onClick={() => setIsCreatingList(false)} className="text-slate-400 text-xs text-[10px]">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      id="select-task-list"
                      value={selectedListId}
                      onChange={e => handleSelectCategory(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white py-1 px-2 text-xs font-semibold text-slate-600 focus:outline-none focus:border-indigo-500"
                    >
                      {taskLists.map((list, lIdx) => (
                        <option key={`task-list-${list.id}-${lIdx}`} value={list.id}>{list.title}</option>
                      ))}
                    </select>
                    <button
                      id="btn-create-taskset"
                      onClick={() => setIsCreatingList(true)}
                      className="text-xs text-indigo-600 hover:underline font-semibold"
                    >
                      + Category
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Loading elements */}
            {isTaskLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 mb-2" />
                <span className="text-xs font-mono text-slate-400">Syncing task items...</span>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Form to add item */}
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-4.5 space-y-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Create New Task Item</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      id="input-task-title"
                      type="text"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="What needs to be done?..."
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="date"
                      id="input-task-due"
                      value={newDueDate}
                      onChange={e => setNewDueDate(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="input-task-notes"
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      placeholder="Add brief task notes/description (optional)..."
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      id="btn-confirm-add-task"
                      onClick={handleAddTaskItem}
                      disabled={!newTitle}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                      Add Task
                    </button>
                  </div>
                </div>

                {/* Task Checklist list items */}
                <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                  {tasks.map((task, tIdx) => (
                    <div 
                      key={`task-item-${task.id}-${tIdx}`} 
                      id={`task-item-${task.id}`}
                      className={`flex items-center justify-between p-3.5 rounded-lg border transition ${
                        task.status === "completed" 
                          ? "bg-slate-50/50 border-slate-100 opacity-60 line-through" 
                          : "bg-white border-slate-150 hover:border-indigo-100"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={task.status === "completed"}
                          onChange={() => handleToggleTaskStatus(task)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <span className="text-slate-800 text-xs font-medium block truncate">
                            {task.title}
                          </span>
                          {task.notes && (
                            <span className="text-[10px] text-slate-400 truncate block">
                              {task.notes}
                            </span>
                          )}
                          {task.due && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500 font-mono font-medium mt-1">
                              <Calendar className="h-2.5 w-2.5" /> Due: {new Date(task.due).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteTaskAction(task.id, task.title)}
                        className="rounded p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                        title="Remove task permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {tasks.length === 0 && (
                    <span className="text-slate-400 text-xs text-center py-6 block font-medium">No tasks found inside category list.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Clock Alarm Schedulers & Gmail Automated reports */}
        <div className="lg:col-span-5 space-y-4">
          {/* Custom schedules alarms */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Clock className="h-4.5 w-4.5 text-slate-400" /> Automated Active Timers
              <InfoTooltip text="Setup a recurring daily alarm to make sure you never forget a routine task you must do in your application." />
            </h3>

            {/* Input additions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <input
                id="reminder-title-input"
                type="text"
                value={newReminderTitle}
                onChange={e => setNewReminderTitle(e.target.value)}
                placeholder="Alarm Label (e.g., Weekly Sync)"
                className="rounded border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50"
              />
              <div className="flex gap-1.5">
                <input
                  id="reminder-time-input"
                  type="time"
                  value={newReminderTime}
                  onChange={e => setNewReminderTime(e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 flex-1 text-slate-600 text-xs"
                />
                <button
                  id="btn-add-reminder"
                  onClick={handleAddReminder}
                  disabled={!newReminderTitle || !newReminderTime}
                  className="rounded-lg bg-indigo-600 text-white font-semibold text-xs px-3 hover:bg-indigo-700 disabled:opacity-50"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Listing active reminders */}
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {reminders.map((rem, rIdx) => (
                <div key={`taskmgr-rem-${rem.id}-${rIdx}`} className="p-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 block truncate leading-snug">{rem.title}</span>
                    <span className="text-[10px] font-mono text-slate-450 text-slate-400">Trigger at: {rem.triggerTime} • Status: {rem.status}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveReminder(rem.id)}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Email Automated reports via Gemini styling */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider text-slate-505 text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Mail className="h-4.5 w-4.5 text-slate-400" /> Executive Digest Mailer
            </h3>

            <p className="text-[11px] text-slate-400 leading-normal">
              Collate Drive modifications, backing, and todo details. Composes structured CSS-styled email summaries utilizing server-side Gemini intelligence.
            </p>

            <button
              id="btn-compose-digest"
              onClick={handleComposeSummaryReport}
              disabled={isComposingReport || activities.length === 0}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {isComposingReport ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Structuring Mail Layout...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Compose Automated Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* REPORT MODAL PREVIEW */}
      {showReportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-display font-bold text-slate-950 text-lg">Automated Executive Report Preview</h3>
                <p className="text-xs text-slate-400">Review layout from Gemini before pushing email out.</p>
              </div>
              <button onClick={() => setShowReportPreview(false)} className="text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            </div>

            {/* Email Subject preview */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-150 text-xs font-semibold text-slate-800 mb-3 block">
              <span className="text-slate-400 font-mono">Subject:</span> {composedSubject}
            </div>

            {/* Frame Content display with strict sandboxing to prevent script execution and cross-origin access */}
            <div className="flex-1 overflow-hidden border border-slate-200 rounded-xl bg-slate-50 h-64 mb-4">
              <iframe
                title="Automated Executive Report Preview"
                sandbox="allow-popups"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{margin:0;padding:16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}</style></head><body>${composedHtml}</body></html>`}
                className="w-full h-full border-0 bg-white rounded-xl"
              />
            </div>

            {/* Footer controls */}
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-150">
              <span className="text-[10px] text-slate-450 text-slate-400 font-mono leading-snug">
                Send to connected account: <br />
                <strong className="text-slate-700">{userEmail}</strong>
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Edit Configuration
                </button>
                <button
                  id="btn-send-email-confirm"
                  onClick={handleSendEmailReportNow}
                  disabled={isSendingMail}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSendingMail ? "Processing..." : "Deliver Report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
