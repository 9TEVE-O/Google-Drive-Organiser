import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DriveFile, TaskItem } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use session persistence so credentials wipe when the browser session closes
setPersistence(auth, browserSessionPersistence).catch(console.error);

// Configure Google Provider with required scopes
export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://www.googleapis.com/auth/tasks');

let isSigningIn = false;
let cachedAccessToken: string | null = sessionStorage.getItem('oauth_access_token');
let currentUser: User | null = null;

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
        sessionStorage.removeItem('oauth_access_token');
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('oauth_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger pop-up Based Google Authentication with scopes
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve OAuth access token from Firebase Authentication.');
    }
    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('oauth_access_token', credential.accessToken);
    currentUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
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
  sessionStorage.removeItem('oauth_access_token');
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
  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
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
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
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
  const metadata = {
    name: fileName.endsWith('.txt') ? fileName : `${fileName}.txt`,
    mimeType: "text/plain",
    parents: parentId ? [parentId] : undefined
  };

  // First create the file with metadata
  const resMeta = await fetch("https://www.googleapis.com/drive/v3/files", {
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
  const resContent = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
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
 * Edit content of a text document on Google Drive
 */
export const updateDriveTextFile = async (token: string, fileId: string, content: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
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
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    // If it's a structural file or fails, return empty
    return "";
  }

  return response.text();
};

/**
 * Move a file or folder into a parent folder
 */
export const moveDriveFile = async (token: string, fileId: string, newParentId: string, currentParentId?: string): Promise<void> => {
  // If we don't know the current parents, we retrieve them
  let parentsToRemove = currentParentId;
  if (!parentsToRemove) {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      parentsToRemove = (meta.parents || []).join(",");
    }
  }

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}`;
  if (parentsToRemove) {
    url += `&removeParents=${parentsToRemove}`;
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to move file within Google Drive.");
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
