"use client";
import { useState, useCallback, useEffect } from "react";
import { BarChart3, AlertTriangle, Wrench, ChevronRight, Bot, Swords, Shuffle, Brain } from "lucide-react";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { LoadingSpinner, ErrorBanner } from "@/components/ui";

import AboutUploadStep from "./steps/AboutUploadStep";
import AboutInspectStep from "./steps/AboutInspectStep";
import AboutMeasureStep from "./steps/AboutMeasureStep";
import AboutFlagStep from "./steps/AboutFlagStep";
import AboutFixStep from "./steps/AboutFixStep";
import AboutRLFixStep from "./steps/AboutRLFixStep";
import AboutAgentPanel from "./steps/AboutAgentPanel";
import AboutRedTeamPanel from "./steps/AboutRedTeamPanel";
import AboutCounterfactualPanel from "./steps/AboutCounterfactualPanel";

import {
  DUMMY_INSPECT_DATA,
  DUMMY_MEASURE_DATA,
  DUMMY_FLAG_DATA,
  DUMMY_FIX_DATA,
  DUMMY_RL_DATA,
  DUMMY_RL_COMPARE_DATA,
  DUMMY_AGENT_DATA,
  DUMMY_REDTEAM_DATA,
  DUMMY_COUNTERFACTUAL_DATA
} from "./dummyData";

// Simulate a realistic API delay
const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AboutPage() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [agentMode, setAgentMode] = useState(false);
  const [redTeamMode, setRedTeamMode] = useState(false);
  const [counterfactualMode, setCounterfactualMode] = useState(false);

  const [datasetId, setDatasetId] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [measureData, setMeasureData] = useState(null);
  const [flagData, setFlagData] = useState(null);
  const [fixData, setFixData] = useState(null);
  
  const [rlData, setRlData] = useState(null);
  const [rlMode, setRlMode] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  const [agentData, setAgentData] = useState(null);
  const [redTeamData, setRedTeamData] = useState(null);
  const [counterfactualData, setCounterfactualData] = useState(null);

  const completedSteps = [];
  if (inspectData || agentData || redTeamData) completedSteps.push(0, 1);
  if (measureData) completedSteps.push(2);
  if (flagData || counterfactualData) completedSteps.push(3);
  if (fixData || rlData) completedSteps.push(4);

  const handleDemoLoad = useCallback(async (demoId) => {
    setLoading(true); setError(null); setAgentMode(false); setRedTeamMode(false);
    await delay(300);
    setDatasetId(`dummy_${demoId}`);
    setInspectData(DUMMY_INSPECT_DATA);
    setMeasureData(null); setFlagData(null); setFixData(null); setRlData(null); setComparisonData(null);
    setStep(1);
    setLoading(false);
  }, []);

  const runMeasure = useCallback(async () => {
    setLoading(true); setError(null);
    await delay(500);
    setMeasureData(DUMMY_MEASURE_DATA);
    setStep(2);
    setLoading(false);
  }, []);

  const runFlag = useCallback(async () => {
    setLoading(true); setError(null);
    await delay(400);
    setFlagData(DUMMY_FLAG_DATA);
    setStep(3);
    setLoading(false);
  }, []);

  const runFix = useCallback(async () => {
    setLoading(true); setError(null); setRlMode(false);
    await delay(600);
    setFixData(DUMMY_FIX_DATA);
    setStep(4);
    setLoading(false);
  }, []);

  const runRLFix = useCallback(async () => {
    setLoading(true); setError(null); setRlMode(true); setComparisonData(null);
    await delay(800); // slightly longer for RL simulation
    setRlData(DUMMY_RL_DATA);
    setStep(4);
    setLoading(false);
  }, []);

  const runComparison = useCallback(async () => {
    setComparing(true);
    await delay(400);
    setComparisonData(DUMMY_RL_COMPARE_DATA);
    setComparing(false);
  }, []);

  // Sandbox panels
  const runAgent = useCallback(async () => {
    setAgentData("loading");
    await delay(1200);
    setAgentData(DUMMY_AGENT_DATA);
  }, []);

  const runRedTeam = useCallback(async () => {
    setRedTeamData("loading");
    await delay(1500);
    setRedTeamData(DUMMY_REDTEAM_DATA);
  }, []);

  const runCounterfactuals = useCallback(async () => {
    setCounterfactualData("loading");
    await delay(1000);
    setCounterfactualData(DUMMY_COUNTERFACTUAL_DATA);
  }, []);

  const loadingMessages = [
    "Loading dummy dataset...",
    "Computing dummy fairness metrics...",
    "Generating simulated bias flags...",
    rlMode ? "Training dummy DQN agent..." : "Applying standard mitigation...",
    "Processing..."
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0F1117] transition-colors duration-300">
      <Header dark={dark} setDark={setDark} />

      <div className="flex max-w-[1200px] mx-auto px-4">
        <Sidebar step={step} setStep={setStep} completedSteps={completedSteps} />

        <main className="flex-1 py-6 pl-6 min-w-0">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">Sandbox Mode Active</h3>
            <p className="text-xs text-blue-800 dark:text-blue-400">
              You are viewing the interactive About environment. Network requests are disabled, and dummy simulated data is presented immediately to let you explore the entire feature suite of the platform.
            </p>
          </div>

          <ErrorBanner message={error} onDismiss={() => setError(null)} />

          {loading ? (
            <LoadingSpinner message={loadingMessages[step]} />
          ) : (
            <div>
              {step === 0 && (
                <AboutUploadStep onDemoLoad={handleDemoLoad} loading={loading} />
              )}
              {step === 1 && !agentMode && !redTeamMode && <AboutInspectStep data={inspectData} />}
              {step === 1 && agentMode && (
                <AboutAgentPanel result={agentData} onAuditStart={runAgent} />
              )}
              {step === 1 && redTeamMode && (
                <AboutRedTeamPanel result={redTeamData} onStart={runRedTeam} />
              )}
              {step === 2 && <AboutMeasureStep data={measureData} />}
              {step === 3 && !counterfactualMode && <AboutFlagStep data={flagData} />}
              {step === 3 && counterfactualMode && (
                 <AboutCounterfactualPanel result={counterfactualData} onStart={runCounterfactuals} />
              )}

              {/* Step 4: Fix / RL Fix */}
              {step === 4 && !rlMode && (
                <AboutFixStep data={fixData} />
              )}
              {step === 4 && rlMode && (
                <AboutRLFixStep data={rlData} onCompare={runComparison} comparing={comparing} comparisonData={comparisonData} />
              )}

              {/* Toggles from Step 3 -> 4 */}
              {!loading && step === 3 && !counterfactualMode && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button onClick={() => setCounterfactualMode(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-500 shadow-md">
                    <Shuffle size={16} /> Counterfactual Stories
                  </button>
                  <div className="flex-1" />
                  <button onClick={runFix} className="btn-primary">
                    <Wrench size={16} /> Apply Mitigation <ChevronRight size={16} />
                  </button>
                  <button onClick={runRLFix} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 shadow-md">
                    <Brain size={16} /> Apply Mitigation with RL <ChevronRight size={16} />
                  </button>
                </div>
              )}
              {!loading && step === 3 && counterfactualMode && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => setCounterfactualMode(false)} className="btn-secondary text-xs">← Back to Flags</button>
                  <div className="flex-1" />
                  <button onClick={() => { setCounterfactualMode(false); runFix(); }} className="btn-primary">
                    <Wrench size={16} /> Apply Mitigation <ChevronRight size={16} />
                  </button>
                  <button onClick={() => { setCounterfactualMode(false); runRLFix(); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 shadow-md">
                    <Brain size={16} /> Apply Mitigation with RL <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* Toggle views Step 4 */}
              {!loading && step === 4 && (fixData || rlData) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {rlMode && fixData && <button onClick={() => setRlMode(false)} className="btn-secondary text-xs"><Wrench size={14} /> View Standard Results</button>}
                  {!rlMode && rlData && <button onClick={() => setRlMode(true)} className="btn-secondary border-violet-200 text-violet-700 text-xs"><Brain size={14} /> View RL Results</button>}
                  {!rlMode && !rlData && <button onClick={runRLFix} className="btn-secondary border-violet-200 text-violet-700 text-xs"><Brain size={14} /> Also Try RL Mitigation</button>}
                  {rlMode && !fixData && <button onClick={runFix} className="btn-secondary text-xs"><Wrench size={14} /> Also Try Standard Mitigation</button>}
                </div>
              )}

              {/* Inspect Step Toggles */}
              {!loading && step === 1 && !agentMode && !redTeamMode && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button onClick={() => { setAgentMode(true); setRedTeamMode(false); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-500 shadow-md">
                    <Bot size={16} /> AI Agent Audit
                  </button>
                  <button onClick={() => { setRedTeamMode(true); setAgentMode(false); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-red-600 to-orange-500 shadow-md">
                    <Swords size={16} /> Red Team Test
                  </button>
                  <div className="flex-1" />
                  <button onClick={runMeasure} className="btn-primary">
                    <BarChart3 size={16} /> Run Fairness Metrics <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {!loading && step === 1 && (agentMode || redTeamMode) && (
                <div className="mt-4"><button onClick={() => { setAgentMode(false); setRedTeamMode(false); }} className="btn-secondary text-xs">← Back to Manual Pipeline</button></div>
              )}

              {/* Next step to Flag */}
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
