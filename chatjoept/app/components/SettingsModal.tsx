import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Trash2,
  LogOut,
  Moon,
  Sun,
  Laptop,
  ShieldCheck,
  Check,
  Link2,
  ExternalLink,
  Copy,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { SharedLinkSummary, UserQuotas } from "~/types/chat";

export type SettingsTab = "general" | "account" | "shares" | "about";

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  userEmail: string;
  userName?: string;
  userPicture?: string;
  onClearChats: () => void;
  onLogout: () => void;
  onQuotasUpdated?: (quotas: UserQuotas) => void;
  theme?: "dark" | "light" | "system";
  onThemeChange?: (theme: "dark" | "light" | "system") => void;
  quotas?: UserQuotas;
}

export function SettingsModal({
  isOpen,
  initialTab = "general",
  onClose,
  userEmail,
  userName,
  userPicture,
  onClearChats,
  onLogout,
  onQuotasUpdated,
  theme = "dark",
  onThemeChange,
  quotas = {
    usagePercent: 0,
    chatPercent: 0,
    sharePercent: 0,
    freePercent: 100,
    isSoftLimited: false,
    isHardLimited: false,
  },
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  // Shared Links Management State
  const [sharedLinks, setSharedLinks] = useState<SharedLinkSummary[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const loadSharedLinks = async () => {
    setSharesLoading(true);
    setSharesError(null);
    try {
      const res = await fetch("/api/dialogs/share");
      if (!res.ok) throw new Error("Failed to load shared links");
      const data = (await res.json()) as {
        sharedLinks?: SharedLinkSummary[];
        quotas?: UserQuotas;
      };
      setSharedLinks(data.sharedLinks || []);
      if (data.quotas && onQuotasUpdated) {
        onQuotasUpdated(data.quotas);
      }
    } catch (err: any) {
      setSharesError(err?.message || "Could not load shared links");
    } finally {
      setSharesLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "shares") {
      loadSharedLinks();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleClear = () => {
    onClearChats();
    setShowClearConfirm(false);
    setClearedNotice(true);
    setTimeout(() => setClearedNotice(false), 2000);
  };

  const handleCopyShareLink = async (shareId: string) => {
    const url = `${window.location.origin}/share/${shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(shareId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDeleteShareLink = async (shareId: string) => {
    setDeletingId(shareId);
    try {
      const res = await fetch(
        `/api/dialogs/share?shareId=${encodeURIComponent(shareId)}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as {
        sharedLinks?: SharedLinkSummary[];
        quotas?: UserQuotas;
      };
      if (data.sharedLinks) {
        setSharedLinks(data.sharedLinks);
      } else {
        setSharedLinks((prev) => prev.filter((l) => l.shareId !== shareId));
      }
      if (data.quotas && onQuotasUpdated) {
        onQuotasUpdated(data.quotas);
      }
    } catch {
      setSharesError("Failed to delete shared snapshot");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllShares = async () => {
    setDeletingId("__all__");
    try {
      const res = await fetch(`/api/dialogs/share?all=true`, { method: "DELETE" });
      const data = (await res.json()) as {
        sharedLinks?: SharedLinkSummary[];
        quotas?: UserQuotas;
      };
      setSharedLinks(data.sharedLinks || []);
      if (data.quotas && onQuotasUpdated) {
        onQuotasUpdated(data.quotas);
      }
    } catch {
      setSharesError("Failed to clear shared snapshots");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#212121] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#10a37f]" />
            <h2 className="text-base font-semibold text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 px-6 text-xs font-medium overflow-x-auto">
          {[
            { id: "general" as const, label: "General" },
            { id: "account" as const, label: "Account & Memory" },
            { id: "shares" as const, label: "Shared Links" },
            { id: "about" as const, label: "About" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-3 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-[#10a37f] text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {activeTab === "general" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "dark", label: "Dark", icon: Moon },
                    { id: "light", label: "Light", icon: Sun },
                    { id: "system", label: "System", icon: Laptop },
                  ].map((t) => {
                    const isSelected = theme === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onThemeChange && onThemeChange(t.id as any)}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-colors ${
                          isSelected
                            ? "bg-[#2f2f2f] border-[#10a37f] text-white"
                            : "bg-[#1e1e1e] border-white/5 text-gray-400 hover:text-white"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#1c1c1c] border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-200">Persona</span>
                  <span className="text-xs text-[#10a37f] font-semibold">ChatJoePT (Joe Universe)</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Balanced Joeglish personality with on-demand access to the Joelib reference archives.
                </p>
              </div>
            </div>
          )}

          {activeTab === "account" && (
            <div className="space-y-4">
              {/* JoeAuth Account Card */}
              <div className="p-4 rounded-xl bg-[#1c1c1c] border border-white/5 flex items-center gap-3">
                {userPicture ? (
                  <img
                    src={userPicture}
                    alt={userName || userEmail}
                    className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#10a37f] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {(userName || userEmail || "J").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">
                      {userName || userEmail || "Joe User"}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>JoeAuth</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono truncate">
                    {userEmail}
                  </div>
                </div>
              </div>

              {/* 24-Hour Usage Quota */}
              <div className="p-4 rounded-xl bg-[#1c1c1c] border border-white/5 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-200">24h Usage Quota</span>
                    <span
                      className={`font-mono font-medium ${
                        quotas.usagePercent >= 90
                          ? "text-red-400"
                          : quotas.usagePercent >= 70
                          ? "text-amber-400"
                          : "text-[#10a37f]"
                      }`}
                    >
                      {quotas.usagePercent}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        quotas.usagePercent >= 90
                          ? "bg-red-500"
                          : quotas.usagePercent >= 70
                          ? "bg-amber-500"
                          : "bg-[#10a37f]"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(0, quotas.usagePercent))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Memory Usage Stacked Bar Chart (Percentages only) */}
                <div className="pt-2 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-200">Memory Usage</span>
                    <span className="text-[11px] font-mono text-gray-400">
                      {quotas.freePercent}% left
                    </span>
                  </div>

                  {/* Stacked Horizontal Bar */}
                  <div
                    className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex"
                    role="img"
                    aria-label={`Memory usage: ${quotas.chatPercent}% chats, ${quotas.sharePercent}% shared links, ${quotas.freePercent}% available`}
                  >
                    {quotas.chatPercent > 0 && (
                      <div
                        className="h-full bg-[#10a37f] transition-all duration-300"
                        style={{ width: `${quotas.chatPercent}%` }}
                        title={`Chats: ${quotas.chatPercent}%`}
                      />
                    )}
                    {quotas.sharePercent > 0 && (
                      <div
                        className="h-full bg-sky-400 transition-all duration-300"
                        style={{ width: `${quotas.sharePercent}%` }}
                        title={`Shared Links: ${quotas.sharePercent}%`}
                      />
                    )}
                  </div>

                  {/* Stacked Bar Legend */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-300 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#10a37f] inline-block" />
                      <span>Chats:</span>
                      <span className="font-mono text-white">{quotas.chatPercent}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                      <span>Shared Links:</span>
                      <span className="font-mono text-white">{quotas.sharePercent}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-white/15 inline-block" />
                      <span>Available:</span>
                      <span className="font-mono text-white">{quotas.freePercent}%</span>
                    </div>
                  </div>

                  {quotas.isSoftLimited && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Memory capacity reached. Delete old chats or shared snapshots to start new conversations.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data controls: Clear all visible chats */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-white">Delete All Chats</div>
                    <div className="text-[11px] text-gray-400">
                      Deletes all visible chats (manage snapshots in Shared Links)
                    </div>
                  </div>

                  {showClearConfirm ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClear}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2 py-1.5 text-xs text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All</span>
                    </button>
                  )}
                </div>

                {clearedNotice && (
                  <div className="flex items-center gap-1.5 text-xs text-green-400 pt-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>All visible conversations deleted.</span>
                  </div>
                )}
              </div>

              {/* Log out */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-white">Log Out of ChatJoePT</div>
                  <div className="text-[11px] text-gray-400">
                    Signs out of this app only (keeps JoeAuth session)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "shares" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Shared Snapshots</div>
                  <p className="text-[11px] text-gray-400">
                    Public links point to hidden snapshots stored in your memory space.
                  </p>
                </div>
                {sharedLinks.length > 0 && (
                  <button
                    type="button"
                    disabled={deletingId === "__all__"}
                    onClick={handleDeleteAllShares}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Delete All
                  </button>
                )}
              </div>

              {sharesError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {sharesError}
                </div>
              )}

              {sharesLoading ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin text-[#10a37f]" />
                  <span className="text-xs">Loading shared snapshots...</span>
                </div>
              ) : sharedLinks.length === 0 ? (
                <div className="py-10 text-center space-y-2 bg-[#1c1c1c] rounded-xl border border-white/5">
                  <Link2 className="w-6 h-6 text-gray-500 mx-auto" />
                  <div className="text-xs font-medium text-gray-300">No active shared links</div>
                  <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                    Use the Share button in any conversation to create a public snapshot link.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sharedLinks.map((link) => {
                    const dateStr = new Date(link.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    });
                    const rounds = Math.ceil(link.messageCount / 2);
                    return (
                      <div
                        key={link.shareId}
                        className="p-3 rounded-xl bg-[#1c1c1c] border border-white/5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white truncate">
                            {link.title || "Shared chat"}
                          </div>
                          <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span>{dateStr}</span>
                            <span>&bull;</span>
                            <span>{rounds} round{rounds !== 1 ? "s" : ""}</span>
                            <span>&bull;</span>
                            <span className="text-sky-400 font-mono">
                              {link.memoryPercent}% mem
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={`/share/${link.shareId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Open snapshot"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyShareLink(link.shareId)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Copy share URL"
                          >
                            {copiedId === link.shareId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === link.shareId}
                            onClick={() => handleDeleteShareLink(link.shareId)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            title="Delete snapshot & free memory"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "about" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#1c1c1c] border border-white/5 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-[#10a37f] flex items-center justify-center mx-auto text-white shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">ChatJoePT</h3>
                <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                  The conversational intelligence of the Joe Universe, backed by Cloudflare D1 and JoeAuth.
                </p>
                <div className="text-[11px] text-gray-400 pt-1 font-mono">
                  Version 6.1.0 &bull; Sol / Terra Core
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex justify-end bg-[#1a1a1a]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-[#2f2f2f] hover:bg-white/10 text-white rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
