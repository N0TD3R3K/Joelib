import React from "react";
import { Sparkles, ShieldCheck, ArrowRight, AlertCircle } from "lucide-react";

interface AuthGateProps {
  authError?: string | null;
}

export function AuthGate({ authError }: AuthGateProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-[#212121] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[420px] flex flex-col items-center text-center">
        {/* Emblem */}
        <div className="w-14 h-14 rounded-full bg-[#10a37f] flex items-center justify-center mb-6 shadow-lg shadow-[#10a37f]/20 ring-4 ring-black/5 dark:ring-white/5">
          <Sparkles className="w-7 h-7 text-white" />
        </div>

        <h1 className="text-2xl md:text-3xl font-semibold text-[#0d0d0d] dark:text-white tracking-tight mb-2">
          Welcome to ChatJoePT
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 max-w-sm">
          Sign in with your JoeAuth account to sync conversations, manage shared snapshots, and access JPT-6.1 intelligence.
        </p>

        {authError && (
          <div className="w-full mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs text-left flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <a
          href="/auth/login"
          className="w-full bg-[#10a37f] hover:bg-[#0e8c6d] text-white font-medium py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2.5 shadow-sm"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Continue with JoeAuth</span>
          <ArrowRight className="w-4 h-4" />
        </a>

        <p className="text-[11px] text-gray-500 mt-4">
          Authenticated securely via <span className="text-gray-700 dark:text-gray-300">auth.joe-univer.se</span> (OAuth 2.0 + OIDC)
        </p>

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>United Taylors &bull; Joe Universe Research Division</p>
        </div>
      </div>
    </div>
  );
}
