"use client";
import { Upload, Database, BarChart3, AlertTriangle, Wrench, Shield, Check } from "lucide-react";

const STEPS = [
  { id: "upload",   label: "Upload",   icon: Upload,        desc: "Load dataset" },
  { id: "inspect",  label: "Inspect",  icon: Database,      desc: "Profile data" },
  { id: "measure",  label: "Measure",  icon: BarChart3,     desc: "Fairness metrics" },
  { id: "flag",     label: "Flag",     icon: AlertTriangle, desc: "Risk assessment" },
  { id: "fix",      label: "Fix",      icon: Wrench,        desc: "Mitigate bias" },
  { id: "validate", label: "Validate", icon: Shield,        desc: "Deploy readiness" },
];

export default function Sidebar({ step, setStep, completedSteps }) {
  return (
    <nav className="w-52 py-6 flex-shrink-0 sticky top-[60px] h-[calc(100vh-60px)] flex flex-col gap-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = step === i;
        const isCompleted = completedSteps.includes(i);
        // Validate (index 5) can be reached after Inspect; other steps follow completion order
        const isClickable = i === 0 || completedSteps.includes(i) || (i === 5 && completedSteps.includes(1));

        return (
          <button
            key={i}
            onClick={() => isClickable && setStep(i)}
            disabled={!isClickable}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all duration-150
              ${isActive ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}
              ${!isClickable ? "opacity-40 cursor-default" : "cursor-pointer"}
            `}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${isActive
                ? "bg-brand-600 text-white"
                : isCompleted
                  ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400"
              }
            `}>
              {isCompleted && !isActive ? <Check size={14} /> : <Icon size={14} />}
            </div>
            <div>
              <div className={`text-[13px] font-medium ${isActive ? "text-brand-600 dark:text-blue-400 font-bold" : "text-gray-700 dark:text-gray-300"}`}>
                {s.label}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">{s.desc}</div>
            </div>
          </button>
        );
      })}

      {/* Progress bar */}
      <div className="mt-auto px-3 pt-4">
        <div className="text-[11px] text-gray-400 mb-1.5">Pipeline Progress</div>
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-400 mt-1">{step + 1} of {STEPS.length}</div>
      </div>
    </nav>
  );
}