import { geminiFetch } from "../lib/geminiApi";
import React, { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  Sliders, 
  Zap, 
  BrainCircuit, 
  FolderTree, 
  CheckSquare, 
  AlertCircle,
  RefreshCw,
  MoreVertical,
  X,
  ArrowRight,
  ChevronDown
} from "lucide-react";
import { ChatMessage, GeminiChatModel, ChatRolePreset, DriveFile } from "../types";

export interface GeminiChatbotProps {
  files?: DriveFile[];
  clearTrigger?: number;
  exportTrigger?: number;
}

const ROLE_PRESETS: ChatRolePreset[] = [
  {
    id: "drive_expert",
    title: "Storage Specialist",
    description: "Folder taxonomy, file naming rules, clean storage hygiene, and deduplication.",
    iconName: "FolderTree",
    defaultModel: "gemini-3.8-flash",
    systemInstruction: "You are an elite Google Drive organization and cloud storage specialist. You help users structure nested folder hierarchies, design foolproof file naming schemas (dates, project tags, revisions), identify archiving candidates, and maintain pristine digital storage hygiene. Be direct, well-organized, and provide bulleted solutions."
  },
  {
    id: "fast_assistant",
    title: "Quick Actions",
    description: "Rapid file lookups, concise recommendations, and fast summaries.",
    iconName: "Zap",
    defaultModel: "gemini-3.1-flash-lite",
    systemInstruction: "You are a high-speed AI assistant optimized for brief, immediate, bulleted responses. Answer queries as quickly and cleanly as possible without unnecessary conversational filler."
  },
  {
    id: "complex_architect",
    title: "Governance Architect",
    description: "Deep reasoning, data retention rules, access policies, and workflow design.",
    iconName: "BrainCircuit",
    defaultModel: "gemini-3.1-pro-preview",
    systemInstruction: "You are an enterprise cloud solutions architect and data governance expert. You specialize in complex file classification, access control policies, multi-tier backup replication strategies, API automation scripts, and large-scale data migration plans. Provide comprehensive, reasoned, and structured technical advice."
  },
  {
    id: "productivity_coach",
    title: "Productivity Coach",
    description: "Turn scattered files into Google Tasks, deadlines, and daily review routines.",
    iconName: "CheckSquare",
    defaultModel: "gemini-3.8-flash",
    systemInstruction: "You are an executive productivity coach. You help the user break down messy projects into actionable Google Tasks, schedule realistic review reminders, prioritize pending documents, and maintain high personal efficiency."
  }
];

const DEFAULT_STARTERS = [
  "How should I structure folders for personal taxes and invoices?",
  "Recommend a standard file naming convention for client projects",
  "What is the best weekly checklist to prevent Google Drive clutter?",
  "Turn my pending tax invoices and contracts into an actionable task sprint"
];

export default function GeminiChatbot({ files, clearTrigger, exportTrigger }: GeminiChatbotProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-msg",
      role: "model",
      content: "Hello! I am your AI Drive Companion. Ask me how to structure your folders, audit files, establish naming rules, or extract action items.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: "gemini-3.8-flash"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("drive_expert");
  const [selectedModel, setSelectedModel] = useState<GeminiChatModel>("gemini-3.8-flash");
  const [customInstruction, setCustomInstruction] = useState(ROLE_PRESETS[0].systemInstruction);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Compressed Options Menu & Drawer
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Dynamic Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<string[]>(DEFAULT_STARTERS);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Click outside to close options menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
        setShowConfirmClear(false);
      }
    };
    if (showOptionsMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOptionsMenu]);

  const activePreset = ROLE_PRESETS.find(p => p.id === selectedPresetId) || ROLE_PRESETS[0];

  const handleSelectPreset = (preset: ChatRolePreset) => {
    setSelectedPresetId(preset.id);
    setSelectedModel(preset.defaultModel);
    setCustomInstruction(preset.systemInstruction);
    setShowOptionsMenu(false);
    setToastNotice(`Mode: ${preset.title}`);
    setTimeout(() => setToastNotice(null), 2500);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    setApiError(null);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputText("");
    setIsLoading(true);

    try {
      let data: any = null;
      try {
        const response = await geminiFetch("/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newHistory.map(m => ({ role: m.role, content: m.content })),
            systemInstruction: customInstruction,
            model: selectedModel
          })
        });

        const resText = await response.text();
        if (resText && (resText.startsWith("{") || resText.startsWith("["))) {
          data = JSON.parse(resText);
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/chat error:", fetchErr);
      }

      if (!data || !data.reply) {
        throw new Error(data?.error || "AI assistant is temporarily busy. Please try again.");
      }

      const botReply: ChatMessage = {
        id: `model-${Date.now()}`,
        role: "model",
        content: data.reply || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || selectedModel
      };

      setMessages(prev => [...prev, botReply]);
    } catch (err: any) {
      console.error("Chat Error:", err);
      setApiError(err.message || "Failed to reach AI service.");
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Safe clear conversation
  const executeClearChat = () => {
    setMessages([
      {
        id: `initial-${Date.now()}`,
        role: "model",
        content: "Chat cleared. What would you like to organize or discuss today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel
      }
    ]);
    setApiError(null);
    setShowConfirmClear(false);
    setShowOptionsMenu(false);
    setToastNotice("Conversation cleared");
    setTimeout(() => setToastNotice(null), 2500);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Safe export transcript
  const handleExportTranscript = () => {
    const transcript = messages
      .map(m => `[${m.timestamp}] ${m.role === 'user' ? 'You' : 'Gemini'}:\n${m.content}\n`)
      .join("\n---\n\n");
    
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drive-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setShowOptionsMenu(false);
    setToastNotice("Transcript downloaded");
    setTimeout(() => setToastNotice(null), 2500);
  };

  // Sync external triggers (Header toolbar & event bus)
  useEffect(() => {
    if (clearTrigger && clearTrigger > 0) executeClearChat();
  }, [clearTrigger]);

  useEffect(() => {
    if (exportTrigger && exportTrigger > 0) handleExportTranscript();
  }, [exportTrigger]);

  useEffect(() => {
    const handleClearEvent = () => executeClearChat();
    const handleExportEvent = () => handleExportTranscript();
    const handleIdeasEvent = () => handleGenerateAiSuggestions();

    window.addEventListener("drive-organizer:clear-chat", handleClearEvent);
    window.addEventListener("drive-organizer:export-chat", handleExportEvent);
    window.addEventListener("drive-organizer:generate-ideas", handleIdeasEvent);

    return () => {
      window.removeEventListener("drive-organizer:clear-chat", handleClearEvent);
      window.removeEventListener("drive-organizer:export-chat", handleExportEvent);
      window.removeEventListener("drive-organizer:generate-ideas", handleIdeasEvent);
    };
  }, [selectedModel, files, selectedPresetId]);

  // AI-Powered Dynamic Suggestion Generator
  const handleGenerateAiSuggestions = async () => {
    if (isGeneratingSuggestions) return;
    setIsGeneratingSuggestions(true);
    setApiError(null);

    try {
      const sampleNames = files?.slice(0, 8).map(f => f.name) || [];
      const res = await geminiFetch("/api/gemini/chat-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleTitle: activePreset.title,
          sampleFiles: sampleNames
        })
      });

      if (!res.ok) throw new Error("Could not fetch suggestions");
      const data = await res.json();
      if (data && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        setToastNotice("New suggestions ready");
        setTimeout(() => setToastNotice(null), 2500);
      }
    } catch {
      // Fallback suggestions
      const sample = files?.[0]?.name ? ` for '${files[0].name}'` : "";
      setAiSuggestions([
        `What folder structure do you recommend${sample}?`,
        "Recommend standard file naming tags with date prefixes",
        "Create an automated weekly checklist to prevent Drive clutter",
        "Turn pending invoices into actionable Google Tasks with deadlines"
      ]);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const isStarterOnly = messages.length <= 1;

  return (
    <div className="relative max-w-4xl mx-auto flex flex-col h-[540px] sm:h-[650px] rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Toast Notification */}
      {toastNotice && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 px-4 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
          <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Clean Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            {selectedPresetId === "drive_expert" && <FolderTree className="h-4 w-4" />}
            {selectedPresetId === "fast_assistant" && <Zap className="h-4 w-4" />}
            {selectedPresetId === "complex_architect" && <BrainCircuit className="h-4 w-4" />}
            {selectedPresetId === "productivity_coach" && <CheckSquare className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Drive Assistant
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {activePreset.title}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Interactive workspace companion
            </p>
          </div>
        </div>

        {/* Compressed Actions */}
        <div className="relative flex items-center gap-1" ref={optionsMenuRef}>
          <button
            onClick={handleGenerateAiSuggestions}
            disabled={isGeneratingSuggestions}
            title="Generate fresh suggestion ideas"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${isGeneratingSuggestions ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Ideas</span>
          </button>

          <button
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            title="Chat options"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {/* Clean Dropdown Menu */}
          {showOptionsMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 block">
                  Assistant Role
                </span>
                <div className="space-y-0.5">
                  {ROLE_PRESETS.map(preset => {
                    const isSelected = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                          isSelected 
                            ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200 font-medium" 
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                        }`}
                      >
                        <span>{preset.title}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 block">
                  Model Speed & Depth
                </span>
                <div className="grid grid-cols-3 gap-1 px-1">
                  {[
                    { id: "gemini-3.1-flash-lite", label: "Fast" },
                    { id: "gemini-3.8-flash", label: "Standard" },
                    { id: "gemini-3.1-pro-preview", label: "Deep" }
                  ].map(tier => (
                    <button
                      key={tier.id}
                      onClick={() => {
                        setSelectedModel(tier.id as GeminiChatModel);
                        setToastNotice(`Model: ${tier.label}`);
                        setTimeout(() => setToastNotice(null), 2000);
                      }}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer text-center ${
                        selectedModel === tier.id
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 space-y-0.5">
                <button
                  onClick={handleExportTranscript}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  <span>Export Transcript</span>
                </button>

                {showConfirmClear ? (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-1.5">
                    <span className="block text-[11px] font-medium text-rose-700 dark:text-rose-300">
                      Clear entire conversation?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={executeClearChat}
                        className="flex-1 py-1 rounded bg-rose-600 text-white font-medium text-[11px] hover:bg-rose-700 transition cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => setShowConfirmClear(false)}
                        className="flex-1 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirmClear(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear Conversation</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/40 dark:bg-slate-950/20">
        {messages.map((msg, mIdx) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={`msg-${msg.id}-${mIdx}`}
              className={`flex gap-3 max-w-2xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
            >
              {/* Clean Minimal Avatar */}
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-2xs ${
                  isUser
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-indigo-600 text-white dark:bg-indigo-500"
                }`}
              >
                {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>

              {/* Message Content */}
              <div className="space-y-1 max-w-[85%] min-w-0">
                <div className={`flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 ${isUser ? "justify-end" : ""}`}>
                  <span>{isUser ? "You" : "Gemini"}</span>
                  <span>·</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words relative group ${
                    isUser
                      ? "bg-indigo-600 text-white rounded-tr-xs shadow-xs"
                      : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs shadow-2xs"
                  }`}
                >
                  {msg.content}

                  {/* Discrete Copy Button */}
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className={`absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition cursor-pointer ${
                      isUser
                        ? "bg-indigo-700 text-indigo-100 hover:text-white"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white"
                    }`}
                    title="Copy response"
                  >
                    {copiedId === msg.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty State Hero Starters */}
        {isStarterOnly && (
          <div className="pt-2 pb-4 max-w-xl mx-auto space-y-2.5 animate-in fade-in duration-200">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block text-center">
              Suggested prompts for your Drive
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aiSuggestions.slice(0, 4).map((promptText, pIdx) => (
                <button
                  key={`hero-starter-${pIdx}`}
                  onClick={() => handleSendMessage(promptText)}
                  disabled={isLoading}
                  className="p-3 text-left rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition cursor-pointer group shadow-2xs"
                >
                  <p className="text-xs text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2 leading-snug">
                    {promptText}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-indigo-500 mt-2 font-medium">
                    Ask this <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Thinking Indicator */}
        {isLoading && (
          <div className="flex gap-3 max-w-md mr-auto animate-in fade-in duration-150">
            <div className="h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl rounded-tl-xs px-4 py-2.5 shadow-2xs flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gemini is thinking</span>
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-bounce"></span>
              </span>
            </div>
          </div>
        )}

        {/* Clean Error Notice */}
        {apiError && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-800/80 bg-rose-50/80 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2 max-w-lg mx-auto">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <p className="flex-1 leading-relaxed">{apiError}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Streamlined Single-Row Suggestions Strip */}
      <div className="px-3 sm:px-4 py-2 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center gap-1.5 overflow-x-auto text-[11px] scrollbar-thin">
        <button
          onClick={handleGenerateAiSuggestions}
          disabled={isGeneratingSuggestions}
          title="Compose fresh ideas"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-medium shrink-0 transition cursor-pointer border border-indigo-200/60 dark:border-indigo-800/60 disabled:opacity-50"
        >
          <Sparkles className={`h-3 w-3 ${isGeneratingSuggestions ? 'animate-spin' : ''}`} />
          <span>Ideas</span>
        </button>

        {aiSuggestions.map((promptText, idx) => (
          <button
            key={`chip-${idx}`}
            onClick={() => handleSendMessage(promptText)}
            disabled={isLoading}
            className="shrink-0 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 rounded-full px-3 py-1 transition cursor-pointer disabled:opacity-50 shadow-2xs whitespace-nowrap"
          >
            {promptText}
          </button>
        ))}
      </div>

      {/* Streamlined Modern Input Bar */}
      <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
        <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your Drive..."
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent py-1 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none max-h-24 leading-relaxed"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="h-8 w-8 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 cursor-pointer shadow-xs"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
