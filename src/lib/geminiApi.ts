import { auth } from "./googleApi";

async function sendAuthenticatedRequest(
  input: RequestInfo | URL,
  init: RequestInit,
  forceRefresh: boolean
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in is required before using Gemini features.");
  }

  const idToken = await user.getIdToken(forceRefresh);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${idToken}`);

  return fetch(input, {
    ...init,
    headers
  });
}

/**
 * Authenticated transport for server-backed Gemini capability.
 * A 401 receives one forced Firebase token refresh before the response is returned.
 */
export async function geminiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  let response = await sendAuthenticatedRequest(input, init, false);
  if (response.status === 401) {
    response = await sendAuthenticatedRequest(input, init, true);
  }
  return response;
}
