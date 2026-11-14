import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import {
  ensureUserExists,
  createSharedSnapshot,
  listUserSharedLinks,
  deleteUserSharedLink,
  deleteAllUserSharedLinks,
  getUserQuotas,
} from "~/utils/db.server";
import type { ChatSession } from "~/types/chat";

// GET /api/dialogs/share -> list all user shared snapshot links + quotas
export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);

  const [sharedLinks, quotas] = await Promise.all([
    listUserSharedLinks(session.sub, env),
    getUserQuotas(session.sub, env),
  ]);

  return Response.json({ sharedLinks, quotas });
}

// POST /api/dialogs/share -> create immutable hidden snapshot + link
// DELETE /api/dialogs/share -> delete shared link & free hidden snapshot storage
export async function action({ request }: ActionFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);

  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const dialog: ChatSession = body?.dialog;
    if (!dialog || !dialog.messages || dialog.messages.length === 0) {
      return Response.json({ error: "Cannot share an empty dialog" }, { status: 400 });
    }

    const result = await createSharedSnapshot(session.sub, dialog, env);
    const quotas = await getUserQuotas(session.sub, env);

    if (!result.success || !result.shareId) {
      return Response.json(
        { error: result.error || "Failed to create share snapshot", quotas },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const shareUrl = `${origin}/share/${result.shareId}`;

    return Response.json({
      success: true,
      shareId: result.shareId,
      shareUrl,
      quotas,
    });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const shareId = url.searchParams.get("shareId");
    const deleteAll = url.searchParams.get("all") === "true";

    if (deleteAll) {
      await deleteAllUserSharedLinks(session.sub, env);
    } else if (shareId) {
      await deleteUserSharedLink(session.sub, shareId, env);
    } else {
      return Response.json({ error: "Missing shareId parameter" }, { status: 400 });
    }

    const [sharedLinks, quotas] = await Promise.all([
      listUserSharedLinks(session.sub, env),
      getUserQuotas(session.sub, env),
    ]);

    return Response.json({ success: true, sharedLinks, quotas });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
