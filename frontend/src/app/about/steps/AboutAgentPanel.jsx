"use client";
import { useState } from "react";
import { Bot, Send, Loader2, Brain, Wrench, Eye, CheckCircle, XCircle, Download, FileText, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

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
];

export default function AboutAgentPanel({ result, onAuditStart }) {
  const [instruction, setInstruction] = useState("");
  const [expandedSteps, setExpandedSteps] = useState({});

  const toggleStep = (idx) => {
    setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isRunning = result === "loading";
  const hasResult = typeof result === "object" && result !== null;

  return (
    <div className="animate-fade-in">
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

      {!hasResult && !isRunning && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Try an example:</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <button key={i} onClick={() => { setInstruction(prompt); onAuditStart(); }}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <Sparkles size={11} className="inline mr-1" />{prompt.substring(0, 60)}...
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <input type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !isRunning && onAuditStart()} placeholder="Tell the agent what to audit..." disabled={isRunning}
          className="flex-1 px-4 py-3 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none disabled:opacity-50" />
        <button onClick={() => onAuditStart()} disabled={isRunning || !instruction.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-500 disabled:opacity-50 flex items-center gap-2">
          {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {isRunning ? "Running..." : "Audit"}
        </button>
      </div>

      {isRunning && (
        <div className="flex flex-col items-center py-12 gap-4">
          <Loader2 size={32} className="text-purple-600 animate-spin" />
          <div className="text-sm">Agent is reasoning and executing the sandbox pipeline...</div>
        </div>
      )}

      {hasResult && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            <div>
              <div className="text-sm font-semibold">Audit Complete</div>
              <div className="text-xs text-gray-500">{result.trace?.length || 0} steps executed</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><Brain size={16} className="text-purple-600" /> Agent Reasoning Trace</h3>
            <div className="space-y-2">
              {(result.trace || []).map((step, i) => {
                const cfg = STEP_ICONS[step.step_type] || STEP_ICONS.thought;
                const Icon = cfg.icon;
                return (
                  <div key={i} className={`rounded-lg border overflow-hidden p-3 flex gap-3 ${cfg.bg}`}>
                    <Icon size={14} className={`${cfg.color} mt-0.5`} />
                    <div className="flex-1 text-xs text-gray-600 dark:text-gray-400">
                      <strong>{cfg.label}</strong> {step.tool_name && `— ${step.tool_name}()`}<br/>
                      {step.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4 bg-gray-50 dark:bg-gray-800/30">
            <div className="text-xs font-semibold text-purple-600 mb-2 flex items-center gap-1.5"><Sparkles size={14} /> Agent Summary</div>
            <div className="text-[13px]">{result.final_narrative}</div>
          </div>
        </div>
      )}
    </div>
  );
}
