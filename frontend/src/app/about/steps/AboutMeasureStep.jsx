"use client";
import { Shield, Info } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, ResponsiveContainer } from "recharts";
import { AboutStatBox as StatBox, AboutMetricCard as MetricCard, AboutSeverityBadge as SeverityBadge, AboutFlipCard } from "../components";

export default function AboutMeasureStep({ data }) {
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

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatBox label="Metrics Computed" value={allMetrics.length} />
        <StatBox label="Passing" value={passing} highlight="text-green-600 dark:text-green-400" />
        <StatBox label="Failing" value={failing} highlight={failing > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} />
      </div>

      {(data.group_metrics || []).map((gm, gi) => (
        <div key={gi} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-brand-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{gm.protected_attribute}</h3>
            <span className="text-xs text-gray-400">
              Privileged: {gm.privileged_group} · Unprivileged: {gm.unprivileged_group}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {gm.metrics.map((m, mi) => (
              <MetricCard key={mi} name={m.display_name} value={m.value}
                threshold={m.threshold} passed={m.passed} formula={m.formula} backContent={m.about} />
            ))}
          </div>

          {gm.metrics.length >= 3 && (
            <div className="mt-4 h-[350px]">
              <AboutFlipCard backContent={
                <div className="flex flex-col h-full justify-center text-left space-y-3 px-2">
                  <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">How this Radar Chart is Plotted</div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Axes:</span>
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">Each spoke represents one of the computed metrics (DI Ratio, SPD, EOD, etc.).</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Values (Blue Polygon):</span>
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">The absolute numerical value of each metric mapped between 0 and 1. Values closer to the center are closer to 0 difference (perfect parity).</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Thresholds (Red Dashed Line):</span>
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">The maximum acceptable deviation limit. If the blue area crosses outside the red dashed boundary, the metric has failed the compliance check.</p>
                  </div>
                </div>
              }>
                <div className="card p-4 h-full flex flex-col justify-center">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Fairness Profile — {gm.protected_attribute}
                  </h4>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={gm.metrics
                        .filter((m) => m.metric_name !== "individual_fairness_consistency")
                        .map((m) => {
                           let parsedThresh = parseFloat(m.threshold.replace(/[^0-9.]/g, ''));
                           if (isNaN(parsedThresh)) parsedThresh = 0.1;
                           // Specialized inversion: if DI Ratio requires >= 0.8, deviation is (1 - value). For simplicity, we plot absolute difference.
                           let plotVal = Math.min(Math.abs(m.value), 1);
                           if (m.name === "di_ratio") {
                             plotVal = Math.abs(1 - m.value); 
                             parsedThresh = 0.2; // 1 - 0.8 => 0.2 allowed deviation on chart
                           }
                           
                           return {
                             metric: m.display_name.split("(")[0].trim().substring(0, 18),
                             value: plotVal,
                             threshold: parsedThresh,
                           };
                        })
                      } outerRadius="70%">
                        <PolarGrid className="stroke-gray-300 dark:stroke-gray-600" />
                        <PolarAngleAxis dataKey="metric"
                          tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 10 }} />
                        <PolarRadiusAxis domain={[0, 1]}
                          tick={{ fill: "currentColor", className: "text-gray-400", fontSize: 9 }} />
                        <Radar name="Absolute Deviation" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2} />
                        <Radar name="Limit Threshold" dataKey="threshold" stroke="#EF4444" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, backgroundColor: "var(--tw-prose-bg, white)" }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </AboutFlipCard>
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
          <AboutFlipCard backContent={
            <div className="flex flex-col h-full justify-center text-left space-y-3">
              <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">Intersectional Analysis Metrics</div>
              
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Selection Rate:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">The probability of a positive outcome for a specific intersectional group (e.g., Black Females). It shows raw baseline success rates.</p>
                <div className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800/50 p-1.5 mt-1.5 rounded text-indigo-600 dark:text-indigo-400">SR = Pr(Y=1 | Group A, Group B)</div>
              </div>
              
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Impact Ratio:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">Compares the intersectional group's Selection Rate to the overall highest Selection Rate to detect compounded bias. Legally required by statutes like NYC LL144.</p>
                <div className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800/50 p-1.5 mt-1.5 rounded text-indigo-600 dark:text-indigo-400">IR = SR(Target Group) / SR(Most Privileged Group)</div>
              </div>
            </div>
          }>
            <div className="card h-full min-h-[220px]">
              <div className="overflow-x-auto h-full flex flex-col justify-center">
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
          </AboutFlipCard>
        </div>
      )}

      {data.impossibility_note && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 flex gap-3">
          <Info size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{data.impossibility_note}</div>
        </div>
      )}
    </div>
  );
}
