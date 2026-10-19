import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import bundledFirebaseConfig from '../../firebase-applet-config.json';
import {
  DriveFile,
  TaskItem,
  SheetMetadata,
  GoogleDocContent,
  PickedFileItem,
  DriveFolderNode,
  ExtractedContentMetadata,
  CommitStagedMoveItem,
  LedgerTransactionEntry
} from '../types';
import {
  evaluateFileDecision,
  extractDeepContentMetadata,
  isProtectedDirectory,
  DEFAULT_TAXONOMY_CONFIG
} from './decisionEngine';

// Resolve configuration with fallback hierarchy:
// 1. Environment variables (process.env.NEXT_PUBLIC_FIREBASE_* or Vite import.meta.env)
// 2. Local bundled configuration from firebase-applet-config.json
const env = typeof process !== 'undefined' && process.env ? process.env : ({} as Record<string, string | undefined>);
const viteEnv = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : {};

export const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || viteEnv.VITE_FIREBASE_API_KEY || bundledFirebaseConfig.apiKey,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || viteEnv.VITE_FIREBASE_AUTH_DOMAIN || bundledFirebaseConfig.authDomain,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || viteEnv.VITE_FIREBASE_PROJECT_ID || bundledFirebaseConfig.projectId,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || viteEnv.VITE_FIREBASE_STORAGE_BUCKET || bundledFirebaseConfig.storageBucket,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || bundledFirebaseConfig.messagingSenderId,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || viteEnv.VITE_FIREBASE_APP_ID || bundledFirebaseConfig.appId,
};

// Singleton Firebase App initialization
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use session persistence so credentials wipe when the browser session closes
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.warn('Session persistence note:', err?.message || err);
});

// Configure Google Provider with required scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/documents');
googleProvider.addScope('https://www.googleapis.com/auth/documents.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/tasks');

// Maintain backward compatibility for existing code importing 'provider'
export const provider = googleProvider;

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

    // C-04: Check if this folder already exists in Drive under currentParentId (Sanitize Query)
    try {
      const safeSegment = segment.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${safeSegment}' and '${currentParentId}' in parents and trashed = false`;
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

/**
 * Rename a file or folder on Google Drive
 */
export const renameDriveFile = async (token: string, fileId: string, newName: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: newName })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to rename file.");
  }
};

/**
 * Move a file to trash on Google Drive
 */
export const trashDriveFile = async (token: string, fileId: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to trash file.");
  }
};

/**
 * H-03: Real integration for duplication - Copies a file to a target destination
 */
export const copyDriveFile = async (
  token: string,
  fileId: string,
  destFolderId: string,
  newName?: string
): Promise<any> => {
  const body: any = {
    parents: [destFolderId]
  };
  if (newName) body.name = newName;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to copy file.");
  }

  return response.json();
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    throw new Error("Invalid recipient email address format.");
  }

  // C-04: Header Injection Prevention (Strip newlines)
  const safeTo = toEmail.replace(/[\r\n]/g, "").trim();
  const safeSubject = subject.replace(/[\r\n]/g, "").trim();

  const emailLines = [
    `To: ${safeTo}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${safeSubject}`,
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
// GOOGLE DOCS API (v1)
// ---------------------------------------------------------

/**
 * Extract plain text from Google Doc structural elements
 */
export const extractGoogleDocText = (doc: any): string => {
  if (!doc || !doc.body || !doc.body.content) return "";
  let fullText = "";

  for (const element of doc.body.content) {
    if (element.paragraph) {
      for (const pElement of element.paragraph.elements || []) {
        if (pElement.textRun && pElement.textRun.content) {
          fullText += pElement.textRun.content;
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            if (cellContent.paragraph) {
              for (const pElement of cellContent.paragraph.elements || []) {
                if (pElement.textRun && pElement.textRun.content) {
                  fullText += pElement.textRun.content.trim() + " | ";
                }
              }
            }
          }
        }
        fullText += "\n";
      }
    }
  }

  return fullText;
};

/**
 * Fetch a Google Doc by documentId using the Google Docs v1 API
 */
export const getGoogleDoc = async (token: string, documentId: string): Promise<GoogleDocContent> => {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to fetch Google Doc (${res.status})`);
  }

  const doc = await res.json();
  const plainText = extractGoogleDocText(doc);
  const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;

  return {
    documentId: doc.documentId,
    title: doc.title || "Untitled Document",
    revisionId: doc.revisionId,
    plainText,
    wordCount: words,
    characterCount: plainText.length,
    rawDoc: doc
  };
};

/**
 * Append text to a Google Doc using Docs batchUpdate (insertText)
 */
export const appendGoogleDocText = async (
  token: string,
  documentId: string,
  text: string
): Promise<any> => {
  const textToInsert = text.endsWith("\n") ? text : text + "\n";
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text: textToInsert
          }
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to append text to Google Doc");
  }

  return res.json();
};

/**
 * Create a new Google Doc using the Google Docs v1 API
 * Optionally relocates it into parentFolderId in Google Drive
 */
export const createGoogleDoc = async (
  token: string,
  title: string,
  initialContent?: string,
  parentFolderId?: string
): Promise<{ documentId: string; title: string; documentUrl: string }> => {
  const res = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: title.trim() || "Untitled Document" })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to create Google Doc");
  }

  const newDoc = await res.json();
  const documentId = newDoc.documentId;

  // Append initial text if provided
  if (initialContent && initialContent.trim()) {
    try {
      await appendGoogleDocText(token, documentId, initialContent);
    } catch (textErr) {
      console.warn("Could not append initial content to Google Doc:", textErr);
    }
  }

  // Relocate to parent folder if specified and not root
  if (parentFolderId && parentFolderId !== "root") {
    try {
      await moveDriveFile(token, documentId, parentFolderId, "root");
    } catch (moveErr) {
      console.warn("Could not relocate Google Doc to folder:", moveErr);
    }
  }

  return {
    documentId,
    title: newDoc.title || title,
    documentUrl: `https://docs.google.com/document/d/${documentId}/edit`
  };
};

// ---------------------------------------------------------
// GOOGLE PICKER API (Client-side interactive modal)
// ---------------------------------------------------------

/**
 * Loads the Google API client script and initializes the Google Picker module
 */
export const loadGooglePickerApi = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.picker) {
      resolve();
      return;
    }

    const checkGapi = () => {
      if ((window as any).gapi) {
        (window as any).gapi.load('picker', {
          callback: () => {
            if ((window as any).google?.picker) {
              resolve();
            } else {
              reject(new Error("Google Picker library failed to initialize"));
            }
          },
          onerror: () => reject(new Error("Failed to load Google Picker via gapi.load"))
        });
      } else {
        setTimeout(checkGapi, 120);
      }
    };

    if (!(window as any).gapi) {
      const existing = document.querySelector('script[src*="apis.google.com/js/api.js"]');
      if (existing) {
        existing.addEventListener('load', checkGapi);
        setTimeout(checkGapi, 200);
      } else {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.async = true;
        script.defer = true;
        script.onload = checkGapi;
        script.onerror = () => reject(new Error("Failed to load Google API script (api.js)"));
        document.body.appendChild(script);
      }
    } else {
      checkGapi();
    }
  });
};

/**
 * Open the Google Picker dialog
 * Follows the exact pattern from references/picker.md
 */
export const openGooglePicker = async (options: {
  token: string;
  onPick: (file: PickedFileItem) => void;
  onCancel?: () => void;
  mimeTypes?: string;
  viewId?: string;
}): Promise<void> => {
  await loadGooglePickerApi();

  const google = (window as any).google;
  if (!google?.picker) {
    throw new Error("Google Picker library is not ready.");
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
  if (options.mimeTypes) {
    view.setMimeTypes(options.mimeTypes);
  }

  const pickerBuilder = new google.picker.PickerBuilder()
    .addView(view)
    .addView(new google.picker.DocsUploadView())
    .setOAuthToken(options.token)
    .setCallback((data: any) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs?.[0];
        if (doc) {
          options.onPick({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            url: doc.url,
            sizeBytes: doc.sizeBytes,
            lastEditedUtc: doc.lastEditedUtc
          });
        }
      } else if (data.action === google.picker.Action.CANCEL) {
        options.onCancel?.();
      }
    })
    .setOrigin(pickerOrigin);

  const picker = pickerBuilder.build();
  picker.setVisible(true);
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

// ---------------------------------------------------------------------------
// GOOGLE DRIVE CONTENT INTELLIGENCE & TWO-PHASE TAXONOMY ENGINE TOOLS
// ---------------------------------------------------------------------------

export const ORGANISER_LEDGER_STORAGE_KEY = ".drive_organiser_ledger.json";
export const ORGANISER_LEDGER_FILENAME = ".drive_organiser_ledger.json";

/**
 * Generates an explicit confirmation token bound to a staged diff revision.
 */
export const generateConfirmationToken = (moveCount: number): string => {
  return `CONFIRM_DIFF_${moveCount}_${Date.now()}`;
};

/**
 * Reads the append-only transaction ledger (.drive_organiser_ledger.json).
 */
export const getOrganiserLedger = (): LedgerTransactionEntry[] => {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(ORGANISER_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Appends new transaction entries to .drive_organiser_ledger.json (local + optional Drive sync).
 */
export const appendToOrganiserLedger = async (
  entries: LedgerTransactionEntry[],
  token?: string | null
): Promise<LedgerTransactionEntry[]> => {
  const existing = getOrganiserLedger();
  const updated = [...existing, ...entries];
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ORGANISER_LEDGER_STORAGE_KEY, JSON.stringify(updated, null, 2));
    }
  } catch (err) {
    console.warn("Could not persist ledger to localStorage:", err);
  }

  // Best-effort sync of .drive_organiser_ledger.json to Google Drive root when token is active
  if (token) {
    try {
      const q = encodeURIComponent(`name = '${ORGANISER_LEDGER_FILENAME}' and trashed = false`);
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const existingLedgerFile = searchData.files?.[0];
        const jsonPayload = JSON.stringify(updated, null, 2);
        if (existingLedgerFile?.id) {
          await updateDriveTextFile(token, existingLedgerFile.id, jsonPayload);
        }
      }
    } catch {
      // Non-fatal if Drive ledger file sync is skipped
    }
  }

  return updated;
};

/**
 * Tool 1: list_drive_structure
 * Scans and returns the user's current Google Drive folder hierarchy with folder IDs and paths.
 */
export const listDriveStructure = async (
  token: string | null,
  rootFolderId = "root",
  depth = 3,
  localFiles: DriveFile[] = [],
  protectedPaths: string[] = DEFAULT_TAXONOMY_CONFIG.protectedPaths
): Promise<DriveFolderNode[]> => {
  const maxDepth = Math.max(1, Math.min(5, depth));
  let folderRecords: Array<{ id: string; name: string; parents?: string[] }> = [];

  if (token) {
    try {
      const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
      const fields = encodeURIComponent("files(id, name, parents)");
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        folderRecords = data.files || [];
      }
    } catch (err) {
      console.warn("Falling back to local folder inventory for listDriveStructure:", err);
    }
  }

  if (folderRecords.length === 0 && localFiles.length > 0) {
    folderRecords = localFiles
      .filter(f => f.mimeType === "application/vnd.google-apps.folder")
      .map(f => ({ id: f.id, name: f.name, parents: f.parents }));
  }

  const folderById = new Map<string, { id: string; name: string; parents?: string[] }>();
  for (const f of folderRecords) {
    folderById.set(f.id, f);
  }

  const buildPathAndDepth = (folder: { id: string; name: string; parents?: string[] }): { path: string; depth: number; parentId: string } => {
    const segments: string[] = [folder.name];
    let currentParentId = folder.parents?.[0] || "root";
    const visited = new Set<string>([folder.id]);

    while (
      currentParentId &&
      currentParentId !== "root" &&
      currentParentId !== rootFolderId &&
      folderById.has(currentParentId) &&
      !visited.has(currentParentId)
    ) {
      visited.add(currentParentId);
      const parentObj = folderById.get(currentParentId)!;
      segments.unshift(parentObj.name);
      currentParentId = parentObj.parents?.[0] || "root";
    }

    const fullPath = "/" + segments.join("/");
    return {
      path: fullPath,
      depth: segments.length,
      parentId: folder.parents?.[0] || "root"
    };
  };

  const nodes: DriveFolderNode[] = [];
  for (const f of folderRecords) {
    const { path, depth: d, parentId } = buildPathAndDepth(f);
    if (d <= maxDepth) {
      nodes.push({
        id: f.id,
        name: f.name,
        path,
        parentId,
        depth: d,
        isProtected: isProtectedDirectory(path, protectedPaths)
      });
    }
  }

  return nodes.sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * Tool 2: inspect_drive_file
 * Extracts raw text, OCR/export data, and structured metadata from a target file in Google Drive.
 * 1. Workspace Files (Docs, Sheets, Slides): Extracts plain text or CSV summary via Drive export API.
 * 2. Binary Documents (PDFs, Images, Scans): Samples first 2,000 tokens of available text/description/content.
 */
export const inspectDriveFile = async (
  token: string | null,
  fileId: string,
  tokenLimit = 2000,
  localFiles: DriveFile[] = []
): Promise<{
  fileId: string;
  fileName: string;
  mimeType: string;
  sampledText: string;
  metadata: ExtractedContentMetadata;
}> => {
  const localMatch = localFiles.find(f => f.id === fileId);
  let fileMeta: DriveFile = localMatch || {
    id: fileId,
    name: "Untitled Document",
    mimeType: "application/octet-stream"
  };

  let rawText = localMatch?.content || "";
  const charLimit = Math.max(500, tokenLimit * 4);

  if (token) {
    try {
      // Fetch file metadata & description if not already complete
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,description,createdTime,modifiedTime,parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metaRes.ok) {
        const remoteMeta = await metaRes.json();
        fileMeta = {
          ...fileMeta,
          id: remoteMeta.id || fileMeta.id,
          name: remoteMeta.name || fileMeta.name,
          mimeType: remoteMeta.mimeType || fileMeta.mimeType,
          createdTime: remoteMeta.createdTime || fileMeta.createdTime,
          modifiedTime: remoteMeta.modifiedTime || fileMeta.modifiedTime,
          parents: remoteMeta.parents || fileMeta.parents
        };
        if (remoteMeta.description && !rawText) {
          rawText = String(remoteMeta.description);
        }
      }

      const mime = (fileMeta.mimeType || "").toLowerCase();

      // 1. Google Workspace Files (Docs, Sheets, Slides) -> Drive Export API
      if (mime === "application/vnd.google-apps.document" || mime === "application/vnd.google-apps.presentation") {
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (exportRes.ok) {
          rawText = await exportRes.text();
        }
      } else if (mime === "application/vnd.google-apps.spreadsheet") {
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/csv")}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (exportRes.ok) {
          rawText = await exportRes.text();
        }
      } else if (
        mime.startsWith("text/") ||
        mime === "application/json" ||
        mime === "application/xml" ||
        /\.(txt|md|csv|json|ts|tsx|js|py|yaml|yml|log)$/i.test(fileMeta.name)
      ) {
        // Plain text / code media download
        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (mediaRes.ok) {
          rawText = await mediaRes.text();
        }
      }
    } catch (err) {
      console.warn(`Deep content fetch notice for ${fileId}:`, err);
    }
  }

  const sampledText = rawText.slice(0, charLimit);
  const metadata = extractDeepContentMetadata(fileMeta, sampledText, tokenLimit);

  return {
    fileId: fileMeta.id,
    fileName: fileMeta.name,
    mimeType: fileMeta.mimeType,
    sampledText,
    metadata
  };
};

/**
 * Tool 3: commit_staged_moves
 * Strictly fail-closed Phase 2 Commit:
 * - Requires a valid non-empty confirmation_token proving explicit user confirmation of the Staging Diff.
 * - Rejects any move targeting or originating from a Protected Directory (/Archive, /Templates, /.drive_appdata).
 * - Records every moved file to the append-only transaction ledger (.drive_organiser_ledger.json).
 */
export const commitStagedMoves = async (
  token: string | null,
  confirmationToken: string,
  moves: CommitStagedMoveItem[],
  localFiles: DriveFile[] = [],
  protectedPaths: string[] = DEFAULT_TAXONOMY_CONFIG.protectedPaths
): Promise<{
  transactionId: string;
  entries: LedgerTransactionEntry[];
  updatedLocalFiles: DriveFile[];
}> => {
  // Operational Invariant: Fail-closed confirmation check
  if (!confirmationToken || !confirmationToken.trim().startsWith("CONFIRM")) {
    throw new Error(
      "Fail-closed security block: Mutating actions require an explicit confirmation_token after reviewing the Phase 1 Staging Diff."
    );
  }

  if (!Array.isArray(moves) || moves.length === 0) {
    throw new Error("No staged moves provided to commit.");
  }

  const batchTransactionId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const timestampUtc = new Date().toISOString();
  const entries: LedgerTransactionEntry[] = [];
  let updatedLocalFiles = [...localFiles];

  // Cache created folder paths -> IDs during this batch
  const resolvedFolderIds = new Map<string, string>();
  for (const f of updatedLocalFiles) {
    if (f.mimeType === "application/vnd.google-apps.folder") {
      resolvedFolderIds.set(f.name.toLowerCase(), f.id);
      resolvedFolderIds.set(("/" + f.name).toLowerCase(), f.id);
    }
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const targetPath = move.to_folder_path || move.to_folder_id;

    // Guard against Protected Directories
    if (
      isProtectedDirectory(targetPath, protectedPaths) ||
      (move.from_folder_path && isProtectedDirectory(move.from_folder_path, protectedPaths))
    ) {
      throw new Error(
        `Protected Directory violation: Cannot move files into or out of protected path "${targetPath}".`
      );
    }

    let destinationFolderId = move.to_folder_id;

    // If to_folder_id is a path (e.g. "/Financial/Taxes/2025") or "NEW_FOLDER", resolve/create it
    if (!destinationFolderId || destinationFolderId.startsWith("/") || destinationFolderId.startsWith("NEW_")) {
      const cleanPath = (move.to_folder_path || destinationFolderId.replace(/^NEW_/, ""))
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const cacheKey = ("/" + cleanPath).toLowerCase();

      if (resolvedFolderIds.has(cacheKey)) {
        destinationFolderId = resolvedFolderIds.get(cacheKey)!;
      } else if (token && cleanPath) {
        const createdId = await createNestedDriveFolders(token, cleanPath, {});
        destinationFolderId = createdId;
        resolvedFolderIds.set(cacheKey, createdId);
      } else {
        const newLocalFolderId = `folder_${Date.now()}_${i}`;
        destinationFolderId = newLocalFolderId;
        resolvedFolderIds.set(cacheKey, newLocalFolderId);
        const leafName = cleanPath.split("/").pop() || cleanPath || "Organised";
        updatedLocalFiles.push({
          id: newLocalFolderId,
          name: leafName,
          mimeType: "application/vnd.google-apps.folder",
          parents: ["root"],
          modifiedTime: timestampUtc
        });
      }
    }

    const existingFile = updatedLocalFiles.find(f => f.id === move.file_id);
    const originalName = move.original_name || existingFile?.name || move.file_id;
    const appliedName = move.rename_to && move.rename_to.trim() ? move.rename_to.trim() : originalName;

    if (token) {
      if (destinationFolderId && destinationFolderId !== move.from_folder_id) {
        await moveDriveFile(token, move.file_id, destinationFolderId, move.from_folder_id);
      }
      if (appliedName !== originalName) {
        await renameDriveFile(token, move.file_id, appliedName);
      }
    }

    // Update local state representation
    updatedLocalFiles = updatedLocalFiles.map(f =>
      f.id === move.file_id
        ? {
            ...f,
            name: appliedName,
            parents: [destinationFolderId]
          }
        : f
    );

    const entry: LedgerTransactionEntry = {
      transaction_id: `${batchTransactionId}_${i + 1}`,
      batch_id: batchTransactionId,
      timestamp_utc: timestampUtc,
      file_id: move.file_id,
      original_parent_id: move.from_folder_id || "root",
      destination_parent_id: destinationFolderId,
      applied_name: appliedName,
      original_name: originalName,
      original_folder_path: move.from_folder_path || "Root (My Drive)",
      destination_folder_path: move.to_folder_path || destinationFolderId,
      reverted: false
    };
    entries.push(entry);
  }

  await appendToOrganiserLedger(entries, token);

  return {
    transactionId: batchTransactionId,
    entries,
    updatedLocalFiles
  };
};

/**
 * Atomic Rollback & Undo:
 * 1. Fetches the most recent non-reverted transaction batch from .drive_organiser_ledger.json.
 * 2. Moves each file back from its destination_parent_id to its original_parent_id (and restores original_name if renamed).
 * 3. Marks the ledger entries as reverted and returns the restored file paths.
 */
export const rollbackLastTransaction = async (
  token: string | null,
  localFiles: DriveFile[] = []
): Promise<{
  transactionId: string;
  restoredFiles: Array<{
    fileId: string;
    fileName: string;
    restoredParentId: string;
    restoredFolderPath: string;
  }>;
  updatedLocalFiles: DriveFile[];
}> => {
  const ledger = getOrganiserLedger();
  const activeEntries = ledger.filter(e => !e.reverted);
  if (activeEntries.length === 0) {
    throw new Error("No active transactions found in .drive_organiser_ledger.json to revert.");
  }

  const lastEntry = activeEntries[activeEntries.length - 1];
  const targetBatchId = lastEntry.batch_id || lastEntry.transaction_id;
  const batchEntries = activeEntries.filter(
    e => (e.batch_id || e.transaction_id) === targetBatchId
  );

  const restoredFiles: Array<{
    fileId: string;
    fileName: string;
    restoredParentId: string;
    restoredFolderPath: string;
  }> = [];
  let updatedLocalFiles = [...localFiles];

  for (const entry of batchEntries) {
    const restoreName = entry.original_name || entry.applied_name;
    if (token) {
      if (entry.original_parent_id && entry.original_parent_id !== entry.destination_parent_id) {
        await moveDriveFile(token, entry.file_id, entry.original_parent_id, entry.destination_parent_id);
      }
      if (entry.original_name && entry.original_name !== entry.applied_name) {
        await renameDriveFile(token, entry.file_id, entry.original_name);
      }
    }

    updatedLocalFiles = updatedLocalFiles.map(f =>
      f.id === entry.file_id
        ? {
            ...f,
            name: restoreName,
            parents: [entry.original_parent_id]
          }
        : f
    );

    restoredFiles.push({
      fileId: entry.file_id,
      fileName: restoreName,
      restoredParentId: entry.original_parent_id,
      restoredFolderPath: entry.original_folder_path || "Root (My Drive)"
    });
  }

  // Mark batch entries as reverted in .drive_organiser_ledger.json
  const updatedLedger = ledger.map(e =>
    (e.batch_id || e.transaction_id) === targetBatchId ? { ...e, reverted: true } : e
  );
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ORGANISER_LEDGER_STORAGE_KEY, JSON.stringify(updatedLedger, null, 2));
    }
  } catch (err) {
    console.warn("Failed to update ledger after rollback:", err);
  }

  return {
    transactionId: targetBatchId,
    restoredFiles,
    updatedLocalFiles
  };
};

