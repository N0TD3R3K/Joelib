import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Brain,
  FileText,
  Globe,
  ImageIcon,
} from "lucide-react";
import type { Message, Attachment } from "~/types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ThoughtBox({
  thought,
  isThinking,
}: {
  thought: string;
  isThinking: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isThinking);

  return (
    <div className="my-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-[#f9f9f9] dark:bg-[#1c1c1c] overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-gray-200 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <Brain
            className={`w-3.5 h-3.5 ${
              isThinking ? "text-[#10a37f] animate-pulse" : "text-gray-500 dark:text-gray-400"
            }`}
          />
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {isThinking ? "Thinking in Joeglish..." : "Thought process"}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 py-2 border-t border-black/5 dark:border-white/5 text-gray-600 dark:text-gray-400 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
          {thought}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({
  message,
  isStreaming = false,
  onRegenerate,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      const textToCopy = message.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      await navigator.clipboard.writeText(textToCopy || message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  if (isUser) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-3 flex flex-col items-end gap-1.5">
        {/* Render Attached Files Preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end mb-1 max-w-[85%] sm:max-w-[75%]">
            {message.attachments.map((file, i) => {
              const isImage =
                file.kind === "image" || file.type.startsWith("image/");
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-[#f4f4f4] dark:bg-[#252525] border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-800 dark:text-gray-200 shadow-sm"
                >
                  {isImage && file.content.startsWith("data:image/") ? (
                    <img
                      src={file.content}
                      alt={file.name}
                      className="w-8 h-8 rounded-md object-cover border border-black/10 dark:border-white/10 shrink-0"
                    />
                  ) : isImage ? (
                    <ImageIcon className="w-3.5 h-3.5 text-[#10a37f]" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-[#10a37f]" />
                  )}
                  <div className="flex flex-col text-left">
                    <span className="font-medium truncate max-w-[150px] text-[11px]">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {file.kind === "file"
                        ? `${file.parsingPurpose === "rich_layout_recognition" ? "Rich Layout OCR" : "Parsed File"} · ${formatBytes(file.size)}`
                        : isImage
                        ? `Vision · ${formatBytes(file.size)}`
                        : formatBytes(file.size)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-[#f4f4f4] dark:bg-[#2f2f2f] text-[#0d0d0d] dark:text-[#ececec] text-sm md:text-base px-4 py-2.5 rounded-[22px] max-w-[85%] sm:max-w-[75%] break-words whitespace-pre-wrap leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Parse reasoning / thinking blocks
  let thoughtText: string | null = null;
  let mainContent = message.content;
  let isCurrentlyThinking = false;

  if (message.content.includes("<think>")) {
    const thinkStart = message.content.indexOf("<think>");
    const thinkEnd = message.content.indexOf("</think>");

    if (thinkEnd !== -1) {
      thoughtText = message.content.substring(thinkStart + 7, thinkEnd);
      mainContent = (
        message.content.substring(0, thinkStart) + message.content.substring(thinkEnd + 8)
      ).trim();
    } else {
      thoughtText = message.content.substring(thinkStart + 7);
      mainContent = message.content.substring(0, thinkStart).trim();
      isCurrentlyThinking = isStreaming;
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-4 flex items-start gap-4 text-sm md:text-base">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-[#10a37f] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="w-4 h-4 text-white" />
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0">
        {/* Tool & Web Search indicators */}
        {(message.webSearch || (message.toolsUsed && message.toolsUsed.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {message.toolsUsed?.map((tool) => {
              const label =
                tool === "search_joelib" || tool === "read_joelib_document"
                  ? "Consulted Joelib"
                  : tool === "deepseek_search"
                  ? "Searched Joeternet"
                  : tool === "deepseek_fetch"
                  ? "Read webpage"
                  : tool;
              return (
                <div
                  key={tool}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f4f4f4] dark:bg-[#1e1e1e] border border-black/5 dark:border-white/5 text-[11px] text-[#0e8c6d] dark:text-[#10a37f] font-medium"
                >
                  <Globe className="w-3 h-3" />
                  <span>{label}</span>
                </div>
              );
            })}
            {message.webSearch && !message.toolsUsed?.includes("deepseek_search") && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f4f4f4] dark:bg-[#1e1e1e] border border-black/5 dark:border-white/5 text-[11px] text-[#0e8c6d] dark:text-[#10a37f] font-medium">
                <Globe className="w-3 h-3" />
                <span>Searched the web</span>
              </div>
            )}
          </div>
        )}

        {thoughtText && (
          <ThoughtBox
            thought={thoughtText}
            isThinking={isCurrentlyThinking}
          />
        )}

        <div className="text-[#0d0d0d] dark:text-gray-100">
          {mainContent ? (
            <MarkdownRenderer content={mainContent} />
          ) : isCurrentlyThinking ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">Formulating Joeglish reasoning...</div>
          ) : null}

          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-[#10a37f] ml-1 animate-pulse align-middle" />
          )}
        </div>

        {/* Action Toolbar */}
        {!isStreaming && message.content && (
          <div className="flex items-center gap-2 mt-3 pt-1 text-gray-500 dark:text-gray-400 text-xs">
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              onClick={() => setFeedback(feedback === "up" ? null : "up")}
              className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                feedback === "up" ? "text-green-600 dark:text-green-400" : "hover:text-black dark:hover:text-white"
              }`}
              title="Good response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setFeedback(feedback === "down" ? null : "down")}
              className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                feedback === "down" ? "text-red-500 dark:text-red-400" : "hover:text-black dark:hover:text-white"
              }`}
              title="Bad response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors flex items-center gap-1"
                title="Regenerate response"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
