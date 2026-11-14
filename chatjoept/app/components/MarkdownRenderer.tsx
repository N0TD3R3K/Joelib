import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export function preprocessLaTeX(content: string): string {
  if (!content) return "";

  // 1. Convert standard LaTeX block math: \[ ... \] -> $$ ... $$
  let processed = content.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    return `\n\n$$\n${math.trim()}\n$$\n\n`;
  });

  // 2. Convert standard LaTeX inline math: \( ... \) -> $ ... $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 3. Fallback for unescaped standalone bracketed math blocks: [ \command ... ] or [ math ]
  processed = processed.replace(
    /(?:^|\n)\s*\[\s*([\s\S]*?(?:\\|\^|_|=|frac|partial|boxed|ln|sqrt|int|sum|prod)[\s\S]*?)\s*\](?:\s*$\n?)/gm,
    (_, math) => {
      return `\n\n$$\n${math.trim()}\n$$\n\n`;
    }
  );

  // 4. Fallback for unescaped parenthesized math expressions like (f_{xy}) or (\alpha)
  processed = processed.replace(
    /\(([a-zA-Z]_[a-zA-Z0-9{}]+|\\[a-zA-Z]+[^)]*)\)/g,
    (_, math) => {
      return `$${math.trim()}$`;
    }
  );

  return processed;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const codeText = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  // If inline code without language prefix and no newline
  if (!match && !codeText.includes("\n")) {
    return (
      <code className="bg-black/5 dark:bg-[#2f2f2f] text-[#0d0d0d] dark:text-[#ececec] px-1.5 py-0.5 rounded text-xs font-mono font-medium">
        {children}
      </code>
    );
  }

  return (
    <div className="relative my-4 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 bg-[#f8f8f8] dark:bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#efefef] dark:bg-[#1e1e1e] text-xs text-gray-600 dark:text-gray-400 font-mono select-none border-b border-black/5 dark:border-white/5">
        <span className="capitalize">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors py-0.5 px-1.5 rounded"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span className="text-green-600 dark:text-green-400 text-xs">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-gray-800 dark:text-gray-200">
        <pre>
          <code>{codeText}</code>
        </pre>
      </div>
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const processedContent = preprocessLaTeX(content);

  return (
    <div className="markdown-prose space-y-3 leading-relaxed text-[#0d0d0d] dark:text-[#ececec] text-sm md:text-base break-words">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath as any, { singleDollarTextMath: true }],
        ]}
        rehypePlugins={[[rehypeKatex as any, { output: "htmlAndMathml", throwOnError: false }]]}
        components={{
          code: CodeBlock as any,
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-7">{children}</p>,
          h1: ({ children }) => <h1 className="text-xl md:text-2xl font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg md:text-xl font-bold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base md:text-lg font-semibold mt-3 mb-1">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#10a37f] pl-4 my-2 text-gray-700 dark:text-gray-300 italic bg-black/5 dark:bg-white/5 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="min-w-full divide-y divide-black/10 dark:divide-white/10 text-xs md:text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-[#f4f4f4] dark:bg-[#1e1e1e] px-4 py-2 text-left font-semibold text-gray-800 dark:text-gray-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#171717]/60 text-gray-700 dark:text-gray-300">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#10a37f] hover:underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
