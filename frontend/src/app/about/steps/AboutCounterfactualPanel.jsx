"use client";
import { useState } from "react";
import { Users, ArrowRight, Loader2, Shuffle, UserX, UserCheck, Fingerprint, ChevronDown, ChevronUp } from "lucide-react";
import { AboutStatBox } from "../components";

export default function AboutCounterfactualPanel({ result, onStart }) {
  const [expandedCases, setExpandedCases] = useState({ 0: true });
  const toggleCase = (idx) => setExpandedCases((prev) => ({ ...prev, [idx]: !prev[idx] }));

  const isRunning = result === "loading";
  const hasResult = typeof result === "object" && result !== null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center">
          <Shuffle size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Counterfactual Fairness Explainer</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Shows individual bias stories using dummy simulation space</p>
        </div>
      </div>

      {!hasResult && !isRunning && (
        <div className="card p-5 mb-5 border-l-4 border-l-emerald-500">
           <h3 className="text-sm font-bold mb-2">How it works</h3>
           <p className="text-xs text-gray-600 mb-4">Modifies non-protected features of rejected candidates to see what minimum changes would flip the AI's decision.</p>
           <button onClick={onStart} className="px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-500 flex items-center gap-2">
             <Shuffle size={16} /> Generate Counterfactual Stories
           </button>
        </div>
      )}

      {isRunning && (
        <div className="flex flex-col items-center py-12 gap-4">
          <Loader2 size={32} className="text-emerald-600 animate-spin" />
          <div className="text-sm">Finding minimal changes that reveal hidden bias...</div>
        </div>
      )}

      {hasResult && (
        <div className="space-y-5 mt-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 rounded-xl p-5">
            <h3 className="text-base font-bold flex items-center gap-2 mb-2"><Shuffle size={18} className="text-emerald-600"/> Analysis Complete</h3>
            <p className="text-sm">{result.summary}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <AboutStatBox label="Total Rejected" value={result.total_rejected} highlight="text-red-600 dark:text-red-400" />
            <AboutStatBox label="Cases Analyzed" value={result.total_analyzed} />
            <AboutStatBox label="Flipped to Selected" value={(result.cases||[]).filter(c=>c.counterfactual_prediction==="selected").length} highlight="text-emerald-600 dark:text-emerald-400" />
            <AboutStatBox label="Proxy Features" value={Object.keys(result.aggregate_proxy_features || {}).length} highlight="text-amber-600 dark:text-amber-400" />
          </div>

          <div>
             <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Users size={16} className="text-emerald-600"/> Individual Cases</h3>
             <div className="space-y-3">
               {(result.cases || []).map((c, i) => {
                 const isExpanded = expandedCases[i];
                 const flipped = c.counterfactual_prediction === "selected";
                 return (
                   <div key={i} className={`card border-l-4 ${flipped ? "border-amber-500" : "border-red-500"}`}>
                      <button onClick={() => toggleCase(i)} className="w-full p-4 flex justify-between items-start text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                        <div className="flex-1 pr-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            {flipped ? <UserCheck size={16} className="text-amber-600 dark:text-amber-400"/> : <UserX size={16} className="text-red-600 dark:text-red-400"/>}
                            <span className={`text-xs font-bold uppercase tracking-wider ${flipped ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                              {flipped ? "Proxy Bias Found" : "Deep Structural Bias"}
                            </span>
                            <span className="text-xs text-gray-400">ID #{c.individual_id}</span>
                          </div>
                          <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{c.narrative}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-400 mt-1" /> : <ChevronDown size={16} className="text-gray-400 mt-1" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">
                          <div className="mb-3">
                            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <Fingerprint size={12}/> Protected Attributes (LOCKED)
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(c.protected_attributes).map(([attr, val], j) => (
                                <span key={j} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 font-medium">
                                  🔒 {attr}: <strong>{val}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                          
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
                                        <td className="px-3 py-2 font-mono font-semibold text-amber-700 dark:text-amber-400">{cf.feature}</td>
                                        <td className="px-3 py-2 line-through opacity-70 text-red-600 dark:text-red-400">{cf.original}</td>
                                        <td className="px-3 py-2 text-center text-gray-400"><ArrowRight size={12}/></td>
                                        <td className="px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-400">{cf.counterfactual}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          <div className={`flex items-center gap-3 p-3 rounded-lg mt-3 ${flipped ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50"}`}>
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
                 )
               })}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
