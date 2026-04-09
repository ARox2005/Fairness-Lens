"use client";
import { Shield, Info } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { StatBox, MetricCard, SeverityBadge } from "../ui";

export default function MeasureStep({ data }) {
  if (!data) return null;

  const allMetrics = (data.group_metrics || []).flatMap((gm) =>
    gm.metrics.map((m) => ({ ...m, attr: gm.protected_attribute }))
  );
  const passing = allMetrics.filter((m) => m.passed).length;
  const failing = allMetrics.filter((m) => !m.passed).length;

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Fairness Measurement</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {allMetrics.length} metrics computed across {(data.group_metrics || []).length} protected attribute(s).
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <StatBox label="Metrics Computed" value={allMetrics.length} />
        <StatBox label="Passing" value={passing} highlight="text-green-600 dark:text-green-400" />
        <StatBox label="Failing" value={failing} highlight={failing > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} />
      </div>

      {/* Metrics per protected attribute */}
      {(data.group_metrics || []).map((gm, gi) => (
        <div key={gi} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-brand-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{gm.protected_attribute}</h3>
            <span className="text-xs text-gray-400">
              Privileged: {gm.privileged_group} · Unprivileged: {gm.unprivileged_group}
            </span>
          </div>

          {/* Metric cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {gm.metrics.map((m, mi) => (
              <MetricCard key={mi} name={m.display_name} value={m.value}
                threshold={m.threshold} passed={m.passed} formula={m.formula} />
            ))}
          </div>

          {/* Radar chart */}
          {gm.metrics.length >= 3 && (
            <div className="card p-4 mt-4">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Fairness Profile — {gm.protected_attribute}
              </h4>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={gm.metrics
                  .filter((m) => m.metric_name !== "individual_fairness_consistency")
                  .map((m) => ({
                    metric: m.display_name.split("(")[0].trim().substring(0, 18),
                    value: Math.min(Math.abs(m.value), 1),
                    threshold: m.threshold,
                  }))
                }>
                  <PolarGrid className="stroke-gray-300 dark:stroke-gray-600" />
                  <PolarAngleAxis dataKey="metric"
                    tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 1]}
                    tick={{ fill: "currentColor", className: "text-gray-400", fontSize: 9 }} />
                  <Radar name="Value" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Threshold" dataKey="threshold" stroke="#EF4444" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ))}

      {/* Intersectional analysis */}
      {data.intersectional_analysis?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Intersectional Analysis{" "}
            <span className="text-xs font-normal text-gray-400">(NYC LL144 required)</span>
          </h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Group A</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Group B</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Selection Rate</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Impact Ratio</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Severity</th>
                </tr>
              </thead>
              <tbody>
                {data.intersectional_analysis
                  .sort((a, b) => a.impact_ratio - b.impact_ratio)
                  .slice(0, 15)
                  .map((cell, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{cell.group_a_value}</td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{cell.group_b_value}</td>
                      <td className="px-4 py-2 text-right">{(cell.selection_rate * 100).toFixed(1)}%</td>
                      <td className={`px-4 py-2 text-right font-semibold ${cell.impact_ratio < 0.8 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {cell.impact_ratio.toFixed(3)}
                      </td>
                      <td className="px-4 py-2 text-center"><SeverityBadge severity={cell.severity} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Impossibility theorem */}
      {data.impossibility_note && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 flex gap-3">
          <Info size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{data.impossibility_note}</div>
        </div>
      )}
    </div>
  );
}
