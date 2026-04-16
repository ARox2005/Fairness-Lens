"use client";
import { useState } from "react";
import { Brain, Zap, ChevronDown, ChevronUp, CheckCircle, XCircle, ArrowRight, Loader2, Trophy, BarChart3, GitBranch, Sparkles, TrendingUp, Scale } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis, Cell, BarChart, Bar, Legend, LineChart, Line } from "recharts";
import { AboutStatBox as StatBox, AboutSeverityBadge as SeverityBadge, AboutFlipCard } from "../components";

const ACTION_COLORS = {
  reweighting: "#3B82F6", threshold_optimizer: "#F59E0B", disparate_impact_remover_low: "#10B981",
  disparate_impact_remover_high: "#059669", reweighting_then_threshold: "#8B5CF6", stop: "#6B7280"
};
const PARETO_COLORS = ["#DC2626", "#F59E0B", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#6366F1"];

export default function AboutRLFixStep({ data, onCompare, comparing, comparisonData }) {
  const [expandedSteps, setExpandedSteps] = useState({});
  const [showCompare, setShowCompare] = useState(false);

  const toggleStep = (i) => setExpandedSteps((p) => ({ ...p, [i]: !p[i] }));
  if (!data) return null;

  const steps = data.steps || [];
  const pareto = data.pareto_frontier || [];

  const progressionData = [
    { step: "Baseline", di: data.di_ratio_before, acc: data.accuracy_before },
    ...steps.map((s) => ({
      step: s.action_display.split("(")[0].trim().substring(0, 15),
      di: s.di_ratio_after,
      acc: s.accuracy_after,
    }))
  ];

  const paretoChartData = pareto.map((p, i) => ({
    accuracy: p.accuracy, di_ratio: p.di_ratio, label: p.technique_label, lambda: p.lambda_value, idx: i,
  }));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center">
          <Brain size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">RL Mitigation Optimizer</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            DQN agent discovered the optimal mitigation sequence in <strong>{data.episodes_trained}</strong> episodes
          </p>
        </div>
      </div>

      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700/50 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-bold text-gray-900 dark:text-white">Agent Summary</span>
        </div>
        <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{data.summary}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Best Sequence:</span>
          {(data.best_sequence_display || []).map((action, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ backgroundColor: ACTION_COLORS[data.best_sequence?.[i]] || "#6B7280" }}>
                {action}
              </span>
              {i < data.best_sequence_display.length - 1 && <ArrowRight size={12} className="text-gray-400" />}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatBox label="DI Ratio Before" value={data.di_ratio_before?.toFixed(3)} highlight={data.di_ratio_before < 0.8 ? "text-red-600 dark:text-red-400" : "text-green-600"} />
        <StatBox label="DI Ratio After" value={data.di_ratio_after?.toFixed(3)} highlight={data.di_ratio_after >= 0.8 ? "text-green-600 dark:text-green-400" : "text-amber-600"} />
        <StatBox label="DI Improvement" value={`${data.di_improvement > 0 ? "+" : ""}${data.di_improvement}%`} highlight={data.di_improvement > 0 ? "text-green-600 dark:text-green-400" : "text-red-600"} />
        <StatBox label="Accuracy Cost" value={`${data.accuracy_cost}pp`} highlight={Math.abs(data.accuracy_cost) < 3 ? "text-green-600 dark:text-green-400" : "text-amber-600"} />
        <StatBox label="Best Reward" value={data.best_reward?.toFixed(3)} highlight="text-violet-600 dark:text-violet-400" />
      </div>

      <div className="mb-6 h-[300px]">
        <AboutFlipCard backContent={
          <div className="flex flex-col h-full justify-center text-left space-y-3 px-2">
            <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">What is DI Ratio Progression?</div>
            <div>
              <span className="text-xs font-bold text-gray-900 dark:text-white">Explanation:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">This graph tracks the DI Ratio evolution at each sequential mitigation step the Reinforcement Learning agent chose.</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-900 dark:text-white">How it is calculated:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">The agent evaluates the new metric state (y-axis) against the environment after executing algorithmic actions (x-axis), rewarding multi-hop sequences that cross the legally required 4/5ths Rule threshold.</p>
            </div>
          </div>
        }>
          <div className="card p-5 h-full flex flex-col justify-center">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-violet-600 dark:text-violet-400" />
              DI Ratio Progression (Step by Step)
            </h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressionData} margin={{ left: 10, right: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="step" tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 10 }} />
                  <YAxis domain={[0, 1]} tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, backgroundColor: "var(--tw-prose-bg, white)" }} />
                  <ReferenceLine y={0.8} stroke="#DC2626" strokeDasharray="4 4" label={{ value: "4/5ths Rule", fill: "#DC2626", fontSize: 10, position: "right" }} />
                  <Line type="monotone" dataKey="di" stroke="#7C3AED" strokeWidth={3} dot={{ r: 5, fill: "#7C3AED" }} name="DI Ratio" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </AboutFlipCard>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <GitBranch size={16} className="text-violet-600 dark:text-violet-400" />
          Agent Decision Trace
        </h3>
        <div className="space-y-2">
          {steps.map((step, i) => {
            const isExpanded = expandedSteps[i];
            const improved = step.di_ratio_after > step.di_ratio_before;
            return (
              <div key={i} className="card overflow-hidden border-l-4" style={{ borderLeftColor: ACTION_COLORS[step.action] || "#6B7280" }}>
                <button onClick={() => toggleStep(i)} className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: ACTION_COLORS[step.action] || "#6B7280" }}>
                    {step.step_num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{step.action_display}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 mt-0.5">
                      <span>DI: {step.di_ratio_before.toFixed(3)} → <strong className={improved ? "text-green-600 dark:text-green-400" : "text-red-500"}>{step.di_ratio_after.toFixed(3)}</strong></span>
                      <span>Reward: <strong className={step.reward > 0 ? "text-green-600" : "text-red-500"}>{step.reward > 0 ? "+" : ""}{step.reward.toFixed(4)}</strong></span>
                      <span>Acc: {step.accuracy_after}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {improved ? <CheckCircle size={16} className="text-green-600 dark:text-green-400" /> : <XCircle size={16} className="text-red-400" />}
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-semibold text-gray-500 dark:text-gray-400 mb-2">State Before</div>
                        {Object.entries(step.state_before).filter(([k]) => !k.endsWith("_passed")).map(([k, v]) => (
                          <div key={k} className="flex justify-between py-0.5"><span className="text-gray-500">{k}</span><span className="font-mono text-gray-700 dark:text-gray-300">{typeof v === "number" ? v.toFixed(4) : String(v)}</span></div>
                        ))}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-500 dark:text-gray-400 mb-2">State After</div>
                        {Object.entries(step.state_after).filter(([k]) => !k.endsWith("_passed")).map(([k, v]) => {
                          const before = step.state_before[k];
                          const changed = typeof before === "number" && typeof v === "number" && Math.abs(v - before) > 0.001;
                          return <div key={k} className="flex justify-between py-0.5"><span className="text-gray-500">{k}</span><span className={`font-mono ${changed ? "font-bold text-violet-600 dark:text-violet-400" : "text-gray-700 dark:text-gray-300"}`}>{typeof v === "number" ? v.toFixed(4) : String(v)}</span></div>
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {pareto.length > 0 && (
        <div className="mb-6 h-[600px]">
          <AboutFlipCard backContent={
            <div className="flex flex-col h-full justify-start text-left space-y-3 px-2 py-4 overflow-y-auto w-full max-w-full">
              <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">What is this Pareto Frontier?</div>
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Explanation:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">This graph demonstrates the trade-off line between model Accuracy (x-axis) and Fairness / DI Ratio (y-axis).</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">How it was plotted:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">The RL agent was trained multiple times under varying penalty weights (lambda / λ) for accuracy loss. Points represent the optimally balanced final sequences found by the agent for each lambda constraint. No point is strictly better than another; they are 'Pareto optimal'.</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Understanding the Table:</span>
                <ul className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 list-disc pl-4 space-y-1">
                  <li><strong>λ (Lambda):</strong> The accuracy retention priority weight.</li>
                  <li><strong>Label:</strong> The goal assigned to the agent run.</li>
                  <li><strong>Actions:</strong> The algorithmic sequence combinations discovered to solve the tradeoff constraint at that specific lambda point.</li>
                </ul>
              </div>
            </div>
          }>
            <div className="card p-5 h-full flex flex-col justify-start overflow-y-auto">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1 flex items-center gap-2">
                <Scale size={16} className="text-violet-600 dark:text-violet-400" /> Pareto Frontier — Accuracy vs Fairness Trade-off
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 whitespace-normal">
                Each point represents the best sequence found for a different λ (accuracy weight). Points on the frontier are equally optimal.
              </p>
              
              <div className="h-[200px] shrink-0 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="accuracy" name="Accuracy" unit="%" type="number" tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 11 }} label={{ value: "Accuracy (%)", position: "insideBottom", offset: -5, fontSize: 11 }}/>
                    <YAxis dataKey="di_ratio" name="DI Ratio" type="number" domain={[0, 1.1]} tick={{ fill: "currentColor", className: "text-gray-500 dark:text-gray-400", fontSize: 11 }} label={{ value: "DI Ratio", angle: -90, position: "insideLeft", fontSize: 11 }}/>
                    <ZAxis range={[120, 120]} />
                    <Tooltip content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload;
                      return <div className="bg-white dark:bg-gray-800 border p-3 rounded-lg shadow-lg text-xs"><div>{d.label}</div><div>Acc: {d.accuracy}% | DI: {d.di_ratio.toFixed(3)}</div></div>;
                    }} />
                    <ReferenceLine y={0.8} stroke="#DC2626" strokeDasharray="4 4" label={{ value: "4/5ths", fill: "#DC2626", fontSize: 9, position: "right" }} />
                    <Scatter data={paretoChartData} name="Pareto Points">
                      {paretoChartData.map((e, i) => <Cell key={i} fill={PARETO_COLORS[i % PARETO_COLORS.length]} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-x-auto shrink-0 w-full min-w-0">
                <table className="w-full text-xs whitespace-nowrap table-auto">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/50">
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold sticky top-0">λ</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold sticky top-0">Label</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold sticky top-0">Accuracy</th>
                      <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold sticky top-0">DI Ratio</th>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold sticky top-0">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pareto.map((p, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{p.lambda_value}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{p.technique_label}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{p.accuracy}%</td>
                        <td className={`px-3 py-2 text-right font-semibold ${p.di_ratio >= 0.8 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{p.di_ratio.toFixed(3)}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={(p.actions_taken || []).join(" → ")}>
                          {(p.actions_taken || []).join(" → ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </AboutFlipCard>
        </div>
      )}

      <div className="mb-6 h-[330px]">
        <AboutFlipCard backContent={
          <div className="flex flex-col h-full justify-center text-left space-y-3 px-2 py-2 max-w-full">
            <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">Optimization Validation Metrics</div>
            <div>
              <span className="text-xs font-bold text-gray-900 dark:text-white">Explanation:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">This table directly contrasts the primary baseline fairness metric statuses against the final resultant metrics after the RL sequence has completed.</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-900 dark:text-white">Status Calculation:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">Each status indicator reflects whether the newly arrived metric respects the legally prescribed bounds (e.g. within -0.1 to 0.1 for SPD), and whether the acceptable accuracy cost tradeoff constraint remained satisfied.</p>
            </div>
          </div>
        }>
          <div className="card p-5 h-full flex flex-col justify-start">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Metrics Before / After RL Optimization</h3>
            <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-x-auto w-full min-w-0">
              <table className="w-full text-xs whitespace-nowrap table-auto">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold min-w-24">Metric</th>
                    <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold min-w-20">Before</th>
                    <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-semibold min-w-20">After</th>
                    <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 font-semibold min-w-16">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {["di_ratio", "spd", "eod", "eop", "ppd"].map((key) => {
                    const before = data.metrics_before?.[key];
                    const after = data.metrics_after?.[key];
                    const passedAfter = data.metrics_after?.[key + "_passed"];
                    if (before === undefined) return null;
                    return (
                      <tr key={key} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{key.toUpperCase().replace("_", " ")}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{Number(before).toFixed(4)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{Number(after).toFixed(4)}</td>
                        <td className="px-3 py-2 text-center">
                          {passedAfter ? <CheckCircle size={15} className="inline text-green-600 dark:text-green-400" /> : <XCircle size={15} className="inline text-red-500" />}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">Accuracy</td>
                    <td className="px-3 py-2 text-right text-gray-500">{data.accuracy_before}%</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{data.accuracy_after}%</td>
                    <td className="px-3 py-2 text-center">
                      {Math.abs(data.accuracy_cost) < 3 ? <CheckCircle size={15} className="inline text-green-600 dark:text-green-400" /> : <XCircle size={15} className="inline text-amber-500" />}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </AboutFlipCard>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => { if (comparisonData) setShowCompare(!showCompare); else if (onCompare) onCompare(); }} disabled={comparing} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md">
          {comparing ? <><Loader2 size={16} className="animate-spin" /> Comparing...</> : <><Trophy size={16} /> {comparisonData ? showCompare ? "Hide Comparison" : "Show RL vs Standard Comparison" : "Compare RL vs Standard Mitigation"}</>}
        </button>
      </div>

      {showCompare && comparisonData && <ComparisonView data={comparisonData} />}
    </div>
  );
}

function Wrench({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function ComparisonView({ data }) {
  const { standard, rl, comparison_metrics, winner, winner_reason } = data;
  
  // Exclude 'accuracy' from the bar chart to prevent it from destroying the 0-1.0 axis scale
  const barChartData = (comparison_metrics || [])
    .filter((cm) => cm.metric_name.toLowerCase() !== "accuracy")
    .map((cm) => ({ 
      metric: cm.metric_name.split(" ").slice(0, 3).join(" "), 
      Baseline: Math.abs(cm.baseline || 0), 
      Standard: cm.standard_after !== null ? Math.abs(cm.standard_after) : null, 
      RL: Math.abs(cm.rl_after || 0) 
    }));

  return (
    <div className="animate-fade-in space-y-5">
      {/* Banner */}
      <div className="w-full">
        <AboutFlipCard backContent={
          <div className="flex flex-col h-full justify-center text-left space-y-2 px-3 py-3 max-w-full">
            <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">Winning Criteria</div>
            <p className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-normal">The winner is decided by a composite score balancing maximum fairness threshold compliance against minimum accuracy deterioration. In a tie, RL provides Pareto sequencing insights.</p>
          </div>
        }>
          <div className={`h-full rounded-xl p-5 border-2 flex flex-col justify-center min-h-[110px] ${winner === "rl" ? "bg-violet-50 dark:bg-violet-900/20 border-violet-400" : winner === "standard" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400" : "bg-gray-50 dark:bg-gray-800/30 border-gray-300"}`}>
            <div className="flex items-center gap-3 mb-2">
              <Trophy size={22} className={winner === "rl" ? "text-violet-600 dark:text-violet-400" : winner === "standard" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
              <span className="text-lg font-bold text-gray-900 dark:text-white leading-none">{winner === "rl" ? "RL Optimizer Wins!" : winner === "standard" ? "Standard Mitigation Wins" : "It's a Tie"}</span>
            </div>
            <p className="text-[12px] text-gray-700 dark:text-gray-300 whitespace-normal leading-relaxed">{winner_reason}</p>
          </div>
        </AboutFlipCard>
      </div>

      {/* Grid of Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
        {/* Standard */}
        <div className="w-full h-full min-w-0">
          <AboutFlipCard backContent={
            <div className="flex flex-col h-full justify-start text-left space-y-2 px-3 py-3 overflow-y-auto w-full max-w-full">
              <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">Standard Mitigation</div>
              <span className="text-[11px] text-gray-900 dark:text-white font-bold mt-1">What it is:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-normal">A static, single-pass algorithmic intervention (e.g., Threshold Optimizer, Reweighting). It modifies weights/labels one time during the pipeline.</p>
              <span className="text-[11px] text-gray-900 dark:text-white font-bold mt-1">Limitation:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-normal">Static nature often results in highly degrading secondary metrics when fixing a primary one, leading to unacceptable Accuracy drops.</p>
            </div>
          }>
            <div className={`card p-5 h-full flex flex-col justify-start w-full min-w-0 ${winner === "standard" ? "border-2 border-blue-400" : ""}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <Wrench size={18} color="#fff" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h4 className="text-[15px] font-bold text-gray-900 dark:text-white truncate leading-tight">Standard Mitigation</h4>
                  <p className="text-[11px] text-gray-500 truncate leading-tight">{standard?.technique}</p>
                </div>
                {winner === "standard" && <Trophy size={18} className="text-amber-500 flex-shrink-0" />}
              </div>
              <div className="space-y-2.5 text-[13px] w-full mb-4">
                <div className="flex justify-between w-full"><span className="text-gray-500">Accuracy</span><span className="font-semibold text-gray-800 dark:text-gray-200">{standard?.accuracy_before}% → {standard?.accuracy_after}%</span></div>
                <div className="flex justify-between w-full"><span className="text-gray-500">Accuracy Cost</span><span className={`font-semibold ${Math.abs(standard?.accuracy_cost) < 3 ? "text-green-600 dark:text-green-400" : "text-amber-600"}`}>{standard?.accuracy_cost}pp</span></div>
                <div className="flex justify-between w-full"><span className="text-gray-500">Fairness Improvement</span><span className="font-semibold text-gray-800 dark:text-gray-200">{standard?.fairness_improvement}%</span></div>
              </div>
              <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700/50 w-full space-y-1">
                {(standard?.metric_comparisons || []).map((mc, i) => (
                  <div key={i} className="flex justify-between text-[11px] py-0.5 w-full">
                    <span className="text-gray-400 min-w-0 truncate">{mc.metric_name.replace(/_/g, " ").substring(0, 25)}</span>
                    <span className="font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap pl-2">{mc.before?.toFixed(3)} → {mc.after?.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </AboutFlipCard>
        </div>

        {/* RL */}
        <div className="w-full h-full min-w-0">
          <AboutFlipCard backContent={
            <div className="flex flex-col h-full justify-start text-left space-y-2 px-3 py-3 overflow-y-auto w-full max-w-full">
              <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">RL Optimizer Tracker</div>
              <span className="text-[11px] text-gray-900 dark:text-white font-bold mt-1">What it is:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-normal">The DQN Agent's iteratively formulated compound pipeline. Instead of just "Reweighting", it chains multiple targeted fixes (e.g., Reweighting → Threshold Optimizer).</p>
              <span className="text-[11px] text-gray-900 dark:text-white font-bold mt-1">Advantage:</span>
              <p className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-normal">Mitigates proxy distortion caused by single algorithms and discovers optimal bounds while preserving overall predictive capability.</p>
            </div>
          }>
             <div className={`card p-5 h-full flex flex-col justify-start w-full min-w-0 ${winner === "rl" ? "border-2 border-violet-400" : ""}`}>
               <div className="flex items-center gap-2 mb-4">
                 <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                   <Brain size={18} color="#fff" />
                 </div>
                 <div className="flex-1 min-w-0 flex flex-col justify-center">
                   <h4 className="text-[15px] font-bold text-gray-900 dark:text-white truncate leading-tight">RL Optimizer</h4>
                   <p className="text-[11px] text-gray-500 truncate leading-tight" title={(rl?.best_sequence_display || []).join(" → ")}>{(rl?.best_sequence_display || []).join(" → ")}</p>
                 </div>
                 {winner === "rl" && <Trophy size={18} className="text-amber-500 flex-shrink-0" />}
               </div>
               <div className="space-y-2.5 text-[13px] w-full mb-4">
                 <div className="flex justify-between w-full"><span className="text-gray-500">Accuracy</span><span className="font-semibold text-gray-800 dark:text-gray-200">{rl?.accuracy_before}% → {rl?.accuracy_after}%</span></div>
                 <div className="flex justify-between w-full"><span className="text-gray-500">Accuracy Cost</span><span className={`font-semibold ${Math.abs(rl?.accuracy_cost) < 3 ? "text-green-600 dark:text-green-400" : "text-amber-600"}`}>{rl?.accuracy_cost}pp</span></div>
                 <div className="flex justify-between w-full"><span className="text-gray-500">DI Ratio</span><span className={`font-semibold ${rl?.di_ratio_after >= 0.8 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{rl?.di_ratio_before?.toFixed(3)} → {rl?.di_ratio_after?.toFixed(3)}</span></div>
                 <div className="flex justify-between w-full"><span className="text-gray-500">Steps</span><span className="font-semibold text-violet-600 dark:text-violet-400 truncate pl-2">{rl?.total_steps} acts ({rl?.episodes_trained} ep)</span></div>
               </div>
               <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700/50 w-full space-y-1">
                 {["di_ratio", "spd", "eod", "eop", "ppd"].map((k) => (
                   <div key={k} className="flex justify-between text-[11px] py-0.5 w-full">
                     <span className="text-gray-400 truncate min-w-0 pr-2">{k.replace(/_/g, " ").toUpperCase()}</span>
                     <span className="font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap pl-2">{Number(rl?.metrics_before?.[k] || 0).toFixed(3)} → {Number(rl?.metrics_after?.[k] || 0).toFixed(3)}</span>
                   </div>
                 ))}
               </div>
             </div>
          </AboutFlipCard>
        </div>
      </div>

      {barChartData.length > 0 && (
        <div className="h-[320px] w-full min-w-0 mt-6">
          <AboutFlipCard backContent={
            <div className="flex flex-col h-full justify-center text-left space-y-3 px-3 py-3 max-w-full">
              <div className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">Comparison Graph Meaning</div>
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Y-Axis:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">Absolute variation from Perfect Parity (where differences = 0, DI = 1.0; although graphed here as distance from 1.0 for visual mapping).</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Interpretation:</span>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5 whitespace-normal">Lower bars are better because they are closer to 0 disparity. The red dashed line represents the maximum allowable threshold (usually 0.1).</p>
              </div>
            </div>
          }>
            <div className="card p-5 h-full flex flex-col justify-center w-full min-w-0 overflow-hidden">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2 max-w-full">
                <BarChart3 size={16} className="text-amber-600 flex-shrink-0" />
                <span className="truncate">Metric Comparison — Baseline vs Standard vs RL</span>
              </h3>
              <div className="flex-1 w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ left: 10, right: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="metric" tick={{ fontSize: 10, fill: "currentColor", className: "text-gray-500" }} angle={-12} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor", className: "text-gray-500" }} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, backgroundColor: "var(--tw-prose-bg, white)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0.1} stroke="#EF4444" strokeDasharray="4 4" label={{ value: "Threshold", fill: "#EF4444", fontSize: 9, position: "right" }} />
                    <Bar dataKey="Baseline" fill="#9CA3AF" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="Standard" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="RL" fill="#7C3AED" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </AboutFlipCard>
        </div>
      )}
    </div>
  );
}
