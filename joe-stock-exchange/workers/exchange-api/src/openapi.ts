export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "JOE Stock Exchange API",
    version: "0.1.0",
    description: "API for the closed, fictional JOESE member exchange and its role-protected operations console.",
  },
  servers: [
    { url: "https://api.joese.derekli.dev/v1", description: "Production" },
    { url: "http://127.0.0.1:8787/v1", description: "Local Wrangler" },
  ],
  tags: [
    { name: "Auth" }, { name: "Market" }, { name: "Portfolio" },
    { name: "Orders" }, { name: "Transfers" }, { name: "Console" },
  ],
  paths: {
    "/health": { get: { tags: ["Market"], summary: "Service health", responses: { "200": { description: "Healthy" } } } },
    "/auth/register": { post: { tags: ["Auth"], summary: "Register one school-email account", responses: { "201": { description: "Verification sent" } } } },
    "/auth/verify-email": { post: { tags: ["Auth"], summary: "Verify school email", responses: { "200": { description: "Account activated" } } } },
    "/auth/login": { post: { tags: ["Auth"], summary: "Create an HttpOnly session", responses: { "200": { description: "Signed in" } } } },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Destroy the current session", responses: { "200": { description: "Signed out" } } } },
    "/market/snapshot": { get: { tags: ["Market"], summary: "Assets, prices, news, and visible comments", responses: { "200": { description: "Current snapshot" } } } },
    "/market/assets/{ticker}": { get: { tags: ["Market"], summary: "Listing detail and history", parameters: [{ name: "ticker", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Listing detail" } } } },
    "/comments": {
      get: { tags: ["Market"], summary: "Visible comments", responses: { "200": { description: "Comments" } } },
      post: { tags: ["Market"], summary: "Post a member comment", security: [{ sessionCookie: [] }], responses: { "201": { description: "Comment created" } } },
    },
    "/me/portfolio": { get: { tags: ["Portfolio"], summary: "Balance and holdings in shareholding, stock, crypto order", security: [{ sessionCookie: [] }], responses: { "200": { description: "Portfolio" } } } },
    "/me/inbox": { get: { tags: ["Portfolio"], summary: "Pending incoming transfers and seller-created share offers", security: [{ sessionCookie: [] }], responses: { "200": { description: "Inbox" } } } },
    "/me/settings": { patch: { tags: ["Portfolio"], summary: "Update username and rise/fall colors", security: [{ sessionCookie: [] }], responses: { "200": { description: "Settings saved" } } } },
    "/orders": {
      get: { tags: ["Orders"], summary: "List the signed-in member's orders", security: [{ sessionCookie: [] }], responses: { "200": { description: "Order history" } } },
      post: { tags: ["Orders"], summary: "Reserve funds or holdings and place a price-time-matched order", security: [{ sessionCookie: [] }], responses: { "201": { description: "Order accepted" }, "423": { description: "Market closed or locked" } } },
    },
    "/orders/{id}/cancel": { post: { tags: ["Orders"], summary: "Cancel an open order and release its remaining reservation", security: [{ sessionCookie: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order cancelled" } } } },
    "/transfers": { post: { tags: ["Transfers"], summary: "Create a receiver-accepted J$ transfer", security: [{ sessionCookie: [] }], responses: { "201": { description: "Transfer pending" } } } },
    "/transfers/{id}/{action}": { post: { tags: ["Transfers"], summary: "Receiver accepts or declines a transfer", security: [{ sessionCookie: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "action", in: "path", required: true, schema: { type: "string", enum: ["accept", "decline"] } }], responses: { "200": { description: "Transfer resolved" } } } },
    "/share-offers": { post: { tags: ["Transfers"], summary: "Seller offers frozen shares to a named buyer", description: "There is intentionally no buyer-request endpoint.", security: [{ sessionCookie: [] }], responses: { "201": { description: "Share offer pending" } } } },
    "/share-offers/{id}/{action}": { post: { tags: ["Transfers"], summary: "Named buyer accepts or declines a share offer", security: [{ sessionCookie: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "action", in: "path", required: true, schema: { type: "string", enum: ["accept", "decline"] } }], responses: { "200": { description: "Offer resolved" } } } },
    "/console/assets": {
      get: { tags: ["Console"], summary: "List console assets", security: [{ sessionCookie: [] }], responses: { "200": { description: "Assets" } } },
      post: { tags: ["Console"], summary: "Launch a developer project as a shareholder-funded listing", security: [{ sessionCookie: [] }], responses: { "201": { description: "Listing created" } } },
    },
    "/console/assets/{ticker}": { patch: { tags: ["Console"], summary: "Edit listing details and description without directly editing price", security: [{ sessionCookie: [] }], parameters: [{ name: "ticker", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Listing updated" } } } },
    "/console/news": {
      get: { tags: ["Console"], summary: "List all Joe Wire events", security: [{ sessionCookie: [] }], responses: { "200": { description: "Events" } } },
      post: { tags: ["Console"], summary: "Create or schedule a structured Joe Wire event", security: [{ sessionCookie: [] }], responses: { "201": { description: "Event created" } } },
    },
    "/console/comments": { get: { tags: ["Console"], summary: "List comments for moderation", security: [{ sessionCookie: [] }], responses: { "200": { description: "Comments" } } } },
    "/console/comments/{id}": { patch: { tags: ["Console"], summary: "Moderate a comment", security: [{ sessionCookie: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Comment updated" } } } },
    "/console/members": { get: { tags: ["Console"], summary: "List member and staff accounts", security: [{ sessionCookie: [] }], responses: { "200": { description: "Accounts" } } } },
    "/console/market": { get: { tags: ["Console"], summary: "Read recent market ticks and order totals", security: [{ sessionCookie: [] }], responses: { "200": { description: "Market operations status" } } } },
    "/console/audit": { get: { tags: ["Console"], summary: "Read the attributed operator audit log", security: [{ sessionCookie: [] }], responses: { "200": { description: "Audit entries" } } } },
    "/console/invitations": { post: { tags: ["Console"], summary: "Create a one-time or limited-use invitation (administrator only)", security: [{ sessionCookie: [] }], responses: { "201": { description: "Invitation shown once" } } } },
  },
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "joese_session" },
    },
  },
} as const;

