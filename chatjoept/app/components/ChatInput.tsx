import React, { useRef, useEffect, useState } from "react";
import { ArrowUp, Square, Plus, Globe, Mic, X, FileText, Image as ImageIcon } from "lucide-react";
import type { Attachment } from "~/types/chat";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (attachments: Attachment[], webSearch: boolean) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  softLimitReached?: boolean;
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
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearch, setWebSearch] = useState(false);

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
      (input.trim() || attachments.length > 0) &&
      !disabled &&
      !softLimitReached
    ) {
      onSend(attachments, webSearch);
      setAttachments([]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        newAttachments.push({
          name: file.name,
          size: file.size,
          type: file.type || "text/plain",
          content: text,
        });
      } catch (err) {
        console.error("Could not read file:", file.name, err);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit =
    (input.trim().length > 0 || attachments.length > 0) &&
    !disabled &&
    !softLimitReached;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {softLimitReached && !isStreaming && (
        <div className="mb-2 px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs text-center">
          Memory is full. Delete old chats or shared links in Settings to continue chatting.
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
      <div className="relative bg-[#2f2f2f] border border-white/10 rounded-[26px] p-2.5 shadow-xl transition-all focus-within:border-white/20">
        {/* Attachment Preview Chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1 border-b border-white/5 mb-1.5">
            {attachments.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-[#1e1e1e] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 shadow-sm"
              >
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="w-3.5 h-3.5 text-[#10a37f]" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-[#10a37f]" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium truncate max-w-[140px] text-[11px]">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatBytes(file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
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
          className="w-full bg-transparent text-white placeholder-gray-400 text-sm md:text-base px-3 pt-1 pb-1 resize-none focus:outline-none max-h-52 leading-relaxed"
        />

        {/* Action Controls Bar */}
        <div className="flex items-center justify-between mt-1 px-1">
          {/* Left tools: Attachment & Web Search Toggle */}
          <div className="flex items-center gap-1.5 text-gray-400">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-full hover:bg-white/10 hover:text-white transition-colors"
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
                  ? "bg-[#10a37f]/20 text-[#10a37f] border border-[#10a37f]/40 px-2.5 font-medium"
                  : "hover:bg-white/10 hover:text-white text-gray-400"
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
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors hidden sm:block"
              title="Voice mode"
            >
              <Mic className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-gray-200 transition-colors shadow"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-black" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow ${
                  canSubmit
                    ? "bg-white text-black hover:bg-gray-200 cursor-pointer"
                    : "bg-white/20 text-gray-400 cursor-not-allowed"
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
      <p className="text-[11px] text-gray-400 text-center mt-2">
        ChatJoePT can make mistakes. Verify important scientific and Joe information.
      </p>
    </div>
  );
}
