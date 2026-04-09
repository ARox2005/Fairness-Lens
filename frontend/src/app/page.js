"use client";
import { useState, useCallback, useEffect } from "react";
import { BarChart3, AlertTriangle, Wrench, ChevronRight, Bot, Swords, Shuffle, Brain } from "lucide-react";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { LoadingSpinner, ErrorBanner } from "@/components/ui";
import UploadStep from "@/components/steps/UploadStep";
import InspectStep from "@/components/steps/InspectStep";
import MeasureStep from "@/components/steps/MeasureStep";
import FlagStep from "@/components/steps/FlagStep";
import FixStep from "@/components/steps/FixStep";
import RLFixStep from "@/components/steps/RLFixStep";
import AgentPanel from "@/components/steps/AgentPanel";
import RedTeamPanel from "@/components/steps/RedTeamPanel";
import CounterfactualPanel from "@/components/steps/CounterfactualPanel";
import { apiFetch, apiUpload, DEMO_META } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  // Theme
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Pipeline state
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [agentMode, setAgentMode] = useState(false);
  const [redTeamMode, setRedTeamMode] = useState(false);
  const [counterfactualMode, setCounterfactualMode] = useState(false);

  // Data state
  const [datasetId, setDatasetId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [measureData, setMeasureData] = useState(null);
  const [flagData, setFlagData] = useState(null);
  const [fixData, setFixData] = useState(null);

  // RL state
  const [rlData, setRlData] = useState(null);
  const [rlMode, setRlMode] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  // Completed steps for sidebar
  const completedSteps = [];
  if (inspectData) completedSteps.push(0, 1);
  if (measureData) completedSteps.push(2);
  if (flagData) completedSteps.push(3);
  if (fixData || rlData) completedSteps.push(4);

  // ── Step 1: Load demo dataset ──
  const handleDemoLoad = useCallback(async (demoId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/inspect/demo/${demoId}`, { method: "POST" });
      setInspectData(data);
      setDatasetId(data.dataset_id);
      setMeta(DEMO_META[demoId] || DEMO_META.adult);
      setMeasureData(null);
      setFlagData(null);
      setFixData(null);
      setRlData(null);
      setRlMode(false);
      setComparisonData(null);
      setStep(1);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ── Step 1b: Upload CSV ──
  const handleFileUpload = useCallback(async (file, csvMeta) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (csvMeta?.protected_attributes?.length > 0) {
        formData.append("protected_attributes", csvMeta.protected_attributes.join(","));
      }
      if (csvMeta?.label_column) {
        formData.append("label_column", csvMeta.label_column);
      }
      if (csvMeta?.favorable_label) {
        formData.append("favorable_label", csvMeta.favorable_label);
      }
      const data = await apiUpload("/api/inspect/upload", formData);
      setInspectData(data);
      setDatasetId(data.dataset_id);
      setMeta({
        protected_attributes: csvMeta?.protected_attributes?.length > 0
          ? csvMeta.protected_attributes
          : data.detected_protected_attributes || [],
        label_column: csvMeta?.label_column || "",
        favorable_label: csvMeta?.favorable_label || "",
      });
      setMeasureData(null);
      setFlagData(null);
      setFixData(null);
      setRlData(null);
      setRlMode(false);
      setComparisonData(null);
      setStep(1);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ── Step 1c: Model + CSV upload ──
  const handleModelUpload = useCallback((newDatasetId, inspectResult, newMeta) => {
    setInspectData(inspectResult);
    setDatasetId(newDatasetId);
    setMeta(newMeta);
    setMeasureData(null);
    setFlagData(null);
    setFixData(null);
    setRlData(null);
    setRlMode(false);
    setComparisonData(null);
    setStep(1);
  }, []);

  // ── Agent mode ──
  const handleAgentComplete = useCallback((agentResult) => {
    if (agentResult.inspect_data) setInspectData(agentResult.inspect_data);
    if (agentResult.measure_data) setMeasureData(agentResult.measure_data);
    if (agentResult.flag_data) setFlagData(agentResult.flag_data);
    if (agentResult.fix_data) setFixData(agentResult.fix_data);
  }, []);

  // ── Step 2: Measure ──
  const runMeasure = useCallback(async () => {
    if (!datasetId || !meta) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/measure/", {
        method: "POST",
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes,
          label_column: meta.label_column,
          favorable_label: meta.favorable_label,
          run_intersectional: true,
          run_shap: false,
        }),
      });
      setMeasureData(data);
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [datasetId, meta]);

  // ── Step 3: Flag ──
  const runFlag = useCallback(async () => {
    if (!datasetId || !meta) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/flag/", {
        method: "POST",
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes,
          label_column: meta.label_column,
          favorable_label: meta.favorable_label,
        }),
      });
      setFlagData(data);
      setStep(3);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [datasetId, meta]);

  // ── Step 4a: Standard Fix ──
  const runFix = useCallback(async () => {
    if (!datasetId || !meta) return;
    setLoading(true);
    setError(null);
    setRlMode(false);
    try {
      const data = await apiFetch("/api/fix/", {
        method: "POST",
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: [meta.protected_attributes[0]],
          label_column: meta.label_column,
          favorable_label: meta.favorable_label,
          techniques: ["reweighting", "threshold_optimizer"],
          fairness_constraint: "demographic_parity",
        }),
      });
      setFixData(data);
      setStep(4);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [datasetId, meta]);

  // ── Step 4b: RL Fix ──
  const runRLFix = useCallback(async () => {
    if (!datasetId || !meta) return;
    setLoading(true);
    setError(null);
    setRlMode(true);
    setComparisonData(null);
    try {
      const res = await fetch(`${API_BASE}/api/rl-fix/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes,
          label_column: meta.label_column,
          favorable_label: meta.favorable_label,
          num_episodes: 80,
          max_steps: 5,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "RL optimization failed");
      }
      const data = await res.json();
      setRlData(data);
      setStep(4);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [datasetId, meta]);

  // ── Compare RL vs Standard ──
  const runComparison = useCallback(async () => {
    if (!datasetId || !meta) return;
    setComparing(true);
    try {
      const res = await fetch(`${API_BASE}/api/rl-fix/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset_id: datasetId,
          protected_attributes: meta.protected_attributes,
          label_column: meta.label_column,
          favorable_label: meta.favorable_label,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Comparison failed");
      }
      const data = await res.json();
      setComparisonData(data);
    } catch (e) {
      setError(e.message);
    }
    setComparing(false);
  }, [datasetId, meta]);

  const loadingMessages = [
    "Loading dataset and running inspection...",
    "Computing all fairness metrics...",
    "Generating bias flags and compliance checks...",
    rlMode
      ? "Training DQN agent — discovering optimal mitigation sequence..."
      : "Applying mitigation techniques...",
    "Processing...",
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] transition-colors duration-300">
      <Header dark={dark} setDark={setDark} />

      <div className="flex max-w-[1200px] mx-auto px-4">
        <Sidebar step={step} setStep={setStep} completedSteps={completedSteps} />

        <main className="flex-1 py-6 pl-6 min-w-0">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {loading ? (
            <LoadingSpinner message={loadingMessages[step]} />
          ) : (
            <div>
              {step === 0 && (
                <UploadStep onDemoLoad={handleDemoLoad} onFileUpload={handleFileUpload} onModelUpload={handleModelUpload} loading={loading} />
              )}
              {step === 1 && !agentMode && !redTeamMode && <InspectStep data={inspectData} />}
              {step === 1 && agentMode && (
                <AgentPanel datasetId={datasetId} meta={meta} onAuditComplete={handleAgentComplete} />
              )}
              {step === 1 && redTeamMode && (
                <RedTeamPanel datasetId={datasetId} meta={meta} />
              )}
              {step === 2 && <MeasureStep data={measureData} />}
              {step === 3 && !counterfactualMode && <FlagStep data={flagData} />}
              {step === 3 && counterfactualMode && (
                <CounterfactualPanel datasetId={datasetId} meta={meta} />
              )}

              {/* Step 4: Standard Fix or RL Fix */}
              {step === 4 && !rlMode && (
                <FixStep data={fixData} inspectData={inspectData} measureData={measureData} flagData={flagData} datasetId={datasetId} />
              )}
              {step === 4 && rlMode && (
                <RLFixStep
                  data={rlData}
                  onCompare={runComparison}
                  comparing={comparing}
                  comparisonData={comparisonData}
                />
              )}

              {/* ═══ FLAG STEP BOTTOM BUTTONS ═══ */}
              {!loading && step === 3 && !counterfactualMode && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    onClick={() => setCounterfactualMode(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white
                               bg-gradient-to-r from-emerald-600 to-teal-500
                               hover:from-emerald-700 hover:to-teal-600
                               shadow-md transition-all cursor-pointer"
                  >
                    <Shuffle size={16} /> Counterfactual Stories
                  </button>
                  <div className="flex-1" />
                  <button onClick={runFix} className="btn-primary">
                    <Wrench size={16} /> Apply Mitigation <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={runRLFix}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white
                               bg-gradient-to-r from-violet-600 to-fuchsia-500
                               hover:from-violet-700 hover:to-fuchsia-600
                               shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    <Brain size={16} /> Apply Mitigation with RL <ChevronRight size={16} />
                  </button>
                </div>
              )}
              {!loading && step === 3 && counterfactualMode && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setCounterfactualMode(false)}
                    className="btn-secondary text-xs"
                  >
                    ← Back to Flags
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => { setCounterfactualMode(false); runFix(); }} className="btn-primary">
                    <Wrench size={16} /> Apply Mitigation <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => { setCounterfactualMode(false); runRLFix(); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white
                               bg-gradient-to-r from-violet-600 to-fuchsia-500
                               hover:from-violet-700 hover:to-fuchsia-600
                               shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    <Brain size={16} /> Apply Mitigation with RL <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* Step 4: toggle between views + try the other approach */}
              {!loading && step === 4 && (fixData || rlData) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {rlMode && fixData && (
                    <button onClick={() => setRlMode(false)} className="btn-secondary text-xs">
                      <Wrench size={14} /> View Standard Results
                    </button>
                  )}
                  {!rlMode && rlData && (
                    <button
                      onClick={() => setRlMode(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                                 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400
                                 border border-violet-200 dark:border-violet-700
                                 hover:bg-violet-200 dark:hover:bg-violet-800/40 transition-all cursor-pointer"
                    >
                      <Brain size={14} /> View RL Results
                    </button>
                  )}
                  {!rlMode && !rlData && (
                    <button
                      onClick={runRLFix}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
                                 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400
                                 border border-violet-200 dark:border-violet-700
                                 hover:bg-violet-200 dark:hover:bg-violet-800/40 transition-all cursor-pointer"
                    >
                      <Brain size={14} /> Also Try RL Mitigation
                    </button>
                  )}
                  {rlMode && !fixData && (
                    <button onClick={runFix} className="btn-secondary text-xs">
                      <Wrench size={14} /> Also Try Standard Mitigation
                    </button>
                  )}
                </div>
              )}

              {/* Inspect step: mode toggles + next */}
              {!loading && step === 1 && !agentMode && !redTeamMode && (
                <div className="mt-6 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setAgentMode(true); setRedTeamMode(false); }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white
                                 bg-gradient-to-r from-purple-600 to-blue-500
                                 hover:from-purple-700 hover:to-blue-600
                                 shadow-md transition-all cursor-pointer"
                    >
                      <Bot size={16} /> AI Agent Audit
                    </button>
                    <button
                      onClick={() => { setRedTeamMode(true); setAgentMode(false); }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white
                                 bg-gradient-to-r from-red-600 to-orange-500
                                 hover:from-red-700 hover:to-orange-600
                                 shadow-md transition-all cursor-pointer"
                    >
                      <Swords size={16} /> Red Team Test
                    </button>
                    <div className="flex-1" />
                    <button onClick={runMeasure} className="btn-primary">
                      <BarChart3 size={16} /> Run Fairness Metrics <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
              {!loading && step === 1 && (agentMode || redTeamMode) && (
                <div className="mt-4">
                  <button
                    onClick={() => { setAgentMode(false); setRedTeamMode(false); }}
                    className="btn-secondary text-xs"
                  >
                    ← Back to Manual Pipeline
                  </button>
                </div>
              )}

              {/* Next step button for step 2 */}
              {!loading && step === 2 && (
                <div className="mt-6 flex justify-end">
                  <button onClick={runFlag} className="btn-primary">
                    <AlertTriangle size={16} /> Flag Bias Issues <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}