import React, { createContext, useContext } from "react";
import { auth } from "./googleApi";
import { evaluateFilesBatch, getDecisionSystemMetrics } from "./decisionEngine";
import type {
  DriveFile,
  GeminiChatModel,
  OrganizerRule,
  ChatMessage,
  UndoSnapshot,
} from "../types";
import type {
  TriageResponsePayload,
  ChangePlanPayload,
  ComposeReportPayload,
  FileSummaryPayload,
  ChatSuggestionsPayload,
} from "./prompts";

export interface GeminiServiceClientConfig {
  baseUrl?: string;
  defaultTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  getToken?: (forceRefresh: boolean) => Promise<string>;
}

export interface ChatRequestMessage {
  role: "user" | "assistant" | "model";
  content: string;
}

export interface ChatResponsePayload {
  success: boolean;
  reply: string;
  modelUsed?: string;
  finishReason?: string;
  truncated?: boolean;
}

export interface WorkflowStorageDatabase {
  saveConversationRecord(record: {
    id: string;
    prompt: string;
    reply: string;
    modelUsed: string;
    truncated: boolean;
    timestamp: string;
  }): Promise<void>;
  saveTriageSnapshot(snapshot: UndoSnapshot): Promise<void>;
}

export interface CoreWorkflowInput {
  prompt: string;
  history?: ChatMessage[];
  model?: GeminiChatModel;
  systemInstruction?: string;
  files?: DriveFile[];
  rules?: OrganizerRule[];
}

export interface CoreWorkflowResult {
  status: "success" | "empty" | "failed" | "fallback";
  renderedMessages: ChatMessage[];
  evaluatedFiles?: DriveFile[];
  persistedRecordId?: string;
  snapshotSaved?: boolean;
  truncated?: boolean;
  error?: string;
  retryPrompt?: string;
}

/**
 * Decoupled AI Service Client interface.
 * UI components depend on this contract rather than low-level HTTP or SDK details.
 */
export interface IGeminiServiceClient {
  request(path: string, init?: RequestInit): Promise<Response>;
  analyzeFiles(payload: {
    files: Partial<DriveFile>[];
    rules?: OrganizerRule[];
  }): Promise<TriageResponsePayload & { success: boolean; fallback?: boolean }>;
  generateOrganizePlan(payload: {
    files: Partial<DriveFile>[];
    existingFolders?: string[];
  }): Promise<{ success: boolean; plan: ChangePlanPayload; fallback?: boolean }>;
  composeReport(payload: {
    recipient: string;
    period: string;
    logs: Array<{ action: string; timestamp: string; details: string }>;
  }): Promise<ComposeReportPayload & { success: boolean; fallback?: boolean }>;
  summarizeFile(payload: {
    fileName: string;
    mimeType?: string;
    size?: string;
    createdTime?: string;
    modifiedTime?: string;
    category?: string;
    tags?: string[];
    contentSnippet?: string;
    folderContext?: string;
  }): Promise<FileSummaryPayload & { success: boolean; fallback?: boolean }>;
  sendChatMessage(payload: {
    messages: ChatRequestMessage[];
    systemInstruction?: string;
    model?: GeminiChatModel;
  }): Promise<ChatResponsePayload>;
  generateChatSuggestions(payload: {
    roleTitle?: string;
    sampleFiles?: string[];
  }): Promise<ChatSuggestionsPayload & { success: boolean; fallback?: boolean }>;
}

function resolveApiUrl(input: RequestInfo | URL, baseUrl = ""): RequestInfo | URL {
  if (typeof input === "string" && baseUrl && input.startsWith("/")) {
    return `${baseUrl.replace(/\/+$/, "")}${input}`;
  }
  return input;
}

async function defaultGetToken(forceRefresh: boolean): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in is required before using Gemini features.");
  }
  return user.getIdToken(forceRefresh);
}

async function executeWithTimeout(
  promiseFactory: (signal: AbortSignal) => Promise<Response>,
  timeoutMs?: number,
  externalSignal?: AbortSignal | null
): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) {
    const controller = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return promiseFactory(controller.signal);
  }

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`AI request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          controller.abort(externalSignal.reason);
        },
        { once: true }
      );
    }
  }

  try {
    return await promiseFactory(controller.signal);
  } catch (err: any) {
    if (timedOut) {
      throw new Error(`AI request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function sendAuthenticatedRequest(
  input: RequestInfo | URL,
  init: RequestInit,
  forceRefresh: boolean,
  fetchFn: typeof fetch = fetch,
  tokenProvider: (forceRefresh: boolean) => Promise<string> = defaultGetToken,
  timeoutMs?: number
): Promise<Response> {
  const idToken = await tokenProvider(forceRefresh);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${idToken}`);

  return executeWithTimeout(
    (signal) =>
      fetchFn(input, {
        ...init,
        headers,
        signal,
      }),
    timeoutMs,
    init.signal
  );
}

/**
 * Authenticated transport for server-backed Gemini capability.
 * A 401 receives one forced Firebase token refresh before the response is returned.
 */
export async function geminiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options?: {
    fetchImpl?: typeof fetch;
    getToken?: (forceRefresh: boolean) => Promise<string>;
    timeoutMs?: number;
  }
): Promise<Response> {
  const fetchFn = options?.fetchImpl || fetch;
  const tokenProvider = options?.getToken || defaultGetToken;
  const timeoutMs = options?.timeoutMs;

  let response = await sendAuthenticatedRequest(
    input,
    init,
    false,
    fetchFn,
    tokenProvider,
    timeoutMs
  );
  if (response.status === 401) {
    response = await sendAuthenticatedRequest(
      input,
      init,
      true,
      fetchFn,
      tokenProvider,
      timeoutMs
    );
  }
  return response;
}

/**
 * Reads a response body safely whether returned as a standard payload or a chunked ReadableStream,
 * validating JSON structure and surfacing malformed or interrupted stream drops cleanly.
 */
export async function readAndParseResponseJson<T>(response: Response): Promise<T> {
  let rawText = "";

  try {
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          rawText += decoder.decode(value, { stream: true });
        }
      }
      rawText += decoder.decode();
    } else {
      rawText = await response.text();
    }
  } catch (streamErr: any) {
    throw new Error(
      `Interrupted streaming network drop: ${streamErr?.message || "Stream terminated prematurely"}`
    );
  }

  let data: any = null;
  const trimmed = rawText.trim();
  if (trimmed) {
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error(
        `Malformed API response: Expected valid JSON from AI endpoint (HTTP ${response.status})`
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null) || `AI service request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Malformed API response: Empty or non-object JSON payload");
  }

  return data as T;
}

/**
 * Concrete HTTP implementation of IGeminiServiceClient that communicates with the
 * backend Express AI orchestration gateway using Firebase ID token authentication.
 */
export function createGeminiServiceClient(
  config: GeminiServiceClientConfig = {}
): IGeminiServiceClient {
  const baseUrl = config.baseUrl || "";

  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const target = resolveApiUrl(path, baseUrl);
    return geminiFetch(target, init, {
      fetchImpl: config.fetchImpl,
      getToken: config.getToken,
      timeoutMs: config.defaultTimeoutMs,
    });
  };

  const postJson = async <TResponse>(path: string, body: unknown): Promise<TResponse> => {
    const response = await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return readAndParseResponseJson<TResponse>(response);
  };

  return {
    request,
    analyzeFiles: (payload) => postJson("/api/gemini/analyze", payload),
    generateOrganizePlan: (payload) => postJson("/api/gemini/organize-plan", payload),
    composeReport: (payload) => postJson("/api/gemini/compose-report", payload),
    summarizeFile: (payload) => postJson("/api/gemini/file-summary", payload),
    sendChatMessage: (payload) => postJson("/api/gemini/chat", payload),
    generateChatSuggestions: (payload) => postJson("/api/gemini/chat-suggestions", payload),
  };
}

/**
 * Core End-to-End User Workflow Orchestrator:
 * 1. Validates prompt & file inputs (rejecting empty/whitespace-only inputs).
 * 2. Dispatches authenticated request to AI client (supporting chunked streams & timeout bounds).
 * 3. Transforms response into renderable UI state (`ChatMessage` thread + evaluated `DriveFile` decisions).
 * 4. Persists the conversation record and pre-commit triage snapshot to the database/storage adapter.
 */
export async function executeCoreAiWorkflow(
  input: CoreWorkflowInput,
  client: IGeminiServiceClient,
  db: WorkflowStorageDatabase
): Promise<CoreWorkflowResult> {
  const normalizedPrompt = (input.prompt ?? "").trim();
  const baseHistory = input.history ?? [];

  if (!normalizedPrompt) {
    return {
      status: "empty",
      renderedMessages: baseHistory,
      error: "Prompt cannot be empty or whitespace-only.",
    };
  }

  const timestamp = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: normalizedPrompt,
    timestamp,
  };

  const updatedHistory: ChatMessage[] = [...baseHistory, userMessage];
  const selectedModel: GeminiChatModel = input.model || "gemini-3.8-flash";

  try {
    const chatResponse = await client.sendChatMessage({
      messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
      systemInstruction: input.systemInstruction,
      model: selectedModel,
    });

    if (
      !chatResponse ||
      typeof chatResponse.reply !== "string" ||
      !chatResponse.reply.trim()
    ) {
      throw new Error("Malformed API response: Missing required 'reply' string field.");
    }

    const isTruncated =
      chatResponse.truncated === true || chatResponse.finishReason === "MAX_TOKENS";
    const displayContent = isTruncated
      ? `${chatResponse.reply}\n\n[Note: Response truncated due to token limit]`
      : chatResponse.reply;

    const modelMessageId = `model-${Date.now()}`;
    const modelMessage: ChatMessage = {
      id: modelMessageId,
      role: "model",
      content: displayContent,
      timestamp,
      modelUsed: (chatResponse.modelUsed as GeminiChatModel) || selectedModel,
    };

    const renderedMessages = [...updatedHistory, modelMessage];

    await db.saveConversationRecord({
      id: modelMessageId,
      prompt: normalizedPrompt,
      reply: displayContent,
      modelUsed: modelMessage.modelUsed || selectedModel,
      truncated: isTruncated,
      timestamp,
    });

    let evaluatedFiles: DriveFile[] | undefined;
    let snapshotSaved = false;

    if (input.files && input.files.length > 0) {
      evaluatedFiles = evaluateFilesBatch(input.files, input.rules);
      const metrics = getDecisionSystemMetrics(evaluatedFiles);
      if (metrics.unsortedCount === 0) {
        const snapshot: UndoSnapshot = {
          timestamp,
          moves: evaluatedFiles
            .filter((f) => f.decision && f.decision.decisionType !== "verified")
            .map((f) => ({
              fileId: f.id,
              fileName: f.name,
              originalParentId: f.parents?.[0] || "root",
              newParentId: f.decision?.targetFolder || "Project Operations",
              targetCategory: (f.category as any) || "Project Operations",
            })),
        };
        await db.saveTriageSnapshot(snapshot);
        snapshotSaved = true;
      }
    }

    return {
      status: "success",
      renderedMessages,
      evaluatedFiles,
      persistedRecordId: modelMessageId,
      snapshotSaved,
      truncated: isTruncated,
    };
  } catch (err: any) {
    const errorMessage = err?.message || "Failed to reach AI service.";

    // If Drive files were supplied for triage and AI failed/dropped, compute deterministic fallback
    if (input.files && input.files.length > 0) {
      const fallbackFiles = evaluateFilesBatch(input.files, input.rules);
      return {
        status: "fallback",
        renderedMessages: updatedHistory,
        evaluatedFiles: fallbackFiles,
        error: errorMessage,
        retryPrompt: normalizedPrompt,
      };
    }

    return {
      status: "failed",
      renderedMessages: updatedHistory,
      error: errorMessage,
      retryPrompt: normalizedPrompt,
    };
  }
}

export const defaultGeminiServiceClient: IGeminiServiceClient = createGeminiServiceClient();

const GeminiServiceContext = createContext<IGeminiServiceClient>(defaultGeminiServiceClient);

export interface GeminiServiceProviderProps {
  client?: IGeminiServiceClient;
  children: React.ReactNode;
}

export function GeminiServiceProvider({
  client = defaultGeminiServiceClient,
  children,
}: GeminiServiceProviderProps) {
  return React.createElement(GeminiServiceContext.Provider, { value: client }, children);
}

export function useGeminiService(): IGeminiServiceClient {
  return useContext(GeminiServiceContext);
}
