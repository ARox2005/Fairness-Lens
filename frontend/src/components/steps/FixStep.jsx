"use client";
import { useState } from "react";
import { CheckCircle, XCircle, Minus, FileText, Loader2, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { StatBox } from "../ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TECH_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#8B5CF6"];

export default function FixStep({ data, inspectData, measureData, flagData, datasetId }) {
  const [downloading, setDownloading] = useState(false);

  if (!data) return null;

  const results = data.results || [];

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Bias Mitigation Results</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {results.length} technique(s) applied. Before/after comparison below.
      </p>

      {/* Recommendation banner */}
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

      {/* Results per technique */}
      {results.map((result, ri) => {
        const isRec = result.technique === data.recommended_technique;
        const chartData = (result.metric_comparisons || []).map((mc) => ({
          metric: mc.metric_name.replace(/_/g, " ").substring(0, 20),
          Before: Math.abs(mc.before),
          After: Math.abs(mc.after),
        }));

        return (
          <div key={ri}
            className={`card p-5 mb-5 ${isRec ? "border-green-400 dark:border-green-500/60 border-[1.5px]" : ""}`}
          >
            {/* Header */}
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

            {/* Stats row */}
            <div className="flex flex-wrap gap-3 mb-5">
              <StatBox label="Accuracy Before" value={`${result.accuracy_before}%`} />
              <StatBox label="Accuracy After" value={`${result.accuracy_after}%`} />
              <StatBox label="Accuracy Cost" value={`${result.accuracy_cost}pp`}
                highlight={Math.abs(result.accuracy_cost) < 2 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"} />
              <StatBox label="Fairness Improvement" value={`${result.overall_fairness_improvement}%`}
                highlight={result.overall_fairness_improvement > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} />
            </div>

            {/* Before/After bar chart */}
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
                    <ReferenceLine y={0.1} stroke="#EF4444" strokeDasharray="4 4"
                      label={{ value: "Threshold", fill: "#EF4444", fontSize: 10, position: "right" }} />
                    <Bar dataKey="Before" fill="#9CA3AF" radius={[4, 4, 0, 0]} barSize={20} name="Before" />
                    <Bar dataKey="After" fill={TECH_COLORS[ri] || "#3B82F6"} radius={[4, 4, 0, 0]} barSize={20} name="After" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Metric comparison table */}
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
        );
      })}

      {/* Gemini explanation */}
      {data.gemini_explanation && (
        <div className="card p-4 bg-gray-50 dark:bg-gray-800/30 border-purple-200 dark:border-purple-700/40">
          <div className="text-[13px] font-semibold text-purple-600 dark:text-purple-400 mb-2">
            ✦ AI-Powered Analysis (Gemma)
          </div>
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{data.gemini_explanation}</div>
        </div>
      )}

      {/* Download PDF Report */}
      <div className="mt-8 p-6 card border-2 border-dashed border-brand-500/30 bg-blue-50/50 dark:bg-blue-900/10 text-center">
        <FileText size={36} className="mx-auto mb-3 text-brand-600 dark:text-blue-400" />
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Download Bias Audit Report</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
          Complete PDF report covering all 4 phases — Inspect, Measure, Flag, Fix — with demographics, metrics, compliance checks, and mitigation results.
        </p>
        <button
          onClick={async () => {
            setDownloading(true);
            try {
              const res = await fetch(`${API_BASE}/api/report/pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dataset_id: datasetId || "dataset",
                  dataset_name: inspectData?.dataset_id || "Dataset",
                  inspect_data: inspectData || {},
                  measure_data: measureData || {},
                  flag_data: flagData || {},
                  fix_data: data || {},
                }),
              });
              if (!res.ok) throw new Error("PDF generation failed");
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `fairnesslens_bias_audit_${datasetId || "report"}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (e) {
              alert("PDF download failed: " + e.message);
            }
            setDownloading(false);
          }}
          disabled={downloading}
          className="btn-primary text-base px-8 py-3 disabled:opacity-60"
        >
          {downloading ? (
            <><Loader2 size={18} className="animate-spin" /> Generating PDF...</>
          ) : (
            <><Download size={18} /> Download PDF Report</>
          )}
        </button>
      </div>
    </div>
  );
}