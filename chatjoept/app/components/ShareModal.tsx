import React, { useState, useEffect } from "react";
import { X, Share2, Copy, Check, Loader2, SlidersHorizontal } from "lucide-react";
import type { ChatSession, UserQuotas } from "~/types/chat";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  dialog: ChatSession | null;
  onQuotasUpdated?: (quotas: UserQuotas) => void;
  onOpenManageShares?: () => void;
}

export function ShareModal({
  isOpen,
  onClose,
  dialog,
  onQuotasUpdated,
  onOpenManageShares,
}: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !dialog) {
      setShareUrl("");
      setCopied(false);
      setError(null);
      return;
    }

    if (!dialog.messages || dialog.messages.length === 0) {
      setError("Cannot share an empty conversation. Send a message first!");
      setShareUrl("");
      return;
    }

    setError(null);
    setIsLoading(true);
    setCopied(false);

    fetch("/api/dialogs/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dialog }),
    })
      .then((res) => res.json())
      .then((data: any) => {
        setIsLoading(false);
        if (data.quotas && onQuotasUpdated) {
          onQuotasUpdated(data.quotas);
        }
        if (data.success && data.shareUrl) {
          setShareUrl(data.shareUrl);
        } else {
          setError(data.error || "Failed to create share snapshot");
        }
      })
      .catch(() => {
        setIsLoading(false);
        setError("Network error while generating share snapshot");
      });
  }, [isOpen, dialog?.id]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#212121] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#10a37f]" />
            <h2 className="text-base font-semibold text-white">Create Share Snapshot</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            Anyone with this link can view a frozen snapshot of this conversation without signing in. Snapshots count toward your memory capacity and can be deleted anytime.
          </p>

          {dialog && (
            <div className="p-3.5 rounded-xl bg-[#1c1c1c] border border-white/5">
              <div className="text-xs font-semibold text-white truncate">
                {dialog.title || "Untitled chat"}
              </div>
              <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                <span>
                  {dialog.messages.length} message{dialog.messages.length !== 1 ? "s" : ""} (
                  {Math.ceil(dialog.messages.length / 2)} round
                  {Math.ceil(dialog.messages.length / 2) !== 1 ? "s" : ""})
                </span>
                <span>&bull;</span>
                <span className="capitalize">{dialog.model || "JPT-6.1 Sol"}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#10a37f]" />
              <span className="text-xs">Saving snapshot...</span>
            </div>
          ) : error ? (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Public Snapshot URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-[#161616] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-gray-200 transition-colors shrink-0 shadow-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-700" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between bg-[#1a1a1a]">
          {onOpenManageShares ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenManageShares();
              }}
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Manage shared links</span>
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-[#2f2f2f] hover:bg-white/10 text-white rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
