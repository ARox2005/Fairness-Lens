"use client";
import { AlertTriangle, Database } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { StatBox } from "../ui";

export default function InspectStep({ data }) {
  if (!data) return null;

  // Group distributions by attribute
  const groupsByAttr = {};
  (data.group_distributions || []).forEach((g) => {
    if (!groupsByAttr[g.attribute]) groupsByAttr[g.attribute] = [];
    groupsByAttr[g.attribute].push(g);
  });

  const strongProxies = (data.proxy_variables || []).filter((p) => p.is_proxy);

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Dataset Inspection</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Profiling <strong>{data.row_count?.toLocaleString()}</strong> rows × <strong>{data.column_count}</strong> columns.
        Detected protected attributes:{" "}
        <strong className="text-brand-600 dark:text-blue-400">
          {(data.detected_protected_attributes || []).join(", ")}
        </strong>
      </p>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        <StatBox label="Rows" value={data.row_count?.toLocaleString()} />
        <StatBox label="Columns" value={data.column_count} />
        <StatBox label="Protected Attrs" value={(data.detected_protected_attributes || []).length} highlight="text-brand-600 dark:text-blue-400" />
        <StatBox
          label="Proxy Variables"
          value={strongProxies.length}
          highlight={strongProxies.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}
        />
      </div>

      {/* Warnings */}
      {data.warnings?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400 text-sm mb-2">
            <AlertTriangle size={16} /> Warnings Detected
          </div>
          {data.warnings.map((w, i) => (
            <div key={i} className="text-[13px] text-gray-700 dark:text-gray-300 pl-6 mb-1">• {w}</div>
          ))}
        </div>
      )}

      {/* Distribution charts */}
      {Object.entries(groupsByAttr).map(([attr, groups]) => (
        <div key={attr} className="mb-8">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Distribution: <span className="text-brand-600 dark:text-blue-400">{attr}</span>
          </h3>
          <div className="card p-4">
            <ResponsiveContainer width="100%" height={Math.max(180, groups.length * 40)}>
              <BarChart data={groups} layout="vertical" margin={{ left: 110, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  className="text-xs" tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400" }} />
                <YAxis type="category" dataKey="group" width={100}
                  tick={{ fill: "currentColor", className: "text-gray-700 dark:text-gray-300", fontSize: 12 }} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="proportion" name="Proportion" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={18} />
                <Bar dataKey="positive_rate" name="Positive Rate" fill="#F59E0B" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}

      {/* Proxy variables */}
      {strongProxies.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Proxy Variables Detected <span className="text-amber-600 dark:text-amber-400">(|r| {">"} 0.3)</span>
          </h3>
          <div className="card overflow-hidden">
            {strongProxies.slice(0, 10).map((p, i) => (
              <div key={i} className={`flex justify-between items-center px-4 py-3 ${i > 0 ? "border-t border-gray-100 dark:border-gray-700/50" : ""}`}>
                <div>
                  <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{p.feature}</span>
                  <span className="text-xs text-gray-400 ml-2">→ {p.protected_attribute}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{p.correlation_type}</span>
                  <span className={`text-[13px] font-bold ${p.correlation > 0.5 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                    |r| = {p.correlation.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
