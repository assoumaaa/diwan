import { afterEach, describe, expect, it, vi } from "vitest";
import { signInLocalOwner } from "./local-owner";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown = {}) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("signInLocalOwner", () => {
  it("signs in when the server lets this computer in", async () => {
    const fetch = respond(200, { created: false });
    await expect(signInLocalOwner()).resolves.toBe("signed-in");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/local-owner/sign-in",
      expect.objectContaining({ method: "POST", credentials: "include", body: "{}" }),
    );
  });

  it("sends the name for a fresh install", async () => {
    const fetch = respond(200, { created: true });
    await expect(signInLocalOwner("Omar")).resolves.toBe("signed-in");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/local-owner/sign-in",
      expect.objectContaining({ body: JSON.stringify({ name: "Omar" }) }),
    );
  });

  it("asks for a name when the install has no account yet", async () => {
    respond(400, { code: "NAME_REQUIRED" });
    await expect(signInLocalOwner()).resolves.toBe("needs-name");
  });

  it.each([
    ["local mode is off", 404],
    ["the request came from another device", 403],
    ["another bad request", 400],
  ])("falls back to normal sign-in when %s", async (_why, status) => {
    respond(status, { code: "OTHER" });
    await expect(signInLocalOwner()).resolves.toBe("unavailable");
  });

  it("falls back to normal sign-in when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      }),
    );
    await expect(signInLocalOwner()).resolves.toBe("unavailable");
  });
});
