"use client";
import { useState } from "react";
import {
  Bot, Send, Loader2, Brain, Wrench, Eye, CheckCircle,
  XCircle, Download, FileText, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STEP_ICONS = {
  thought: { icon: Brain, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20", label: "THINKING" },
  action: { icon: Wrench, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20", label: "ACTION" },
  observation: { icon: Eye, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", label: "OBSERVATION" },
  done: { icon: CheckCircle, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20", label: "COMPLETE" },
  error: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20", label: "ERROR" },
};

const EXAMPLE_PROMPTS = [
  "Audit this hiring dataset for bias against women and minorities. I need an LL144-compliant report.",
  "Check if this model discriminates by race and gender. Apply the best mitigation technique.",
  "Run a full fairness audit. Focus on the four-fifths rule and equalized odds.",
  "Detect bias, fix it with reweighting, and generate a compliance report.",
];

export default function AgentPanel({ datasetId, meta, onAuditComplete }) {
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState({});

  const toggleStep = (idx) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const runAgent = async (customInstruction) => {
    const instr = customInstruction || instruction;
    if (!instr.trim() || !datasetId) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/agent/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          instruction: instr,
          protected_attributes: meta?.protected_attributes || [],
          label_column: meta?.label_column || "",
          favorable_label: meta?.favorable_label || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Agent failed");
      }

      const data = await res.json();
      setResult(data);

      if (onAuditComplete && data.status === "completed") {
        onAuditComplete(data);
      }
    } catch (e) {
      setError(e.message);
    }

    setRunning(false);
  };

  const downloadReport = async () => {
    if (!result?.session_id) return;
    try {
      const res = await fetch(`${API_BASE}/api/agent/${result.session_id}/report`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fairnesslens_agent_audit_${result.session_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed: " + e.message);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center">
          <Bot size={22} color="#fff" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Audit Agent</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Autonomous bias auditor powered by Gemini — runs the full Inspect → Measure → Flag → Fix pipeline for you
          </p>
        </div>
      </div>

      {/* Example prompts */}
      {!result && !running && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Try an example:</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button key={i}
                onClick={() => { setInstruction(prompt); runAgent(prompt); }}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700
                           text-gray-600 dark:text-gray-400 hover:border-purple-400 hover:text-purple-600
                           dark:hover:border-purple-500 dark:hover:text-purple-400 transition-all cursor-pointer
                           bg-white dark:bg-gray-800"
              >
                <Sparkles size={11} className="inline mr-1" />{prompt.substring(0, 60)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && runAgent()}
          placeholder="Tell the agent what to audit... (e.g., 'Audit for gender and race bias, generate LL144 report')"
          disabled={running}
          className="flex-1 px-4 py-3 text-sm rounded-xl border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200
                     focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none
                     disabled:opacity-50 placeholder:text-gray-400"
        />
        <button
          onClick={() => runAgent()}
          disabled={running || !instruction.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-white
                     bg-gradient-to-r from-purple-600 to-blue-500
                     hover:from-purple-700 hover:to-blue-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all cursor-pointer flex items-center gap-2"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {running ? "Running..." : "Audit"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-4 mb-4 text-sm text-red-700 dark:text-red-300">
          ✕ {error}
        </div>
      )}

      {/* Loading state */}
      {running && (
        <div className="flex flex-col items-center py-12 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center">
              <Bot size={28} color="#fff" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center">
              <Loader2 size={14} className="text-purple-600 animate-spin" />
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Agent is reasoning and executing the audit pipeline...</div>
          <div className="text-xs text-gray-400">This may take 15-30 seconds</div>
        </div>
      )}

      {/* Results — Reasoning Trace */}
      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            result.status === "completed"
              ? "bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700"
              : "bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700"
          }`}>
            {result.status === "completed"
              ? <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
              : <XCircle size={20} className="text-red-600 dark:text-red-400" />}
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Audit {result.status === "completed" ? "Complete" : "Failed"}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {result.trace?.length || 0} steps executed
                {result.has_report && " · PDF report ready"}
              </div>
            </div>
          </div>

          {/* Reasoning trace */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Brain size={16} className="text-purple-600 dark:text-purple-400" />
              Agent Reasoning Trace
            </h3>

            <div className="space-y-2">
              {(result.trace || []).map((step, i) => {
                const cfg = STEP_ICONS[step.step_type] || STEP_ICONS.thought;
                const Icon = cfg.icon;
                const isExpanded = expandedSteps[i];
                const isLong = step.content?.length > 150;

                return (
                  <div key={i} className={`rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${cfg.bg}`}>
                    <button
                      onClick={() => isLong && toggleStep(i)}
                      className={`w-full flex items-start gap-3 p-3 text-left ${isLong ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        <Icon size={14} className={cfg.color} />
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {step.tool_name && (
                          <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 mr-2">
                            {step.tool_name}()
                          </span>
                        )}
                        <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                          {isLong && !isExpanded ? step.content.substring(0, 150) + "..." : step.content}
                        </span>
                      </div>
                      {isLong && (
                        <div className="flex-shrink-0">
                          {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      )}
                    </button>

                    {/* Tool args (collapsed by default) */}
                    {step.tool_args && isExpanded && (
                      <div className="px-3 pb-2 pt-0">
                        <pre className="text-[10px] text-gray-500 bg-white/50 dark:bg-gray-800/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify(step.tool_args, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final narrative */}
          {result.final_narrative && (
            <div className="card p-4 bg-gray-50 dark:bg-gray-800/30">
              <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
                <Sparkles size={14} /> Agent Summary
              </div>
              <div className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                {result.final_narrative}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {result.has_report && (
              <button onClick={downloadReport}
                className="btn-primary">
                <Download size={16} /> Download PDF Report
              </button>
            )}
            <button
              onClick={() => { setResult(null); setInstruction(""); }}
              className="btn-secondary"
            >
              Run Another Audit
            </button>
          </div>

          {/* Pipeline data indicator */}
          <div className="card p-4">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Pipeline Data Populated (click sidebar steps to review)
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Inspect", done: result.has_inspect_data },
                { label: "Measure", done: result.has_measure_data },
                { label: "Flag", done: result.has_flag_data },
                { label: "Fix", done: result.has_fix_data },
                { label: "Report", done: result.has_report },
              ].map((s, i) => (
                <span key={i} className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1
                  ${s.done
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                  }`}>
                  {s.done ? <CheckCircle size={12} /> : <XCircle size={12} />} {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}