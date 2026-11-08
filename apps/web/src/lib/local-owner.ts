export type LocalOwnerResult = "signed-in" | "needs-name" | "unavailable";

/** A full load, so the app starts with the session the server just set. */
export function reloadInto(path: string): void {
  window.location.assign(path);
}

/**
 * Asks the server to sign in this computer as the install's owner. Anything but success, including
 * local mode being off or the request coming from another device, falls back to normal sign-in.
 */
export async function signInLocalOwner(name?: string): Promise<LocalOwnerResult> {
  try {
    const response = await fetch("/api/auth/local-owner/sign-in", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(name === undefined ? {} : { name }),
    });
    if (response.ok) {
      return "signed-in";
    }
    if (response.status !== 400) {
      return "unavailable";
    }
    const body = (await response.json().catch(() => ({}))) as { code?: unknown };
    return body.code === "NAME_REQUIRED" ? "needs-name" : "unavailable";
  } catch {
    return "unavailable";
  }
}
