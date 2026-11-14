import React, { useRef, useEffect, useState } from "react";
import {
  ArrowUp,
  Square,
  Plus,
  Globe,
  Mic,
  X,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { Attachment, UserQuotas } from "~/types/chat";
import { classifyAndPrepareAttachment } from "~/utils/attachments";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (attachments: Attachment[], webSearch: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  softLimitReached?: boolean;
  onQuotasUpdated?: (quotas: UserQuotas) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatInput({
  input,
  setInput,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  softLimitReached = false,
  onQuotasUpdated,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [webSearch, setWebSearch] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const revokeAllPreviews = (urls: Record<string, string>) => {
    for (const url of Object.values(urls)) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  useEffect(() => {
    return () => {
      revokeAllPreviews(previewUrls);
    };
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (
      !isStreaming &&
      uploadingCount === 0 &&
      (input.trim() || attachments.length > 0) &&
      !disabled &&
      !softLimitReached
    ) {
      setAttachmentError(null);
      onSend(attachments, webSearch);
      revokeAllPreviews(previewUrls);
      setPreviewUrls({});
      setAttachments([]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setAttachmentError(null);
    setUploadingCount((c) => c + selectedFiles.length);

    const newAttachments: Attachment[] = [];
    const addedPreviews: Record<string, string> = {};
    const errors: string[] = [];

    for (const file of selectedFiles) {
      try {
        const result = await classifyAndPrepareAttachment(file);
        if (result.ok) {
          newAttachments.push(result.attachment);
          if (result.previewUrl && result.attachment.fileId) {
            addedPreviews[result.attachment.fileId] = result.previewUrl;
          }
          if (result.quotas && onQuotasUpdated) {
            onQuotasUpdated(result.quotas);
          }
        } else {
          errors.push(result.error);
        }
      } catch (err: any) {
        errors.push(err?.message || `Failed to process "${file.name}".`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      if (Object.keys(addedPreviews).length > 0) {
        setPreviewUrls((prev) => ({ ...prev, ...addedPreviews }));
      }
    }
    if (errors.length > 0) {
      setAttachmentError(errors.join(" "));
    }
  };

  const removeAttachment = async (index: number) => {
    const target = attachments[index];
    const remaining = attachments.filter((_, i) => i !== index);
    setAttachments(remaining);

    if (target?.fileId) {
      const stillInDraft = remaining.some((a) => a.fileId === target.fileId);
      if (!stillInDraft && previewUrls[target.fileId]) {
        try {
          URL.revokeObjectURL(previewUrls[target.fileId]);
        } catch {
          // Ignore
        }
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[target.fileId!];
          return next;
        });
      }

      if (!stillInDraft) {
        try {
          const res = await fetch(`/api/files?id=${encodeURIComponent(target.fileId)}`, {
            method: "DELETE",
          });
          const data: any = await res.json().catch(() => ({}));
          if (data?.quotas && onQuotasUpdated) {
            onQuotasUpdated(data.quotas);
          }
        } catch {
          // Ignore cleanup failure
        }
      }
    }
  };

  const canSubmit =
    (input.trim().length > 0 || attachments.length > 0) &&
    !disabled &&
    !softLimitReached &&
    uploadingCount === 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {softLimitReached && !isStreaming && (
        <div className="mb-2 px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-200 text-xs text-center">
          Memory is full. Delete old chats or shared links in Settings to continue chatting.
        </div>
      )}
      {attachmentError && (
        <div className="mb-2 px-3.5 py-2 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="leading-snug">{attachmentError}</span>
          </div>
          <button
            type="button"
            onClick={() => setAttachmentError(null)}
            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
      />

      {/* Container Dock */}
      <div className="relative bg-[#f4f4f4] dark:bg-[#2f2f2f] border border-black/10 dark:border-white/10 rounded-[26px] p-2.5 shadow-xl transition-all focus-within:border-black/20 dark:focus-within:border-white/20">
        {/* Attachment Preview Chips */}
        {(attachments.length > 0 || uploadingCount > 0) && (
          <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1 border-b border-black/5 dark:border-white/5 mb-1.5">
            {attachments.map((file, i) => {
              const isImage =
                file.kind === "image" || file.type.startsWith("image/");
              const thumbSrc =
                (file.fileId && previewUrls[file.fileId]) ||
                (file.content.startsWith("data:image/") ? file.content : "");
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white dark:bg-[#1e1e1e] border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 shadow-sm"
                >
                  {isImage && thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt={file.name}
                      className="w-7 h-7 rounded-md object-cover border border-black/10 dark:border-white/10 shrink-0"
                    />
                  ) : isImage ? (
                    <ImageIcon className="w-3.5 h-3.5 text-[#10a37f]" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-[#10a37f]" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[140px] text-[11px]">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {file.kind === "file"
                        ? `${file.parsingPurpose === "rich_layout_recognition" ? "Rich OCR" : "Parsed File"} · ${formatBytes(file.size)}`
                        : isImage
                        ? `Vision · ${formatBytes(file.size)}`
                        : formatBytes(file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {uploadingCount > 0 && (
              <div className="flex items-center gap-2 bg-white dark:bg-[#1e1e1e] border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#10a37f]" />
                <span className="text-[11px]">Uploading & parsing...</span>
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask ChatJoePT anything in Joeglish..."
          rows={1}
          disabled={disabled}
          className="w-full bg-transparent text-[#0d0d0d] dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm md:text-base px-3 pt-1 pb-1 resize-none focus:outline-none max-h-52 leading-relaxed"
        />

        {/* Action Controls Bar */}
        <div className="flex items-center justify-between mt-1 px-1">
          {/* Left tools: Attachment & Web Search Toggle */}
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-colors"
              title="Add attachment"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* DeepSeek Web Search Button */}
            <button
              type="button"
              onClick={() => setWebSearch(!webSearch)}
              className={`p-1.5 rounded-full flex items-center gap-1.5 text-xs transition-all ${
                webSearch
                  ? "bg-[#10a37f]/20 text-[#0e8c6d] dark:text-[#10a37f] border border-[#10a37f]/40 px-2.5 font-medium"
                  : "hover:bg-black/10 dark:hover:bg-white/10 hover:text-black dark:hover:text-white text-gray-500 dark:text-gray-400"
              }`}
              title={webSearch ? "Web Search enabled" : "Search the web"}
            >
              <Globe className="w-4 h-4" />
              {webSearch && <span>Search</span>}
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors hidden sm:block"
              title="Voice mode"
            >
              <Mic className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="w-8 h-8 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors shadow"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow ${
                  canSubmit
                    ? "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 cursor-pointer"
                    : "bg-black/15 dark:bg-white/20 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                }`}
                title="Send prompt"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-2">
        ChatJoePT can make mistakes. Verify important scientific and Joe information.
      </p>
    </div>
  );
}
