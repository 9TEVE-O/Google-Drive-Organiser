import { DriveFile, FileDecision, OrganizerRule } from "../types";

/**
 * Autonomous Decision Engine for Google Drive Workspace
 * Transforms a passive inventory of files into an active, functioning decision system.
 * Eliminates "Unsorted" debt by classifying every single item into high-confidence categories,
 * computing actionable triage decisions, and generating explicit recommendations.
 */

export interface DecisionSystemMetrics {
  totalFiles: number;
  classifiedCount: number;
  unsortedCount: number;
  coveragePercentage: number;
  pendingActionsCount: number;
  relocationCandidatesCount: number;
  archiveCandidatesCount: number;
  highUrgencyCount: number;
  verifiedCount: number;
  categoryBreakdown: { [category: string]: number };
}

/**
 * Categorization heuristics & semantic keyword dictionaries
 */
const CATEGORY_DICTIONARIES: { [category: string]: { keywords: string[]; extensions: string[]; mimes: string[]; targetFolder: string } } = {
  "Financials & Billing": {
    keywords: [
      "invoice", "receipt", "billing", "tax", "w2", "1099", "payroll", "budget", "bill",
      "expense", "statement", "accounting", "ledger", "pnl", "financial", "salary",
      "reimbursement", "vendor", "payment", "bank", "stripe", "quickbooks", "quote"
    ],
    extensions: ["csv", "tsv", "xlsx", "xls"],
    mimes: ["application/vnd.google-apps.spreadsheet", "text/csv"],
    targetFolder: "Financials"
  },
  "Contracts & Legal": {
    keywords: [
      "contract", "agreement", "nda", "terms", "privacy", "compliance", "lease",
      "addendum", "settlement", "clause", "copyright", "trademark", "patent", "bylaws",
      "dpa", "service agreement", "msa", "sow", "amendment", "authorized"
    ],
    extensions: ["pdf", "docx", "doc"],
    mimes: ["application/pdf"],
    targetFolder: "Legal"
  },
  "Engineering & Code": {
    keywords: [
      "spec", "architecture", "api", "schema", "git", "docker", "k8s", "database",
      "query", "technical", "sprint", "bug", "feature", "rfc", "backend", "frontend",
      "endpoint", "sdk", "deploy", "build", "pipeline", "env", "sql", "migration"
    ],
    extensions: ["ts", "tsx", "js", "json", "py", "sh", "yaml", "yml", "sql", "md"],
    mimes: ["application/json", "text/plain", "text/markdown"],
    targetFolder: "Engineering"
  },
  "Operations & Projects": {
    keywords: [
      "roadmap", "project", "sprint", "meeting", "minutes", "notes", "checklist",
      "okr", "plan", "workflow", "agenda", "milestone", "team", "onboarding",
      "status report", "standup", "deliverable", "tracker", "action item"
    ],
    extensions: ["doc", "docx", "gdoc"],
    mimes: ["application/vnd.google-apps.document"],
    targetFolder: "Projects"
  },
  "Analytics & Data": {
    keywords: [
      "metrics", "performance", "forecast", "kpi", "report", "survey", "analysis",
      "dataset", "analytics", "churn", "retention", "conversion", "benchmark",
      "telemetry", "dashboard", "funnel", "summary", "experiment"
    ],
    extensions: ["xlsx", "csv", "json"],
    mimes: ["application/vnd.google-apps.spreadsheet"],
    targetFolder: "Analytics"
  },
  "Media & Assets": {
    keywords: [
      "design", "logo", "banner", "photo", "icon", "mockup", "video", "audio",
      "screenshot", "asset", "vector", "brand", "guideline", "poster", "artwork",
      "avatar", "hero", "graphic", "illustration", "figma"
    ],
    extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif", "mp4", "mov", "mp3"],
    mimes: ["image/", "video/", "audio/"],
    targetFolder: "Media"
  },
  "Personal & Records": {
    keywords: [
      "resume", "cv", "passport", "medical", "insurance", "travel", "flight",
      "itinerary", "hotel", "personal", "family", "certificate", "license",
      "id", "vaccine", "vacation", "health", "estate"
    ],
    extensions: ["pdf", "jpg", "png"],
    mimes: ["application/pdf", "image/"],
    targetFolder: "Personal"
  },
  "Archives & Backups": {
    keywords: [
      "archive", "backup", "old", "deprecated", "dump", "historical", "legacy",
      "2018", "2019", "2020", "2021", "2022", "2023", "bak", "temp", "trash"
    ],
    extensions: ["zip", "tar", "gz", "bak"],
    mimes: ["application/zip", "application/x-tar"],
    targetFolder: "Archives"
  }
};

/**
 * Evaluates an individual file and produces a high-confidence Category, Tags, Relevance,
 * and an actionable Triage Decision with rationale.
 */
export const evaluateFileDecision = (file: DriveFile, rules: OrganizerRule[] = []): DriveFile => {
  const name = (file.name || "").toLowerCase();
  const mime = (file.mimeType || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  const isFolder = mime === "application/vnd.google-apps.folder";

  // 1. Check custom user rules first
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const kw = rule.keyword?.trim().toLowerCase();
    if (kw && name.includes(kw)) {
      const category = rule.targetCategory || "Operations & Projects";
      const targetFolder = category.split("&")[0].trim();
      const decision: FileDecision = {
        action: `Move to /${targetFolder}`,
        decisionType: "relocate",
        targetFolder,
        confidence: 96,
        urgency: "high",
        rationale: `Matched user-defined rule "${rule.keyword}" targeting category ${category}.`,
        status: "recommended"
      };

      return {
        ...file,
        category,
        tags: Array.from(new Set([...(file.tags || []), kw, targetFolder.toLowerCase(), "custom-rule"])),
        relevance: 95,
        decision,
        decisionAction: decision.action,
        decisionRationale: decision.rationale
      };
    }
  }

  // 2. Score across built-in semantic dictionaries
  let bestCategory = "";
  let highestScore = 0;
  let detectedTargetFolder = "General";
  let matchedKeyword = "";

  for (const [category, dict] of Object.entries(CATEGORY_DICTIONARIES)) {
    let score = 0;

    // Keyword matching in name
    for (const kw of dict.keywords) {
      if (name.includes(kw)) {
        score += 35;
        if (!matchedKeyword) matchedKeyword = kw;
      }
    }

    // Extension matching
    if (ext && dict.extensions.includes(ext)) {
      score += 20;
    }

    // MIME type matching
    for (const m of dict.mimes) {
      if (mime.includes(m)) {
        score += 15;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestCategory = category;
      detectedTargetFolder = dict.targetFolder;
    }
  }

  // 3. Fallback resolution if keyword score is low
  if (!bestCategory || highestScore === 0) {
    if (isFolder) {
      bestCategory = "Operations & Projects";
      detectedTargetFolder = "Projects";
      highestScore = 30;
    } else if (mime.includes("spreadsheet") || ext === "csv" || ext === "xlsx") {
      bestCategory = "Analytics & Data";
      detectedTargetFolder = "Analytics";
      highestScore = 40;
    } else if (mime.includes("pdf")) {
      bestCategory = "Contracts & Legal";
      detectedTargetFolder = "Legal";
      highestScore = 35;
    } else if (mime.includes("image")) {
      bestCategory = "Media & Assets";
      detectedTargetFolder = "Media";
      highestScore = 40;
    } else {
      bestCategory = "General Documents";
      detectedTargetFolder = "Documents";
      highestScore = 25;
    }
  }

  // 4. Calculate Decision Type, Action, and Urgency
  let decisionType: FileDecision["decisionType"] = "relocate";
  let action = `Relocate to /${detectedTargetFolder}`;
  let urgency: FileDecision["urgency"] = "medium";
  let rationale = `Identified as ${bestCategory} resource. Recommended automated filing to /${detectedTargetFolder}.`;

  // Age / Stale File Detection (> 180 days)
  if (file.modifiedTime || file.createdTime) {
    const fileDate = new Date(file.modifiedTime || file.createdTime || Date.now());
    const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 3600 * 24);
    if (daysOld > 180 && !isFolder) {
      decisionType = "archive";
      detectedTargetFolder = "Archives";
      action = `Archive Stale Resource (>180d)`;
      urgency = "low";
      rationale = `Item has had no activity for over 180 days. Recommend cold storage in /Archives to reduce clutter.`;
    }
  }

  // High priority for financial, tax, or legal agreements
  if (bestCategory === "Financials & Billing" || bestCategory === "Contracts & Legal") {
    urgency = "high";
    rationale = `High-compliance ${bestCategory} record requires structured indexing in /${detectedTargetFolder}.`;
  }

  // Check if already in target folder
  const currentParentId = file.parents?.[0];
  if (currentParentId && currentParentId.toLowerCase().includes(detectedTargetFolder.toLowerCase())) {
    decisionType = "verified";
    action = `Verified in Location`;
    urgency = "low";
    rationale = `Resource is already correctly catalogued within /${detectedTargetFolder}.`;
  }

  // Confidence & Relevance calculation
  const confidence = Math.min(Math.max(highestScore + 45, 70), 98);
  const relevance = Math.min(Math.max(highestScore + 50, 60), 95);

  // Generate clean tags
  const generatedTags = Array.from(new Set([
    ...(file.tags || []),
    bestCategory.split("&")[0].trim().toLowerCase(),
    matchedKeyword || ext || "document",
    urgency === "high" ? "priority" : "standard"
  ])).filter(Boolean);

  const decision: FileDecision = {
    action,
    decisionType,
    targetFolder: detectedTargetFolder,
    confidence,
    urgency,
    rationale,
    status: decisionType === "verified" ? "applied" : "recommended"
  };

  return {
    ...file,
    category: bestCategory,
    tags: generatedTags,
    relevance,
    decision,
    decisionAction: decision.action,
    decisionRationale: decision.rationale
  };
};

/**
 * Runs the Decision Engine across a collection of Drive files, guaranteeing 100% classification coverage.
 */
export const evaluateFilesBatch = (files: DriveFile[], rules: OrganizerRule[] = []): DriveFile[] => {
  return files.map(file => evaluateFileDecision(file, rules));
};

/**
 * Computes live operational metrics for the Decision System
 */
export const getDecisionSystemMetrics = (files: DriveFile[]): DecisionSystemMetrics => {
  const totalFiles = files.length;
  if (totalFiles === 0) {
    return {
      totalFiles: 0,
      classifiedCount: 0,
      unsortedCount: 0,
      coveragePercentage: 100,
      pendingActionsCount: 0,
      relocationCandidatesCount: 0,
      archiveCandidatesCount: 0,
      highUrgencyCount: 0,
      verifiedCount: 0,
      categoryBreakdown: {}
    };
  }

  let classifiedCount = 0;
  let unsortedCount = 0;
  let pendingActionsCount = 0;
  let relocationCandidatesCount = 0;
  let archiveCandidatesCount = 0;
  let highUrgencyCount = 0;
  let verifiedCount = 0;
  const categoryBreakdown: { [category: string]: number } = {};

  for (const rawFile of files) {
    // If not classified or missing decision, evaluate dynamically
    const f = (!rawFile.category || rawFile.category === "Unsorted" || !rawFile.decision)
      ? evaluateFileDecision(rawFile)
      : rawFile;

    const cat = f.category || "General Documents";
    classifiedCount++;
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

    const dec = f.decision;
    if (dec) {
      if (dec.urgency === "high") {
        highUrgencyCount++;
      }
      if (dec.decisionType === "relocate") {
        relocationCandidatesCount++;
        pendingActionsCount++;
      } else if (dec.decisionType === "archive") {
        archiveCandidatesCount++;
        pendingActionsCount++;
      } else if (dec.decisionType === "verified") {
        verifiedCount++;
      }
    }
  }

  const coveragePercentage = totalFiles > 0 ? Math.round((classifiedCount / totalFiles) * 100) : 100;

  return {
    totalFiles,
    classifiedCount,
    unsortedCount: 0,
    coveragePercentage,
    pendingActionsCount,
    relocationCandidatesCount,
    archiveCandidatesCount,
    highUrgencyCount,
    verifiedCount,
    categoryBreakdown
  };
};
