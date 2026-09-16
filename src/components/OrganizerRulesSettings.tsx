import React, { useState } from "react";
import { 
  Sliders, Plus, Trash2, Check, X, ArrowRight, RotateCcw, 
  Sparkles, Tag, Folder, ShieldCheck, AlertCircle, Info
} from "lucide-react";
import { OrganizerRule } from "../types";

export const DEFAULT_ORGANIZER_RULES: OrganizerRule[] = [
  {
    id: "rule_invoice",
    keyword: "Invoice",
    targetCategory: "Finance",
    targetFolder: "Work/Financials",
    enabled: true
  },
  {
    id: "rule_receipt",
    keyword: "Receipt",
    targetCategory: "Finance",
    targetFolder: "Work/Financials/Receipts",
    enabled: true
  },
  {
    id: "rule_tax",
    keyword: "Tax",
    targetCategory: "Finance",
    targetFolder: "Finance/Taxes",
    enabled: true
  },
  {
    id: "rule_contract",
    keyword: "Contract",
    targetCategory: "Legal",
    targetFolder: "Documents/Legal",
    enabled: true
  },
  {
    id: "rule_design",
    keyword: "Design",
    targetCategory: "Media",
    targetFolder: "Media/Designs",
    enabled: true
  }
];

const PRESET_SUGGESTIONS = [
  { keyword: "Invoice", category: "Finance", folder: "Work/Financials" },
  { keyword: "Tax", category: "Finance", folder: "Finance/Taxes" },
  { keyword: "Receipt", category: "Finance", folder: "Work/Financials/Receipts" },
  { keyword: "Contract", category: "Legal", folder: "Documents/Legal" },
  { keyword: "NDA", category: "Legal", folder: "Documents/Legal/NDAs" },
  { keyword: "Resume", category: "Personal", folder: "Documents/Career" },
  { keyword: "Sprint", category: "Projects", folder: "Work/Sprints" },
  { keyword: "Screenshot", category: "Media", folder: "Media/Screenshots" },
];

const COMMON_CATEGORIES = [
  "Finance",
  "Legal",
  "Work",
  "Projects",
  "Personal",
  "Media",
  "Education",
  "Archives"
];

interface OrganizerRulesSettingsProps {
  rules: OrganizerRule[];
  onSaveRules: (newRules: OrganizerRule[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrganizerRulesSettings({
  rules,
  onSaveRules,
  isOpen,
  onClose
}: OrganizerRulesSettingsProps) {
  const [keywordInput, setKeywordInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("Finance");
  const [folderInput, setFolderInput] = useState("Work/Financials");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCategoryChange = (newCat: string) => {
    setCategoryInput(newCat);
    // Suggest standard nested folder if user hasn't heavily customized
    if (!folderInput || folderInput.startsWith("Work/") || folderInput.startsWith("Documents/") || folderInput.startsWith("Media/") || folderInput.startsWith("Finance/")) {
      switch (newCat) {
        case "Finance":
          setFolderInput("Work/Financials");
          break;
        case "Legal":
          setFolderInput("Documents/Legal");
          break;
        case "Projects":
          setFolderInput("Work/Projects");
          break;
        case "Media":
          setFolderInput("Media/Assets");
          break;
        case "Personal":
          setFolderInput("Documents/Personal");
          break;
        case "Education":
          setFolderInput("Education/Courses");
          break;
        case "Archives":
          setFolderInput("Archives/2026");
          break;
        default:
          setFolderInput(`${newCat}/General`);
      }
    }
  };

  const handleAddRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const kw = keywordInput.trim();
    if (!kw) {
      setErrorMsg("Please enter a keyword to match (e.g., 'Invoice').");
      return;
    }

    // Check if duplicate keyword already exists
    const exists = rules.some(r => r.keyword.toLowerCase() === kw.toLowerCase());
    if (exists) {
      setErrorMsg(`A rule for keyword "${kw}" already exists.`);
      return;
    }

    const newRule: OrganizerRule = {
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      keyword: kw,
      targetCategory: categoryInput.trim() || "Finance",
      targetFolder: folderInput.trim() || `${categoryInput.trim() || 'Finance'}/General`,
      enabled: true
    };

    const updated = [...rules, newRule];
    onSaveRules(updated);
    setKeywordInput("");
    setErrorMsg(null);
    setSuccessMsg(`Added rule: "${kw}" -> ${newRule.targetCategory}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleApplyPreset = (preset: { keyword: string; category: string; folder: string }) => {
    const exists = rules.some(r => r.keyword.toLowerCase() === preset.keyword.toLowerCase());
    if (exists) {
      setErrorMsg(`A rule for "${preset.keyword}" already exists.`);
      return;
    }
    const newRule: OrganizerRule = {
      id: "rule_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      keyword: preset.keyword,
      targetCategory: preset.category,
      targetFolder: preset.folder,
      enabled: true
    };
    onSaveRules([...rules, newRule]);
    setErrorMsg(null);
    setSuccessMsg(`Added rule: "${preset.keyword}" -> ${preset.category}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleToggleRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: r.enabled === false ? true : false } : r);
    onSaveRules(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updated = rules.filter(r => r.id !== id);
    onSaveRules(updated);
  };

  const handleResetDefaults = () => {
    onSaveRules(DEFAULT_ORGANIZER_RULES);
    setSuccessMsg("Reset rules to standard default presets.");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const activeCount = rules.filter(r => r.enabled !== false).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="organizer-rules-settings-modal"
        className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-600 flex items-center justify-center shadow-2xs">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
                AI Keyword Priority Rules
                <span className="rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-semibold px-2 py-0.5">
                  {activeCount} Active
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Define custom keyword mappings (e.g., 'Invoice' -&gt; 'Finance') to prioritize Gemini's sorting logic.
              </p>
            </div>
          </div>

          <button
            id="btn-close-rules-settings"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            title="Close Settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* AI Banner Explainer */}
          <div className="rounded-xl border border-indigo-150 bg-indigo-50/50 p-3.5 flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-slate-600 leading-relaxed">
              <p className="font-semibold text-indigo-950 text-xs">
                How AI Prioritization Works
              </p>
              <p className="text-[11px] text-slate-600">
                When Gemini analyzes your files and prepares folder sort layouts, any filename matching an enabled keyword is automatically prioritized into your target category and destination directory, overriding generic defaults.
              </p>
            </div>
          </div>

          {/* Add Rule Form */}
          <form onSubmit={handleAddRule} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-indigo-600" /> Define New Keyword Rule
              </span>
              <span className="text-[10.5px] text-slate-400">Exact or substring match</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Keyword input */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[10.5px] font-medium text-slate-600 block">
                  Keyword (e.g. Invoice)
                </label>
                <div className="relative">
                  <input
                    id="input-rule-keyword"
                    type="text"
                    value={keywordInput}
                    onChange={(e) => { setKeywordInput(e.target.value); setErrorMsg(null); }}
                    placeholder="e.g. Invoice"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Target Category selector */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[10.5px] font-medium text-slate-600 block">
                  Target Category
                </label>
                <select
                  id="select-rule-category"
                  value={categoryInput}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                >
                  {COMMON_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="Custom">Custom...</option>
                </select>
              </div>

              {/* Target Destination Folder */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[10.5px] font-medium text-slate-600 block">
                  Destination Directory
                </label>
                <input
                  id="input-rule-folder"
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="e.g. Work/Financials"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Error or Success feedback */}
            {errorMsg && (
              <div className="text-[11px] text-rose-600 flex items-center gap-1.5 bg-rose-50 p-2 rounded-lg border border-rose-200">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="text-[11px] text-emerald-700 flex items-center gap-1.5 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                id="btn-add-keyword-rule"
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 active:scale-95 transition cursor-pointer shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Keyword Rule</span>
              </button>
            </div>
          </form>

          {/* Quick Preset Chips */}
          <div className="space-y-1.5">
            <span className="text-[10.5px] font-medium text-slate-500 block">
              Quick Suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SUGGESTIONS.map((sug) => {
                const isAlreadyPresent = rules.some(r => r.keyword.toLowerCase() === sug.keyword.toLowerCase());
                return (
                  <button
                    key={`sug-${sug.keyword}`}
                    type="button"
                    disabled={isAlreadyPresent}
                    onClick={() => handleApplyPreset(sug)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition cursor-pointer ${
                      isAlreadyPresent
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60"
                        : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
                    }`}
                  >
                    <span>+ {sug.keyword}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">{sug.category}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Existing Rules List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-150">
              <span className="font-semibold text-slate-800 text-xs">
                Active Priority Rules ({rules.length})
              </span>
              <button
                id="btn-reset-rules-defaults"
                type="button"
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                title="Reset to recommended standard rules"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset to Defaults</span>
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="p-6 text-center text-slate-400 rounded-xl border border-dashed border-slate-200">
                No custom keyword rules defined yet. Add one above or choose a suggestion.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {rules.map((rule) => {
                  const isEnabled = rule.enabled !== false;
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition ${
                        isEnabled
                          ? "bg-white border-slate-200 shadow-2xs"
                          : "bg-slate-50/60 border-slate-200/60 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Toggle Active Switch */}
                        <button
                          id={`toggle-rule-${rule.id}`}
                          type="button"
                          onClick={() => handleToggleRule(rule.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                            isEnabled ? "bg-indigo-600" : "bg-slate-300"
                          }`}
                          title={isEnabled ? "Disable rule" : "Enable rule"}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>

                        {/* Rule Description */}
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[11.5px] bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-200">
                            <Tag className="h-3 w-3 text-indigo-600" />
                            "{rule.keyword}"
                          </span>

                          <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />

                          <span className="inline-flex items-center gap-1 font-semibold text-[11.5px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {rule.targetCategory}
                          </span>

                          {rule.targetFolder && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 font-mono">
                              <Folder className="h-3 w-3 text-slate-400 shrink-0" />
                              {rule.targetFolder}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete Action */}
                      <button
                        id={`delete-rule-${rule.id}`}
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer shrink-0"
                        title="Delete this rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-150 bg-slate-50/80 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Priority rules are saved locally and synced with Gemini.
          </span>
          <button
            id="btn-done-rules-settings"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
