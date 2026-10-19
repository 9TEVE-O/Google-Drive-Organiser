import React, { useEffect, useMemo } from "react";
import { ShieldCheck, Mail, Send, X, Layers } from "lucide-react";
import { EmailApprovalRequest } from "../types";

interface EmailApprovalModalProps {
  request: EmailApprovalRequest | null;
  onApprove: (request: EmailApprovalRequest) => void;
  onDecline: (request: EmailApprovalRequest) => void;
  isSending?: boolean;
  pendingCount?: number;
}

export default function EmailApprovalModal({
  request,
  onApprove,
  onDecline,
  isSending = false,
  pendingCount = 1
}: EmailApprovalModalProps) {
  // Keyboard accessibility: dismiss/decline modal on Escape key press
  useEffect(() => {
    if (!request) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSending) {
        onDecline(request);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request, isSending, onDecline]);

  // Decode entities and strip raw HTML safely for native text preview
  const cleanPreviewText = useMemo(() => {
    if (!request?.htmlBody) return "";
    return request.htmlBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }, [request?.htmlBody]);

  if (!request) return null;

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-approval-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-indigo-50/50 dark:bg-indigo-950/30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="email-approval-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Human Email Approval Required
                </h3>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  Security Gate
                </span>
                {pendingCount > 1 && (
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span>1 of {pendingCount} queued</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                An automated action or reminder has prepared an outbound message. Review before sending.
              </p>
            </div>
          </div>
          <button
            onClick={() => onDecline(request)}
            disabled={isSending}
            aria-label="Decline and close"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* METADATA BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">Recipient</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 break-all">{request.recipientEmail}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono tracking-wider">Trigger Reason</span>
              <span className="text-slate-700 dark:text-slate-300">{request.triggerReason}</span>
            </div>
          </div>

          {/* SUBJECT */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Email Subject
            </label>
            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {request.subject}
            </div>
          </div>

          {/* MESSAGE PREVIEW */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>HTML Message Content Preview</span>
              <span className="text-[10px] font-normal text-slate-400">Safe Native Rendering</span>
            </label>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs leading-relaxed max-h-56 overflow-y-auto font-mono whitespace-pre-wrap">
              {cleanPreviewText}
            </div>
          </div>

          {/* NOTICE BANNER */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-200">
            <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              If declined, the reminder stays registered in your in-app workspace alerts only, and no email will be transmitted.
            </span>
          </div>
        </div>

        {/* FOOTER CONTROLS */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onDecline(request)}
            disabled={isSending}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Decline (Keep In-App Only)
          </button>

          <button
            type="button"
            onClick={() => onApprove(request)}
            disabled={isSending}
            className="px-5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSending ? (
              <>
                <span className="animate-spin mr-1">⏳</span>
                <span>Sending via Gmail...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Approve & Send Email</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
