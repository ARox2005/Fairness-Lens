"use client";
import { useState } from "react";
import { CheckCircle, AlertCircle, AlertTriangle, XCircle } from "lucide-react";

export function AboutFlipCard({ children, backContent }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="group [perspective:2000px] w-full h-full cursor-pointer min-h-[120px]" onClick={(e) => { e.stopPropagation(); setFlipped(!flipped); }}>
      <div 
        className="relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d]" 
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        
        {/* Front */}
        <div className="w-full h-full [backface-visibility:hidden]">
          {children}
        </div>
        
        {/* Back */}
        <div 
          className="absolute top-0 left-0 w-full h-full [backface-visibility:hidden] card p-5 overflow-y-auto flex flex-col justify-center gap-2 bg-gradient-to-br from-white to-blue-50/30 dark:from-[#1A1D2E] dark:to-[#121420]"
          style={{ transform: "rotateY(180deg)" }}
        >
          {backContent}
        </div>
      </div>
    </div>
  );
}

export function AboutStatBox({ label, value, sub, highlight, backContent }) {
  const content = (
    <div className="card p-4 flex-1 min-w-[140px] h-full flex flex-col justify-center items-center text-center">
      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight || "text-gray-900 dark:text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );

  const fallback = (
    <div className="flex flex-col h-full justify-center">
      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">What is {label}?</div>
      <div className="text-xs text-gray-700 dark:text-gray-300">
        This tracks an important aggregate statistic across the pipeline processing step.
      </div>
    </div>
  );

  return <AboutFlipCard backContent={backContent || fallback}>{content}</AboutFlipCard>;
}

export function AboutMetricCard({ name, value, threshold, passed, formula, backContent }) {
  const display = typeof value === "number" ? value.toFixed(4) : value;
  
  const content = (
    <div className={`card p-4 h-full transition-all flex flex-col ${!passed ? "border-red-400 dark:border-red-500/60" : ""}`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-tight flex-1 pr-2">{name}</span>
        {passed
          ? <CheckCircle size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
          : <XCircle size={18} className="text-red-500 dark:text-red-400 flex-shrink-0" />}
      </div>
      <div className={`text-[28px] font-bold mb-1 ${passed ? "text-gray-900 dark:text-white" : "text-red-600 dark:text-red-400"}`}>
        {display}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5 flex-1">
        Threshold: {threshold} · {passed ? "PASS" : "FAIL"}
      </div>
      {formula && (
        <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded truncate">
          {formula}
        </div>
      )}
    </div>
  );

  const fallback = (
    <div className="flex flex-col h-full justify-center">
      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">How it's measured</div>
      <div className="text-xs text-gray-700 dark:text-gray-300 mb-3 text-mono">{formula || "Mathematical equality test."}</div>
      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Why it matters</div>
      <div className="text-xs text-gray-700 dark:text-gray-300">
        This metric tests for statistical parity differences among subgroups. Failure indicates possible structural bias.
      </div>
    </div>
  );

  return <AboutFlipCard backContent={backContent || fallback}>{content}</AboutFlipCard>;
}

const SEV = {
  low:      { label: "Low",      Icon: CheckCircle,  cls: "severity-low flex items-center justify-center p-1 bg-green-50 text-green-700 rounded dark:bg-green-900/30 dark:text-green-400" },
  medium:   { label: "Medium",   Icon: AlertCircle,  cls: "severity-medium flex items-center justify-center p-1 bg-yellow-50 text-yellow-700 rounded dark:bg-yellow-900/30 dark:text-yellow-400" },
  high:     { label: "High",     Icon: AlertTriangle, cls: "severity-high flex items-center justify-center p-1 bg-orange-50 text-orange-700 rounded dark:bg-orange-900/30 dark:text-orange-400" },
  critical: { label: "Critical", Icon: XCircle,       cls: "severity-critical flex items-center justify-center p-1 bg-red-50 text-red-700 rounded dark:bg-red-900/30 dark:text-red-400" },
};

export function AboutSeverityBadge({ severity }) {
  const s = SEV[severity] || SEV.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>
      <s.Icon size={13} /> {s.label}
    </span>
  );
}

const SEV_LEFT_BORDER = {
  low: "border-l-green-500", medium: "border-l-yellow-500",
  high: "border-l-orange-500", critical: "border-l-red-500",
};

export function AboutFlagCard({ flag, backContent }) {
  const content = (
    <div className={`card p-4 h-full border-l-4 ${SEV_LEFT_BORDER[flag.severity] || "border-l-gray-300"}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{flag.metric_name}</span>
          <span className="text-xs text-gray-400 ml-2">{flag.protected_attribute}</span>
        </div>
        <AboutSeverityBadge severity={flag.severity} />
      </div>
      <div className="text-[13px] text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">{flag.description}</div>
      <div className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-2.5 rounded-lg">
        <strong>Recommendation:</strong> {flag.recommendation}
      </div>
    </div>
  );

  const fallback = (
    <div className="flex flex-col h-full justify-center text-left">
      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Risk Context</div>
      <div className="text-xs text-gray-700 dark:text-gray-300 mb-3">
        The application detected a significant divergence from the acceptable baseline performance causing a <strong>{flag.severity}</strong> severity flag.
      </div>
      <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Mitigation Plan</div>
      <div className="text-xs text-gray-700 dark:text-gray-300">
        Please proceed to the action panel. Reinforcement learning optimization can balance this out natively.
      </div>
    </div>
  );

  return <AboutFlipCard backContent={backContent || fallback}>{content}</AboutFlipCard>;
}
