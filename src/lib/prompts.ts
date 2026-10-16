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
