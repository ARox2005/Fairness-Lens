"use client";
import { useState, useCallback, useEffect } from "react";
import { BarChart3, AlertTriangle, Wrench, ChevronRight, Bot, Swords, Shuffle } from "lucide-react";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { LoadingSpinner, ErrorBanner } from "@/components/ui";
import UploadStep from "@/components/steps/UploadStep";
import InspectStep from "@/components/steps/InspectStep";
import MeasureStep from "@/components/steps/MeasureStep";
import FlagStep from "@/components/steps/FlagStep";
import FixStep from "@/components/steps/FixStep";
import AgentPanel from "@/components/steps/AgentPanel";
import RedTeamPanel from "@/components/steps/RedTeamPanel";
import CounterfactualPanel from "@/components/steps/CounterfactualPanel";
import { apiFetch, apiUpload, DEMO_META, wakeBackend } from "@/lib/api";

export default function Home() {
  // Theme
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Wake backend on mount (handles Render cold start)
  useEffect(() => {
    wakeBackend();
  }, []);

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

  // Completed steps for sidebar
  const completedSteps = [];
  if (inspectData) completedSteps.push(0, 1);
  if (measureData) completedSteps.push(2);
  if (flagData) completedSteps.push(3);
  if (fixData) completedSteps.push(4);

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
    setStep(1);
  }, []);

  // ── Agent mode: populate all data from agent results ──
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

  // ── Step 4: Fix ──
  const runFix = useCallback(async () => {
    if (!datasetId || !meta) return;
    setLoading(true);
    setError(null);
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

  // Next action for each step
  const nextActions = [
    null, // upload — handled by buttons
    { label: "Run Fairness Metrics", action: runMeasure, Icon: BarChart3 },
    { label: "Flag Bias Issues", action: runFlag, Icon: AlertTriangle },
    { label: "Apply Mitigation", action: runFix, Icon: Wrench },
    null, // fix — end of pipeline
  ];

  const loadingMessages = [
    "Loading dataset and running inspection...",
    "Computing all fairness metrics...",
    "Generating bias flags and compliance checks...",
    "Applying mitigation techniques...",
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
              {step === 4 && <FixStep data={fixData} inspectData={inspectData} measureData={measureData} flagData={flagData} datasetId={datasetId} />}

              {/* Counterfactual toggle + Apply Mitigation on Flag step */}
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
                </div>
              )}
              {!loading && step === 3 && counterfactualMode && (
                <div className="mt-4 flex gap-2">
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
                </div>
              )}

              {/* Mode toggles + Next step button (on Inspect step) */}
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

              {/* Next step buttons for steps 2-3 */}
              {!loading && nextActions[step] && step > 1 && step !== 3 && (() => {
                const na = nextActions[step];
                return (
                  <div className="mt-6 flex justify-end">
                    <button onClick={na.action} className="btn-primary">
                      <na.Icon size={16} />
                      {na.label}
                      <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}