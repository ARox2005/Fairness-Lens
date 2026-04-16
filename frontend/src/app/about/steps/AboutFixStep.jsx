"use client";
import { CheckCircle, XCircle, Minus, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { AboutStatBox as StatBox, AboutFlipCard } from "../components";

const TECH_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#8B5CF6"];

export default function AboutFixStep({ data }) {
  if (!data) return null;

  const results = data.results || [];

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Bias Mitigation Results</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {results.length} technique(s) applied. Before/after comparison below.
      </p>

      {data.recommendation_reason && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700/50 rounded-xl p-4 mb-6">
          <div className="text-[13px] font-bold text-green-700 dark:text-green-400 mb-1">
            ★ Recommended: {data.recommended_technique?.replace(/_/g, " ").toUpperCase()}
          </div>
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
            {data.recommendation_reason}
          </div>
        </div>
      )}

      {results.map((result, ri) => {
        const isRec = result.technique === data.recommended_technique;
        const chartData = (result.metric_comparisons || []).map((mc) => ({
          metric: mc.metric_name.replace(/_/g, " ").substring(0, 20),
          Before: Math.abs(mc.before),
          After: Math.abs(mc.after),
        }));

        return (
          <div key={ri} className="w-full h-full min-w-0 mb-6">
            <AboutFlipCard backContent={
              <div className="flex flex-col h-full justify-center text-left space-y-4 px-4 py-4 w-full">
                <div className="text-base font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">
                  How to Read the Mitigation Report
                </div>
                <div>
                   <span className="text-[13px] font-bold text-gray-900 dark:text-white">What is happening here?</span>
                   <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 whitespace-normal leading-relaxed">
                     This overarching box captures the complete state of the pipeline after applying {result.technique_display_name}.
                     It includes evaluating top-level accuracy costs as well as granular fairness metric shifts. The goal is to maximize fairness while minimizing accuracy degradation.
                   </p>
                </div>
                <div>
                   <span className="text-[13px] font-bold text-gray-900 dark:text-white">Chart vs Table:</span>
                   <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 whitespace-normal leading-relaxed">
                     The bar chart visually graphs the absolute distance from parity (the red dashed line represents the 0.1 legal threshold).
                     The table beneath exhaustively logs raw before/after states, calculating the percent change and providing a final compliance status check against 4/5ths rules.
                   </p>
                </div>
              </div>
            }>
              <div className={`card p-5 h-full flex flex-col justify-start w-full min-w-0 ${isRec ? "border-green-400 dark:border-green-500/60 border-[1.5px]" : ""}`}>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-gray-900 dark:text-white">
                      {result.technique_display_name}
                    </span>
                    {isRec && (
                      <span className="text-[11px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-semibold">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <StatBox label="Accuracy Before" value={`${result.accuracy_before}%`} />
                  <StatBox label="Accuracy After" value={`${result.accuracy_after}%`} />
                  <StatBox label="Accuracy Cost" value={`${result.accuracy_cost}pp`}
                    highlight={Math.abs(result.accuracy_cost) < 2 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"} />
                  <StatBox label="Fairness Improvement" value={`${result.overall_fairness_improvement}%`}
                    highlight={result.overall_fairness_improvement > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} />
                </div>

                {chartData.length > 0 && (
                  <div className="mb-4">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                        <XAxis dataKey="metric" angle={-12} textAnchor="end" height={50}
                          tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 10 }} />
                        <YAxis tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <ReferenceLine y={0.1} stroke="#EF4444" strokeDasharray="4 4" />
                        <Bar dataKey="Before" fill="#9CA3AF" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="After" fill={TECH_COLORS[ri] || "#3B82F6"} radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {(result.metric_comparisons || []).length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold">Metric</th>
                          <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold">Before</th>
                          <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold">After</th>
                          <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold">Change</th>
                          <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.metric_comparisons.map((mc, mi) => (
                          <tr key={mi} className="border-t border-gray-100 dark:border-gray-700/50">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">
                              {mc.metric_name.replace(/_/g, " ")}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                              {mc.before.toFixed(4)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-800 dark:text-gray-200 font-semibold">
                              {mc.after.toFixed(4)}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${mc.improvement > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {mc.improvement > 0 ? "+" : ""}{mc.improvement.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-center">
                              {mc.passed_after
                                ? <CheckCircle size={15} className="inline text-green-600 dark:text-green-400" />
                                : mc.passed_before === mc.passed_after
                                  ? <Minus size={15} className="inline text-gray-400" />
                                  : <XCircle size={15} className="inline text-red-500" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {result.recommendation_notes && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 italic">{result.recommendation_notes}</div>
                )}
              </div>
            </AboutFlipCard>
          </div>
        );
      })}

      {data.gemini_explanation && (
        <div className="card p-4 bg-gray-50 dark:bg-gray-800/30 border-purple-200 dark:border-purple-700/40">
          <div className="text-[13px] font-semibold text-purple-600 dark:text-purple-400 mb-2">
            ✦ AI-Powered Analysis (Gemini)
          </div>
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{data.gemini_explanation}</div>
        </div>
      )}

      {/* Note: Dummy mode has no actual PDF rendering */}
      <div className="mt-8 p-6 card border-2 border-dashed border-brand-500/30 bg-blue-50/50 dark:bg-blue-900/10 text-center opacity-75">
        <FileText size={36} className="mx-auto mb-3 text-brand-600 dark:text-blue-400" />
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Download Bias Audit Report</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
          In the actual application, this downloads a complete compliant PDF report. Disabled in About demo.
        </p>
      </div>
    </div>
  );
}
