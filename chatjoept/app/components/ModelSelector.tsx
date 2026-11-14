import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Zap, Sparkles } from "lucide-react";

interface ModelSelectorProps {
  currentModel: string;
  onSelectModel: (model: string) => void;
}

const MODELS = [
  {
    id: "jpt-6.1-sol",
    name: "JPT-6.1 Sol",
    description: "Flagship intelligence for deep analysis, intricate reasoning & math",
    icon: Sparkles,
    badge: "Flagship",
  },
  {
    id: "jpt-6.1-terra",
    name: "JPT-6.1 Terra",
    description: "Fast, grounded everyday intelligence optimized for high efficiency",
    icon: Zap,
    badge: "Fast",
  },
];

export function ModelSelector({ currentModel, onSelectModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeModel =
    MODELS.find((m) => m.id === currentModel) || MODELS[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[#0d0d0d] dark:text-gray-200 hover:text-black dark:hover:text-white font-semibold text-base transition-colors"
      >
        <span>ChatJoePT ({activeModel.name})</span>
        <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#212121] border border-black/10 dark:border-white/10 shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 px-3 py-1.5 uppercase tracking-wider">
            Model Selection
          </div>
          <div className="space-y-1">
            {MODELS.map((m) => {
              const isSelected = activeModel.id === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? "bg-black/5 dark:bg-white/10 text-[#0d0d0d] dark:text-white"
                      : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 mt-0.5 text-[#10a37f]">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#0d0d0d] dark:text-white">{m.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#10a37f]" />}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
