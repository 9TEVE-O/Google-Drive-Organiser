import React, { useState, useEffect } from "react";
import { 
  X, Sparkles, FileText, Calendar, HardDrive, Tag, Folder, 
  ExternalLink, Copy, Check, RefreshCw, AlertCircle, Eye, 
  Download, Edit3, Move, Trash2, CheckCircle2, ChevronRight, Layers, ArrowUpRight
} from "lucide-react";
import { DriveFile } from "../types";
import { getDriveTextFileContent } from "../lib/googleApi";

interface FilePreviewModalProps {
  file: DriveFile | null;
  token: string | null;
  onClose: () => void;
  metadata?: { category?: string; tags?: string[]; relevance?: number };
  onStartEdit?: (file: DriveFile) => void;
  onStartMove?: (file: DriveFile) => void;
  onStartDelete?: (file: DriveFile) => void;
}

interface AISummaryData {
  summary: string;
  documentType: string;
  keyPoints: string[];
  suggestedActions: string[];
  relevanceScore?: number;
  fallback?: boolean;
}

export default function FilePreviewModal({
  file,
  token,
  onClose,
  metadata,
  onStartEdit,
  onStartMove,
  onStartDelete
}: FilePreviewModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  
  // Content preview state for text-based files
  const [fileContent, setFileContent] = useState<string | null>(file?.content || null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  
  // Gemini AI summary state
  const [summaryData, setSummaryData] = useState<AISummaryData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch content and generate AI summary when file changes
  useEffect(() => {
    if (!file) return;

    let isMounted = true;
    setSummaryData(null);
    setSummaryError(null);
    setFileContent(file.content || null);

    const isTextMime = 
      file.mimeType?.includes("text") || 
      file.mimeType === "application/json" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".json");

    // 1. Fetch text content if editable and token available
    const loadContent = async () => {
      if (!isTextMime) return "";
      if (file.content) return file.content;
      if (!token) return "";

      setIsLoadingContent(true);
      try {
        const text = await getDriveTextFileContent(token, file.id);
        if (isMounted) {
          setFileContent(text);
        }
        return text;
      } catch (err) {
        console.warn("Could not fetch file text content:", err);
        return "";
      } finally {
        if (isMounted) {
          setIsLoadingContent(false);
        }
      }
    };

    // 2. Fetch Gemini AI summary
    const fetchSummary = async (contentSnippet: string) => {
      setIsLoadingSummary(true);
      try {
        const payload = {
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          category: metadata?.category || file.category,
          tags: metadata?.tags || file.tags,
          contentSnippet: contentSnippet ? contentSnippet.slice(0, 2000) : undefined,
          folderContext: file.parents?.length ? file.parents.join(", ") : "Root / My Drive"
        };

        let data: any = null;
        try {
          const res = await fetch("/api/gemini/file-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const text = await res.text();
          if (text && (text.startsWith("{") || text.startsWith("["))) {
            data = JSON.parse(text);
          }
        } catch (fetchErr) {
          console.warn("Fetch /api/gemini/file-summary error:", fetchErr);
        }

        if (isMounted && data && data.success) {
          setSummaryData({
            summary: data.summary,
            documentType: data.documentType,
            keyPoints: data.keyPoints || [],
            suggestedActions: data.suggestedActions || [],
            relevanceScore: data.relevanceScore,
            fallback: data.fallback
          });
        } else if (isMounted) {
          setSummaryData({
            summary: `File "${file.name}" (${file.mimeType || 'Document'}) stored in Google Drive.`,
            documentType: file.name.split('.').pop()?.toUpperCase() || "Document",
            keyPoints: [
              `Name: ${file.name}`,
              `Type: ${file.mimeType}`,
              `Modified: ${file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Recent'}`
            ],
            suggestedActions: ["Organize into folder", "Keep reviewed"],
            relevanceScore: 70,
            fallback: true
          });
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Gemini summary error:", err);
          setSummaryError(err.message || "Failed to generate AI summary.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingSummary(false);
        }
      }
    };

    // Run sequence
    loadContent().then(loadedContent => {
      if (isMounted) {
        fetchSummary(loadedContent || file.content || "");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [file?.id, token]);

  if (!file) return null;

  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
  const isEditable = !isFolder && (
    file.mimeType === "text/plain" ||
    file.mimeType === "text/markdown" ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".md")
  );

  const category = metadata?.category || file.category || "Unsorted";
  const tags = metadata?.tags || file.tags || [];
  const relevance = metadata?.relevance ?? file.relevance ?? 70;

  const handleCopyId = () => {
    navigator.clipboard.writeText(file.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyContent = () => {
    if (fileContent) {
      navigator.clipboard.writeText(fileContent);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    }
  };

  const handleManualRegenerate = async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const payload = {
        fileName: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        category,
        tags,
        contentSnippet: fileContent ? fileContent.slice(0, 2000) : undefined
      };

      let data: any = null;
      try {
        const res = await fetch("/api/gemini/file-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/file-summary error:", fetchErr);
      }

      if (data && data.success) {
        setSummaryData({
          summary: data.summary,
          documentType: data.documentType,
          keyPoints: data.keyPoints || [],
          suggestedActions: data.suggestedActions || [],
          relevanceScore: data.relevanceScore,
          fallback: data.fallback
        });
      } else {
        setSummaryData({
          summary: `Summary for "${file.name}" (${file.mimeType || 'Document'}).`,
          documentType: file.name.split('.').pop()?.toUpperCase() || "Document",
          keyPoints: [`Name: ${file.name}`, `Type: ${file.mimeType}`],
          suggestedActions: ["Organize into folder", "Keep reviewed"],
          relevanceScore: 70,
          fallback: true
        });
      }
    } catch (err: any) {
      setSummaryError(err.message || "Failed to refresh summary");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Human-readable format label
  const getFormatLabel = (mime: string, name: string) => {
    if (mime === "application/vnd.google-apps.folder") return "Folder Directory";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "PDF Document";
    if (mime.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "Spreadsheet Workbook";
    if (mime.includes("document") || name.endsWith(".docx") || name.endsWith(".doc")) return "Word Document";
    if (mime.includes("presentation") || name.endsWith(".pptx")) return "Presentation Slides";
    if (mime.includes("image") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".svg")) return "Image Graphic";
    if (mime === "text/plain" || name.endsWith(".txt")) return "Plain Text Document";
    if (mime === "text/markdown" || name.endsWith(".md")) return "Markdown Document";
    if (mime === "application/json" || name.endsWith(".json")) return "JSON Data";
    return mime || "Document File";
  };

  const webLink = file.webViewLink || (file.id && !file.id.startsWith("fb_") ? `https://drive.google.com/file/d/${file.id}/view` : null);

  return (
    <div 
      id="file-preview-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="file-preview-modal-container"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5 pb-4 bg-slate-50/50">
          <div className="flex items-start gap-3 min-w-0 pr-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
              isFolder 
                ? "bg-amber-100 text-amber-700" 
                : "bg-indigo-50 text-indigo-600 border border-indigo-100"
            }`}>
              {isFolder ? (
                <Folder className="h-5 w-5 fill-amber-200 text-amber-600" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>
            
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 
                  id="preview-modal-title" 
                  className="font-display font-bold text-slate-900 text-base sm:text-lg truncate"
                  title={file.name}
                >
                  {file.name}
                </h3>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>{getFormatLabel(file.mimeType, file.name)}</span>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-[11px]">{file.size || "Unknown size"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {webLink && (
              <a
                id="preview-open-drive-link"
                href={webLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                title="Open in Google Drive"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              id="preview-modal-close-btn"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              title="Close Preview (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* AI-Generated Summary Card (Gemini) */}
          <div className="rounded-2xl border border-indigo-200 bg-linear-to-b from-indigo-50/50 to-white p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-indigo-950 flex items-center gap-1.5">
                    AI Summary & Insights
                    <span className="rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-mono px-2 py-0.2 font-semibold">
                      Gemini 3.8 Flash
                    </span>
                  </h4>
                  <span className="text-[10px] text-slate-500 block">
                    Synthesized from file content, naming taxonomy, and metadata
                  </span>
                </div>
              </div>

              <button
                id="btn-regenerate-summary"
                onClick={handleManualRegenerate}
                disabled={isLoadingSummary}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 shadow-2xs transition disabled:opacity-50 cursor-pointer"
                title="Regenerate AI summary with Gemini"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingSummary ? "animate-spin text-indigo-600" : ""}`} />
                <span>{isLoadingSummary ? "Analyzing..." : "Refresh"}</span>
              </button>
            </div>

            {/* AI Summary Loading State */}
            {isLoadingSummary && (
              <div className="py-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-indigo-700">
                  <div className="h-3.5 w-3.5 border-2 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
                  <span className="font-medium">Gemini is inspecting file structure and summarizing...</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full bg-indigo-100/70 rounded-md animate-pulse"></div>
                  <div className="h-3 w-4/5 bg-indigo-100/70 rounded-md animate-pulse"></div>
                  <div className="h-3 w-2/3 bg-indigo-100/70 rounded-md animate-pulse"></div>
                </div>
              </div>
            )}

            {/* AI Summary Loaded Content */}
            {!isLoadingSummary && summaryData && (
              <div className="space-y-3 pt-1">
                {/* Document classification badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500">Document Classification:</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100/80 px-2 py-0.5 text-[11px] font-bold text-indigo-900 border border-indigo-200/60">
                    <Layers className="h-3 w-3 text-indigo-600" />
                    {summaryData.documentType}
                  </span>
                  {summaryData.fallback && (
                    <span className="text-[10px] text-slate-400 italic">
                      (Synthesized metadata assessment)
                    </span>
                  )}
                </div>

                {/* Executive summary text */}
                <p className="text-xs text-slate-700 leading-relaxed bg-white/80 p-3 rounded-xl border border-indigo-100">
                  {summaryData.summary}
                </p>

                {/* Key Points / Highlights */}
                {summaryData.keyPoints.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Key Takeaways & Details
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {summaryData.keyPoints.map((point, idx) => (
                        <div key={`keypoint-${idx}-${point.slice(0, 10)}`} className="flex items-start gap-1.5 text-xs text-slate-700 bg-white/60 p-2 rounded-lg border border-indigo-50">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="leading-snug">{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Actions */}
                {summaryData.suggestedActions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Recommended Next Actions
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {summaryData.suggestedActions.map((action, idx) => (
                        <span 
                          key={`sugg-action-${idx}-${action.slice(0, 10)}`} 
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 border border-emerald-200/70"
                        >
                          <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                          {action}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error state */}
            {!isLoadingSummary && summaryError && !summaryData && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{summaryError}</span>
              </div>
            )}
          </div>

          {/* Basic File Details Grid */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3.5">
            <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider">
              File Properties & Metadata
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Category */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-slate-400" /> Category:
                </span>
                <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                  category === "Unsorted" 
                    ? "bg-slate-200 text-slate-700" 
                    : "bg-indigo-100 text-indigo-800"
                }`}>
                  {category}
                </span>
              </div>

              {/* File Size */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-slate-400" /> File Size:
                </span>
                <span className="font-mono font-semibold text-slate-800">
                  {file.size || "Unknown"}
                </span>
              </div>

              {/* Created Date */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" /> Created:
                </span>
                <span className="font-mono text-[11px] text-slate-700">
                  {file.createdTime ? new Date(file.createdTime).toLocaleString() : "Unknown"}
                </span>
              </div>

              {/* Modified Date */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" /> Modified:
                </span>
                <span className="font-mono text-[11px] text-slate-700">
                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "Same as creation"}
                </span>
              </div>

              {/* Relevance Score */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between sm:col-span-2">
                <span className="text-slate-500 font-medium">Relevance Rating:</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        relevance > 75 ? "bg-emerald-500" : relevance > 40 ? "bg-indigo-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${relevance}%` }}
                    />
                  </div>
                  <span className="font-mono font-bold text-slate-700 text-[11px]">
                    {relevance}/100
                  </span>
                </div>
              </div>

              {/* Tags */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-2 space-y-1.5">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-400" /> Assigned Tags:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.length > 0 ? (
                    tags.map((tag, idx) => (
                      <span key={`prev-tag-${tag}-${idx}`} className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-700 border border-slate-200 font-mono shadow-2xs">
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">No tags assigned yet</span>
                  )}
                </div>
              </div>

              {/* File ID & Copy */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Google Drive File ID</span>
                  <span className="font-mono text-[11px] text-slate-600 truncate block max-w-sm">
                    {file.id}
                  </span>
                </div>
                <button
                  id="btn-copy-file-id"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shrink-0 cursor-pointer shadow-2xs"
                >
                  {copiedId ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Text Content Preview (if text-based file) */}
          {(fileContent !== null || isLoadingContent) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" /> Document Content Preview
                </h4>
                {fileContent && (
                  <button
                    id="btn-copy-content"
                    onClick={handleCopyContent}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                  >
                    {copiedContent ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-slate-500" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {isLoadingContent ? (
                <div className="py-8 flex flex-col items-center justify-center text-xs text-slate-400">
                  <div className="h-5 w-5 border-2 border-indigo-600 border-t-transparent animate-spin rounded-full mb-2"></div>
                  <span>Fetching text from Google Drive...</span>
                </div>
              ) : fileContent ? (
                <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-900 text-slate-200 p-3.5 font-mono text-[11px] leading-relaxed border border-slate-800 whitespace-pre-wrap select-text">
                  {fileContent}
                </pre>
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  This document is empty.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="border-t border-slate-100 p-4 px-5 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isEditable && onStartEdit && (
              <button
                id="preview-btn-edit"
                onClick={() => {
                  onClose();
                  onStartEdit(file);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
              >
                <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                <span>Edit Document</span>
              </button>
            )}

            {onStartMove && (
              <button
                id="preview-btn-move"
                onClick={() => {
                  onClose();
                  onStartMove(file);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer shadow-2xs"
              >
                <Move className="h-3.5 w-3.5 text-slate-500" />
                <span>Move</span>
              </button>
            )}

            {onStartDelete && (
              <button
                id="preview-btn-delete"
                onClick={() => {
                  onClose();
                  onStartDelete(file);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer shadow-2xs"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                <span>Delete</span>
              </button>
            )}
          </div>

          <button
            id="preview-modal-done-btn"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
