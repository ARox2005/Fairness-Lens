"use client";
import { useState } from "react";
import {
  Swords, Shield, Eye, Loader2, CheckCircle, XCircle,
  AlertTriangle, Target, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { SeverityBadge } from "../ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const AGENT_STYLES = {
  Orchestrator: { icon: Target, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/30" },
  Attacker: { icon: Swords, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
  Auditor: { icon: Shield, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
};

const SEV_COLORS = { low: "#059669", medium: "#D97706", high: "#EA580C", critical: "#DC2626" };

export default function RedTeamPanel({ datasetId, meta }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expandedRounds, setExpandedRounds] = useState({});

  const toggleRound = (idx) => {
    setExpandedRounds((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const startRedTeam = async () => {
    if (!datasetId || !meta) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/red-team/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes || [],
          label_column: meta.label_column || "",
          favorable_label: meta.favorable_label || "",
          max_rounds: 5,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Red team failed");
      }

      const data = await res.json();
      setResult(data);
      // Auto-expand first round
      setExpandedRounds({ 0: true });
    } catch (e) {
      setError(e.message);
    }

    setRunning(false);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center">
          <Swords size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Red Team Adversarial Testing</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Two AI agents probe the model with synthetic edge-case profiles to discover hidden bias hotspots
          </p>
        </div>
      </div>

      {/* Info card */}
      {!result && !running && (
        <div className="card p-5 mb-5 border-l-4 border-l-red-500">
          <div className="flex gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">How it works</h3>
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-2">
                  <Swords size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-red-600 dark:text-red-400">Attacker Agent</strong> generates maximally qualified synthetic candidates from underrepresented subgroups to test if the model still rejects them.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Shield size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <span><strong className="text-blue-600 dark:text-blue-400">Auditor Agent</strong> evaluates predictions, computes per-subgroup impact ratios, identifies root cause features, and directs the next probe.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Zap size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>They iterate until no new bias hotspot is found — discovering biases that standard metrics might miss.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start button */}
      {!result && !running && (
        <button onClick={startRedTeam}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white
                     bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600
                     shadow-md transition-all cursor-pointer">
          <Swords size={16} /> Start Red Team Test
        </button>
      )}

      {/* Loading */}
      {running && (
        <div className="flex flex-col items-center py-12 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center">
              <Swords size={28} color="#fff" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
              <Loader2 size={14} className="text-red-600 animate-spin" />
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Attacker and Auditor agents running adversarial probes...</div>
          <div className="text-xs text-gray-400">This may take 20-40 seconds</div>
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
          {/* Summary banner */}
          <div className={`rounded-xl p-5 border ${
            result.worst_di < 0.65
              ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
              : result.worst_di < 0.80
                ? "bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700"
                : "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
          }`}>
            <div className="flex items-center gap-3 mb-2">
              {result.worst_di < 0.80
                ? <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
                : <CheckCircle size={20} className="text-green-600 dark:text-green-400" />}
              <span className="text-base font-bold text-gray-900 dark:text-white">
                Red Team Complete — {result.total_rounds} Round{result.total_rounds !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{result.final_summary}</p>

            {result.root_cause?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Root cause features:</span>
                {result.root_cause.map((f, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-mono">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3">
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Rounds</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{result.total_rounds}</div>
            </div>
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Worst Subgroup</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{result.worst_subgroup || "N/A"}</div>
            </div>
            <div className="stat-box">
              <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Worst DI Ratio</div>
              <div className={`text-2xl font-bold ${result.worst_di < 0.8 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                {result.worst_di?.toFixed(3)}
              </div>
            </div>
          </div>

          {/* Conversation trace */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Eye size={16} className="text-amber-600 dark:text-amber-400" />
              Agent Conversation
            </h3>
            <div className="space-y-2">
              {(result.conversation_trace || []).map((msg, i) => {
                const style = AGENT_STYLES[msg.agent] || AGENT_STYLES.Orchestrator;
                const Icon = style.icon;
                return (
                  <div key={i} className={`rounded-lg p-3 flex items-start gap-3 ${style.bg}`}>
                    <Icon size={14} className={`${style.color} mt-0.5 flex-shrink-0`} />
                    <div className="flex-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
                        {msg.agent} — Round {msg.round}
                      </span>
                      <div className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">{msg.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Round details */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Round-by-Round Results</h3>
            {(result.rounds || []).map((round, ri) => (
              <div key={ri} className="card mb-3 overflow-hidden">
                <button
                  onClick={() => toggleRound(ri)}
                  className="w-full p-4 flex justify-between items-center text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold
                      ${round.worst_severity === "critical" ? "bg-red-600" : round.worst_severity === "high" ? "bg-orange-500" : round.worst_severity === "medium" ? "bg-yellow-500" : "bg-green-500"}`}>
                      R{round.round_num}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Round {round.round_num}: Target → {round.target_subgroup}
                      </span>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Worst: {round.worst_subgroup} (DI={round.worst_di.toFixed(3)}) · {round.profiles_generated} profiles
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={round.worst_severity} />
                    {expandedRounds[ri] ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {expandedRounds[ri] && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">
                    {/* Subgroup bar chart */}
                    {round.subgroup_results?.length > 0 && (
                      <div className="mb-4">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Subgroup Selection Rates</div>
                        <ResponsiveContainer width="100%" height={Math.max(150, round.subgroup_results.length * 32)}>
                          <BarChart data={round.subgroup_results} layout="vertical" margin={{ left: 130, right: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                            <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                              tick={{ fill: "currentColor", className: "text-gray-500", fontSize: 10 }} />
                            <YAxis type="category" dataKey="subgroup" width={120}
                              tick={{ fill: "currentColor", className: "text-gray-700 dark:text-gray-300", fontSize: 10 }} />
                            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`}
                              contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                            <ReferenceLine x={0.8} stroke="#DC2626" strokeDasharray="4 4"
                              label={{ value: "4/5ths", fill: "#DC2626", fontSize: 9 }} />
                            <Bar dataKey="selection_rate" radius={[0, 4, 4, 0]} barSize={18}>
                              {round.subgroup_results.map((entry, idx) => (
                                <Cell key={idx} fill={SEV_COLORS[entry.severity] || "#3B82F6"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Auditor analysis */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      <strong>Auditor:</strong> {round.auditor_analysis}
                    </div>

                    {/* Root cause features */}
                    {round.root_cause_features?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] text-gray-500 font-semibold">Root cause:</span>
                        {round.root_cause_features.map((f, fi) => (
                          <span key={fi} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Run again */}
          <button onClick={() => { setResult(null); setError(null); }}
            className="btn-secondary text-xs">
            Run Another Red Team Test
          </button>
        </div>
      )}
    </div>
  );
}