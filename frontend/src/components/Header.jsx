"use client";
import { Shield, Sun, Moon } from "lucide-react";

export default function Header({ dark, setDark }) {
  return (
    <header className="bg-white dark:bg-[#1A1D2E] border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-card">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 flex items-center justify-center">
          <Shield size={20} color="#fff" />
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">FairnessLens</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-widest">AI Bias Detection & Mitigation</div>
        </div>
      </div>
      <button
        onClick={() => setDark(!dark)}
        className="btn-secondary text-xs"
      >
        {dark ? <Sun size={14} /> : <Moon size={14} />}
        {dark ? "Light" : "Dark"}
      </button>
    </header>
  );
}
