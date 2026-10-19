import { describe, it, beforeEach, afterEach, expect, vi, type MockFn } from "./testUtils.ts";
import {
  createGeminiServiceClient,
  executeCoreAiWorkflow,
  type WorkflowStorageDatabase,
} from "../geminiApi.ts";
import { evaluateFilesBatch, getDecisionSystemMetrics } from "../decisionEngine.ts";
import {
  TriageSchema,
  ChangePlanSchema,
  ComposeReportSchema,
  FileSummarySchema,
  ChatSuggestionsSchema,
} from "../prompts.ts";
import type { DriveFile, OrganizerRule, UndoSnapshot } from "../../types.ts";

/**
 * Helper to simulate a chunked streaming HTTP Response (ReadableStream of Uint8Array chunks)
 */
function createChunkedStreamResponse(
  chunks: string[],
  status = 200,
  dropAfterChunkIndex?: number
): Response {
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (dropAfterChunkIndex !== undefined && index > dropAfterChunkIndex) {
        controller.error(new Error("Connection reset by peer during chunked stream transfer"));
        return;
      }
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Core User Workflow Suite: Prompt Input -> Streaming Response -> Render -> Save to Database", () => {
  let mockFetch: MockFn<[RequestInfo | URL, RequestInit?], Promise<Response>>;
  let mockGetToken: MockFn<[boolean], Promise<string>>;
  let mockSaveConversation: MockFn<
    [
      {
        id: string;
        prompt: string;
        reply: string;
        modelUsed: string;
        truncated: boolean;
        timestamp: string;
      },
    ],
    Promise<void>
  >;
  let mockSaveSnapshot: MockFn<[UndoSnapshot], Promise<void>>;
  let mockDb: WorkflowStorageDatabase;

  const sampleDriveFiles: DriveFile[] = [
    {
      id: "file-inv-001",
      name: "Q4_Tax_Invoice_2026.pdf",
      mimeType: "application/pdf",
      size: "240 KB",
      modifiedTime: "2026-10-01T10:00:00Z",
      category: "Unsorted",
      tags: [],
      parents: ["root"],
    },
    {
      id: "file-msa-002",
      name: "Master_Service_Agreement_Signed.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: "512 KB",
      modifiedTime: "2026-10-02T12:00:00Z",
      category: "Unsorted",
      tags: [],
      parents: ["Legal & Contracts"],
    },
  ];

  beforeEach(() => {
    mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>();
    mockGetToken = vi.fn<[boolean], Promise<string>>(async (forceRefresh: boolean) =>
      forceRefresh ? "refreshed-firebase-jwt-token" : "initial-firebase-jwt-token"
    );
    mockSaveConversation = vi.fn<
      [
        {
          id: string;
          prompt: string;
          reply: string;
          modelUsed: string;
          truncated: boolean;
          timestamp: string;
        },
      ],
      Promise<void>
    >(async () => undefined);
    mockSaveSnapshot = vi.fn<[UndoSnapshot], Promise<void>>(async () => undefined);

    mockDb = {
      saveConversationRecord: mockSaveConversation,
      saveTriageSnapshot: mockSaveSnapshot,
    };
  });

  afterEach(() => {
    mockFetch.mockClear();
    mockGetToken.mockClear();
    mockSaveConversation.mockClear();
    mockSaveSnapshot.mockClear();
  });

  describe("1. Happy Path Execution with Standard Inputs", () => {
    it("should process a standard prompt through chunked streaming response, render messages, and persist to database", async () => {
      const streamedJsonChunks = [
        '{"success":true,',
        '"reply":"Here is your structured folder taxonomy for Q4 tax invoices and legal agreements.",',
        '"modelUsed":"gemini-3.8-flash",',
        '"finishReason":"STOP",',
        '"truncated":false}',
      ];

      mockFetch.mockResolvedValueOnce(createChunkedStreamResponse(streamedJsonChunks, 200));

      const client = createGeminiServiceClient({
        baseUrl: "http://localhost:3000",
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
        defaultTimeoutMs: 5000,
      });

      const result = await executeCoreAiWorkflow(
        {
          prompt: "Organize my Q4 tax invoices and legal contracts",
          model: "gemini-3.8-flash",
          systemInstruction: "You are an elite Google Drive storage specialist.",
          files: sampleDriveFiles,
        },
        client,
        mockDb
      );

      // 1. Verify status & rendered message thread
      expect(result.status).toBe("success");
      expect(result.truncated).toBe(false);
      expect(result.renderedMessages).toHaveLength(2);
      expect(result.renderedMessages[0].role).toBe("user");
      expect(result.renderedMessages[0].content).toBe(
        "Organize my Q4 tax invoices and legal contracts"
      );
      expect(result.renderedMessages[1].role).toBe("model");
      expect(result.renderedMessages[1].content).toContain(
        "structured folder taxonomy for Q4 tax invoices"
      );
      expect(result.renderedMessages[1].modelUsed).toBe("gemini-3.8-flash");

      // 2. Verify authenticated AI endpoint call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(String(calledUrl)).toBe("http://localhost:3000/api/gemini/chat");
      const headers = new Headers(calledInit?.headers);
      expect(headers.get("Authorization")).toBe("Bearer initial-firebase-jwt-token");

      // 3. Verify database persistence of conversation & pre-commit triage snapshot
      expect(mockSaveConversation).toHaveBeenCalledTimes(1);
      const savedRecord = mockSaveConversation.mock.calls[0][0];
      expect(savedRecord.prompt).toBe("Organize my Q4 tax invoices and legal contracts");
      expect(savedRecord.reply).toContain("structured folder taxonomy");
      expect(savedRecord.modelUsed).toBe("gemini-3.8-flash");
      expect(savedRecord.truncated).toBe(false);

      expect(result.snapshotSaved).toBe(true);
      expect(mockSaveSnapshot).toHaveBeenCalledTimes(1);
      const savedSnapshot = mockSaveSnapshot.mock.calls[0][0];
      expect(savedSnapshot.moves).toHaveLength(1);
      expect(savedSnapshot.moves[0].fileId).toBe("file-inv-001");
      expect(savedSnapshot.moves[0].targetCategory).toBe("Financials & Billing");
    });

    it("should transparently refresh the Firebase Bearer token on HTTP 401 and complete persistence", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Expired token" }), { status: 401 })
        )
        .mockResolvedValueOnce(
          createChunkedStreamResponse([
            JSON.stringify({
              success: true,
              reply: "Authenticated after token refresh and organized your Drive.",
              modelUsed: "gemini-3.1-flash-lite",
              finishReason: "STOP",
              truncated: false,
            }),
          ])
        );

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        {
          prompt: "Audit my Drive workspace permissions",
          model: "gemini-3.1-flash-lite",
        },
        client,
        mockDb
      );

      expect(result.status).toBe("success");
      expect(mockGetToken).toHaveBeenCalledTimes(2);
      expect(mockGetToken.mock.calls[0][0]).toBe(false);
      expect(mockGetToken.mock.calls[1][0]).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const retryHeaders = new Headers(mockFetch.mock.calls[1][1]?.headers);
      expect(retryHeaders.get("Authorization")).toBe("Bearer refreshed-firebase-jwt-token");
      expect(mockSaveConversation).toHaveBeenCalledTimes(1);
    });

    it("should append a truncation notice and flag the database record when finishReason is MAX_TOKENS", async () => {
      mockFetch.mockResolvedValueOnce(
        createChunkedStreamResponse([
          JSON.stringify({
            success: true,
            reply: "1. Create /Financials\n2. Move invoices",
            modelUsed: "gemini-3.1-pro-preview",
            finishReason: "MAX_TOKENS",
            truncated: true,
          }),
        ])
      );

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        {
          prompt: "Generate a detailed 50-step governance migration checklist",
          model: "gemini-3.1-pro-preview",
        },
        client,
        mockDb
      );

      expect(result.status).toBe("success");
      expect(result.truncated).toBe(true);
      expect(result.renderedMessages[1].content).toContain(
        "[Note: Response truncated due to token limit]"
      );
      expect(mockSaveConversation).toHaveBeenCalledTimes(1);
      expect(mockSaveConversation.mock.calls[0][0].truncated).toBe(true);
    });
  });

  describe("2. Empty or Whitespace-Only Inputs", () => {
    it("should reject an empty string prompt without calling the AI endpoint or mutating the database", async () => {
      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        {
          prompt: "",
          history: [
            {
              id: "init-1",
              role: "model",
              content: "Welcome! How can I help?",
              timestamp: "10:00 AM",
            },
          ],
        },
        client,
        mockDb
      );

      expect(result.status).toBe("empty");
      expect(result.error).toContain("Prompt cannot be empty");
      expect(result.renderedMessages).toHaveLength(1);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSaveConversation).not.toHaveBeenCalled();
      expect(mockSaveSnapshot).not.toHaveBeenCalled();
    });

    it("should reject whitespace-only prompts (spaces, tabs, newlines) before network dispatch", async () => {
      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      for (const blankInput of ["   ", "\t\t", "\n  \r\n \t "]) {
        const result = await executeCoreAiWorkflow(
          { prompt: blankInput },
          client,
          mockDb
        );
        expect(result.status).toBe("empty");
        expect(result.renderedMessages).toHaveLength(0);
      }

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSaveConversation).not.toHaveBeenCalled();
    });

    it("should ignore empty or whitespace-only custom keyword rules during file classification", () => {
      const noisyRules: OrganizerRule[] = [
        { id: "r-empty", keyword: "   ", targetCategory: "Archives & Backups", enabled: true },
        { id: "r-valid", keyword: "tax", targetCategory: "Financials & Billing", enabled: true },
      ];

      const evaluated = evaluateFilesBatch(sampleDriveFiles, noisyRules);
      expect(evaluated).toHaveLength(2);
      expect(evaluated[0].category).toBe("Financials & Billing");
      expect(evaluated[1].category).toBe("Legal & Contracts");

      const metrics = getDecisionSystemMetrics(evaluated);
      expect(metrics.unsortedCount).toBe(0);
      expect(metrics.coveragePercentage).toBe(100);
    });
  });

  describe("3. Malformed API Responses or Interrupted Streaming Network Drops", () => {
    it("should handle truncated/malformed JSON payloads cleanly without saving corrupted data to the database", async () => {
      mockFetch.mockResolvedValueOnce(
        createChunkedStreamResponse(['{"success": true, "reply": "Unclosed JSON string...'], 200)
      );

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        { prompt: "Summarize my Q4 tax documents" },
        client,
        mockDb
      );

      expect(result.status).toBe("failed");
      expect(result.error || "").toContain("Malformed API response");
      expect(result.retryPrompt).toBe("Summarize my Q4 tax documents");
      expect(mockSaveConversation).not.toHaveBeenCalled();
    });

    it("should handle mid-stream network drops (ReadableStream disconnect) and activate deterministic file fallback", async () => {
      const brokenChunks = [
        '{"success":true,',
        '"reply":"Starting stream before network drop...',
        '"}',
      ];
      // Drop the stream right after chunk 0
      mockFetch.mockResolvedValueOnce(createChunkedStreamResponse(brokenChunks, 200, 0));

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        {
          prompt: "Classify and organize my pending files",
          files: sampleDriveFiles,
        },
        client,
        mockDb
      );

      expect(result.status).toBe("fallback");
      expect(result.error || "").toContain("Interrupted streaming network drop");
      expect(result.retryPrompt).toBe("Classify and organize my pending files");

      // Verify deterministic fallback still classified all files with zero Unsorted items
      expect(result.evaluatedFiles).toBeDefined();
      expect(result.evaluatedFiles).toHaveLength(2);
      expect(result.evaluatedFiles![0].category).toBe("Financials & Billing");
      expect(result.evaluatedFiles![1].category).toBe("Legal & Contracts");
      expect(mockSaveConversation).not.toHaveBeenCalled();
    });

    it("should reject structurally incomplete JSON responses missing required schema properties", async () => {
      mockFetch.mockResolvedValueOnce(
        createChunkedStreamResponse([JSON.stringify({ success: true, modelUsed: "gemini-3.8-flash" })], 200)
      );

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
      });

      const result = await executeCoreAiWorkflow(
        { prompt: "Check missing reply field handling" },
        client,
        mockDb
      );

      expect(result.status).toBe("failed");
      expect(result.error || "").toContain("Missing required 'reply' string field");
      expect(mockSaveConversation).not.toHaveBeenCalled();
    });
  });

  describe("4. High-Latency Timeout Thresholds", () => {
    it("should abort the AI request and return a deterministic timeout error when latency exceeds defaultTimeoutMs", async () => {
      mockFetch.mockImplementationOnce((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(signal.reason || new Error("Aborted"));
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                reject(signal.reason || new Error("Aborted"));
              },
              { once: true }
            );
          }
        });
      });

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
        defaultTimeoutMs: 45, // 45ms strict timeout threshold for test speed
      });

      const result = await executeCoreAiWorkflow(
        { prompt: "Run deep archive analysis across workspace" },
        client,
        mockDb
      );

      expect(result.status).toBe("failed");
      expect(result.error || "").toContain("AI request timed out after 45ms");
      expect(result.retryPrompt).toBe("Run deep archive analysis across workspace");
      expect(mockSaveConversation).not.toHaveBeenCalled();
    });

    it("should succeed when a high-latency response completes just inside the configured timeout threshold", async () => {
      mockFetch.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return createChunkedStreamResponse([
          JSON.stringify({
            success: true,
            reply: "Completed within latency budget.",
            modelUsed: "gemini-3.8-flash",
            finishReason: "STOP",
            truncated: false,
          }),
        ]);
      });

      const client = createGeminiServiceClient({
        fetchImpl: mockFetch as unknown as typeof fetch,
        getToken: mockGetToken,
        defaultTimeoutMs: 250,
      });

      const result = await executeCoreAiWorkflow(
        { prompt: "Verify latency threshold pass-through" },
        client,
        mockDb
      );

      expect(result.status).toBe("success");
      expect(result.renderedMessages[1].content).toBe("Completed within latency budget.");
      expect(mockSaveConversation).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. Structured Gemini ResponseSchema Contract Integrity", () => {
    it("should enforce strict required fields across all 5 production Gemini JSON schemas", () => {
      expect(TriageSchema.required).toEqual(["summary", "decisions"]);
      expect(ChangePlanSchema.required).toEqual(["summary", "proposedActions"]);
      expect(ComposeReportSchema.required).toEqual(["subject", "htmlBody"]);
      expect(FileSummarySchema.required).toEqual([
        "summary",
        "documentType",
        "keyPoints",
        "suggestedActions",
      ]);
      expect(ChatSuggestionsSchema.required).toEqual(["suggestions"]);
    });
  });
});
