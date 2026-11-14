import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { clearSessionCookie, isHttpsRequest } from "~/utils/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(isHttpsRequest(request)),
      },
    }
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(isHttpsRequest(request)),
      },
    }
  );
}
