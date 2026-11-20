import React, { useState } from "react";
import {
  PanelLeft,
  SquarePen,
  Search,
  Trash2,
  Settings,
  LogOut,
  Sparkles,
  MessageSquare,
  X,
} from "lucide-react";
import type { ChatSession } from "~/types/chat";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  userEmail: string;
  userName?: string;
  userPicture?: string;
  isSoftLimited?: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export function Sidebar({
  isOpen,
  onToggle,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  userEmail,
  userName,
  userPicture,
  isSoftLimited = false,
  onOpenSettings,
  onLogout,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Group sessions by relative age
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groups = {
    today: filteredSessions.filter((s) => now - s.updatedAt < oneDay),
    yesterday: filteredSessions.filter(
      (s) => now - s.updatedAt >= oneDay && now - s.updatedAt < 2 * oneDay
    ),
    previous7Days: filteredSessions.filter(
      (s) => now - s.updatedAt >= 2 * oneDay && now - s.updatedAt < 7 * oneDay
    ),
    older: filteredSessions.filter((s) => now - s.updatedAt >= 7 * oneDay),
  };

  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : "J";

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onToggle}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-[260px] bg-[#f9f9f9] dark:bg-[#171717] border-r border-black/10 dark:border-white/5 flex flex-col transition-transform duration-300 ease-in-out select-none ${
          isOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        {/* Top Header */}
        <div className="p-3 flex items-center justify-between">
          <button
            onClick={onToggle}
            type="button"
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Close sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSearching(!isSearching)}
              type="button"
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="Search chats"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={onNewChat}
              type="button"
              disabled={isSoftLimited}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isSoftLimited ? "Memory full — delete chats or shared links to start a new chat" : "New chat"}
            >
              <SquarePen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Input (conditionally visible) */}
        {isSearching && (
          <div className="px-3 pb-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                autoFocus
                className="w-full bg-white dark:bg-[#212121] text-xs text-[#0d0d0d] dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg pl-8 pr-7 py-2 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-[#10a37f]"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 absolute left-2.5 top-2.5" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* New Chat Primary Button */}
        <div className="px-3 pb-2">
          <button
            onClick={onNewChat}
            type="button"
            disabled={isSoftLimited}
            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 dark:text-gray-200 text-xs font-medium transition-colors border border-black/5 dark:border-white/5"
            title={isSoftLimited ? "Memory full — free space in Settings or delete chats" : undefined}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#10a37f]/20 flex items-center justify-center text-[#10a37f]">
                <Sparkles className="w-3 h-3" />
              </div>
              <span>{isSoftLimited ? "Memory full" : "New chat"}</span>
            </div>
            <SquarePen className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4 text-xs">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              {searchQuery ? "No matching chats found" : "No conversations yet"}
            </div>
          ) : (
            <>
              {renderGroup("Today", groups.today)}
              {renderGroup("Yesterday", groups.yesterday)}
              {renderGroup("Previous 7 Days", groups.previous7Days)}
              {renderGroup("Older", groups.older)}
            </>
          )}
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-black/10 dark:border-white/5 bg-[#f2f2f2] dark:bg-[#141414]">
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              {userPicture ? (
                <img
                  src={userPicture}
                  alt={userName || userEmail || "Joe User"}
                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-black/10 dark:border-white/10"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#10a37f] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {userName ? userName.charAt(0).toUpperCase() : initial}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#0d0d0d] dark:text-white truncate max-w-[120px]">
                  {userName || userEmail || "Joe User"}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                  {userName && userEmail ? userEmail : "Joe Universe Member"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={onOpenSettings}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );

  function renderGroup(title: string, items: ChatSession[]) {
    if (items.length === 0) return null;
    return (
      <div key={title} className="space-y-1">
        <div className="text-[11px] font-semibold text-gray-500 px-2 py-1">
          {title}
        </div>
        {items.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                isActive
                  ? "bg-black/10 dark:bg-[#212121] text-[#0d0d0d] dark:text-white font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-[#212121]/60 hover:text-black dark:hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="truncate">{session.title || "New chat"}</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-all"
                title="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }
}
