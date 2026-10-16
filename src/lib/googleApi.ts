import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DriveFile, TaskItem, SheetMetadata } from '../types';
import { evaluateFileDecision } from './decisionEngine';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use session persistence so credentials wipe when the browser session closes
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.warn('Session persistence note:', err?.message || err);
});

// Configure Google Provider with required scopes
export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://www.googleapis.com/auth/tasks');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;

/**
 * Checks whether an authentication error is due to user cancellation or browser popup dismissal.
 */
export const isPopupDismissedError = (error: any): boolean => {
  if (!error) return false;
  const code = typeof error === 'string' ? error : error.code || '';
  const message = typeof error === 'string' ? error : error.message || '';
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/popup-blocked' ||
    code === 'auth/user-cancelled' ||
    message.includes('popup-closed-by-user') ||
    message.includes('cancelled-popup-request') ||
    message.includes('popup-blocked')
  );
};

/**
 * Initialize Firebase Authentication listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger pop-up Based Google Authentication with scopes
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    return null;
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve OAuth access token from Firebase Authentication.');
    }
    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (isPopupDismissedError(error)) {
      console.info('Google sign-in popup was dismissed or closed before completion.');
      return null;
    }
    console.error('Sign-in Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Logs out the current Google workspace account
 */
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return currentUser;
};

// ---------------------------------------------------------
// GOOGLE DRIVE API FUNCTIONS
// ---------------------------------------------------------

/**
 * List files from user's Google Drive. 
 * Fetches relevant metadata: id, name, mimeType, size, modifiedTime, parents, workViewLink
 */
export const listDriveFiles = async (token: string): Promise<DriveFile[]> => {
  const query = "trashed = false";
  const fields = "files(id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to list Google Drive files.");
  }

  const data = await response.json();
  const rawList = data.files || [];
  const seenIds = new Set<string>();
  const uniqueFiles: DriveFile[] = [];

  for (const file of rawList) {
    if (!file || !file.id || seenIds.has(file.id)) continue;
    seenIds.add(file.id);
    uniqueFiles.push({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? formatBytes(parseInt(file.size)) : undefined,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      parents: file.parents || [],
      webViewLink: file.webViewLink
    });
  }

  return uniqueFiles;
};

/**
 * Create a new folder on Google Drive
 */
export const createDriveFolder = async (token: string, folderName: string, parentId?: string): Promise<any> => {
  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder"
  };
  // In Google Drive v3, omitting parents creates the folder in the user's root folder.
  // Passing symbolic "root" can cause API rejection.
  if (parentId && parentId !== "root") {
    metadata.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to create folder.");
  }

  return response.json();
};

/**
 * Create a shortcut on Google Drive for shared files or aliases
 */
export const createDriveShortcut = async (
  token: string,
  targetFileId: string,
  fileName: string,
  parentId?: string
): Promise<any> => {
  const metadata: any = {
    name: fileName,
    mimeType: "application/vnd.google-apps.shortcut",
    shortcutDetails: {
      targetId: targetFileId
    }
  };
  if (parentId && parentId !== "root") {
    metadata.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to create Drive shortcut.");
  }

  return response.json();
};

/**
 * Creates or resolves nested folder path on Google Drive (e.g. "Work/Financials/Invoices")
 */
export const createNestedDriveFolders = async (
  token: string,
  folderPath: string,
  existingCache: { [path: string]: string } = {}
): Promise<string> => {
  const segments = folderPath.split("/").map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return "root";

  let currentParentId = "root";
  let accumulatedPath = "";

  for (const segment of segments) {
    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
    if (existingCache[accumulatedPath]) {
      currentParentId = existingCache[accumulatedPath];
      continue;
    }

    // Check if this folder already exists in Drive under currentParentId
    try {
      const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${segment.replace(/'/g, "\\'")}' and '${currentParentId}' in parents and trashed = false`;
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (checkRes.ok) {
        const data = await checkRes.json();
        if (data.files && data.files.length > 0) {
          currentParentId = data.files[0].id;
          existingCache[accumulatedPath] = currentParentId;
          continue;
        }
      }
    } catch {
      // Continue to create if lookup fails
    }

    // Create the folder under currentParentId
    const newFolder = await createDriveFolder(token, segment, currentParentId);
    currentParentId = newFolder.id;
    existingCache[accumulatedPath] = currentParentId;
  }

  return currentParentId;
};

/**
 * Create a custom text/plain file on Google Drive
 */
export const createDriveTextFile = async (token: string, fileName: string, content: string, parentId?: string): Promise<any> => {
  // Drive v3 uses a multipart upload for file + metadata or simple upload
  // Simple upload with text:
  const metadata: any = {
    name: fileName.endsWith('.txt') ? fileName : `${fileName}.txt`,
    mimeType: "text/plain"
  };
  if (parentId && parentId !== "root") {
    metadata.parents = [parentId];
  }

  // First create the file with metadata
  const resMeta = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  if (!resMeta.ok) {
    const err = await resMeta.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to initialise document metadata.");
  }

  const fileData = await resMeta.json();
  const fileId = fileData.id;

  // Then upload body content to upload endpoint
  const resContent = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain"
    },
    body: content
  });

  if (!resContent.ok) {
    const err = await resContent.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to upload document content.");
  }

  return fileData;
};

/**
 * Upload a binary or text file to Google Drive via multipart upload
 */
export const uploadDriveBlob = async (token: string, file: File, parentId?: string): Promise<DriveFile> => {
  const metadata: any = {
    name: file.name,
    mimeType: file.type || "application/octet-stream"
  };
  if (parentId && parentId !== "root") {
    metadata.parents = [parentId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const arrayBuffer = await file.arrayBuffer();
  const metadataBlob = new Blob([
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
  ], { type: 'text/plain' });

  const finalBlob = new Blob([metadataBlob, arrayBuffer, closeDelimiter], {
    type: `multipart/related; boundary=${boundary}`
  });

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: finalBlob
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to upload file to Google Drive.");
  }

  const result = await response.json();
  return {
    id: result.id,
    name: result.name || file.name,
    mimeType: result.mimeType || file.type || "application/octet-stream",
    size: `${(file.size / 1024).toFixed(1)} KB`,
    modifiedTime: new Date().toISOString(),
    createdTime: new Date().toISOString(),
    parents: parentId && parentId !== "root" ? [parentId] : ["root"]
  };
};

/**
 * Edit content of a text document on Google Drive
 */
export const updateDriveTextFile = async (token: string, fileId: string, content: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain"
    },
    body: content
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to edit document content.");
  }
};

/**
 * Read text content of a plain-text file on Google Drive
 */
export const getDriveTextFileContent = async (token: string, fileId: string): Promise<string> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    // If it's a structural file or fails, return empty
    return "";
  }

  return response.text();
};

let cachedRootFolderId: string | null = null;

/**
 * Fetch and cache the user's true root folder ID from Google Drive
 */
export const getRootFolderId = async (token: string): Promise<string> => {
  if (cachedRootFolderId) return cachedRootFolderId;
  try {
    const aboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=rootFolderId", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (aboutRes.ok) {
      const data = await aboutRes.json();
      if (data.rootFolderId) {
        cachedRootFolderId = data.rootFolderId;
        return data.rootFolderId;
      }
    }
  } catch (e) {
    console.warn("Could not query about?fields=rootFolderId:", e);
  }

  try {
    const rootRes = await fetch("https://www.googleapis.com/drive/v3/files/root?fields=id&supportsAllDrives=true", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (rootRes.ok) {
      const rootData = await rootRes.json();
      if (rootData.id) {
        cachedRootFolderId = rootData.id;
        return rootData.id;
      }
    }
  } catch (e) {
    console.warn("Could not query files/root ID:", e);
  }

  return "";
};

/**
 * Move a file or folder into a parent folder
 * Adheres strictly to Google Drive API v3 single-parent enforcement rules
 */
export const moveDriveFile = async (
  token: string, 
  fileId: string, 
  newParentId: string, 
  currentParentId?: string
): Promise<void> => {
  const rootId = await getRootFolderId(token);
  const resolvedNewParentId = (newParentId === "root" && rootId) ? rootId : newParentId;

  // Query live metadata to determine ownership, permissions, and exact current parents
  let actualParents: string[] = [];
  let isOwnedByMe = true;
  let canMove = true;
  let fileName = "";

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,ownedByMe,capabilities(canMoveItemWithinDrive)&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      fileName = meta.name || "";
      if (Array.isArray(meta.parents)) {
        actualParents = meta.parents.filter(Boolean);
      }
      if (meta.ownedByMe !== undefined) {
        isOwnedByMe = meta.ownedByMe;
      }
      if (meta.capabilities?.canMoveItemWithinDrive !== undefined) {
        canMove = meta.capabilities.canMoveItemWithinDrive;
      }
    }
  } catch (e) {
    console.warn("Could not query fresh metadata for file", fileId, e);
  }

  // Fallback to caller-supplied currentParentId if fetch returned no parents
  if (actualParents.length === 0 && currentParentId) {
    const splitted = currentParentId.split(",").map(p => p.trim()).filter(Boolean);
    actualParents = splitted.map(p => (p === "root" && rootId ? rootId : p)).filter(p => p !== "root");
  }

  // If already at target destination and has no other parents, no move needed
  if (
    actualParents.includes(resolvedNewParentId) ||
    (resolvedNewParentId === rootId && actualParents.includes("root"))
  ) {
    const extraParents = actualParents.filter(p => p !== resolvedNewParentId && p !== rootId && p !== "root");
    if (extraParents.length === 0) {
      return; // Fully aligned
    }
    // Only strip extra parents
    const stripUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${encodeURIComponent(extraParents.join(","))}&supportsAllDrives=true`;
    await fetch(stripUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    return;
  }

  // If user cannot move the file (e.g. shared file owned by another user)
  if (!isOwnedByMe || !canMove) {
    // In Google Drive, non-owners cannot add/remove parents on shared files.
    // The canonical Google Drive approach is creating a shortcut in the destination folder.
    try {
      await createDriveShortcut(token, fileId, fileName || "Shared Resource", resolvedNewParentId);
      return;
    } catch (shortcutErr) {
      console.warn("Creating shortcut for non-owned file deferred:", shortcutErr);
      return; // Do not fail the batch move
    }
  }

  // Determine parents to remove: only remove parents that actually belong to the file
  const parentsToRemoveSet = new Set<string>(actualParents);
  parentsToRemoveSet.delete(resolvedNewParentId);
  parentsToRemoveSet.delete("root"); // Never send symbolic "root" in removeParents

  // If actualParents was empty (e.g. file in My Drive root without explicit parent field)
  if (parentsToRemoveSet.size === 0 && rootId && resolvedNewParentId !== rootId) {
    parentsToRemoveSet.add(rootId);
  }

  const parentsToRemoveStr = Array.from(parentsToRemoveSet).filter(p => p && p !== "root").join(",");

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(resolvedNewParentId)}&supportsAllDrives=true`;
  if (parentsToRemoveStr) {
    url += `&removeParents=${encodeURIComponent(parentsToRemoveStr)}`;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const errMsg = err?.error?.message || response.statusText || "";

    // If Google Drive rejects with parent count violation or 400:
    if (errMsg.includes("parents") || errMsg.includes("Increasing the number of parents") || response.status === 400) {
      // Recovery attempt: Try creating a shortcut if user doesn't have parent removal permissions
      try {
        const fullRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,ownedByMe&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          if (fullData.ownedByMe === false) {
            await createDriveShortcut(token, fileId, fullData.name || "Resource", resolvedNewParentId);
            return;
          }

          const freshParents = (fullData.parents || []).filter((p: string) => p && p !== resolvedNewParentId && p !== "root");
          if (freshParents.length > 0) {
            const recoveryUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(resolvedNewParentId)}&removeParents=${encodeURIComponent(freshParents.join(","))}&supportsAllDrives=true`;
            const recoveryPatch = await fetch(recoveryUrl, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}` }
            });
            if (recoveryPatch.ok) {
              return;
            }
          }
        }
      } catch (retryErr) {
        console.warn("Parent recovery attempt failed:", retryErr);
      }
    }

    throw new Error(errMsg || "Failed to move file within Google Drive.");
  }
};



// ---------------------------------------------------------
// GOOGLE TASKS API FUNCTIONS
// ---------------------------------------------------------

/**
 * List the user's task lists
 */
export const listTaskLists = async (token: string): Promise<any[]> => {
  const response = await fetch("https://www.googleapis.com/tasks/v1/users/@me/lists", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Failed to list Google Task categories.");
  }
  const data = await response.json();
  return data.items || [];
};

/**
 * Create a new Task list
 */
export const createTaskList = async (token: string, title: string): Promise<any> => {
  const response = await fetch("https://www.googleapis.com/tasks/v1/users/@me/lists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });
  if (!response.ok) throw new Error("Failed to create new Task List category.");
  return response.json();
};

/**
 * List active tasks within a specific Task list
 */
export const listTasks = async (token: string, listId: string): Promise<TaskItem[]> => {
  const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Failed to list tasks for the category.");
  }

  const data = await response.json();
  const rawTasks = data.items || [];
  const seenTaskIds = new Set<string>();
  const uniqueTasks: TaskItem[] = [];

  for (const t of rawTasks) {
    if (!t || !t.id || seenTaskIds.has(t.id)) continue;
    seenTaskIds.add(t.id);
    uniqueTasks.push({
      id: t.id,
      title: t.title,
      notes: t.notes || "",
      status: t.status,
      due: t.due,
      notifyEmail: false
    });
  }

  return uniqueTasks;
};

/**
 * Create a new task item under a list
 */
export const createGoogleTask = async (token: string, listId: string, task: Partial<TaskItem>): Promise<any> => {
  const body: any = {
    title: task.title,
    notes: task.notes,
  };
  if (task.due) {
    body.due = task.due; // ISO format string
  }

  const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Failed to create new Google Task item.");
  }

  return response.json();
};

/**
 * Complete/uncomplete or edit a task
 */
export const updateGoogleTask = async (token: string, listId: string, taskId: string, updates: Partial<TaskItem>): Promise<any> => {
  const body: any = {};
  if (updates.status) body.status = updates.status;
  if (updates.title) body.title = updates.title;
  if (updates.notes !== undefined) body.notes = updates.notes;
  if (updates.due !== undefined) body.due = updates.due;

  const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Failed to patch Google Task item.");
  }

  return response.json();
};

/**
 * Delete a google task (destructively)
 */
export const deleteGoogleTask = async (token: string, listId: string, taskId: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Failed to delete Google Task item.");
  }
};


// ---------------------------------------------------------
// GMAIL SEND API FUNCTIONS
// ---------------------------------------------------------

/**
 * Send an HTML email message via Gmail API
 */
export const sendGmailReport = async (token: string, toEmail: string, subject: string, htmlBody: string): Promise<any> => {
  const emailLines = [
    `To: ${toEmail}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    htmlBody
  ];

  const emailContent = emailLines.join("\r\n");

  // Base64URL encoding (RFC 4648 section 5)
  const base64UrlEmail = btoa(unescape(encodeURIComponent(emailContent)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw: base64UrlEmail
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to deliver email through Gmail API.");
  }

  return response.json();
};


// ---------------------------------------------------------
// GOOGLE SHEETS API FUNCTIONS
// ---------------------------------------------------------

/**
 * List all Google Sheets in the user's Drive
 */
export const listSpreadsheets = async (token: string): Promise<DriveFile[]> => {
  const query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const fields = "files(id, name, mimeType, size, modifiedTime, createdTime, parents, webViewLink)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime%20desc&pageSize=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to list Google Sheets.");
  }

  const data = await response.json();
  const rawList = data.files || [];
  const seenIds = new Set<string>();
  const uniqueSheets: DriveFile[] = [];

  for (const file of rawList) {
    if (!file || !file.id || seenIds.has(file.id)) continue;
    seenIds.add(file.id);
    uniqueSheets.push({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? formatBytes(parseInt(file.size)) : undefined,
      modifiedTime: file.modifiedTime,
      createdTime: file.createdTime,
      parents: file.parents || [],
      webViewLink: file.webViewLink
    });
  }

  return uniqueSheets;
};

/**
 * Get spreadsheet structural metadata including tabs (sheets)
 */
export const getSpreadsheetMetadata = async (token: string, spreadsheetId: string): Promise<SheetMetadata> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,spreadsheetUrl,sheets.properties`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to retrieve spreadsheet metadata.");
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || "Untitled Spreadsheet",
    spreadsheetUrl: data.spreadsheetUrl,
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || "Sheet1",
      index: s.properties?.index ?? 0,
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount
    }))
  };
};

/**
 * Fetch 2D grid values from a specific sheet range (e.g. "Sheet1" or "Sheet1!A1:Z50")
 */
export const getSpreadsheetValues = async (token: string, spreadsheetId: string, range: string): Promise<string[][]> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to retrieve spreadsheet values.");
  }

  const data = await response.json();
  return data.values || [];
};

/**
 * Create a new Google Spreadsheet with optional initial rows
 */
export const createSpreadsheet = async (
  token: string,
  title: string,
  sheetTitle: string = "Sheet1",
  initialRows?: string[][],
  parentFolderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const body: any = {
    properties: { title }
  };

  if (initialRows && initialRows.length > 0) {
    body.sheets = [
      {
        properties: { title: sheetTitle },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: initialRows.map(row => ({
              values: row.map(cell => ({
                userEnteredValue: { stringValue: String(cell ?? "") }
              }))
            }))
          }
        ]
      }
    ];
  } else {
    body.sheets = [
      {
        properties: { title: sheetTitle }
      }
    ];
  }

  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to create Google Spreadsheet.");
  }

  const resData = await response.json();

  // If created inside a specific folder (other than root), move it into that folder
  if (parentFolderId && parentFolderId !== "root") {
    try {
      await moveDriveFile(token, resData.spreadsheetId, parentFolderId);
    } catch (moveErr) {
      console.warn("Spreadsheet created in root, move to parent folder deferred:", moveErr);
    }
  }

  return {
    spreadsheetId: resData.spreadsheetId,
    spreadsheetUrl: resData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${resData.spreadsheetId}/edit`
  };
};

/**
 * Update cell values in a specified range
 */
export const updateSpreadsheetValues = async (
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<any> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to update spreadsheet values.");
  }

  return response.json();
};

/**
 * Append one or more rows to a spreadsheet
 */
export const appendSpreadsheetValues = async (
  token: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<any> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to append rows to spreadsheet.");
  }

  return response.json();
};

/**
 * Generate a comprehensive Drive Decision System & Inventory Audit into a new Google Spreadsheet
 */
export const exportDriveInventoryToSheet = async (
  token: string,
  title: string,
  files: DriveFile[],
  parentFolderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const headers = [
    "File Name",
    "MIME Type",
    "Category",
    "Triage Decision",
    "Decision Type",
    "Target Folder",
    "Urgency",
    "Confidence",
    "Decision Rationale",
    "Status",
    "Size",
    "Created Date",
    "Last Modified",
    "Tags",
    "Google Drive Link"
  ];

  const rows: string[][] = [headers];

  for (const rawFile of files) {
    // Evaluates dynamic decision and category if not already populated
    const f = (!rawFile.category || rawFile.category === "Unsorted" || !rawFile.decision)
      ? evaluateFileDecision(rawFile)
      : rawFile;

    const dec = f.decision;

    rows.push([
      f.name || "Untitled",
      f.mimeType || "unknown",
      f.category || "General Documents",
      dec ? dec.action : "Review in Place",
      dec ? dec.decisionType : "verified",
      dec ? dec.targetFolder : "Root",
      dec ? dec.urgency.toUpperCase() : "MEDIUM",
      dec ? `${dec.confidence}%` : "85%",
      dec ? dec.rationale : "Catalogued by Decision Engine",
      dec ? dec.status : "recommended",
      f.size || "-",
      f.createdTime ? new Date(f.createdTime).toLocaleDateString() : "-",
      f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : "-",
      (f.tags || []).join(", "),
      f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
    ]);
  }

  return createSpreadsheet(token, title, "Decision Matrix & Inventory", rows, parentFolderId);
};


// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
