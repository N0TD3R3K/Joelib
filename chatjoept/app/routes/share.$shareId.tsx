import React from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, Link } from "react-router";
import { Sparkles, ArrowLeft, MessageSquare, Calendar, Bot } from "lucide-react";
import { getEnv } from "~/utils/auth.server";
import { getSharedSnapshot } from "~/utils/db.server";
import { ChatMessage } from "~/components/ChatMessage";

export const meta: MetaFunction = () => {
  return [
    { title: "ChatJoePT - Shared Snapshot" },
    { name: "description", content: "A shared conversation snapshot from ChatJoePT in the Joe Universe" },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const shareId = params.shareId || "";
  const env = getEnv();
  const dialog = await getSharedSnapshot(shareId, env);

  return {
    shareId,
    dialog,
  };
}

export default function SharedChatView() {
  const { dialog } = useLoaderData<typeof loader>();

  if (!dialog) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center mb-4 text-gray-500 dark:text-gray-400">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Shared Chat Not Found</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mb-6">
          This shared conversation snapshot may have been deleted by the author or never existed.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Return to ChatJoePT
        </Link>
      </div>
    );
  }

  const modelLabel =
    dialog.model === "jpt-6.1-terra" ? "JPT-6.1 Terra" : "JPT-6.1 Sol";
  const formattedDate = new Date(dialog.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec] flex flex-col selection:bg-[#10a37f]/30">
      {/* Top Header */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-[#212121]/90 backdrop-blur border-b border-black/10 dark:border-white/10 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="ChatJoePT Home"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#10a37f] to-emerald-400 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4 fill-white" />
            </div>
            <span className="font-semibold text-base tracking-tight text-[#0d0d0d] dark:text-white hidden sm:inline">
              ChatJoePT
            </span>
          </Link>
          <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 font-medium">
            Shared Snapshot
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="px-4 py-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-xs md:text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-all shadow-sm flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            <span>Open in ChatJoePT</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        {/* Title Card */}
        <div className="mb-8 pb-6 border-b border-black/10 dark:border-white/10">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0d0d0d] dark:text-white mb-3">
            {dialog.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Snapshot from {formattedDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-[#10a37f]" />
              <span className="font-medium text-gray-700 dark:text-gray-300">{modelLabel}</span>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="space-y-6">
          {dialog.messages.map((message, idx) => (
            <ChatMessage
              key={message.id || idx}
              message={message}
              isStreaming={false}
            />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-black/5 dark:border-white/5 text-center text-xs text-gray-500">
        <p>ChatJoePT &bull; United Taylors Joe Universe</p>
      </footer>
    </div>
  );
}
