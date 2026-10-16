/**
 * Shared Type Definitions for Drive Organizer Companion
 */

export interface FileDecision {
  action: string;
  decisionType: 'relocate' | 'archive' | 'protect' | 'consolidate' | 'verified';
  targetFolder: string;
  confidence: number;
  urgency: 'high' | 'medium' | 'low';
  rationale: string;
  status: 'recommended' | 'applied';
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  tags?: string[];
  category?: string;
  relevance?: number; // 0 to 100 Relevance score based on category
  content?: string; // Cache text content for edit view
  webViewLink?: string;
  decision?: FileDecision;
  decisionAction?: string;
  decisionRationale?: string;
}

export interface BackupJob {
  id: string;
  name: string;
  sourceFolderId: string;
  sourceFolderName: string;
  destinationFolderId: string;
  destinationFolderName: string;
  schedule: 'hourly' | 'daily' | 'weekly' | 'manual';
  status: 'idle' | 'running' | 'success' | 'failed';
  lastRun?: string;
  devices: string[]; // List of connected simulated/real device backups
}

export interface BackupLog {
  id: string;
  timestamp: string;
  jobId: string;
  jobName: string;
  status: 'success' | 'failed';
  message: string;
  filesCopied: number;
}

export interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  remindAt?: string; // Custom time scheduled to execute or send email
  notifyEmail: boolean;
  executed?: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  actionType: 'create' | 'move' | 'modify' | 'organize' | 'backup' | 'task' | 'email' | 'sheet';
  message: string;
  details?: string;
}

export interface OrganizerRule {
  id: string;
  keyword: string;
  targetCategory: string;
  targetFolder?: string;
  priority?: number;
  enabled?: boolean;
}

export interface DriveAnalysisResult {
  fileId: string;
  fileName: string;
  recommendedCategory: string;
  recommendedTags: string[];
  relevanceScore: number;
  reason: string;
}

export interface OrganizationReport {
  summary: string;
  categoryDistribution: { [key: string]: number };
  actionsTaken: string[];
  recommendations: DriveAnalysisResult[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export type GeminiChatModel = 'gemini-3.8-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';

export interface ChatRolePreset {
  id: string;
  title: string;
  description: string;
  iconName: string;
  defaultModel: GeminiChatModel;
  systemInstruction: string;
}

export interface SheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl?: string;
  sheets?: Array<{
    sheetId: number;
    title: string;
    index: number;
    rowCount?: number;
    columnCount?: number;
  }>;
}

export interface SheetGridData {
  range: string;
  majorDimension?: string;
  values: string[][];
}

export interface SmartTaskReminder {
  id: string;
  title: string;
  description?: string;
  triggerDate?: string; // YYYY-MM-DD
  triggerTime: string; // HH:mm
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly';
  actionType: 'reminder_only' | 'create_folder' | 'edit_doc' | 'relocate_file';
  actionPayload?: {
    folderName?: string;
    parentFolderId?: string;
    appendContent?: string;
    targetDestinationFolderId?: string;
  };
  targetFileId?: string;
  targetFileName?: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  status: 'active' | 'fired' | 'completed';
  notified?: boolean;
  executed?: boolean;
  lastFiredAt?: string;
  createdAt?: string;
}

export interface EmailApprovalRequest {
  id: string;
  reminderId?: string;
  recipientEmail: string;
  subject: string;
  triggerReason: string;
  htmlBody: string;
  timestamp: string;
}

export interface ProposedAction {
  fileId: string;
  originalName: string;
  proposedName: string;
  currentParentId: string;
  proposedFolderPath: string;
  actionType: "MOVE" | "RENAME" | "MOVE_AND_RENAME" | "ARCHIVE" | "TRASH_DUPLICATE" | "SKIP";
  confidence: number;
  rationale: string;
}

export interface ProposedReminder {
  fileId: string;
  title: string;
  triggerDate: string;
  rationale: string;
}

export interface OrganizationPlan {
  summary: string;
  proposedActions: ProposedAction[];
  proposedReminders?: ProposedReminder[];
}

export type CanonicalCategory =
  | "Financials & Billing"
  | "Legal & Contracts"
  | "Project Operations"
  | "Marketing & Assets"
  | "HR & Operations"
  | "Archives & Backups";

export type TriageAction = "relocate" | "archive" | "protect" | "consolidate";
export type TriageUrgency = "high" | "medium" | "low";

export interface TriageDecision {
  fileId: string;
  fileName: string;
  targetCategory: CanonicalCategory;
  action: TriageAction;
  confidence: number;
  urgency: TriageUrgency;
  rationale: string;
  size?: string;
  currentParentId?: string;
}

export interface TriageSummary {
  totalAnalyzed: number;
  relocateCount: number;
  archiveCount: number;
  protectCount: number;
}

export interface TriagePlan {
  summary: TriageSummary;
  decisions: TriageDecision[];
}

export interface UndoSnapshotMove {
  fileId: string;
  originalParentId: string;
  newParentId: string;
  fileName?: string;
  targetCategory?: string;
}

export interface UndoSnapshot {
  timestamp: string;
  moves: UndoSnapshotMove[];
}

export interface GoogleDocContent {
  documentId: string;
  title: string;
  revisionId?: string;
  plainText: string;
  wordCount: number;
  characterCount: number;
  rawDoc?: any;
}

export interface PickedFileItem {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
  sizeBytes?: number;
  lastEditedUtc?: number;
}

