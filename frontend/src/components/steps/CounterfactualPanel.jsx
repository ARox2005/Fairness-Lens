"use client";
import { useState } from "react";
import {
  Users, ArrowRight, Loader2, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, ChevronUp, Shuffle, User,
  UserX, UserCheck, Fingerprint,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function CounterfactualPanel({ datasetId, meta }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expandedCases, setExpandedCases] = useState({});

  const toggleCase = (idx) => {
    setExpandedCases((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const runCounterfactual = async () => {
    if (!datasetId || !meta) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/counterfactual/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes || [],
          label_column: meta.label_column || "",
          favorable_label: meta.favorable_label || "",
          max_cases: 8,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Counterfactual analysis failed");
      }

      const data = await res.json();
      setResult(data);
      if (data.cases?.length > 0) setExpandedCases({ 0: true });
    } catch (e) {
      setError(e.message);
    }

    setRunning(false);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center">
          <Shuffle size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Counterfactual Fairness Explainer</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Shows individual bias stories — "Priya was rejected, but if her name was Peter, she'd be selected"
          </p>
        </div>
      </div>

      {/* Info card */}
      {!result && !running && (
        <div className="card p-5 mb-5 border-l-4 border-l-emerald-500">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">How it works</h3>
          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-start gap-2">
              <Fingerprint size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <span><strong>Protected attributes are LOCKED</strong> — sex, race cannot change. Only non-protected features are modified.</span>
            </div>
            <div className="flex items-start gap-2">
              <Shuffle size={14} className="text-teal-500 mt-0.5 flex-shrink-0" />
              <span><strong>Minimal changes found</strong> — the smallest number of feature tweaks that would flip a rejection to selection.</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <span><strong>Reveals proxy discrimination</strong> — if changing 'marital_status' flips the decision, that feature is acting as a proxy for gender bias.</span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
            <div className="text-xs text-emerald-800 dark:text-emerald-300 italic">
              "Numbers like 'DI ratio = 0.72' are abstract. But 'Priya was rejected — only their name was different' is visceral.
              It's the Amazon resume scandal made interactive."
            </div>
          </div>
        </div>
      )}

      {/* Start button */}
      {!result && !running && (
        <button onClick={runCounterfactual}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white
                     bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600
                     shadow-md transition-all cursor-pointer">
          <Shuffle size={16} /> Generate Counterfactual Stories
        </button>
      )}

      {/* Loading */}
      {running && (
        <div className="flex flex-col items-center py-12 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center">
              <Shuffle size={28} color="#fff" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
              <Loader2 size={14} className="text-emerald-600 animate-spin" />
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Finding minimal changes that reveal hidden bias...</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-4 mb-4 text-sm text-red-700 dark:text-red-300">
          ✕ {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5 mt-4">
          {/* Summary */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shuffle size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-base font-bold text-gray-900 dark:text-white">
                Analysis Complete — {result.total_analyzed} Cases
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{result.summary}</p>

            {/* Aggregate proxy features */}
            {Object.keys(result.aggregate_proxy_features || {}).length > 0 && (
              <div className="mt-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Top proxy features detected:</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {Object.entries(result.aggregate_proxy_features)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([feature, count], i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30
                        text-amber-800 dark:text-amber-300 font-mono font-medium border border-amber-200 dark:border-amber-700/50">
                        {feature} <span className="text-amber-500">({count}×)</span>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Rejected</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{result.total_rejected}</div>
            </div>
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Cases Analyzed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{result.total_analyzed}</div>
            </div>
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Flipped to Selected</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {(result.cases || []).filter(c => c.counterfactual_prediction === "selected").length}
              </div>
            </div>
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Proxy Features</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {Object.keys(result.aggregate_proxy_features || {}).length}
              </div>
            </div>
          </div>

          {/* Individual cases */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Users size={16} className="text-emerald-600 dark:text-emerald-400" />
              Individual Counterfactual Stories
            </h3>

            <div className="space-y-3">
              {(result.cases || []).map((c, i) => {
                const isExpanded = expandedCases[i];
                const flipped = c.counterfactual_prediction === "selected";

                return (
                  <div key={i} className={`card overflow-hidden border-l-4
                    ${flipped ? "border-l-amber-500" : "border-l-red-500"}`}>

                    {/* Header */}
                    <button
                      onClick={() => toggleCase(i)}
                      className="w-full p-4 flex justify-between items-start text-left
                        hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          {flipped
                            ? <UserCheck size={16} className="text-amber-600 dark:text-amber-400" />
                            : <UserX size={16} className="text-red-600 dark:text-red-400" />}
                          <span className={`text-xs font-bold uppercase tracking-wider
                            ${flipped ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {flipped ? "Proxy Bias Found" : "Deep Structural Bias"}
                          </span>
                          <span className="text-xs text-gray-400">ID #{c.individual_id}</span>
                        </div>
                        <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
                          {c.narrative}
                        </p>
                      </div>
                      {isExpanded
                        ? <ChevronUp size={16} className="text-gray-400 mt-1" />
                        : <ChevronDown size={16} className="text-gray-400 mt-1" />}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">

                        {/* Protected attributes (locked) */}
                        <div className="mb-3">
                          <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Fingerprint size={12} /> Protected Attributes (LOCKED)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(c.protected_attributes).map(([attr, val], j) => (
                              <span key={j} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800
                                text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 font-medium">
                                🔒 {attr}: <strong>{val}</strong>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Changed features */}
                        {c.changed_features?.length > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <Shuffle size={12} /> Features Changed to Flip Decision
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Feature</th>
                                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Original</th>
                                    <th className="px-3 py-2 text-center text-gray-400">→</th>
                                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Counterfactual</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.changed_features.map((cf, fi) => (
                                    <tr key={fi} className="border-t border-gray-100 dark:border-gray-700/50">
                                      <td className="px-3 py-2 font-mono font-semibold text-amber-700 dark:text-amber-400">
                                        {cf.feature}
                                      </td>
                                      <td className="px-3 py-2 text-red-600 dark:text-red-400 line-through opacity-70">
                                        {cf.original}
                                      </td>
                                      <td className="px-3 py-2 text-center text-gray-400">
                                        <ArrowRight size={12} />
                                      </td>
                                      <td className="px-3 py-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                                        {cf.counterfactual}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Outcome */}
                        <div className={`flex items-center gap-3 p-3 rounded-lg
                          ${flipped
                            ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50"
                            : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50"
                          }`}>
                          <div className="flex items-center gap-2">
                            <UserX size={16} className="text-red-500" />
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">Rejected</span>
                          </div>
                          <ArrowRight size={14} className="text-gray-400" />
                          <div className="flex items-center gap-2">
                            {flipped
                              ? <><UserCheck size={16} className="text-emerald-500" /><span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Selected (flipped!)</span></>
                              : <><UserX size={16} className="text-red-500" /><span className="text-xs font-semibold text-red-600 dark:text-red-400">Still Rejected</span></>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Run again */}
          <button onClick={() => { setResult(null); setError(null); }}
            className="btn-secondary text-xs">
            Run Another Analysis
          </button>
        </div>
      )}
    </div>
  );
}