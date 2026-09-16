import { geminiFetch } from "../lib/geminiApi";
import React, { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  RotateCcw, 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  Sliders, 
  Zap, 
  BrainCircuit, 
  FolderTree, 
  CheckSquare,
  AlertCircle
} from "lucide-react";
import { ChatMessage, GeminiChatModel, ChatRolePreset } from "../types";

const ROLE_PRESETS: ChatRolePreset[] = [
  {
    id: "drive_expert",
    title: "Drive & Storage Specialist",
    description: "Expert in folder taxonomy, file naming conventions, cloud storage cleanup, and deduplication.",
    iconName: "FolderTree",
    defaultModel: "gemini-3.8-flash",
    systemInstruction: "You are an elite Google Drive organization and cloud storage specialist. You help users structure nested folder hierarchies, design foolproof file naming schemas (dates, project tags, revisions), identify archiving candidates, and maintain pristine digital storage hygiene. Be direct, well-organized, and provide bulleted solutions."
  },
  {
    id: "fast_assistant",
    title: "Fast / Quick Actions",
    description: "Ultra-fast answers, instant summaries, rapid file lookups, and concise recommendations.",
    iconName: "Zap",
    defaultModel: "gemini-3.1-flash-lite",
    systemInstruction: "You are a high-speed AI assistant optimized for brief, immediate, bulleted responses. Answer queries as quickly and cleanly as possible without unnecessary conversational filler."
  },
  {
    id: "complex_architect",
    title: "Strategy & Governance Architect",
    description: "In-depth reasoning, automated workflow design, enterprise data policies, and complex scenarios.",
    iconName: "BrainCircuit",
    defaultModel: "gemini-3.1-pro-preview",
    systemInstruction: "You are an enterprise cloud solutions architect and data governance expert. You specialize in complex file classification, access control policies, multi-tier backup replication strategies, API automation scripts, and large-scale data migration plans. Provide comprehensive, reasoned, and structured technical advice."
  },
  {
    id: "productivity_coach",
    title: "Productivity & Task Coach",
    description: "Turn file chaos into actionable Google Tasks, deadlines, priorities, and daily review routines.",
    iconName: "CheckSquare",
    defaultModel: "gemini-3.8-flash",
    systemInstruction: "You are an executive productivity coach. You help the user break down messy projects into actionable Google Tasks, schedule realistic review reminders, prioritize pending documents, and maintain high personal efficiency."
  },
  {
    id: "custom",
    title: "Custom Role",
    description: "Define your own specific system instruction and model configuration.",
    iconName: "Sliders",
    defaultModel: "gemini-3.8-flash",
    systemInstruction: "You are an adaptable AI assistant for Google Drive and productivity."
  }
];

const PROMPT_CHIPS = [
  "How should I structure folders for personal taxes and invoices?",
  "Recommend a standard file naming convention for client projects",
  "What is the best weekly checklist to prevent Google Drive clutter?",
  "How do I organize shared team documents to avoid accidental deletions?"
];

export default function GeminiChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-msg",
      role: "model",
      content: "Hello! I am your AI Drive Companion powered by Gemini. You can ask me how to organize your folders, suggest file naming standards, write cleanup checklists, or select different specialized AI roles to assist your workflow.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: "gemini-3.8-flash"
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("drive_expert");
  const [selectedModel, setSelectedModel] = useState<GeminiChatModel>("gemini-3.8-flash");
  const [customInstruction, setCustomInstruction] = useState(ROLE_PRESETS[0].systemInstruction);
  const [showRoleConfig, setShowRoleConfig] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSelectPreset = (preset: ChatRolePreset) => {
    setSelectedPresetId(preset.id);
    setSelectedModel(preset.defaultModel);
    setCustomInstruction(preset.systemInstruction);
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

        const text = await response.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/chat error:", fetchErr);
      }

      if (!data || !data.reply) {
        throw new Error(data?.error || "AI assistant is temporarily busy or reconnecting. Please try again in a moment.");
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
      setApiError(err.message || "Failed to contact Gemini chatbot.");
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

  const handleClearHistory = () => {
    if (confirm("Clear conversation history and start fresh?")) {
      setMessages([
        {
          id: `initial-${Date.now()}`,
          role: "model",
          content: "Conversation history reset. How can I assist you with your Google Drive or workflow today?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: selectedModel
        }
      ]);
      setApiError(null);
    }
  };

  const handleExportTranscript = () => {
    const transcript = messages
      .map(m => `[${m.timestamp}] ${m.role === 'user' ? 'You' : `Gemini (${m.modelUsed || 'AI'})`}:\n${m.content}\n`)
      .join("\n---\n\n");
    
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gemini-drive-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activePreset = ROLE_PRESETS.find(p => p.id === selectedPresetId) || ROLE_PRESETS[0];

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-violet-50/50 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                <Bot className="h-5 w-5" />
              </span>
              <h2 className="font-display font-bold text-slate-900 text-xl tracking-tight">
                Gemini Multi-Turn Chatbot
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                {selectedModel}
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Engage in multi-turn conversations with customizable system instructions. Switch roles to match your task — from lightning-fast answers to deep enterprise drive architecture.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowRoleConfig(!showRoleConfig)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                showRoleConfig 
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Role & Model Settings
            </button>
            <button
              onClick={handleExportTranscript}
              title="Export conversation history"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              onClick={handleClearHistory}
              title="Clear conversation"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 transition cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* Role & Model Drawer / Config */}
        {showRoleConfig && (
          <div className="mt-4 pt-4 border-t border-indigo-100 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Select Chatbot Persona & Role
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {ROLE_PRESETS.map(preset => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset)}
                      className={`p-3 rounded-xl border transition cursor-pointer text-left ${
                        isSelected 
                          ? "bg-indigo-50/90 border-indigo-500 shadow-xs ring-1 ring-indigo-500" 
                          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                          {preset.id === "drive_expert" && <FolderTree className="h-3.5 w-3.5 text-indigo-600" />}
                          {preset.id === "fast_assistant" && <Zap className="h-3.5 w-3.5 text-amber-600" />}
                          {preset.id === "complex_architect" && <BrainCircuit className="h-3.5 w-3.5 text-purple-600" />}
                          {preset.id === "productivity_coach" && <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />}
                          {preset.id === "custom" && <Sliders className="h-3.5 w-3.5 text-slate-600" />}
                          {preset.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {preset.defaultModel.replace("gemini-", "")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Gemini Model Tier
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as GeminiChatModel)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="gemini-3.8-flash">gemini-3.8-flash (General Tasks / Default)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Tasks / Low Latency)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Complex Tasks / Deep Reasoning)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Selected tier applies to future messages in this thread.
                </p>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Active System Instruction
                  </label>
                  <button
                    onClick={() => setCustomInstruction(activePreset.systemInstruction)}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset to preset default
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-none font-sans"
                  placeholder="Define the role, rules, and personality for Gemini..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col h-[580px] overflow-hidden">
        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50/40">
          {messages.map((msg, mIdx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={`chat-msg-${msg.id}-${mIdx}`}
                className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              >
                {/* Avatar */}
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-2xs ${
                    isUser
                      ? "bg-slate-900 text-white"
                      : "bg-indigo-600 text-white ring-2 ring-indigo-100"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Bubble */}
                <div className="space-y-1 max-w-[85%]">
                  <div className={`flex items-center gap-2 text-[11px] ${isUser ? "justify-end text-slate-500" : "text-slate-500"}`}>
                    <span className="font-semibold text-slate-700">
                      {isUser ? "You" : "Gemini"}
                    </span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                    {msg.modelUsed && !isUser && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px] border border-indigo-100">
                        {msg.modelUsed}
                      </span>
                    )}
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed shadow-2xs whitespace-pre-wrap break-words relative group ${
                      isUser
                        ? "bg-slate-900 text-white rounded-tr-none"
                        : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
                    }`}
                  >
                    {msg.content}

                    {/* Copy action button */}
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className={`absolute top-2 right-2 p-1 rounded-md transition opacity-0 group-hover:opacity-100 cursor-pointer ${
                        isUser
                          ? "bg-slate-800 text-slate-300 hover:text-white"
                          : "bg-slate-100 text-slate-500 hover:text-slate-800"
                      }`}
                      title="Copy text"
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading bubble */}
          {isLoading && (
            <div className="flex gap-3 max-w-3xl mr-auto">
              <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-2xs flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Gemini is thinking</span>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-bounce"></span>
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {apiError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 max-w-2xl mx-auto">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Chat response error</p>
                <p className="text-[11px] text-rose-700">{apiError}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompt Chips */}
        <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-indigo-500" /> Ideas:
          </span>
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              disabled={isLoading}
              className="shrink-0 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 rounded-lg px-2.5 py-1 transition cursor-pointer disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 md:p-4 bg-white border-t border-slate-200">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500 transition">
            <textarea
              ref={inputRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask Gemini (${activePreset.title}). Press Enter to send, Shift+Enter for new line...`}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent px-2 py-1 text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none max-h-28"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isLoading}
              className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 cursor-pointer shadow-xs"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1">
            <span>Role: <strong className="text-slate-600 font-medium">{activePreset.title}</strong></span>
            <span>Model: <strong className="text-slate-600 font-mono font-medium">{selectedModel}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
