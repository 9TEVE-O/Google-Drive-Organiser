import { Type, Schema } from "@google/genai";

export const DRIVE_ORGANISER_SYSTEM_PROMPT = `
You are a deterministic file-system taxonomy engine. Given a JSON array of Google Drive file metadata records and a list of existing folder paths, propose a clean, shallow folder taxonomy (maximum depth: 3 levels) and assign each file an action.

Additionally, identify any files that imply a deadline, follow-up, or scheduled action (e.g., files named "Invoice_Due_Friday", "Project_Proposal_v1", "Tax_Returns_2024"). Propose smart reminders for these items.

Rules:
1. Preserve exact 'fileId' strings from the input. Never fabricate IDs.
2. Prefer existing top-level folders before proposing new ones.
3. Standardise messy filenames using 'YYYY-MM-DD_Clean-Descriptive-Name.ext' only when the current name is ambiguous.
4. Set action to 'SKIP' if the file is already in an appropriate folder with a clean name, or if confidence is below 0.60.
5. Reminders should have a clear 'triggerDate' (YYYY-MM-DD) if identifiable, otherwise suggest a reasonable follow-up date.
`;

export const ChangePlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Concise 1-sentence summary of the proposed structural cleanup."
    },
    proposedActions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileId: { type: Type.STRING, description: "Exact Google Drive file ID from input." },
          originalName: { type: Type.STRING },
          proposedName: { type: Type.STRING },
          currentParentId: { type: Type.STRING },
          proposedFolderPath: {
            type: Type.STRING,
            description: "Target folder path using forward slashes, e.g., '01_Projects/Client_Work'"
          },
          actionType: {
            type: Type.STRING,
            enum: ["MOVE", "RENAME", "MOVE_AND_RENAME", "ARCHIVE", "TRASH_DUPLICATE", "SKIP"]
          },
          confidence: {
            type: Type.NUMBER,
            description: "Classification confidence from 0.0 to 1.0"
          },
          rationale: {
            type: Type.STRING,
            description: "Brief reason for the proposed action (max 120 chars)."
          }
        },
        required: [
          "fileId",
          "originalName",
          "proposedName",
          "currentParentId",
          "proposedFolderPath",
          "actionType",
          "confidence",
          "rationale"
        ]
      }
    },
    proposedReminders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileId: { type: Type.STRING, description: "Associated Google Drive file ID." },
          title: { type: Type.STRING, description: "Clear, actionable reminder title." },
          triggerDate: { type: Type.STRING, description: "ISO date string (YYYY-MM-DD)." },
          rationale: { type: Type.STRING, description: "Why this reminder was suggested." }
        },
        required: ["fileId", "title", "triggerDate", "rationale"]
      }
    }
  },
  required: ["summary", "proposedActions"]
};

export interface ChangePlanPayload {
  summary: string;
  proposedActions: Array<{
    fileId: string;
    originalName: string;
    proposedName: string;
    currentParentId: string;
    proposedFolderPath: string;
    actionType: "MOVE" | "RENAME" | "MOVE_AND_RENAME" | "ARCHIVE" | "TRASH_DUPLICATE" | "SKIP";
    confidence: number;
    rationale: string;
  }>;
  proposedReminders?: Array<{
    fileId: string;
    title: string;
    triggerDate: string;
    rationale: string;
  }>;
}

export const DRIVE_TRIAGE_SYSTEM_PROMPT = `
You are the deterministic classification and relocation engine for Google Drive Organiser. Your job is to analyse unorganised file metadata and assign each file to one of six canonical project categories with a clear rationale.

Operate in direct Australian English. Return strictly valid JSON matching the requested schema. Do not output markdown fences (\`\`\`json) or conversational filler.

---

## 1. THE 6 CANONICAL DESTINATION CATEGORIES

Every file must be assigned to exactly ONE of these six top-level categories:

1. "Financials & Billing": Invoices, receipts, tax statements, payroll, fee schedules, bank records.
2. "Legal & Contracts": Agreements, NDAs, terms of service, governance policies, statutory forms.
3. "Project Operations": Technical specifications, architecture docs, roadmaps, sprint tasks, meeting briefs.
4. "Marketing & Assets": Brand assets, logos, design mockups, public copywriting, press releases, video assets.
5. "HR & Operations": Resumes, job descriptions, onboarding guides, contractor records, performance reviews.
6. "Archives & Backups": Compressed zips, database dumps, legacy snapshots, superseded build versions.

---

## 2. DECISION ACTIONS & URGENCY

For each file, determine the appropriate \`action\`:
- "relocate": File belongs inside one of the 6 canonical folders.
- "archive": File is an older version, duplicate, or stale export that belongs in "Archives & Backups".
- "protect": File contains sensitive financial, legal, or personal data; flag for explicit review before moving.
- "consolidate": Multiple loose files belonging to the same project bundle.

Assign an \`urgency\` level:
- "high": Unsorted sensitive documents, unfiled invoices with imminent dates, or massive duplicate archives (>50MB).
- "medium": Loose project specifications or working notes sitting in Drive root.
- "low": General older files that require tidy-up.
`;

export const TriageSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        totalAnalyzed: { type: Type.NUMBER },
        relocateCount: { type: Type.NUMBER },
        archiveCount: { type: Type.NUMBER },
        protectCount: { type: Type.NUMBER }
      },
      required: ["totalAnalyzed", "relocateCount", "archiveCount", "protectCount"]
    },
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileId: { type: Type.STRING, description: "Exact Google Drive file ID from input." },
          fileName: { type: Type.STRING },
          targetCategory: {
            type: Type.STRING,
            enum: [
              "Financials & Billing",
              "Legal & Contracts",
              "Project Operations",
              "Marketing & Assets",
              "HR & Operations",
              "Archives & Backups"
            ]
          },
          action: {
            type: Type.STRING,
            enum: ["relocate", "archive", "protect", "consolidate"]
          },
          confidence: { type: Type.NUMBER, description: "Classification confidence 0.0 to 1.0" },
          urgency: {
            type: Type.STRING,
            enum: ["high", "medium", "low"]
          },
          rationale: { type: Type.STRING, description: "One direct sentence explaining why this file belongs here." }
        },
        required: [
          "fileId",
          "fileName",
          "targetCategory",
          "action",
          "confidence",
          "urgency",
          "rationale"
        ]
      }
    }
  },
  required: ["summary", "decisions"]
};

export interface TriageDecisionRecord {
  fileId: string;
  fileName: string;
  targetCategory:
    | "Financials & Billing"
    | "Legal & Contracts"
    | "Project Operations"
    | "Marketing & Assets"
    | "HR & Operations"
    | "Archives & Backups";
  action: "relocate" | "archive" | "protect" | "consolidate";
  confidence: number;
  urgency: "high" | "medium" | "low";
  rationale: string;
}

export interface TriageResponsePayload {
  summary: {
    totalAnalyzed: number;
    relocateCount: number;
    archiveCount: number;
    protectCount: number;
  };
  decisions: TriageDecisionRecord[];
}

export interface ComposeReportPayload {
  subject: string;
  htmlBody: string;
}

export const ComposeReportSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description: "An elegant, concise email subject line, e.g., 'Drive Companion: Automated Organization & Task Report'."
    },
    htmlBody: {
      type: Type.STRING,
      description: "Complete visually robust HTML code containing headers, paragraph descriptions, structured CSS rules, cards for metrics, and action breakdowns."
    }
  },
  required: ["subject", "htmlBody"]
};

export interface FileSummaryPayload {
  summary: string;
  documentType: string;
  keyPoints: string[];
  suggestedActions: string[];
  relevanceScore?: number;
}

export const FileSummarySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A concise 2-3 sentence overview explaining what this file is, its purpose, and value."
    },
    documentType: {
      type: Type.STRING,
      description: "Descriptive label (e.g., 'Financial Invoice', 'Design Specification', 'Meeting Agenda', 'Project Documentation', 'Media Graphic', 'Spreadsheet Dataset')."
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 to 4 key highlights, takeaways, or extracted information points."
    },
    suggestedActions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "1 to 3 recommended next actions for managing or organizing this file."
    },
    relevanceScore: {
      type: Type.INTEGER,
      description: "Estimated relevance score 0-100 based on currency and importance."
    }
  },
  required: ["summary", "documentType", "keyPoints", "suggestedActions"]
};

export interface ChatSuggestionsPayload {
  suggestions: string[];
}

export const ChatSuggestionsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of 4 actionable prompt suggestions."
    }
  },
  required: ["suggestions"]
};

export const CONTENT_INTELLIGENCE_SYSTEM_PROMPT = `You are the Google Drive Content Intelligence and Taxonomy Engine. Your role is to inspect the actual contents of files in a user's Google Drive, determine their true subjects, match them against the user's existing folder taxonomy, and stage safe, reversible organisation actions.

### 1. Operational Invariants
- Read-only actions (inspecting text, crawling directories, searching files) execute freely.
- Mutating actions (moving files, renaming files, creating folders) are strictly fail-closed:
  - NEVER execute a move, rename, or folder creation without first presenting an explicit Staging Diff and receiving the user's direct confirmation.
  - Silent or automated background file restructuring is strictly forbidden.
- Always reuse existing folders before creating new ones. Only propose a new folder if semantic match to every existing directory is strictly below 0.85.

---

### 2. Deep Content Ingestion Protocol
Do not rely on file names (e.g. "Scan_001.pdf", "Untitled Document"). Classify files using their actual text:
1. Workspace Files (Docs, Sheets, Slides): Extract plain text or cell summaries directly via the Drive export API.
2. Binary Documents (PDFs, Images, Scans): Sample the first 2 pages or the first 2,000 tokens of OCR/text extract.
3. Metadata Extraction Schema:
   For every inspected file, extract:
   - Primary Entity / Vendor / Organisation (e.g. "ATO", "Telstra", "Bunnings", "Project Atlas")
   - Document Type (e.g. "Invoice", "Tax Return", "Contract", "Meeting Notes", "Specification")
   - Canonical Date (ISO 8601: \`YYYY-MM-DD\`, extracted from invoice dates or document headers)
   - Core Subject Summary (5–10 words describing what the document actually covers)

---

### 3. Existing Taxonomy & Hierarchy Matching
1. Baseline Crawl: Read and cache the user's existing Google Drive folder hierarchy (\`list_drive_structure\`).
2. Routing Priority:
   - Level 1: Match against active existing folders. If a suitable target exists with high semantic confidence (≥ 0.85), route the file there.
   - Level 2: If no folder exists, observe the user's existing organisational pattern (e.g. \`Client/Year/Topic\` vs \`Year/Topic/Client\`) before generating a proposed new folder name.
3. Protected Directories: Never propose moves into or out of system folders, shared team roots, or user-blacklisted paths (e.g. \`/Archive\`, \`/Templates\`, \`/.drive_appdata\`).

---

### 4. Two-Phase Staging & User Control
Always execute file organisation across two distinct phases:

#### Phase 1: Staging Diff (Read-Only)
When the user asks to organise files, output a clear staging table:

| File Name | Detected Entity & Subject | Current Folder | Proposed Target Folder | Match Type | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Scan_042.pdf | ATO - FY25 Notice of Assessment | Root (My Drive) | /Financial/Taxes/2025 | Existing Folder | 94% |
| Untitled.gdoc | Architecture Spec - Personal AI OS | /Drafts | /Projects/AI-OS/Specs | New Folder | 88% |

Conclude Phase 1 with:
"Review the proposed moves above. Reply **Confirm** to execute, or tell me which paths to adjust."

#### Phase 2: Commit (Gated Mutation)
- ONLY after the user replies with explicit approval (e.g. "Confirm", "Looks good", "Proceed"), call the batch move tool.
- Record every moved file to an append-only transaction ledger (\`.drive_organiser_ledger.json\`) storing:
  - \`transaction_id\`
  - \`timestamp_utc\`
  - \`file_id\`
  - \`original_parent_id\`
  - \`destination_parent_id\`
  - \`applied_name\`

---

### 5. Atomic Rollback & Undo
When the user says "Undo", "Revert last batch", or asks to step back:
1. Fetch the most recent transaction entry from \`.drive_organiser_ledger.json\`.
2. Move each file back from its current folder to its \`original_parent_id\`.
3. Report the restored paths clearly to the user.

---

### 6. User Customisation Rules
Respect user instructions regarding:
- Naming conventions: e.g. \`[YYYY-MM-DD] - [Entity] - [Subject]\` vs \`[Subject]_[OriginalName]\`.
- Date placement: Prefix vs suffix.
- Folder depth limits: Maximum subfolder nesting depth (default: 3 levels).
- Interactive Correction: If the user overrides a folder choice in chat, remember that rule for all remaining files in the session.`;

export const CONTENT_INTELLIGENCE_TOOLS = [
  {
    name: "list_drive_structure",
    description: "Scans and returns the user's current Google Drive folder hierarchy with folder IDs and paths.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        root_folder_id: { type: Type.STRING, description: "Starting folder ID, or 'root'." },
        depth: { type: Type.INTEGER, description: "Traversal depth limit." }
      },
      required: ["root_folder_id"]
    }
  },
  {
    name: "inspect_drive_file",
    description: "Extracts raw text, OCR data, and metadata from a target file in Google Drive.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        file_id: { type: Type.STRING, description: "Google Drive unique file ID." },
        token_limit: { type: Type.INTEGER, description: "Max tokens/characters to sample (default: 2000)." }
      },
      required: ["file_id"]
    }
  },
  {
    name: "commit_staged_moves",
    description: "Executes approved file relocations and logs transactions to the ledger.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmation_token: { type: Type.STRING, description: "Token proving user confirmed the diff." },
        moves: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              file_id: { type: Type.STRING },
              from_folder_id: { type: Type.STRING },
              to_folder_id: { type: Type.STRING },
              rename_to: { type: Type.STRING }
            },
            required: ["file_id", "from_folder_id", "to_folder_id"]
          }
        }
      },
      required: ["confirmation_token", "moves"]
    }
  }
];


