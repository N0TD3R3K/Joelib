import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "ChatJoePT" },
  { name: "description", content: "The official ChatGPT replica of the Joe Universe" },
  { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
];

const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem("chatjoept_settings_v1");var parsed=raw?JSON.parse(raw):null;var t=parsed&&parsed.theme?parsed.theme:"system";var isDark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",!!isDark);}catch(e){if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark");}}})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body className="bg-white dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec] font-sans antialiased selection:bg-[#10a37f]/30">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found in the Joe Universe."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#f4f4f4] dark:bg-[#2f2f2f] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-xl text-center">
        <h1 className="text-2xl font-bold mb-2 text-red-500 dark:text-red-400">{message}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{details}</p>
        {stack && (
          <pre className="text-left text-xs bg-white dark:bg-[#171717] p-3 rounded overflow-x-auto text-gray-600 dark:text-gray-400 max-h-60 mb-4 border border-black/10 dark:border-white/5">
            <code>{stack}</code>
          </pre>
        )}
        <a
          href="/"
          className="inline-block px-4 py-2 bg-[#10a37f] hover:bg-[#0e8c6d] text-white rounded-lg text-sm font-medium transition-colors"
        >
          Return to ChatJoePT
        </a>
      </div>
    </main>
  );
}
