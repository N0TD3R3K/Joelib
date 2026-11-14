import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("share/:shareId", "routes/share.$shareId.tsx"),
  route("auth/login", "routes/auth.login.ts"),
  route("auth/callback", "routes/auth.callback.ts"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/dialogs", "routes/api.dialogs.ts"),
  route("api/dialogs/share", "routes/api.dialogs.share.ts"),
  route("api/user/quotas", "routes/api.user.quotas.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
] satisfies RouteConfig;
