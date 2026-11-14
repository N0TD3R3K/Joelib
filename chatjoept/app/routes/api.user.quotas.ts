import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import { ensureUserExists, getUserQuotas } from "~/utils/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);
  const quotas = await getUserQuotas(session.sub, env);
  return Response.json({ quotas });
}
