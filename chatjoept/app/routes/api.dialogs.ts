import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import {
  ensureUserExists,
  getAllUserDialogs,
  saveUserDialog,
  deleteUserDialog,
  deleteAllVisibleChats,
  deleteAllUserData,
  getUserQuotas,
} from "~/utils/db.server";
import type { ChatSession } from "~/types/chat";

// GET /api/dialogs -> list all visible dialogs & quotas
export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);

  const [dialogs, quotas] = await Promise.all([
    getAllUserDialogs(session.sub, env),
    getUserQuotas(session.sub, env),
  ]);

  return Response.json({ dialogs, quotas });
}

// POST /api/dialogs (save dialog) or DELETE /api/dialogs (delete dialog(s))
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
    if (!dialog || !dialog.id) {
      return Response.json({ error: "Missing dialog payload" }, { status: 400 });
    }

    const allowPastSoftLimit = Boolean(body?.isCompletion);
    const saveResult = await saveUserDialog(session.sub, dialog, env, {
      allowPastSoftLimit,
    });

    const quotas = await getUserQuotas(session.sub, env);

    if (!saveResult.success) {
      return Response.json(
        { error: saveResult.error, quotas },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      truncated: Boolean(saveResult.truncated),
      dialog: saveResult.savedDialog,
      quotas,
    });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const dialogId = url.searchParams.get("id");
    const deleteAll = url.searchParams.get("all") === "true";
    const includeShares = url.searchParams.get("includeShares") === "true";

    if (deleteAll) {
      if (includeShares) {
        await deleteAllUserData(session.sub, env);
      } else {
        await deleteAllVisibleChats(session.sub, env);
      }
      const quotas = await getUserQuotas(session.sub, env);
      return Response.json({ success: true, quotas });
    }

    if (!dialogId) {
      return Response.json({ error: "Missing dialog id" }, { status: 400 });
    }

    await deleteUserDialog(session.sub, dialogId, env);
    const quotas = await getUserQuotas(session.sub, env);
    return Response.json({ success: true, quotas });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
