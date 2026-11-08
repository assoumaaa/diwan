import { isLocalhostOrLoopbackIp } from "@rakazo/contracts";
import { MESSAGING_EMAIL_SUFFIX } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { CLIENT_IP_HEADER } from "./client-ip-header.js";

/**
 * Local mode signs in whoever uses Diwan on the computer that runs it. The request must come from
 * this machine, judged by the address the API resolved rather than one the caller chose, and from
 * a page opened on a loopback origin. Requests from any other device still sign in normally.
 */
export function localOwnerRequestAllowed(headers: Headers): boolean {
  const ip = headers.get(CLIENT_IP_HEADER);
  const origin = headers.get("origin");
  if (!ip || !origin || !isLocalhostOrLoopbackIp(ip)) {
    return false;
  }
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Signs this computer in as the install's owner: its first account, or a new one made from just a
 * name on a fresh install. Only registered when local mode is turned on.
 */
export function localOwner(prisma: PrismaClient): BetterAuthPlugin {
  return {
    id: "local-owner",
    endpoints: {
      localOwnerSignIn: createAuthEndpoint(
        "/local-owner/sign-in",
        { method: "POST" },
        async (ctx) => {
          if (!ctx.headers || !localOwnerRequestAllowed(ctx.headers)) {
            throw new APIError("FORBIDDEN", { message: "Local mode only works on this computer" });
          }
          const adapter = ctx.context.internalAdapter;
          const first = await prisma.user.findFirst({
            where: { NOT: { email: { endsWith: MESSAGING_EMAIL_SUFFIX } } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          let user = first ? await adapter.findUserById(first.id) : null;
          if (!user) {
            const body = (ctx.body ?? {}) as { name?: unknown };
            const name = typeof body.name === "string" ? body.name.trim() : "";
            if (!name) {
              throw new APIError("BAD_REQUEST", {
                code: "NAME_REQUIRED",
                message: "Enter your name",
              });
            }
            user = await adapter.createUser(
              { name, email: "owner@diwan.localhost", emailVerified: true },
              { method: "local-owner" },
            );
          }
          const session = await adapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ created: !first });
        },
      ),
    },
  };
}
