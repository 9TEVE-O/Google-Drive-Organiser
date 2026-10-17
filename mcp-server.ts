import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { DRIVE_TRIAGE_SYSTEM_PROMPT, TriageSchema, DRIVE_ORGANISER_SYSTEM_PROMPT, ChangePlanSchema } from "./src/lib/prompts.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN;

if (!GEMINI_API_KEY) {
  console.warn("Warning: GEMINI_API_KEY not found in environment. AI tools will fail.");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY || "",
});

/**
 * Drive API Helper
 */
async function driveFetch(path: string, options: RequestInit = {}) {
  if (!GOOGLE_ACCESS_TOKEN) {
    throw new McpError(ErrorCode.InvalidRequest, "GOOGLE_ACCESS_TOKEN not found in environment. Please provide a valid Google OAuth access token.");
  }

  const response = await fetch(`https://www.googleapis.com/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new McpError(ErrorCode.InternalError, `Google Drive API error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * MCP Server Implementation
 */
const server = new Server(
  {
    name: "drive-organizer-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_drive_files",
        description: "List files and folders from Google Drive.",
        inputSchema: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search query (e.g., 'name contains \"Invoice\"')" },
            pageSize: { type: "number", default: 20 },
            folderId: { type: "string", description: "Parent folder ID to list from (defaults to root)" },
          },
        },
      },
      {
        name: "get_file_text_content",
        description: "Get text content of a file (txt, md) or Google Doc.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string", description: "The ID of the file or document" },
            mimeType: { type: "string", description: "The mimeType of the file" },
          },
          required: ["fileId"],
        },
      },
      {
        name: "analyze_files_triage",
        description: "Use Gemini AI to categorize and triage a list of files into 6 canonical categories.",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  mimeType: { type: "string" },
                  size: { type: "string" },
                },
              },
            },
          },
          required: ["files"],
        },
      },
      {
        name: "generate_organization_plan",
        description: "Generate a full structural organization plan for files and folders.",
        inputSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "object" } },
            folders: { type: "array", items: { type: "object" }, description: "Existing folders to consider" },
          },
          required: ["files"],
        },
      },
      {
        name: "execute_file_move",
        description: "Move a file to a target folder.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
            targetFolderId: { type: "string" },
            currentParentId: { type: "string" },
          },
          required: ["fileId", "targetFolderId"],
        },
      },
      {
        name: "create_google_doc",
        description: "Create a new Google Doc.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string", description: "Initial text content" },
          },
          required: ["title"],
        },
      },
      {
        name: "create_folder",
        description: "Create a new folder in Google Drive.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            parentId: { type: "string", default: "root" },
          },
          required: ["name"],
        },
      },
      {
        name: "list_task_lists",
        description: "List the user's task lists from Google Tasks.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_tasks",
        description: "List tasks within a specific Google Task list.",
        inputSchema: {
          type: "object",
          properties: {
            listId: { type: "string", description: "The ID of the task list" },
          },
          required: ["listId"],
        },
      },
      {
        name: "create_task",
        description: "Create a new task in a Google Task list.",
        inputSchema: {
          type: "object",
          properties: {
            listId: { type: "string" },
            title: { type: "string" },
            notes: { type: "string" },
            due: { type: "string", description: "Due date in RFC 3339 format (e.g., 2023-12-31T23:59:59Z)" },
          },
          required: ["listId", "title"],
        },
      },
      {
        name: "send_email",
        description: "Send an HTML email via Gmail API. MANDATORY: Ensure user has approved the content.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string" },
            htmlBody: { type: "string", description: "HTML content of the email" },
          },
          required: ["to", "subject", "htmlBody"],
        },
      },
      {
        name: "get_spreadsheet_data",
        description: "Get metadata and values from a Google Spreadsheet.",
        inputSchema: {
          type: "object",
          properties: {
            spreadsheetId: { type: "string" },
            range: { type: "string", description: "Range to fetch (e.g., 'Sheet1!A1:Z100')" },
          },
          required: ["spreadsheetId", "range"],
        },
      },
      {
        name: "create_spreadsheet",
        description: "Create a new Google Spreadsheet.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
          },
          required: ["title"],
        },
      },
      {
        name: "get_ai_file_summary",
        description: "Use Gemini AI to generate a summary and insights for a file based on metadata.",
        inputSchema: {
          type: "object",
          properties: {
            fileName: { type: "string" },
            mimeType: { type: "string" },
            size: { type: "string" },
            contentSnippet: { type: "string", description: "Optional text snippet from the file" },
          },
          required: ["fileName"],
        },
      },
      {
        name: "compose_ai_report",
        description: "Use Gemini AI to compose a professional HTML activity report from a list of actions.",
        inputSchema: {
          type: "object",
          properties: {
            actions: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            userEmail: { type: "string" },
          },
          required: ["actions"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_drive_files": {
        const { q, pageSize, folderId } = (args as any) || {};
        let query = q || "trashed = false";
        if (folderId) {
          query += ` and '${folderId}' in parents`;
        }
        const data = await driveFetch(`drive/v3/files?q=${encodeURIComponent(query)}&pageSize=${pageSize || 20}&fields=files(id,name,mimeType,size,parents,createdTime)`);
        return { content: [{ type: "text", text: JSON.stringify(data.files, null, 2) }] };
      }

      case "get_file_text_content": {
        const { fileId, mimeType } = (args as any);
        if (mimeType === "application/vnd.google-apps.document") {
          const doc = await driveFetch(`docs/v1/documents/${fileId}`);
          // Simplified text extraction logic
          let fullText = "";
          doc.body.content.forEach((el: any) => {
            if (el.paragraph) {
              el.paragraph.elements.forEach((pe: any) => {
                if (pe.textRun) fullText += pe.textRun.content;
              });
            }
          });
          return { content: [{ type: "text", text: fullText }] };
        } else {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` },
          });
          const text = await res.text();
          return { content: [{ type: "text", text }] };
        }
      }

      case "analyze_files_triage": {
        const { files } = (args as any);
        const prompt = `Analyze these Google Drive items:\n${JSON.stringify(files, null, 2)}`;
        const result = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: DRIVE_TRIAGE_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: TriageSchema as any,
          }
        });
        return { content: [{ type: "text", text: result.text }] };
      }

      case "generate_organization_plan": {
        const { files, folders } = (args as any);
        const prompt = `Generate a plan for these files:\nFiles: ${JSON.stringify(files)}\nExisting Folders: ${JSON.stringify(folders)}`;
        const result = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: DRIVE_ORGANISER_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: ChangePlanSchema as any,
          }
        });
        return { content: [{ type: "text", text: result.text }] };
      }

      case "execute_file_move": {
        const { fileId, targetFolderId, currentParentId } = (args as any);
        const params = new URLSearchParams();
        if (targetFolderId) params.append("addParents", targetFolderId);
        if (currentParentId) params.append("removeParents", currentParentId);
        
        const data = await driveFetch(`drive/v3/files/${fileId}?${params.toString()}`, {
          method: "PATCH",
        });
        return { content: [{ type: "text", text: `Success: Moved ${data.name} to ${targetFolderId}` }] };
      }

      case "create_google_doc": {
        const { title, content } = (args as any);
        const data = await driveFetch(`docs/v1/documents`, {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        if (content) {
          await driveFetch(`docs/v1/documents/${data.documentId}:batchUpdate`, {
            method: "POST",
            body: JSON.stringify({
              requests: [{ insertText: { endOfSegmentLocation: {}, text: content } }]
            }),
          });
        }
        return { content: [{ type: "text", text: `Success: Created Google Doc "${data.title}" with ID ${data.documentId}` }] };
      }

      case "create_folder": {
        const { name, parentId } = (args as any);
        const data = await driveFetch(`drive/v3/files`, {
          method: "POST",
          body: JSON.stringify({
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId || "root"],
          }),
        });
        return { content: [{ type: "text", text: `Success: Created folder ${data.name} with ID ${data.id}` }] };
      }

      case "list_task_lists": {
        const data = await driveFetch("tasks/v1/users/@me/lists");
        return { content: [{ type: "text", text: JSON.stringify(data.items || [], null, 2) }] };
      }

      case "list_tasks": {
        const { listId } = (args as any);
        const data = await driveFetch(`tasks/v1/lists/${listId}/tasks?showCompleted=true`);
        return { content: [{ type: "text", text: JSON.stringify(data.items || [], null, 2) }] };
      }

      case "create_task": {
        const { listId, title, notes, due } = (args as any);
        const data = await driveFetch(`tasks/v1/lists/${listId}/tasks`, {
          method: "POST",
          body: JSON.stringify({ title, notes, due }),
        });
        return { content: [{ type: "text", text: `Success: Created task "${data.title}" in list ${listId}` }] };
      }

      case "send_email": {
        const { to, subject, htmlBody } = (args as any);
        const emailLines = [
          `To: ${to}`,
          "Content-Type: text/html; charset=utf-8",
          "MIME-Version: 1.0",
          `Subject: ${subject}`,
          "",
          htmlBody
        ];
        const emailContent = emailLines.join("\r\n");
        const base64UrlEmail = Buffer.from(emailContent).toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        await driveFetch("gmail/v1/users/me/messages/send", {
          method: "POST",
          body: JSON.stringify({ raw: base64UrlEmail }),
        });
        return { content: [{ type: "text", text: `Success: Email sent to ${to}` }] };
      }

      case "get_spreadsheet_data": {
        const { spreadsheetId, range } = (args as any);
        const metadata = await driveFetch(`sheets/v4/spreadsheets/${spreadsheetId}`);
        const values = await driveFetch(`sheets/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title: metadata.properties.title,
              sheets: metadata.sheets.map((s: any) => s.properties.title),
              values: values.values || []
            }, null, 2)
          }]
        };
      }

      case "create_spreadsheet": {
        const { title } = (args as any);
        const data = await driveFetch("sheets/v4/spreadsheets", {
          method: "POST",
          body: JSON.stringify({ properties: { title } }),
        });
        return { content: [{ type: "text", text: `Success: Created spreadsheet "${data.properties.title}" at ${data.spreadsheetUrl}` }] };
      }

      case "get_ai_file_summary": {
        const { fileName, mimeType, size, contentSnippet } = (args as any);
        const prompt = `Analyze this file and produce a summary:
File Name: "${fileName}"
MIME Type: ${mimeType || "Unknown"}
Size: ${size || "Unknown"}
${contentSnippet ? `Content Snippet: ${contentSnippet}` : ""}`;

        const result = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: "You are an intelligent Google Drive document analysis assistant. Generate an insightful summary, document type, key points, and suggested actions.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                documentType: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["summary", "documentType", "keyPoints", "suggestedActions"]
            }
          }
        });
        return { content: [{ type: "text", text: result.text }] };
      }

      case "compose_ai_report": {
        const { actions, summary, userEmail } = (args as any);
        const actionsText = actions.map((act: string, index: number) => `${index + 1}. ${act}`).join("\n");
        const prompt = `Compose an executive report for ${userEmail || 'User'}.\nActions performed:\n${actionsText}\nSummary: ${summary || 'No summary provided'}`;

        const result = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: "You are a professional secretary bot. Write gorgeous HTML emails with structured CSS, cards, and elegant tables. Deliver strictly valid JSON with 'subject' and 'htmlBody' keys.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                htmlBody: { type: Type.STRING }
              },
              required: ["subject", "htmlBody"]
            }
          }
        });
        return { content: [{ type: "text", text: result.text }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message || String(error)}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Drive Organizer MCP server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
