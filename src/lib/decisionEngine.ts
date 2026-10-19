import {
  DriveFile,
  FileDecision,
  OrganizerRule,
  ExtractedContentMetadata,
  DriveFolderNode,
  StagingDiffRow,
  TaxonomyCustomisationConfig
} from "../types";

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
      "reimbursement", "vendor", "payment", "bank", "stripe", "quickbooks", "quote", "fee"
    ],
    extensions: ["csv", "tsv", "xlsx", "xls"],
    mimes: ["application/vnd.google-apps.spreadsheet", "text/csv"],
    targetFolder: "Financials & Billing"
  },
  "Legal & Contracts": {
    keywords: [
      "contract", "agreement", "nda", "terms", "privacy", "compliance", "lease",
      "addendum", "settlement", "clause", "copyright", "trademark", "patent", "bylaws",
      "dpa", "service agreement", "msa", "sow", "amendment", "authorized", "statutory", "policy"
    ],
    extensions: ["pdf", "docx", "doc"],
    mimes: ["application/pdf"],
    targetFolder: "Legal & Contracts"
  },
  "Project Operations": {
    keywords: [
      "spec", "architecture", "api", "schema", "roadmap", "project", "sprint", "meeting",
      "minutes", "notes", "checklist", "okr", "plan", "workflow", "agenda", "milestone",
      "status report", "standup", "deliverable", "tracker", "action item", "technical",
      "rfc", "backend", "frontend", "pipeline", "migration", "brief", "task"
    ],
    extensions: ["ts", "tsx", "js", "json", "py", "sh", "yaml", "yml", "sql", "md", "doc", "docx", "gdoc"],
    mimes: ["application/json", "text/plain", "text/markdown", "application/vnd.google-apps.document"],
    targetFolder: "Project Operations"
  },
  "Marketing & Assets": {
    keywords: [
      "design", "logo", "banner", "photo", "icon", "mockup", "video", "audio",
      "screenshot", "asset", "vector", "brand", "guideline", "poster", "artwork",
      "avatar", "hero", "graphic", "illustration", "figma", "press", "release", "copywriting"
    ],
    extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif", "mp4", "mov", "mp3"],
    mimes: ["image/", "video/", "audio/"],
    targetFolder: "Marketing & Assets"
  },
  "HR & Operations": {
    keywords: [
      "resume", "cv", "job", "description", "contractor", "onboarding", "performance",
      "review", "interview", "handbook", "benefits", "employee", "team", "guide"
    ],
    extensions: ["pdf", "docx", "doc"],
    mimes: ["application/pdf", "application/vnd.google-apps.document"],
    targetFolder: "HR & Operations"
  },
  "Archives & Backups": {
    keywords: [
      "archive", "backup", "old", "deprecated", "dump", "historical", "legacy",
      "2018", "2019", "2020", "2021", "2022", "2023", "bak", "temp", "trash", "zip", "snapshot", "superseded"
    ],
    extensions: ["zip", "tar", "gz", "bak", "rar", "7z"],
    mimes: ["application/zip", "application/x-tar", "application/gzip"],
    targetFolder: "Archives & Backups"
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
      const category = rule.targetCategory || "Project Operations";
      const targetFolder = rule.targetFolder || category;
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
  let detectedTargetFolder = "Project Operations";
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
      bestCategory = "Project Operations";
      detectedTargetFolder = "Project Operations";
      highestScore = 30;
    } else if (mime.includes("spreadsheet") || ext === "csv" || ext === "xlsx") {
      bestCategory = "Financials & Billing";
      detectedTargetFolder = "Financials & Billing";
      highestScore = 40;
    } else if (mime.includes("pdf")) {
      bestCategory = "Legal & Contracts";
      detectedTargetFolder = "Legal & Contracts";
      highestScore = 35;
    } else if (mime.includes("image")) {
      bestCategory = "Marketing & Assets";
      detectedTargetFolder = "Marketing & Assets";
      highestScore = 40;
    } else {
      bestCategory = "Project Operations";
      detectedTargetFolder = "Project Operations";
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
      detectedTargetFolder = "Archives & Backups";
      action = `Archive Stale Resource (>180d)`;
      urgency = "low";
      rationale = `Item has had no activity for over 180 days. Recommend cold storage in /Archives & Backups.`;
    }
  }

  // High priority for financial, tax, or legal agreements
  if (bestCategory === "Financials & Billing" || bestCategory === "Legal & Contracts") {
    urgency = "high";
    rationale = `High-compliance ${bestCategory} record requires structured indexing in /${detectedTargetFolder}.`;
  }

  // H-02: Check if the file's parent ID matches a known folder ID or name for the target category
  const currentParentId = file.parents?.[0];
  
  // Attempt to resolve parent name if possible or assume currentParentId might be a name in simulation
  const isAlreadyInTarget = currentParentId && (
    currentParentId.toLowerCase() === detectedTargetFolder.toLowerCase() ||
    currentParentId === file.id
  );

  if (isAlreadyInTarget) {
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

// ---------------------------------------------------------------------------
// GOOGLE DRIVE CONTENT INTELLIGENCE & TAXONOMY ENGINE (TWO-PHASE STAGING)
// ---------------------------------------------------------------------------

export const DEFAULT_TAXONOMY_CONFIG: TaxonomyCustomisationConfig = {
  namingConvention: "[YYYY-MM-DD] - [Entity] - [Subject]",
  datePlacement: "prefix",
  maxFolderDepth: 3,
  reuseThreshold: 0.85,
  protectedPaths: ["/Archive", "/Templates", "/.drive_appdata"],
  sessionOverrides: {}
};

const KNOWN_ENTITIES: Array<{ pattern: RegExp; canonical: string; category: string }> = [
  { pattern: /\b(ato|australian taxation office|notice of assessment|mygov)\b/i, canonical: "ATO", category: "Financials & Billing" },
  { pattern: /\b(telstra|telstra corporation)\b/i, canonical: "Telstra", category: "Financials & Billing" },
  { pattern: /\b(bunnings|bunnings warehouse|wesfarmers)\b/i, canonical: "Bunnings", category: "Financials & Billing" },
  { pattern: /\b(project atlas|atlas platform)\b/i, canonical: "Project Atlas", category: "Project Operations" },
  { pattern: /\b(personal ai os|ai-os|ai os)\b/i, canonical: "Personal AI OS", category: "Project Operations" },
  { pattern: /\b(commonwealth bank|commbank|cba)\b/i, canonical: "CommBank", category: "Financials & Billing" },
  { pattern: /\b(stripe|stripe payments)\b/i, canonical: "Stripe", category: "Financials & Billing" },
  { pattern: /\b(aws|amazon web services)\b/i, canonical: "AWS", category: "Project Operations" },
  { pattern: /\b(xero|quickbooks|myob)\b/i, canonical: "Xero", category: "Financials & Billing" },
  { pattern: /\b(optus|vodafone)\b/i, canonical: "Optus", category: "Financials & Billing" },
  { pattern: /\b(medicare|services australia)\b/i, canonical: "Medicare", category: "HR & Operations" }
];

const DOCUMENT_TYPE_PATTERNS: Array<{ pattern: RegExp; docType: string }> = [
  { pattern: /\b(notice of assessment|tax return|tax statement|bas statement|group certificate|payg)\b/i, docType: "Tax Return" },
  { pattern: /\b(tax invoice|invoice|remittance|bill|billing statement)\b/i, docType: "Invoice" },
  { pattern: /\b(receipt|proof of purchase|payment confirmation)\b/i, docType: "Receipt" },
  { pattern: /\b(master services agreement|msa|non-disclosure|nda|contract|deed|lease agreement|service agreement)\b/i, docType: "Contract" },
  { pattern: /\b(architecture|specification|spec|rfc|technical design|system design|schema)\b/i, docType: "Specification" },
  { pattern: /\b(meeting notes|minutes|standup|retrospective|agenda)\b/i, docType: "Meeting Notes" },
  { pattern: /\b(roadmap|okr|project plan|sprint plan|proposal)\b/i, docType: "Project Plan" },
  { pattern: /\b(onboarding|resume|cv|position description|handbook)\b/i, docType: "HR Document" }
];

/**
 * Checks whether a path is a protected directory (/Archive, /Templates, /.drive_appdata, etc.)
 */
export const isProtectedDirectory = (
  folderPath: string,
  protectedPaths: string[] = DEFAULT_TAXONOMY_CONFIG.protectedPaths
): boolean => {
  if (!folderPath) return false;
  const normalized = ("/" + folderPath.trim().replace(/^\/+/, "").replace(/\/+$/, "")).toLowerCase();
  return protectedPaths.some(p => {
    const normProt = ("/" + p.trim().replace(/^\/+/, "").replace(/\/+$/, "")).toLowerCase();
    return normalized === normProt || normalized.startsWith(normProt + "/");
  });
};

/**
 * Extracts ISO 8601 date (YYYY-MM-DD) from raw document content, headers, or metadata.
 */
export const extractCanonicalDateFromContent = (rawText: string, file: DriveFile): string => {
  const combined = `${rawText}\n${file.name || ""}`;

  // 1. Explicit ISO 8601 date: YYYY-MM-DD
  const isoMatch = combined.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Australian / UK date format: DD/MM/YYYY or DD-MM-YYYY
  const auMatch = combined.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (auMatch) {
    const day = String(auMatch[1]).padStart(2, "0");
    const month = String(auMatch[2]).padStart(2, "0");
    return `${auMatch[3]}-${month}-${day}`;
  }

  // 3. Australian Financial Year notation: FY25 / FY2025 -> 2025-06-30
  const fyMatch = combined.match(/\bFY\s*20?(\d{2})\b/i);
  if (fyMatch) {
    return `20${fyMatch[1]}-06-30`;
  }

  // 4. Quarter notation: Q1-Q4 2024/2025/2026
  const qMatch = combined.match(/\bQ([1-4])\s*(20\d{2})\b/i);
  if (qMatch) {
    const qMonthMap: Record<string, string> = { "1": "03-31", "2": "06-30", "3": "09-30", "4": "12-31" };
    return `${qMatch[2]}-${qMonthMap[qMatch[1]] || "06-30"}`;
  }

  // 5. Fallback to file modifiedTime or createdTime
  const fallbackDate = file.modifiedTime || file.createdTime;
  if (fallbackDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackDate)) {
    return fallbackDate.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
};

/**
 * Deep Content Ingestion Protocol:
 * Classifies files using their actual text content (not relying solely on opaque file names like "Scan_001.pdf" or "Untitled Document").
 */
export const extractDeepContentMetadata = (
  file: DriveFile,
  rawTextOverride?: string,
  tokenLimit = 2000
): ExtractedContentMetadata => {
  const rawContent = (rawTextOverride ?? file.content ?? "").trim();
  // Sample first ~2,000 tokens (~8,000 characters)
  const charLimit = Math.max(500, tokenLimit * 4);
  const sampledText = rawContent.slice(0, charLimit);
  const sampledTokensCount = sampledText
    ? sampledText.split(/\s+/).filter(Boolean).length
    : 0;

  const isOpaqueName = /^(scan[_\-\s]*\d+|img[_\-\s]*\d+|untitled|document\s*\d*|copy of|new\s+file|page\s*\d+)/i.test(
    file.name.replace(/\.[^.]+$/, "")
  );

  // Combine sampled text first (highest priority), followed by filename if not opaque
  const corpus = sampledText
    ? `${sampledText}\n${isOpaqueName ? "" : file.name}`
    : `${file.name} ${file.decisionRationale || ""} ${(file.tags || []).join(" ")}`;

  // 1. Extract Primary Entity / Vendor / Organisation
  let primaryEntity = "";
  for (const item of KNOWN_ENTITIES) {
    if (item.pattern.test(corpus)) {
      primaryEntity = item.canonical;
      break;
    }
  }

  if (!primaryEntity && sampledText) {
    const headerMatch = sampledText.match(
      /(?:vendor|issuer|organisation|organization|client|customer|project|from|company|authority)\s*[:\-]\s*([A-Z][A-Za-z0-9 &.\-]{1,32})/i
    );
    if (headerMatch?.[1]) {
      primaryEntity = headerMatch[1].trim();
    }
  }

  if (!primaryEntity) {
    // Derive from non-opaque filename tokens or category
    if (!isOpaqueName) {
      const cleanTokens = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[_\-]+/g, " ")
        .replace(/\b20\d{2}\b/g, "")
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 2 && !/^(the|and|for|with|draft|final|v\d+|rev)$/i.test(w));
      if (cleanTokens.length > 0) {
        primaryEntity = cleanTokens
          .slice(0, 2)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    }
    if (!primaryEntity) {
      primaryEntity = file.category?.split("&")[0]?.trim() || "General Workspace";
    }
  }

  // 2. Extract Document Type
  let documentType = "";
  for (const dt of DOCUMENT_TYPE_PATTERNS) {
    if (dt.pattern.test(corpus)) {
      documentType = dt.docType;
      break;
    }
  }
  if (!documentType) {
    const mime = (file.mimeType || "").toLowerCase();
    if (mime.includes("spreadsheet") || /\.xlsx?|\.csv$/i.test(file.name)) {
      documentType = "Financial Schedule";
    } else if (mime.includes("presentation") || /\.pptx?$/i.test(file.name)) {
      documentType = "Presentation Deck";
    } else if (mime.includes("pdf")) {
      documentType = "Statement / Record";
    } else if (mime.includes("folder")) {
      documentType = "Directory";
    } else {
      documentType = "Specification";
    }
  }

  // 3. Extract Canonical Date (ISO 8601: YYYY-MM-DD)
  const canonicalDate = extractCanonicalDateFromContent(sampledText, file);

  // 4. Extract Core Subject Summary (5-10 words describing what the document actually covers)
  let coreSubject = "";
  if (sampledText) {
    // Look for an explicit Subject/Title/Re line in the text
    const subjectLine = sampledText.match(/(?:subject|title|re|matter|summary|topic)\s*[:\-]\s*([^\r\n]{10,90})/i);
    if (subjectLine?.[1]) {
      const words = subjectLine[1].trim().split(/\s+/).slice(0, 9);
      coreSubject = words.join(" ");
    } else {
      // Take the first meaningful sentence/line from the document body
      const firstMeaningfulLine = sampledText
        .split(/[\r\n]+/)
        .map(l => l.replace(/^[#*\->\s]+/, "").trim())
        .find(l => l.split(/\s+/).length >= 4 && !/^(date|page|id|abn|acn)\b/i.test(l));
      if (firstMeaningfulLine) {
        const words = firstMeaningfulLine.split(/\s+/).slice(0, 8);
        coreSubject = words.join(" ");
      }
    }
  }

  if (!coreSubject) {
    const yearStr = canonicalDate.slice(0, 4);
    const cleanedName = isOpaqueName
      ? `${primaryEntity} ${documentType}`
      : file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_\-]+/g, " ")
          .trim();
    const rawWords = `${primaryEntity} ${documentType} - ${cleanedName} (${yearStr})`
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    coreSubject = rawWords.slice(0, 8).join(" ");
  }

  const mime = (file.mimeType || "").toLowerCase();
  const extractionMethod: ExtractedContentMetadata["extractionMethod"] = sampledText
    ? mime.includes("google-apps")
      ? "workspace_export"
      : mime.includes("pdf") || mime.includes("image")
      ? "binary_ocr_sample"
      : "content_stream"
    : "heuristic_fallback";

  return {
    primaryEntity,
    documentType,
    canonicalDate,
    coreSubject,
    sampledTokensCount,
    extractedTextSnippet: sampledText ? sampledText.slice(0, 240) : undefined,
    extractionMethod
  };
};

/**
 * Computes semantic match score (0.0 to 0.99) between extracted content metadata and an existing folder node.
 * Operational Invariant: Always reuse existing folders before creating new ones if score >= 0.85.
 */
export const computeFolderSemanticSimilarity = (
  metadata: ExtractedContentMetadata,
  fileCategory: string,
  folder: DriveFolderNode
): number => {
  if (folder.isProtected) return 0;

  const folderPathLower = folder.path.toLowerCase();
  const folderNameLower = folder.name.toLowerCase();
  const entityLower = metadata.primaryEntity.toLowerCase();
  const docTypeLower = metadata.documentType.toLowerCase();
  const subjectLower = metadata.coreSubject.toLowerCase();
  const categoryLower = (fileCategory || "").toLowerCase();
  const year = metadata.canonicalDate.slice(0, 4);

  let score = 0;

  // Exact entity match in folder path or name
  if (entityLower && entityLower.length > 2 && (folderPathLower.includes(entityLower) || folderNameLower.includes(entityLower))) {
    score += 0.52;
  }

  // Exact document type or pluralized type in folder path
  const docTypeRoot = docTypeLower.split(/\s+/)[0];
  if (docTypeRoot && folderPathLower.includes(docTypeRoot)) {
    score += 0.36;
  }

  // Exact category match (e.g., Financials & Billing, Legal & Contracts, Project Operations)
  if (categoryLower && (folderNameLower === categoryLower || folderPathLower.includes(categoryLower.split("&")[0].trim()))) {
    score += 0.48;
  }

  // Domain semantic synonyms
  if (
    (docTypeLower.includes("tax") || docTypeLower.includes("invoice") || docTypeLower.includes("receipt") || entityLower === "ato") &&
    /\b(tax|taxes|financial|financials|billing|invoices|accounting|accounts)\b/i.test(folderPathLower)
  ) {
    score += 0.42;
  }

  if (
    (docTypeLower.includes("spec") || docTypeLower.includes("project") || docTypeLower.includes("meeting")) &&
    /\b(project|projects|specs|engineering|operations|architecture)\b/i.test(folderPathLower)
  ) {
    score += 0.40;
  }

  if (
    docTypeLower.includes("contract") &&
    /\b(legal|contracts|agreements|compliance)\b/i.test(folderPathLower)
  ) {
    score += 0.45;
  }

  // Year match bonus
  if (folderPathLower.includes(year)) {
    score += 0.12;
  }

  // Keyword overlap with subject
  const subjectWords = subjectLower.split(/\W+/).filter(w => w.length > 3);
  for (const w of subjectWords) {
    if (folderPathLower.includes(w)) {
      score += 0.08;
    }
  }

  return Math.min(0.98, Number(score.toFixed(2)));
};

/**
 * Formats a clean file name respecting user customisation rules (Naming Convention & Date Placement)
 */
export const formatProposedFileName = (
  originalName: string,
  metadata: ExtractedContentMetadata,
  config: TaxonomyCustomisationConfig = DEFAULT_TAXONOMY_CONFIG
): string => {
  if (config.namingConvention === "preserve_original") {
    return originalName;
  }

  const extMatch = originalName.match(/(\.[a-zA-Z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1] : "";
  const baseOriginal = ext ? originalName.slice(0, -ext.length) : originalName;

  const cleanEntity = metadata.primaryEntity.replace(/[/\\?%*:|"<>]/g, "").trim();
  const cleanSubject = metadata.coreSubject
    .replace(/[/\\?%*:|"<>]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .trim();
  const dateStr = metadata.canonicalDate;

  if (config.namingConvention === "[Subject]_[OriginalName]") {
    const slugSubject = cleanSubject.replace(/\s+/g, "-");
    return config.datePlacement === "suffix"
      ? `${slugSubject}_${baseOriginal}_${dateStr}${ext}`
      : `${dateStr}_${slugSubject}_${baseOriginal}${ext}`;
  }

  if (config.namingConvention === "[Entity] - [Subject] - [YYYY-MM-DD]" || config.datePlacement === "suffix") {
    return `${cleanEntity} - ${cleanSubject} - ${dateStr}${ext}`;
  }

  // Default: [YYYY-MM-DD] - [Entity] - [Subject]
  return `${dateStr} - ${cleanEntity} - ${cleanSubject}${ext}`;
};

/**
 * Enforces max folder depth limit (default: 3 levels)
 */
export const enforceFolderDepthLimit = (folderPath: string, maxDepth = 3): string => {
  const segments = folderPath
    .split("/")
    .map(s => s.trim())
    .filter(Boolean);
  const clamped = segments.slice(0, Math.max(1, maxDepth));
  return "/" + clamped.join("/");
};

/**
 * Builds the Phase 1 Read-Only Staging Diff across inspected Drive files.
 * - Never proposes moves into or out of Protected Directories (/Archive, /Templates, /.drive_appdata)
 * - Reuses existing folders whenever semantic match >= config.reuseThreshold (0.85)
 * - Only proposes a New Folder if semantic match to every existing directory is strictly below 0.85
 */
export const buildStagingDiff = (
  files: DriveFile[],
  existingFolders: DriveFolderNode[],
  config: TaxonomyCustomisationConfig = DEFAULT_TAXONOMY_CONFIG,
  rules: OrganizerRule[] = []
): StagingDiffRow[] => {
  const threshold = config.reuseThreshold ?? 0.85;
  const maxDepth = config.maxFolderDepth ?? 3;
  const folderMapById = new Map<string, DriveFolderNode>();
  for (const f of existingFolders) {
    folderMapById.set(f.id, f);
  }

  // Detect existing organisational pattern from existing folders (e.g., Year-last vs Entity-first)
  const nonProtectedFolders = existingFolders.filter(
    f => !isProtectedDirectory(f.path, config.protectedPaths)
  );

  const rows: StagingDiffRow[] = [];

  for (const rawFile of files) {
    if (rawFile.mimeType === "application/vnd.google-apps.folder") continue;

    const evaluated = evaluateFileDecision(rawFile, rules);
    const metadata = rawFile.contentMetadata || extractDeepContentMetadata(evaluated);
    const parentId = rawFile.parents?.[0] || "root";
    const currentFolderNode = folderMapById.get(parentId);
    const currentFolderPath = currentFolderNode ? currentFolderNode.path : "Root (My Drive)";

    // Guard 1: Never propose moves out of protected directories
    if (currentFolderNode && isProtectedDirectory(currentFolderNode.path, config.protectedPaths)) {
      rows.push({
        fileId: rawFile.id,
        fileName: rawFile.name,
        detectedEntity: metadata.primaryEntity,
        detectedSubject: `${metadata.primaryEntity} - ${metadata.coreSubject}`,
        documentType: metadata.documentType,
        canonicalDate: metadata.canonicalDate,
        currentFolder: currentFolderPath,
        currentFolderId: parentId,
        proposedTargetFolder: currentFolderPath,
        proposedTargetFolderId: parentId,
        proposedName: rawFile.name,
        matchType: "Protected (Skipped)",
        confidence: 1.0,
        sampledTextSnippet: metadata.extractedTextSnippet,
        selected: false
      });
      continue;
    }

    // Check Session Overrides first (Interactive Correction Rule)
    const entityKey = metadata.primaryEntity.toLowerCase();
    const overridePath =
      config.sessionOverrides[rawFile.id] ||
      config.sessionOverrides[entityKey] ||
      config.sessionOverrides[metadata.documentType.toLowerCase()];

    if (overridePath && !isProtectedDirectory(overridePath, config.protectedPaths)) {
      const clampedOverride = enforceFolderDepthLimit(overridePath, maxDepth);
      const matchingExisting = nonProtectedFolders.find(
        f => f.path.toLowerCase() === clampedOverride.toLowerCase()
      );
      rows.push({
        fileId: rawFile.id,
        fileName: rawFile.name,
        detectedEntity: metadata.primaryEntity,
        detectedSubject: `${metadata.primaryEntity} - ${metadata.coreSubject}`,
        documentType: metadata.documentType,
        canonicalDate: metadata.canonicalDate,
        currentFolder: currentFolderPath,
        currentFolderId: parentId,
        proposedTargetFolder: clampedOverride,
        proposedTargetFolderId: matchingExisting?.id,
        proposedName: formatProposedFileName(rawFile.name, metadata, config),
        matchType: matchingExisting ? "Existing Folder" : "New Folder",
        confidence: 0.98,
        sampledTextSnippet: metadata.extractedTextSnippet,
        selected: true
      });
      continue;
    }

    // Level 1: Score against all active existing folders
    let bestFolder: DriveFolderNode | null = null;
    let bestScore = 0;

    for (const folder of nonProtectedFolders) {
      const score = computeFolderSemanticSimilarity(metadata, evaluated.category || "", folder);
      if (score > bestScore) {
        bestScore = score;
        bestFolder = folder;
      }
    }

    if (bestFolder && bestScore >= threshold) {
      // Reuse existing folder (Confidence >= 0.85)
      rows.push({
        fileId: rawFile.id,
        fileName: rawFile.name,
        detectedEntity: metadata.primaryEntity,
        detectedSubject: `${metadata.primaryEntity} - ${metadata.coreSubject}`,
        documentType: metadata.documentType,
        canonicalDate: metadata.canonicalDate,
        currentFolder: currentFolderPath,
        currentFolderId: parentId,
        proposedTargetFolder: enforceFolderDepthLimit(bestFolder.path, maxDepth),
        proposedTargetFolderId: bestFolder.id,
        proposedName: formatProposedFileName(rawFile.name, metadata, config),
        matchType: "Existing Folder",
        confidence: bestScore,
        sampledTextSnippet: metadata.extractedTextSnippet,
        selected: bestFolder.id !== parentId
      });
    } else {
      // Level 2: Semantic match to every existing directory is strictly < 0.85
      // Propose a clean New Folder following hierarchical conventions capped at maxFolderDepth
      const year = metadata.canonicalDate.slice(0, 4);
      const categoryBase = (evaluated.category || "Project Operations").split("&")[0].trim();
      const docPlural = metadata.documentType.endsWith("s")
        ? metadata.documentType
        : `${metadata.documentType}s`;

      let proposedRawPath = `/${categoryBase}/${metadata.primaryEntity}/${year}`;
      if (metadata.primaryEntity === "ATO" || metadata.documentType === "Tax Return") {
        proposedRawPath = `/Financial/Taxes/${year}`;
      } else if (metadata.documentType === "Specification" || categoryBase.includes("Project")) {
        proposedRawPath = `/Projects/${metadata.primaryEntity}/Specs`;
      } else if (metadata.documentType === "Invoice" || metadata.documentType === "Receipt") {
        proposedRawPath = `/Financial/${docPlural}/${year}`;
      }

      const clampedNewPath = enforceFolderDepthLimit(proposedRawPath, maxDepth);
      const proposedConfidence = Math.max(0.86, Math.min(0.94, Number(((bestScore || 0.72) + 0.16).toFixed(2))));

      rows.push({
        fileId: rawFile.id,
        fileName: rawFile.name,
        detectedEntity: metadata.primaryEntity,
        detectedSubject: `${metadata.primaryEntity} - ${metadata.coreSubject}`,
        documentType: metadata.documentType,
        canonicalDate: metadata.canonicalDate,
        currentFolder: currentFolderPath,
        currentFolderId: parentId,
        proposedTargetFolder: clampedNewPath,
        proposedTargetFolderId: undefined,
        proposedName: formatProposedFileName(rawFile.name, metadata, config),
        matchType: "New Folder",
        confidence: proposedConfidence,
        sampledTextSnippet: metadata.extractedTextSnippet,
        selected: true
      });
    }
  }

  return rows;
};

/**
 * Formats Phase 1 Staging Diff as the canonical Markdown table with confirmation footer.
 */
export const formatStagingDiffMarkdownTable = (rows: StagingDiffRow[]): string => {
  if (rows.length === 0) {
    return "No eligible files found to stage for organisation.";
  }

  const header = [
    "| File Name | Detected Entity & Subject | Current Folder | Proposed Target Folder | Match Type | Confidence |",
    "| :--- | :--- | :--- | :--- | :--- | :--- |"
  ];

  const body = rows.map(r => {
    const pct = `${Math.round(r.confidence * 100)}%`;
    return `| ${r.fileName} | ${r.detectedSubject} | ${r.currentFolder} | ${r.proposedTargetFolder} | ${r.matchType} | ${pct} |`;
  });

  return [
    ...header,
    ...body,
    "",
    "Review the proposed moves above. Reply **Confirm** to execute, or tell me which paths to adjust."
  ].join("\n");
};

