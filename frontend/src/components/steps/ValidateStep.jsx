"use client";
import { useState, useEffect } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  TrendingUp, Activity, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Users, Loader2,
  ArrowRight, Play, Award, Brain, Sparkles, BookOpen,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const BADGE_STYLES = {
  ready: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-400 dark:border-emerald-600",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "stroke-emerald-500",
    Icon: ShieldCheck,
  },
  monitor: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-400 dark:border-yellow-600",
    text: "text-yellow-700 dark:text-yellow-400",
    ring: "stroke-yellow-500",
    Icon: Shield,
  },
  work: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-400 dark:border-orange-600",
    text: "text-orange-700 dark:text-orange-400",
    ring: "stroke-orange-500",
    Icon: ShieldAlert,
  },
  block: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-400 dark:border-red-600",
    text: "text-red-700 dark:text-red-400",
    ring: "stroke-red-500",
    Icon: ShieldX,
  },
};


// ═══════════════════════════════════════
//  CIRCULAR SCORE GAUGE (medium size)
// ═══════════════════════════════════════
function ScoreGauge({ score, badge, size = 140, stroke = 12 }) {
  const style = BADGE_STYLES[badge] || BADGE_STYLES.work;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={stroke}
          className="stroke-gray-200 dark:stroke-gray-700"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={style.ring}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-bold text-gray-900 dark:text-white text-3xl">
          {Math.round(score)}
        </div>
        <div className="text-gray-500 dark:text-gray-400 text-[10px]">/ 100</div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
//  STACKED MODEL ROW (gauge + details)
// ═══════════════════════════════════════
function ModelRow({ title, subtitle, result, accent, delta = null, deltaLabel = null, locked = false }) {
  if (!result && !locked) return null;

  if (locked) {
    return (
      <div className="card p-5 border-2 border-dashed border-gray-300 dark:border-gray-700 opacity-60">
        <div className="flex items-center gap-4">
          <div className="w-[140px] h-[140px] flex items-center justify-center">
            <div className="text-gray-400 text-xs text-center">Not yet<br/>tested</div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Brain size={14} className="text-violet-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                {title}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  const style = BADGE_STYLES[result.badge] || BADGE_STYLES.work;
  const Icon = style.Icon;

  return (
    <div className={`card p-5 ${accent ? `border-l-4 ${accent}` : ""}`}>
      <div className="flex items-start gap-5 flex-wrap">
        <ScoreGauge score={result.total_score} badge={result.badge} />

        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {title}
              </div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{subtitle}</div>
            </div>
            {delta !== null && (
              <div className={`text-xs font-bold px-2.5 py-1 rounded-lg
                ${delta >= 0
                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}`}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(0)} pts {deltaLabel}
              </div>
            )}
          </div>

          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3
            ${style.bg} ${style.text} border ${style.border}`}>
            <Icon size={12} />
            <span className="font-semibold text-[11px]">{result.badge_label}</span>
          </div>

          {/* Mini score breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-2">
              <div className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fresh Cohort</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                {result.fresh_cohort?.score?.toFixed(0)}<span className="text-gray-400 text-[10px]">/40</span>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-2">
              <div className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shadow</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                {result.shadow?.score?.toFixed(0)}<span className="text-gray-400 text-[10px]">/35</span>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-2">
              <div className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stability</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                {result.stability?.score?.toFixed(0)}<span className="text-gray-400 text-[10px]">/25</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
//  TEST CARD (expandable)
// ═══════════════════════════════════════
function TestCard({ title, icon: Icon, score, maxScore, verdict, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = (score / maxScore) * 100;
  const barColor =
    pct >= 80 ? "bg-emerald-500"
      : pct >= 60 ? "bg-yellow-500"
        : pct >= 40 ? "bg-orange-500"
          : "bg-red-500";

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} color="#fff" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 dark:text-white">{title}</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[200px]">
              <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {score.toFixed(0)}/{maxScore} pts
            </span>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {verdict}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════
//  THREE-WAY SCORE COMPARISON BAR
// ═══════════════════════════════════════
function ThreeWayBar({ original, mitigated, rl }) {
  const data = [
    { name: "Fresh Cohort", Original: original?.fresh_cohort?.score || 0, Standard: mitigated?.fresh_cohort?.score || 0, RL: rl?.fresh_cohort?.score || 0, max: 40 },
    { name: "Shadow", Original: original?.shadow?.score || 0, Standard: mitigated?.shadow?.score || 0, RL: rl?.shadow?.score || 0, max: 35 },
    { name: "Stability", Original: original?.stability?.score || 0, Standard: mitigated?.stability?.score || 0, RL: rl?.stability?.score || 0, max: 25 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 0, right: 20, top: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" tick={{ fill: "currentColor", fontSize: 11 }} />
        <YAxis tick={{ fill: "currentColor", fontSize: 10 }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="Original" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Standard" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="RL" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}


// ═══════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════
export default function ValidateStep({ datasetId, meta, initialResult = null, onComplete }) {
  const [running, setRunning] = useState(false);
  const [runningRL, setRunningRL] = useState(false);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(null);
  const [activeNarrative, setActiveNarrative] = useState("primary"); // "primary" | "alternative"

  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);

  // Which model to show test breakdown for
  const [breakdownModel, setBreakdownModel] = useState("mitigated");

  const runValidation = async () => {
    if (!datasetId || !meta) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/validate/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes || [],
          label_column: meta.label_column || "",
          favorable_label: meta.favorable_label || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Validation failed");
      }

      const data = await res.json();
      setResult(data);
      if (onComplete) onComplete(data);
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  const runRLValidation = async () => {
    if (!datasetId || !meta) return;
    setRunningRL(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/validate/run-rl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes || [],
          label_column: meta.label_column || "",
          favorable_label: meta.favorable_label || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "RL validation failed");
      }

      const data = await res.json();
      setResult(data);
      if (onComplete) onComplete(data);
    } catch (e) {
      setError(e.message);
    }
    setRunningRL(false);
  };

  const hasRL = result?.rl_mitigated != null;
  const breakdown = result?.[breakdownModel] || result?.mitigated;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center">
          <Shield size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Deployment Validation</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Real-world readiness testing before production deployment
          </p>
        </div>
      </div>

      {/* Info card (before running) */}
      {!result && !running && (
        <div className="card p-5 mb-5 border-l-4 border-l-indigo-500">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
            Three Industry-Standard Tests
          </h3>
          <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={14} color="#fff" />
              </div>
              <div>
                <strong className="text-blue-600 dark:text-blue-400">Fresh Cohort Simulation (40 pts)</strong>
                <p className="mt-0.5">500 synthetic candidates from a shifted distribution. Checks if fairness generalizes beyond the training data.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                <Users size={14} color="#fff" />
              </div>
              <div>
                <strong className="text-violet-600 dark:text-violet-400">Shadow Disagreement Analysis (35 pts)</strong>
                <p className="mt-0.5">Runs original and mitigated models side-by-side. Measures whether disagreements correct bias.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                <Activity size={14} color="#fff" />
              </div>
              <div>
                <strong className="text-amber-600 dark:text-amber-400">Stability Under Perturbation (25 pts)</strong>
                <p className="mt-0.5">20 candidates × 50 noise variants each. Brittle models fail in production.</p>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
            <div className="text-xs text-indigo-800 dark:text-indigo-300 italic">
              First run shows Baseline vs Standard Mitigation (~15 sec). You can then add the RL-discovered sequence for a three-way comparison (+30 sec).
            </div>
          </div>
        </div>
      )}

      {/* Start button */}
      {!result && !running && (
        <button
          onClick={runValidation}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white
                     bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600
                     shadow-md transition-all cursor-pointer"
        >
          <Play size={16} /> Run Deployment Validation
        </button>
      )}

      {/* Loading */}
      {running && (
        <div className="flex flex-col items-center py-12 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center">
              <Shield size={28} color="#fff" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
              <Loader2 size={14} className="text-indigo-600 animate-spin" />
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Running fresh cohort, shadow deployment, and stability tests...
          </div>
          <div className="text-xs text-gray-400">This takes 10–20 seconds</div>
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
          {/* ── Stacked model rows ── */}
          <div className="space-y-3">
            <ModelRow
              title="Baseline"
              subtitle="Original (No Mitigation)"
              result={result.original}
              accent="border-l-gray-400"
            />
            <ModelRow
              title="After Reweighting"
              subtitle="Standard Mitigation"
              result={result.mitigated}
              accent="border-l-blue-500"
              delta={result.score_improvement}
              deltaLabel="vs baseline"
            />
            {hasRL ? (
              <ModelRow
                title="After RL Optimization"
                subtitle={result.rl_mitigated?.summary?.match(/RL sequence: ([^.]+)\./)?.[1] || "Reweighting → Threshold Optimizer"}
                result={result.rl_mitigated}
                accent="border-l-violet-500"
                delta={result.rl_vs_standard}
                deltaLabel="vs standard"
              />
            ) : (
              // Locked RL card with call-to-action
              <div className="card p-5 border-2 border-dashed border-violet-300 dark:border-violet-700">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="w-[140px] h-[140px] rounded-full border-2 border-dashed border-violet-300 dark:border-violet-700 flex items-center justify-center flex-shrink-0">
                    <Brain size={36} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-violet-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                        Add RL Comparison
                      </span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                      RL-Discovered Mitigation Sequence
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                      Train an RL-optimized multi-step sequence and run the same three tests on it. Reveals whether multi-step mitigation beats single-technique approaches.
                    </p>
                    <button
                      onClick={runRLValidation}
                      disabled={runningRL}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white
                                 bg-gradient-to-r from-violet-600 to-fuchsia-500
                                 hover:from-violet-700 hover:to-fuchsia-600
                                 shadow-md transition-all cursor-pointer
                                 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {runningRL ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Training RL sequence... (~30 sec)
                        </>
                      ) : (
                        <>
                          <Brain size={14} />
                          Include RL Comparison
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Verdict / Narrative ── */}
          <div className="card p-5">
            <div className="flex items-start gap-2 mb-3">
              <Award size={16} className="text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
                <strong className="text-gray-900 dark:text-white">Standard Verdict:</strong> {result.improvement_verdict}
              </p>
            </div>

            {hasRL && (
              <>
                <div className="flex items-start gap-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/50">
                  <Brain size={16} className="text-violet-600 dark:text-violet-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
                    <strong className="text-gray-900 dark:text-white">RL Verdict:</strong> {result.rl_verdict}
                  </p>
                </div>

                {/* Narrative tabs */}
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={14} className="text-gray-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Story framing:
                  </span>
                  <button
                    onClick={() => setActiveNarrative("primary")}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer
                      ${activeNarrative === "primary"
                        ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-300 dark:border-violet-700"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700"
                      }`}
                  >
                    RL is better
                  </button>
                  <button
                    onClick={() => setActiveNarrative("alternative")}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer
                      ${activeNarrative === "alternative"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700"
                      }`}
                  >
                    Different tools for different constraints
                  </button>
                </div>
                <div className={`p-3 rounded-lg text-[12px] leading-relaxed
                  ${activeNarrative === "primary"
                    ? "bg-violet-50 dark:bg-violet-900/20 text-gray-700 dark:text-gray-300 border border-violet-200 dark:border-violet-700/50"
                    : "bg-blue-50 dark:bg-blue-900/20 text-gray-700 dark:text-gray-300 border border-blue-200 dark:border-blue-700/50"
                  }`}>
                  {activeNarrative === "primary" ? result.narrative_primary : result.narrative_alternative}
                </div>
              </>
            )}
          </div>

          {/* ── Three-way comparison chart (if RL exists) ── */}
          {hasRL && (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
                Per-Test Score Comparison
              </h3>
              <ThreeWayBar
                original={result.original}
                mitigated={result.mitigated}
                rl={result.rl_mitigated}
              />
            </div>
          )}

          {/* ── Detailed breakdown (switchable model) ── */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                Test Breakdown
              </h3>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setBreakdownModel("original")}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer
                    ${breakdownModel === "original"
                      ? "bg-gray-700 dark:bg-gray-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}
                >
                  Baseline
                </button>
                <button
                  onClick={() => setBreakdownModel("mitigated")}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer
                    ${breakdownModel === "mitigated"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}
                >
                  Standard
                </button>
                {hasRL && (
                  <button
                    onClick={() => setBreakdownModel("rl_mitigated")}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer
                      ${breakdownModel === "rl_mitigated"
                        ? "bg-violet-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}
                  >
                    RL
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Fresh Cohort */}
              <TestCard
                title="Fresh Cohort Simulation"
                icon={TrendingUp}
                score={breakdown?.fresh_cohort?.score || 0}
                maxScore={40}
                verdict={breakdown?.fresh_cohort?.verdict || ""}
                color="bg-gradient-to-br from-blue-500 to-blue-600"
                defaultOpen={true}
              >
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">DI on Training Data</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                      {breakdown?.fresh_cohort?.di_ratio_training?.toFixed(3)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">DI on Fresh Cohort</div>
                    <div className={`text-lg font-bold mt-1 ${breakdown?.fresh_cohort?.di_ratio_fresh >= 0.8 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {breakdown?.fresh_cohort?.di_ratio_fresh?.toFixed(3)}
                    </div>
                  </div>
                </div>

                {breakdown?.fresh_cohort?.subgroup_selection_rates && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Selection Rates on Fresh Cohort
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(100, Object.keys(breakdown.fresh_cohort.subgroup_selection_rates).length * 32)}>
                      <BarChart
                        data={Object.entries(breakdown.fresh_cohort.subgroup_selection_rates).map(([k, v]) => ({ group: k, rate: v }))}
                        layout="vertical"
                        margin={{ left: 80, right: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                        <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                          tick={{ fill: "currentColor", fontSize: 10 }} />
                        <YAxis type="category" dataKey="group" width={70}
                          tick={{ fill: "currentColor", fontSize: 10 }} />
                        <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <ReferenceLine x={0.8} stroke="#DC2626" strokeDasharray="4 4" />
                        <Bar dataKey="rate" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </TestCard>

              {/* Shadow Disagreement */}
              <TestCard
                title="Shadow Deployment Disagreement"
                icon={Users}
                score={breakdown?.shadow?.score || 0}
                maxScore={35}
                verdict={breakdown?.shadow?.verdict?.replace(/_/g, " ") || ""}
                color="bg-gradient-to-br from-violet-500 to-violet-600"
              >
                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">Total Disagreements</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                      {breakdown?.shadow?.total_disagreements || 0}
                    </div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded p-3">
                    <div className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wider">Favoring Unprivileged</div>
                    <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                      {breakdown?.shadow?.flips_favoring_unprivileged || 0}
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded p-3">
                    <div className="text-red-700 dark:text-red-400 text-[10px] uppercase tracking-wider">Favoring Privileged</div>
                    <div className="text-lg font-bold text-red-700 dark:text-red-400 mt-1">
                      {breakdown?.shadow?.flips_favoring_privileged || 0}
                    </div>
                  </div>
                </div>

                {breakdown?.shadow?.subgroup_flip_breakdown?.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left text-gray-500 font-semibold">Group</th>
                          <th className="px-3 py-2 text-right text-emerald-600 font-semibold">Gained</th>
                          <th className="px-3 py-2 text-right text-red-600 font-semibold">Lost</th>
                          <th className="px-3 py-2 text-center text-gray-500 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.shadow.subgroup_flip_breakdown.map((s, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                            <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-medium">
                              {s.group}
                              {s.is_privileged && (
                                <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold">PRIV</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-semibold">+{s.in_favor}</td>
                            <td className="px-3 py-2 text-right text-red-600 dark:text-red-400 font-semibold">-{s.against}</td>
                            <td className="px-3 py-2 text-center">
                              {s.in_favor > s.against
                                ? <CheckCircle size={14} className="inline text-emerald-500" />
                                : s.against > s.in_favor
                                  ? <XCircle size={14} className="inline text-red-500" />
                                  : <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TestCard>

              {/* Stability */}
              <TestCard
                title="Stability Under Perturbation"
                icon={Activity}
                score={breakdown?.stability?.score || 0}
                maxScore={25}
                verdict={breakdown?.stability?.verdict?.replace(/_/g, " ") || ""}
                color="bg-gradient-to-br from-amber-500 to-orange-500"
              >
                <div className="grid grid-cols-3 gap-3 text-xs mb-3">
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">Mean Consistency</div>
                    <div className={`text-lg font-bold mt-1 ${(breakdown?.stability?.mean_consistency || 0) >= 0.9 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                      {((breakdown?.stability?.mean_consistency || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">Min Consistency</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                      {((breakdown?.stability?.min_consistency || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded p-3">
                    <div className="text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">Unstable Candidates</div>
                    <div className={`text-lg font-bold mt-1 ${(breakdown?.stability?.unstable_candidate_count || 0) === 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {breakdown?.stability?.unstable_candidate_count || 0}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Per-Candidate Stability ({breakdown?.stability?.num_candidates_tested} tested × {breakdown?.stability?.num_variants_per_candidate} variants each)
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={breakdown?.stability?.per_candidate_scores || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis dataKey="id" tick={{ fill: "currentColor", fontSize: 9 }} />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fill: "currentColor", fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={0.80} stroke="#DC2626" strokeDasharray="4 4" />
                    <Bar dataKey="consistency" radius={[2, 2, 0, 0]}>
                      {(breakdown?.stability?.per_candidate_scores || []).map((entry, i) => (
                        <Cell key={i} fill={entry.consistency >= 0.95 ? "#10B981" : entry.consistency >= 0.80 ? "#F59E0B" : "#DC2626"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TestCard>
            </div>
          </div>

          {/* Run again */}
          <button onClick={() => { setResult(null); setError(null); }} className="btn-secondary text-xs">
            Run Validation Again
          </button>
        </div>
      )}
    </div>
  );
}