import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER } from "./client-ip-header.js";
import { localOwnerRequestAllowed } from "./local-owner.js";

function request(ip: string | null, origin: string | null) {
  const headers = new Headers();
  if (ip !== null) headers.set(CLIENT_IP_HEADER, ip);
  if (origin !== null) headers.set("origin", origin);
  return headers;
}

describe("local owner sign-in", () => {
  it.each([
    ["127.0.0.1", "http://127.0.0.1:5183"],
    ["::1", "http://localhost:5183"],
  ])("lets this computer in: %s from %s", (ip, origin) => {
    expect(localOwnerRequestAllowed(request(ip, origin))).toBe(true);
  });

  it.each([
    ["a tailnet phone", "100.101.102.103", "http://127.0.0.1:5183"],
    ["a device on the local network", "192.168.1.20", "http://127.0.0.1:5183"],
    ["a page opened on the tailnet address", "127.0.0.1", "https://mac.example.ts.net:5183"],
    ["a page on another site", "127.0.0.1", "https://evil.example.com"],
    ["a request with no origin", "127.0.0.1", null],
    ["a request with no resolved address", null, "http://127.0.0.1:5183"],
    ["a malformed origin", "127.0.0.1", "not a url"],
  ])("keeps out %s", (_who, ip, origin) => {
    expect(localOwnerRequestAllowed(request(ip, origin))).toBe(false);
  });
});
