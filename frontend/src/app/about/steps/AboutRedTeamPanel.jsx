"use client";
import { useState } from "react";
import { Swords, Shield, Eye, Loader2, CheckCircle, AlertTriangle, Target, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { AboutSeverityBadge as SeverityBadge, AboutStatBox } from "../components";

const AGENT_STYLES = {
  Orchestrator: { icon: Target, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/30" },
  Attacker: { icon: Swords, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
  Auditor: { icon: Shield, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
};

const SEV_COLORS = { low: "#059669", medium: "#D97706", high: "#EA580C", critical: "#DC2626" };

export default function AboutRedTeamPanel({ result, onStart }) {
  const [expandedRounds, setExpandedRounds] = useState({ 0: true });
  const toggleRound = (idx) => setExpandedRounds((prev) => ({ ...prev, [idx]: !prev[idx] }));

  const isRunning = result === "loading";
  const hasResult = typeof result === "object" && result !== null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center">
          <Swords size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Red Team Adversarial Testing</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Two AI agents probe the model with synthetic edge-case profiles</p>
        </div>
      </div>

      {!hasResult && !isRunning && (
        <div className="card p-5 mb-5 border-l-4 border-l-red-500">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">How it works</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2"><Swords size={14} className="text-red-500" /><span><strong>Attacker Agent</strong> generates maximally qualified synthetic candidates from underrepresented subgroups...</span></div>
            <div className="flex items-start gap-2"><Shield size={14} className="text-blue-500" /><span><strong>Auditor Agent</strong> evaluates predictions and directs the next probe.</span></div>
          </div>
          <button onClick={onStart} className="mt-4 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-orange-500 flex items-center gap-2">
            <Swords size={16} /> Start Red Team Test
          </button>
        </div>
      )}

      {isRunning && (
        <div className="flex flex-col items-center py-12 gap-4">
          <Loader2 size={32} className="text-red-600 animate-spin" />
          <div className="text-sm text-gray-500">Attacker and Auditor agents running simulated adversarial probes...</div>
        </div>
      )}

      {hasResult && (
        <div className="space-y-5 mt-4">
          <div className="rounded-xl p-5 border bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              <span className="text-base font-bold text-gray-900 dark:text-white">Red Team Complete — {result.total_rounds} Rounds</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{result.final_summary}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             <AboutStatBox label="Rounds" value={result.total_rounds} />
             <AboutStatBox label="Worst Subgroup" value={result.worst_subgroup} />
             <AboutStatBox label="Worst DI Ratio" value={result.worst_di} highlight="text-red-600 dark:text-red-400" />
          </div>

          <div>
             <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Eye size={16} className="text-amber-600"/> Agent Conversation</h3>
             <div className="space-y-2">
               {(result.conversation_trace || []).map((msg, i) => {
                 const style = AGENT_STYLES[msg.agent] || AGENT_STYLES.Orchestrator;
                 const Icon = style.icon;
                 return (
                   <div key={i} className={`rounded-lg p-3 flex gap-3 ${style.bg}`}>
                     <Icon size={14} className={`${style.color} mt-0.5`} />
                     <div className="flex-1 text-xs text-gray-700 dark:text-gray-300">
                       <span className={`font-bold ${style.color}`}>{msg.agent}</span><br/>{msg.message}
                     </div>
                   </div>
                 )
               })}
             </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-3">Round-by-Round Results</h3>
            {(result.rounds || []).map((round, ri) => (
              <div key={ri} className="card overflow-hidden">
                <button onClick={() => toggleRound(ri)} className="w-full p-4 flex justify-between items-center text-left hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white text-sm font-bold">R{round.round_num}</div>
                    <div>
                      <span className="text-sm font-semibold">Target → {round.target_subgroup}</span>
                      <div className="text-xs text-gray-500">Worst: {round.worst_subgroup} (DI={round.worst_di})</div>
                    </div>
                  </div>
                  {expandedRounds[ri] ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>
                {expandedRounds[ri] && (
                  <div className="px-4 pb-4 border-t pt-3">
                    {/* Simplified bar chart */}
                    {round.subgroup_results?.length > 0 && (
                      <div className="mb-4">
                        <ResponsiveContainer width="100%" height={Math.max(150, round.subgroup_results.length * 32)}>
                          <BarChart data={round.subgroup_results} layout="vertical" margin={{ left: 130, right: 30 }}>
                             <CartesianGrid strokeDasharray="3 3" />
                             <XAxis type="number" domain={[0, 1]} tick={{fontSize: 10}} />
                             <YAxis type="category" dataKey="subgroup" width={120} tick={{fontSize: 10}} />
                             <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                             <ReferenceLine x={0.8} stroke="#DC2626" strokeDasharray="4 4" />
                             <Bar dataKey="selection_rate" radius={[0,4,4,0]} barSize={18}>
                               {round.subgroup_results.map((entry, idx) => <Cell key={idx} fill={SEV_COLORS[entry.severity] || "#3B82F6"} />)}
                             </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="text-xs text-gray-600"><strong>Auditor:</strong> {round.auditor_analysis}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
