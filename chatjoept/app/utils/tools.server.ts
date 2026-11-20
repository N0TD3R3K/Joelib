// Server-side OpenAI-compatible Tool Definitions & Executors
// 1. DeepSeek Search API (POST /v1/tools/search) & Fetch API (POST /v1/tools/fetch)
// 2. On-demand Joelib repository reference lookup (N0TD3R3K/Joelib)

const JOELIB_OWNER = "N0TD3R3K";
const JOELIB_REPO = "Joelib";
const JOELIB_BRANCH = "main";

const CURATED_JOELIB_INDEX = [
  { path: "README.md", summary: "Joelib overview and links to Joe Universe literature, language, and science tools." },
  { path: "CONTRIBUTING.md", summary: "Contribution guidelines for the Joelib repository." },
  { path: "joelements/joelements.json", summary: "Complete JSON dataset of the Joeriodic Table of Joelements (118 elements, nicknames, families)." },
  { path: "Joekemons/Joekemon - Kanjoe.tsv", summary: "Joekemon dataset for the Kanjoe region." },
  { path: "Joekemons/Joekemon - Joeto.tsv", summary: "Joekemon dataset for the Joeto region." },
  { path: "Joekemons/Joekemon - Hoenn.tsv", summary: "Check tree for exact Joekemon TSV region names." },
  { path: "joeglish_translator/scripts/entries_words.json", summary: "Joeglish translator dictionary word entries." },
  { path: "JoeLang/README.md", summary: "JoeLang programming language overview and documentation index." },
  { path: "jpp/Joe.hpp", summary: "J++ (jpp) header definitions for Joe Universe programming." },
];

interface GitTreeItem {
  path: string;
  type: string;
  size?: number;
}

let cachedJoelibTree: { items: GitTreeItem[]; expiresAt: number } | null = null;

async function fetchJoelibTree(): Promise<GitTreeItem[]> {
  if (cachedJoelibTree && Date.now() < cachedJoelibTree.expiresAt) {
    return cachedJoelibTree.items;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${JOELIB_OWNER}/${JOELIB_REPO}/git/trees/${JOELIB_BRANCH}?recursive=1`,
      {
        headers: {
          "User-Agent": "ChatJoePT-Worker/1.0",
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) {
      return CURATED_JOELIB_INDEX.map((x) => ({ path: x.path, type: "blob" }));
    }
    const data = (await res.json()) as { tree?: GitTreeItem[] };
    const blobs = (data.tree || []).filter((item) => item.type === "blob");
    cachedJoelibTree = { items: blobs, expiresAt: Date.now() + 10 * 60 * 1000 };
    return blobs;
  } catch {
    return CURATED_JOELIB_INDEX.map((x) => ({ path: x.path, type: "blob" }));
  }
}

export async function searchJoelib(query: string): Promise<string> {
  const cleanQuery = (query || "").trim().toLowerCase();
  const terms = cleanQuery.split(/\s+/).filter(Boolean);
  const tree = await fetchJoelibTree();

  const scored = tree
    .filter((item) => {
      const p = item.path.toLowerCase();
      // Skip binary blobs
      if (/\.(png|jpg|jpeg|gif|ico|pdf|zip|woff2?|ttf|ds_store)$/i.test(p)) {
        return false;
      }
      if (terms.length === 0) return true;
      const curated = CURATED_JOELIB_INDEX.find((c) => c.path.toLowerCase() === p);
      const haystack = `${p} ${curated?.summary || ""}`.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .slice(0, 25)
    .map((item) => {
      const curated = CURATED_JOELIB_INDEX.find(
        (c) => c.path.toLowerCase() === item.path.toLowerCase()
      );
      return {
        path: item.path,
        size: item.size,
        description: curated?.summary || undefined,
      };
    });

  return JSON.stringify({
    repository: `${JOELIB_OWNER}/${JOELIB_REPO}`,
    matches: scored,
    hint: "Use read_joelib_document with a matching path (and optional query filter) to read exact contents.",
  });
}

export async function readJoelibDocument(
  docPath: string,
  filterQuery?: string
): Promise<string> {
  const cleanPath = (docPath || "").trim().replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..") || cleanPath.includes("\\")) {
    return JSON.stringify({ error: "Invalid Joelib document path." });
  }

  const rawUrl = `https://raw.githubusercontent.com/${JOELIB_OWNER}/${JOELIB_REPO}/${JOELIB_BRANCH}/${cleanPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  try {
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": "ChatJoePT-Worker/1.0" },
    });
    if (!res.ok) {
      return JSON.stringify({
        error: `Document not found at '${cleanPath}' (HTTP ${res.status}). Call search_joelib first to find exact paths.`,
      });
    }

    const text = await res.text();
    const filter = (filterQuery || "").trim().toLowerCase();

    if (filter && text.length > 4000) {
      // Line- or JSON-entry based filtering so huge files like joelements.json return exact matches cleanly
      if (cleanPath.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          const snippets: any[] = [];
          const scan = (node: any) => {
            if (snippets.length >= 15) return;
            if (Array.isArray(node)) {
              for (const item of node) scan(item);
            } else if (node && typeof node === "object") {
              const serialized = JSON.stringify(node).toLowerCase();
              const hasNestedArrays = Object.values(node).some((v) => Array.isArray(v));
              if (!hasNestedArrays && serialized.includes(filter)) {
                snippets.push(node);
              } else {
                for (const val of Object.values(node)) {
                  if (val && typeof val === "object") scan(val);
                }
              }
            }
          };
          scan(parsed);
          if (snippets.length > 0) {
            return JSON.stringify({
              path: cleanPath,
              filteredBy: filterQuery,
              matches: snippets,
            });
          }
        } catch {
          // Fall back to line filtering below
        }
      }

      const lines = text.split("\n");
      const matchedLines = lines.filter((line) => line.toLowerCase().includes(filter));
      if (matchedLines.length > 0) {
        const joined = matchedLines.slice(0, 60).join("\n").slice(0, 10000);
        return JSON.stringify({
          path: cleanPath,
          filteredBy: filterQuery,
          totalMatchingLines: matchedLines.length,
          content: joined,
        });
      }
    }

    const maxChars = 10000;
    const truncated = text.length > maxChars;
    return JSON.stringify({
      path: cleanPath,
      truncated,
      content: truncated ? `${text.slice(0, maxChars)}\n\n...[truncated]` : text,
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Failed to fetch Joelib document: ${err?.message || "network error"}`,
    });
  }
}

export async function runDeepSeekSearch(
  query: string,
  oriQuestion: string,
  options: { apiKey: string; baseUrl: string; count?: number }
): Promise<string> {
  const cleanQuery = (query || "").trim().slice(0, 128);
  if (!cleanQuery) {
    return JSON.stringify({ error: "Search query must not be empty." });
  }

  try {
    const res = await fetch(`${options.baseUrl}/v1/tools/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: cleanQuery,
        count: Math.min(20, Math.max(1, options.count || 8)),
        ori_question: (oriQuestion || cleanQuery).slice(0, 128),
        need_content: false,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return JSON.stringify({
        error: `Search API error (${res.status}): ${(data as any)?.error?.message || "unavailable"}`,
      });
    }
    return JSON.stringify(data);
  } catch (err: any) {
    return JSON.stringify({
      error: `Search request failed: ${err?.message || "network error"}`,
    });
  }
}

export async function runDeepSeekFetch(
  targetUrl: string,
  options: { apiKey: string; baseUrl: string }
): Promise<string> {
  const cleanUrl = (targetUrl || "").trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    return JSON.stringify({ error: "URL must start with http:// or https://." });
  }

  try {
    const res = await fetch(`${options.baseUrl}/v1/tools/fetch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: cleanUrl }),
    });

    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return JSON.stringify({
        error: `Fetch API error (${res.status}): ${data?.error?.message || "could not retrieve page"}`,
      });
    }

    const content = typeof data?.content === "string" ? data.content : "";
    const maxChars = 12000;
    return JSON.stringify({
      url: cleanUrl,
      title: data?.title || "",
      truncated: content.length > maxChars,
      content: content.length > maxChars ? `${content.slice(0, maxChars)}\n\n...[truncated]` : content,
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Fetch request failed: ${err?.message || "network error"}`,
    });
  }
}

export function getChatToolDefinitions(webSearch: boolean) {
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "search_joelib",
        description:
          "Search the N0TD3R3K/Joelib reference repository (Joe Universe literature, Joeriodic Table of Joelements, Joekemons, JoeLang, Joeglish vocabulary). Call only when the user asks about Joelib or Joe Universe subjects.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Keywords or topic to find matching files in Joelib (e.g. 'joelements', 'joekemon', 'joelang', 'README').",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_joelib_document",
        description:
          "Read the contents of a specific document from N0TD3R3K/Joelib discovered via search_joelib. Pass an optional filter query when inspecting large datasets like joelements/joelements.json.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Repository file path, e.g. 'README.md' or 'joelements/joelements.json'.",
            },
            query: {
              type: "string",
              description: "Optional case-insensitive filter keyword to extract matching entries from large files.",
            },
          },
          required: ["path"],
        },
      },
    },
  ];

  if (webSearch) {
    tools.push(
      {
        type: "function",
        function: {
          name: "deepseek_search",
          description:
            "Search the live internet (Joeternet) for up-to-date information, documentation, news, and webpages.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query (1 to 128 characters). Supports operators like site:, -site:, lang:, after:YYYY-MM-DD.",
              },
              count: {
                type: "integer",
                description: "Number of search results to return (1 to 20, default 8).",
              },
            },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "deepseek_fetch",
          description: "Fetch the clean Markdown content of a specific webpage URL.",
          parameters: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The HTTP/HTTPS URL of the webpage to read.",
              },
            },
            required: ["url"],
          },
        },
      }
    );
  }

  return tools;
}

export async function executeChatTool(
  name: string,
  rawArgs: string,
  context: { apiKey: string; baseUrl: string; userQuestion: string }
): Promise<string> {
  let args: Record<string, any> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case "search_joelib":
      return searchJoelib(String(args.query || ""));
    case "read_joelib_document":
      return readJoelibDocument(String(args.path || ""), args.query ? String(args.query) : undefined);
    case "deepseek_search":
      return runDeepSeekSearch(String(args.query || ""), context.userQuestion, {
        apiKey: context.apiKey,
        baseUrl: context.baseUrl,
        count: typeof args.count === "number" ? args.count : 8,
      });
    case "deepseek_fetch":
      return runDeepSeekFetch(String(args.url || ""), {
        apiKey: context.apiKey,
        baseUrl: context.baseUrl,
      });
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
