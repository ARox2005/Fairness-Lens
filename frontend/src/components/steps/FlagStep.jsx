"use client";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { StatBox, SeverityBadge } from "../ui";

const SEV_BANNER = {
  low:      "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700/50",
  medium:   "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700/50",
  high:     "bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700/50",
  critical: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700/50",
};

const SEV_LEFT_BORDER = {
  low: "border-l-green-500", medium: "border-l-yellow-500",
  high: "border-l-orange-500", critical: "border-l-red-500",
};

const STATUS_ICON = {
  PASS: { Icon: CheckCircle, cls: "text-green-600 dark:text-green-400" },
  FAIL: { Icon: XCircle, cls: "text-red-600 dark:text-red-400" },
  WARNING: { Icon: AlertCircle, cls: "text-yellow-600 dark:text-yellow-400" },
};

export default function FlagStep({ data }) {
  if (!data) return null;

  const sc = data.scorecard || {};
  const flags = sc.flags || [];
  const compliance = sc.compliance_checks || [];
  const sev = sc.overall_severity || "low";

  const sortOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Bias Flagging & Risk Assessment</h2>

      {/* Overall severity banner */}
      <div className={`rounded-xl p-5 mb-6 border ${SEV_BANNER[sev] || SEV_BANNER.low}`}>
        <div className="flex items-center gap-3 mb-2">
          <SeverityBadge severity={sev} />
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            Overall Risk: {sev.toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{sc.summary}</p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        <StatBox label="Total Flags" value={sc.total_flags || 0} />
        <StatBox label="Critical" value={sc.critical_flags || 0}
          highlight={sc.critical_flags > 0 ? "text-red-600 dark:text-red-400" : "text-green-600"} />
        <StatBox label="High" value={sc.high_flags || 0}
          highlight={sc.high_flags > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600"} />
        <StatBox label="Medium / Low" value={(sc.medium_flags || 0) + (sc.low_flags || 0)} />
      </div>

      {/* Regulatory compliance */}
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Regulatory Compliance</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {compliance.map((c, i) => {
          const st = STATUS_ICON[c.status] || STATUS_ICON.WARNING;
          return (
            <div key={i} className="card p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[13px] font-bold text-gray-800 dark:text-gray-200">
                  {c.regulation.replace(/_/g, " ")}
                </span>
                <div className="flex items-center gap-1">
                  <st.Icon size={16} className={st.cls} />
                  <span className={`text-xs font-bold ${st.cls}`}>{c.status}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{c.details}</div>
            </div>
          );
        })}
      </div>

      {/* Flagged issues */}
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Flagged Issues</h3>
      <div className="flex flex-col gap-3 mb-6">
        {flags
          .sort((a, b) => (sortOrder[a.severity] ?? 4) - (sortOrder[b.severity] ?? 4))
          .map((flag, i) => (
            <div key={i}
              className={`card p-4 border-l-4 ${SEV_LEFT_BORDER[flag.severity] || "border-l-gray-300"}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{flag.metric_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{flag.protected_attribute}</span>
                </div>
                <SeverityBadge severity={flag.severity} />
              </div>
              <div className="text-[13px] text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">{flag.description}</div>
              <div className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-2.5 rounded-lg">
                <strong>Recommendation:</strong> {flag.recommendation}
              </div>
            </div>
          ))}
      </div>

      {/* Gemini explanation */}
      {data.gemini_explanation && (
        <div className="card p-4 bg-gray-50 dark:bg-gray-800/30 border-purple-200 dark:border-purple-700/40">
          <div className="text-[13px] font-semibold text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
            ✦ AI-Powered Explanation (Gemini)
          </div>
          <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">{data.gemini_explanation}</div>
        </div>
      )}
    </div>
  );
}
