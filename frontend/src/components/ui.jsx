"use client";
import { CheckCircle, AlertCircle, AlertTriangle, XCircle, Loader2, X } from "lucide-react";

const SEV = {
  low:      { label: "Low",      Icon: CheckCircle,  cls: "severity-low" },
  medium:   { label: "Medium",   Icon: AlertCircle,  cls: "severity-medium" },
  high:     { label: "High",     Icon: AlertTriangle, cls: "severity-high" },
  critical: { label: "Critical", Icon: XCircle,       cls: "severity-critical" },
};

export function SeverityBadge({ severity }) {
  const s = SEV[severity] || SEV.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>
      <s.Icon size={13} /> {s.label}
    </span>
  );
}

export function StatBox({ label, value, sub, highlight }) {
  return (
    <div className="stat-box">
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight || "text-gray-900 dark:text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function MetricCard({ name, value, threshold, passed, formula }) {
  const display = typeof value === "number" ? value.toFixed(4) : value;
  return (
    <div className={`card p-4 transition-all ${!passed ? "border-red-400 dark:border-red-500/60" : ""}`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-tight flex-1 pr-2">{name}</span>
        {passed
          ? <CheckCircle size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          : <XCircle size={18} className="text-red-500 dark:text-red-400 flex-shrink-0" />}
      </div>
      <div className={`text-[28px] font-bold mb-1 ${passed ? "text-gray-900 dark:text-white" : "text-red-600 dark:text-red-400"}`}>
        {display}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
        Threshold: {threshold} · {passed ? "PASS" : "FAIL"}
      </div>
      {formula && (
        <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded">
          {formula}
        </div>
      )}
    </div>
  );
}

export function LoadingSpinner({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
      <Loader2 size={36} className="text-brand-500 animate-spin" />
      <span className="text-sm text-gray-500 dark:text-gray-400">{message || "Processing..."}</span>
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl px-4 py-3 mb-4 flex justify-between items-center animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
        <XCircle size={16} /> {message}
      </div>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-700 cursor-pointer">
        <X size={16} />
      </button>
    </div>
  );
}
