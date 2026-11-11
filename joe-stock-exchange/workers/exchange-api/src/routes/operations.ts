import type { CompanyDetails, Direction, Severity } from "@joese/contracts";
import { quoteForPrice } from "@joese/market-rules";
import type { Env } from "../env";
import { requireAdministrator, requireOperator } from "../lib/auth";
import { randomToken, sha256 } from "../lib/crypto";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";
import { mapAsset, mapComment, mapNews } from "./market";

async function audit(
  env: Env,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  requestId: string | null,
): Promise<D1PreparedStatement> {
  return env.DB.prepare(
    `INSERT INTO audit_log
      (id, actor_user_id, action, target_type, target_id, before_json, after_json, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    createId("audit"), actorId, action, targetType, targetId,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    requestId,
  );
}

function validTicker(value: string): boolean {
  return /^[A-Z][A-Z0-9]{1,7}$/.test(value);
}

function validatedCompanyDetails(input: CompanyDetails): CompanyDetails {
  const overview = input.overview?.trim();
  if (!overview || overview.length > 5_000) {
    throw new HttpError(400, "INVALID_COMPANY_DETAILS", "Company overview must contain 1–5,000 characters.");
  }
  if (input.projectUrl) {
    try {
      const projectUrl = new URL(input.projectUrl);
      if (projectUrl.protocol !== "https:" && projectUrl.protocol !== "http:") throw new Error("Unsupported protocol");
    } catch {
      throw new HttpError(400, "INVALID_PROJECT_URL", "Project URL must be a valid HTTP or HTTPS address.");
    }
  }
  const focus = input.focus?.map((value) => value.trim()).filter(Boolean);
  if (focus && (focus.length > 12 || focus.some((value) => value.length > 80))) {
    throw new HttpError(400, "INVALID_COMPANY_FOCUS", "Use no more than 12 focus labels of up to 80 characters each.");
  }
  return { ...input, overview, ...(focus ? { focus } : {}) };
}

export async function handleOperations(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/v1/console/")) return null;
  const operator = await requireOperator(request, env);
  const requestId = request.headers.get("x-request-id");

  if (url.pathname === "/v1/console/assets" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM assets ORDER BY active DESC, asset_type DESC, ticker")
      .all<Record<string, unknown>>();
    return json(rows.results.map(mapAsset));
  }

  if (url.pathname === "/v1/console/assets" && request.method === "POST") {
    const body = await readJson<{
      ticker?: string;
      name?: string;
      description?: string;
      companyDetails?: CompanyDetails;
      developerUserId?: string;
      shareholders?: Array<{ userId: string; contributionCents: number; shares: number }>;
      publicFloatShares?: number;
    }>(request);
    const ticker = (body.ticker ?? "").trim().toUpperCase();
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim();
    const shareholders = body.shareholders ?? [];
    if (!validTicker(ticker) || name.length < 2 || description.length < 10) {
      throw new HttpError(400, "INVALID_LISTING", "Ticker, name, and a useful description are required.");
    }
    if (!body.developerUserId || shareholders.length === 0) {
      throw new HttpError(400, "SHAREHOLDERS_REQUIRED", "A developer and founding shareholders are required.");
    }
    const totalContribution = shareholders.reduce((total, item) => total + Number(item.contributionCents), 0);
    const totalShares = shareholders.reduce((total, item) => total + Number(item.shares), 0);
    if (!Number.isSafeInteger(totalContribution) || totalContribution < 500_000 || !Number.isSafeInteger(totalShares) || totalShares <= 0) {
      throw new HttpError(400, "FOUNDING_MINIMUM", "Founding shareholders must convert at least J$5,000 into whole shares.");
    }
    const developerAllocation = shareholders.find((item) => item.userId === body.developerUserId);
    if (!developerAllocation || shareholders.some((item) => item.userId !== body.developerUserId && item.shares >= developerAllocation.shares)) {
      throw new HttpError(400, "MAIN_SHAREHOLDER_REQUIRED", "The developer must be the listing's largest founding shareholder.");
    }
    const userIds = [...new Set(shareholders.map((item) => item.userId))];
    if (userIds.length !== shareholders.length) {
      throw new HttpError(400, "DUPLICATE_SHAREHOLDER", "Combine each founding shareholder into one allocation.");
    }
    const placeholders = userIds.map(() => "?").join(",");
    const users = await env.DB.prepare(
      `SELECT id, disposable_balance_cents FROM users WHERE status = 'active' AND role = 'member' AND id IN (${placeholders})`,
    ).bind(...userIds).all<{ id: string; disposable_balance_cents: number }>();
    if (users.results.length !== userIds.length) {
      throw new HttpError(400, "INVALID_SHAREHOLDER", "Every founding shareholder must be an active member.");
    }
    const balanceByUser = new Map(users.results.map((user) => [user.id, Number(user.disposable_balance_cents)]));
    const contributionByUser = new Map<string, number>();
    for (const item of shareholders) {
      if (!Number.isSafeInteger(item.contributionCents) || item.contributionCents <= 0 || !Number.isSafeInteger(item.shares) || item.shares <= 0) {
        throw new HttpError(400, "INVALID_ALLOCATION", "Each founding allocation needs positive whole cents and shares.");
      }
      contributionByUser.set(item.userId, (contributionByUser.get(item.userId) ?? 0) + item.contributionCents);
    }
    for (const [userId, contribution] of contributionByUser) {
      if ((balanceByUser.get(userId) ?? 0) < contribution) {
        throw new HttpError(409, "INSUFFICIENT_SHAREHOLDER_BALANCE", "A shareholder lacks the required disposable balance.");
      }
    }

    const assetId = createId("asset");
    const initialPriceCents = Math.max(1, Math.round(totalContribution / totalShares));
    const publicFloatShares = Number(body.publicFloatShares ?? Math.max(1, Math.floor(totalShares * 0.25)));
    if (!Number.isSafeInteger(publicFloatShares) || publicFloatShares <= 0 || publicFloatShares > totalShares) {
      throw new HttpError(400, "INVALID_PUBLIC_FLOAT", "Public float must be a positive whole-share amount no larger than the founding allocation.");
    }
    const details = validatedCompanyDetails({
      ...(body.companyDetails ?? { overview: description }),
      developer: body.companyDetails?.developer ?? body.developerUserId,
    });
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO assets
          (id, ticker, name, asset_type, description, company_details_json, developer_user_id,
           current_price_cents, open_price_cents, high_price_cents, low_price_cents,
           close_price_cents, previous_close_cents, ordinary_drift, volatility, hourly_cap, daily_cap)
         VALUES (?, ?, ?, 'stock', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.001, 0.02, 0.12, 0.35)`,
      ).bind(
        assetId, ticker, name, description, JSON.stringify(details), body.developerUserId,
        initialPriceCents, initialPriceCents, initialPriceCents, initialPriceCents,
        initialPriceCents, initialPriceCents,
      ),
      env.DB.prepare(
        "INSERT INTO price_points (id, asset_id, price_cents, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
      ).bind(createId("price"), assetId, initialPriceCents),
      env.DB.prepare(
        `INSERT INTO holdings
          (id, user_id, asset_id, holding_kind, quantity, reserved_quantity, average_cost_cents)
         VALUES (?, 'usr-joese-issuer', ?, 'stock', ?, ?, ?)`,
      ).bind(createId("holding"), assetId, publicFloatShares, publicFloatShares, initialPriceCents),
      env.DB.prepare(
        `INSERT INTO orders
          (id, user_id, asset_id, side, quantity, remaining_quantity, limit_price_cents)
         VALUES (?, 'usr-joese-issuer', ?, 'sell', ?, ?, ?)`,
      ).bind(
        createId("issuance"), assetId, publicFloatShares, publicFloatShares,
        quoteForPrice(initialPriceCents).askCents,
      ),
    ];
    for (const item of shareholders) {
      statements.push(
        env.DB.prepare(
          "UPDATE users SET disposable_balance_cents = disposable_balance_cents - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(item.contributionCents, item.userId),
        env.DB.prepare(
          `INSERT INTO holdings
            (id, user_id, asset_id, holding_kind, quantity, frozen_quantity, average_cost_cents)
           VALUES (?, ?, ?, 'shareholding', ?, ?, ?)`,
        ).bind(createId("holding"), item.userId, assetId, item.shares, item.shares, Math.round(item.contributionCents / item.shares)),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
           VALUES (?, ?, 'founding_shareholding', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'asset', ?)`,
        ).bind(createId("led"), item.userId, -item.contributionCents, item.userId, assetId, item.shares, assetId),
      );
    }
    statements.push(await audit(env, operator.id, "asset.create", "asset", assetId, null, { ticker, name, totalContribution, totalShares, publicFloatShares }, requestId));
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(409, "LISTING_CONFLICT", "The listing could not be created; verify the ticker and shareholder allocations.");
    }
    const row = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first<Record<string, unknown>>();
    return json(row ? mapAsset(row) : { id: assetId, ticker }, 201);
  }

  const assetMatch = url.pathname.match(/^\/v1\/console\/assets\/([A-Z0-9]+)$/i);
  if (assetMatch && request.method === "PATCH") {
    const ticker = assetMatch[1].toUpperCase();
    const before = await env.DB.prepare("SELECT * FROM assets WHERE ticker = ? LIMIT 1")
      .bind(ticker).first<Record<string, unknown>>();
    if (!before) throw new HttpError(404, "ASSET_NOT_FOUND", "That listing was not found.");
    const body = await readJson<{ name?: string; description?: string; companyDetails?: CompanyDetails; active?: boolean }>(request);
    const name = body.name?.trim() ?? String(before.name);
    const description = body.description?.trim() ?? String(before.description);
    if (name.length < 2 || description.length < 10) {
      throw new HttpError(400, "INVALID_ASSET_COPY", "Name and a useful description are required.");
    }
    let details = String(before.company_details_json);
    if (body.companyDetails) details = JSON.stringify(validatedCompanyDetails(body.companyDetails));
    const active = body.active == null ? Number(before.active) : body.active ? 1 : 0;
    const after = { name, description, companyDetails: JSON.parse(details), active: Boolean(active) };
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE assets SET name = ?, description = ?, company_details_json = ?, active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE ticker = ?`,
      ).bind(name, description, details, active, ticker),
      await audit(env, operator.id, "asset.update", "asset", String(before.id), before, after, requestId),
    ]);
    const row = await env.DB.prepare("SELECT * FROM assets WHERE ticker = ?").bind(ticker).first<Record<string, unknown>>();
    return json(mapAsset(row!));
  }

  if (url.pathname === "/v1/console/news" && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT n.*, COALESCE(u.username, 'The Joe Wire') AS author_name
         FROM news_events n LEFT JOIN users u ON u.id = n.author_id
        ORDER BY n.created_at DESC LIMIT 200`,
    ).all<Record<string, unknown>>();
    return json(rows.results.map(mapNews));
  }

  if (url.pathname === "/v1/console/news" && request.method === "POST") {
    const body = await readJson<{
      headline?: string; article?: string; category?: string; direction?: Direction;
      severity?: Severity; affectedTickers?: string[]; durationTicks?: number;
      status?: "draft" | "scheduled" | "published"; publishAt?: string;
    }>(request);
    const headline = (body.headline ?? "").trim();
    const article = (body.article ?? "").trim();
    const direction = body.direction ?? "uncertain";
    const severity = body.severity ?? "mild";
    const durationTicks = Number(body.durationTicks ?? 1);
    const status = body.status ?? "draft";
    const allowedCategories = ["launch", "discovery", "scandal", "cultural event", "research result", "infrastructure incident", "Joekemon event"];
    const affectedTickers = [...new Set((body.affectedTickers ?? []).map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
    if (headline.length < 5 || headline.length > 180 || article.length < 20 || article.length > 5_000 || ![1, 2, 3].includes(durationTicks)) {
      throw new HttpError(400, "INVALID_NEWS_EVENT", "Headline, article, and a one-to-three-tick duration are required.");
    }
    if (!body.category || !allowedCategories.includes(body.category) || !["bullish", "bearish", "mixed", "uncertain"].includes(direction) || !["mild", "moderate", "major"].includes(severity) || !["draft", "scheduled", "published"].includes(status)) {
      throw new HttpError(400, "INVALID_NEWS_CLASSIFICATION", "Category, direction, and severity are required.");
    }
    if (affectedTickers.length === 0 || affectedTickers.length > 12) {
      throw new HttpError(400, "AFFECTED_LISTINGS_REQUIRED", "Choose between one and 12 affected listings.");
    }
    const tickerPlaceholders = affectedTickers.map(() => "?").join(",");
    const validAssets = await env.DB.prepare(
      `SELECT ticker FROM assets WHERE active = 1 AND ticker IN (${tickerPlaceholders})`,
    ).bind(...affectedTickers).all<{ ticker: string }>();
    if (validAssets.results.length !== affectedTickers.length) {
      throw new HttpError(400, "INVALID_AFFECTED_LISTING", "Every affected ticker must be an active listing.");
    }
    if (status === "scheduled") {
      const publishAt = body.publishAt ? new Date(body.publishAt) : null;
      if (!publishAt || Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
        throw new HttpError(400, "INVALID_PUBLISH_TIME", "A scheduled event needs a valid future publication time.");
      }
    }
    if (severity === "major" && status !== "draft") {
      const existingMajor = await env.DB.prepare(
        `SELECT id FROM news_events
          WHERE severity = 'major' AND status IN ('scheduled', 'published')
            AND date(COALESCE(publish_at, published_at, created_at)) = date(COALESCE(?, CURRENT_TIMESTAMP)) LIMIT 1`,
      ).bind(body.publishAt ?? null).first();
      if (existingMajor) throw new HttpError(409, "MAJOR_EVENT_LIMIT", "Only one major Joe Wire event may be scheduled per market day.");
    }
    const id = createId("news");
    const publishedAt = status === "published" ? new Date().toISOString() : null;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO news_events
          (id, headline, article, category, direction, severity, affected_tickers_json,
           duration_ticks, author_id, status, publish_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, headline, article, body.category, direction, severity,
        JSON.stringify(affectedTickers),
        durationTicks, operator.id, status, body.publishAt ?? null, publishedAt,
      ),
      await audit(env, operator.id, "news.create", "news_event", id, null, body, requestId),
    ]);
    return json({ id, headline, status }, 201);
  }

  if (url.pathname === "/v1/console/comments" && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT c.*, a.ticker AS asset_ticker, u.username AS author_name
         FROM comments c JOIN users u ON u.id = c.user_id JOIN assets a ON a.id = c.asset_id
        ORDER BY c.created_at DESC LIMIT 300`,
    ).all<Record<string, unknown>>();
    return json(rows.results.map(mapComment));
  }

  const commentMatch = url.pathname.match(/^\/v1\/console\/comments\/([^/]+)$/);
  if (commentMatch && request.method === "PATCH") {
    const body = await readJson<{ status?: "visible" | "hidden" | "flagged" }>(request);
    if (!body.status || !["visible", "hidden", "flagged"].includes(body.status)) {
      throw new HttpError(400, "INVALID_COMMENT_STATUS", "Choose visible, hidden, or flagged.");
    }
    const before = await env.DB.prepare("SELECT * FROM comments WHERE id = ?").bind(commentMatch[1]).first<Record<string, unknown>>();
    if (!before) throw new HttpError(404, "COMMENT_NOT_FOUND", "That comment was not found.");
    await env.DB.batch([
      env.DB.prepare("UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, commentMatch[1]),
      await audit(env, operator.id, "comment.moderate", "comment", commentMatch[1], before, { status: body.status }, requestId),
    ]);
    return json({ id: commentMatch[1], status: body.status });
  }

  if (url.pathname === "/v1/console/members" && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT id, email, username, role, status, disposable_balance_cents,
              borrowed_principal_cents, verified_at, created_at
         FROM users ORDER BY created_at DESC LIMIT 500`,
    ).all<Record<string, unknown>>();
    return json(rows.results);
  }

  if (url.pathname === "/v1/console/invitations" && request.method === "POST") {
    await requireAdministrator(request, env);
    const body = await readJson<{ maxUses?: number; expiresAt?: string }>(request);
    const maxUses = Number(body.maxUses ?? 1);
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 100) {
      throw new HttpError(400, "INVALID_INVITE_LIMIT", "Invitation use limit must be between 1 and 100.");
    }
    const code = randomToken(30);
    const id = createId("invite");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO invitation_codes (id, code_hash, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?)",
      ).bind(id, await sha256(code), maxUses, body.expiresAt ?? null, operator.id),
      await audit(env, operator.id, "invitation.create", "invitation", id, null, { maxUses, expiresAt: body.expiresAt ?? null }, requestId),
    ]);
    return json({ id, code, maxUses, expiresAt: body.expiresAt ?? null, warning: "This plaintext code is shown once." }, 201);
  }

  if (url.pathname === "/v1/console/audit" && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT a.*, u.username AS actor_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 500`,
    ).all<Record<string, unknown>>();
    return json(rows.results);
  }

  if (url.pathname === "/v1/console/market" && request.method === "GET") {
    const ticks = await env.DB.prepare("SELECT * FROM market_ticks ORDER BY started_at DESC LIMIT 50")
      .all<Record<string, unknown>>();
    const orders = await env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY status",
    ).all<Record<string, unknown>>();
    return json({ ticks: ticks.results, orders: orders.results });
  }

  return null;
}

