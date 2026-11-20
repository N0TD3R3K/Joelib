import React from "react";
import { Sparkles, Code2, Sigma, FlaskConical, BookOpen } from "lucide-react";

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    icon: Sigma,
    title: "Derive a LaTeX equation",
    prompt: "Please derive the quadratic formula step-by-step and show Euler's formula in LaTeX, explaining in Joeglish.",
  },
  {
    icon: Code2,
    title: "Write a Joeglish Python script",
    prompt: "Write a clean Python script that computes the sacred Joe energy quotient of Joelements, with full type annotations.",
  },
  {
    icon: FlaskConical,
    title: "Explain the Joeriodic Table",
    prompt: "Tell me about the Joeriodic Table of Joelements from the Joe Universe, and how it compares to human chemistry.",
  },
  {
    icon: BookOpen,
    title: "The Great Joetsby Literature",
    prompt: "Quote and analyze the famous speech: 'To Joe, or not to Joe, that is the question' from the sacred Joe archives.",
  },
];

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-2xl mx-auto text-center select-none">
      <div className="w-16 h-16 rounded-full bg-[#10a37f] flex items-center justify-center mb-6 shadow-xl shadow-[#10a37f]/20 ring-4 ring-black/5 dark:ring-white/5 animate-in zoom-in-90 duration-300">
        <Sparkles className="w-8 h-8 text-white" />
      </div>

      <h1 className="text-2xl md:text-3xl font-semibold text-[#0d0d0d] dark:text-white tracking-tight mb-2">
        What can I help with in the Joe Universe?
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 max-w-md">
        Speak fluent Joeglish, solve mathematics with LaTeX, write code, or explore the sacred texts of Joe Jin.
      </p>

      {/* Suggestion Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
        {PROMPT_SUGGESTIONS.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={index}
              onClick={() => onSelectPrompt(item.prompt)}
              className="p-3.5 rounded-2xl bg-[#f4f4f4] hover:bg-[#eaeaea] dark:bg-[#2f2f2f]/60 dark:hover:bg-[#2f2f2f] border border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10 transition-all flex items-start gap-3 group"
            >
              <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5 text-gray-600 dark:text-gray-300 group-hover:text-[#10a37f] transition-colors mt-0.5">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white mb-0.5">
                  {item.title}
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                  {item.prompt}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
