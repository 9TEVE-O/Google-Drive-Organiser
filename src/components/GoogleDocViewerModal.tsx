import React, { useState, useEffect } from "react";
import { 
  FileText, ExternalLink, X, Plus, Check, RefreshCw, Copy, Download, 
  AlertCircle, ShieldCheck, Clock, Type, AlignLeft 
} from "lucide-react";
import { getGoogleDoc, appendGoogleDocText } from "../lib/googleApi";
import { GoogleDocContent } from "../types";

interface GoogleDocViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  documentTitle?: string;
  token: string | null;
  addLog?: (action: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email', message: string, details?: string) => void;
  onRefresh?: () => Promise<void>;
}

export default function GoogleDocViewerModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  token,
  addLog,
  onRefresh
}: GoogleDocViewerModalProps) {
  const [docContent, setDocContent] = useState<GoogleDocContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Append Text Sub-flow with mandatory mutation confirmation
  const [isAppending, setIsAppending] = useState(false);
  const [appendText, setAppendText] = useState("");
  const [showConfirmAppend, setShowConfirmAppend] = useState(false);
  const [isSavingAppend, setIsSavingAppend] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const [appendSuccess, setAppendSuccess] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    if (!isOpen || !documentId || !token) {
      setDocContent(null);
      setLoadError(null);
      setAppendText("");
      setShowConfirmAppend(false);
      setAppendSuccess(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    getGoogleDoc(token, documentId)
      .then((data) => {
        if (isMounted) {
          setDocContent(data);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          console.error("Error loading Google Doc:", err);
          setLoadError(err?.message || "Failed to load Google Doc content.");
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId, token, reloadTrigger]);

  if (!isOpen || !documentId) return null;

  const handleExecuteAppend = async () => {
    if (!token || !documentId || !appendText.trim()) return;

    setIsSavingAppend(true);
    setAppendError(null);
    setAppendSuccess(null);
    try {
      await appendGoogleDocText(token, documentId, appendText);
      if (addLog) {
        addLog(
          "modify",
          `Appended content to Google Doc "${docContent?.title || documentTitle || documentId}"`,
          `Appended: ${appendText.slice(0, 80)}...`
        );
      }

      // Reload document content
      const updated = await getGoogleDoc(token, documentId);
      setDocContent(updated);
      setAppendSuccess(`Appended ${appendText.length} characters to Google Doc successfully.`);
      setAppendText("");
      setIsAppending(false);
      setShowConfirmAppend(false);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      console.error("Failed to append to Google Doc:", err);
      setAppendError(err?.message || "Unknown error occurred while appending text.");
      setShowConfirmAppend(false);
    } finally {
      setIsSavingAppend(false);
    }
  };

  const handleCopyText = async () => {
    if (!docContent?.plainText) return;
    try {
      await navigator.clipboard.writeText(docContent.plainText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (e) {
      console.warn("Failed to copy text:", e);
    }
  };

  const handleDownloadTxt = () => {
    if (!docContent) return;
    const blob = new Blob([docContent.plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${docContent.title.replace(/[^\w.-]/g, "_")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const externalDocUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                  {docContent?.title || documentTitle || "Google Doc"}
                </h3>
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
                  Google Docs API
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Direct Workspace Document Content & Structure
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={externalDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition cursor-pointer"
              title="Open document in Google Docs web editor"
            >
              <span>Open in Docs</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* METRICS & ACTION STRIP */}
        {docContent && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-slate-100/50 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800/60 text-xs">
            <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1">
                <AlignLeft className="h-3.5 w-3.5 text-slate-400" />
                <span>{docContent.wordCount.toLocaleString()} words</span>
              </div>
              <div className="flex items-center gap-1">
                <Type className="h-3.5 w-3.5 text-slate-400" />
                <span>{docContent.characterCount.toLocaleString()} characters</span>
              </div>
              {docContent.revisionId && (
                <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                  <span>Rev: {docContent.revisionId.slice(-6)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyText}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer"
                title="Copy entire document text to clipboard"
              >
                {copyFeedback ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadTxt}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer"
                title="Download plain text file"
              >
                <Download className="h-3 w-3" />
                <span>Save .txt</span>
              </button>

              <button
                onClick={() => setIsAppending(!isAppending)}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  isAppending 
                    ? "bg-blue-600 text-white" 
                    : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60"
                }`}
              >
                <Plus className="h-3 w-3" />
                <span>Append Content</span>
              </button>
            </div>
          </div>
        )}

        {/* BODY AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {isLoading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-xs">Fetching document structural elements from Google Docs API...</p>
            </div>
          )}

            {appendSuccess && (
              <div role="status" className="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <p>{appendSuccess}</p>
                <button onClick={() => setAppendSuccess(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {appendError && (
              <div role="alert" className="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2 animate-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <p>{appendError}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExecuteAppend}
                    disabled={isSavingAppend}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isSavingAppend ? "animate-spin" : ""}`} />
                    <span>Retry Append</span>
                  </button>
                  <button onClick={() => setAppendError(null)} className="p-1 text-rose-400 hover:text-rose-600 cursor-pointer">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {loadError && (
            <div role="alert" className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 text-xs flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Unable to load document contents</p>
                  <p className="text-[11px] mt-0.5 text-rose-700 dark:text-rose-300">{loadError}</p>
                  <a
                    href={externalDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium underline text-blue-600 dark:text-blue-400 mt-2"
                  >
                    Open in Google Docs Web Editor instead <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReloadTrigger(prev => prev + 1)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer shrink-0"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
                <span>Retry Load</span>
              </button>
            </div>
          )}

          {/* APPEND TEXT PANEL */}
          {isAppending && !isLoading && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Append Content to Document (BatchUpdate)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Docs v1 insertText</span>
              </div>

              <textarea
                value={appendText}
                onChange={e => setAppendText(e.target.value)}
                placeholder="Type or paste text to append to the end of this Google Doc..."
                rows={3}
                className="w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none placeholder:text-slate-400"
              />

              {showConfirmAppend ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Confirm edit: Append <strong>{appendText.length} chars</strong> to Google Doc?
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowConfirmAppend(false)}
                      disabled={isSavingAppend}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteAppend}
                      disabled={isSavingAppend}
                      className="px-3.5 py-1 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingAppend ? "Writing..." : "Confirm & Append"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsAppending(false);
                      setAppendText("");
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!appendText.trim()) return;
                      setShowConfirmAppend(true);
                    }}
                    disabled={!appendText.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    Review & Append
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DOCUMENT CONTENT */}
          {!isLoading && !loadError && docContent && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 p-5 min-h-[280px]">
              {docContent.plainText.trim() ? (
                <div className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans selection:bg-blue-100 dark:selection:bg-blue-900/40">
                  {docContent.plainText}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>This Google Doc is currently empty.</p>
                  <button
                    onClick={() => setIsAppending(true)}
                    className="mt-2 text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Append initial content
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-6 py-3.5 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-400">ID: {documentId}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            Close Viewer
          </button>
        </div>

      </div>
    </div>
  );
}
