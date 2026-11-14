import type { ActionFunctionArgs } from "react-router";
import {
  clearSessionCookie,
  getAuthenticatedUser,
  getEnv,
  isHttpsRequest,
} from "~/utils/auth.server";
import { deleteUserAccount } from "~/utils/db.server";

// DELETE /api/user -> deletes ChatJoePT account & all D1 user data (leaves JoeAuth untouched)
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteUserAccount(session.sub, env);

  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(isHttpsRequest(request)),
      },
    }
  );
}
