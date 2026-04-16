"use client";
import { useState } from "react";
import { Upload, Play, Database, Box, FileText, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const DEMOS = [
  { id: "adult", name: "UCI Adult / Census Income", domain: "Hiring", rows: "32,561", bias: "Gender & race bias in income prediction. Men are 2x more likely to earn >$50K.", color: "blue" },
  { id: "german_credit", name: "German Credit", domain: "Lending", rows: "1,000", bias: "Gender & age bias in credit risk decisions from a German bank.", color: "amber" },
  { id: "compas", name: "ProPublica COMPAS", domain: "Criminal Justice", rows: "6,907", bias: "Black defendants ~2x more likely to be falsely flagged high-risk.", color: "red" },
];

const COLOR_MAP = {
  blue:  { bar: "bg-blue-500",  text: "text-blue-600 dark:text-blue-400",  tag: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
  amber: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", tag: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
  red:   { bar: "bg-red-500",   text: "text-red-600 dark:text-red-400",    tag: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400" },
};

const TABS = [
  { id: "demo", label: "Demo Datasets", icon: Database },
  { id: "csv", label: "Upload CSV", icon: FileText },
  { id: "model", label: "Upload Model + CSV", icon: Box },
];

export default function AboutUploadStep({ onDemoLoad, onFileUpload, onModelUpload, loading }) {
  const [activeTab, setActiveTab] = useState("demo");
  const [showPredictions, setShowPredictions] = useState(false);

  // Note: All file state logic is kept visually identical but clicks route directly to dummy data
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Load a Dataset (Sandbox Mode)</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This is an interactive sandbox. Click any option below to instantly load perfectly modelled realistic data.
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 flex-1 justify-center py-2.5 px-3 rounded-md text-sm font-medium transition-all cursor-pointer
                ${isActive ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "demo" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DEMOS.map((d) => {
            const c = COLOR_MAP[d.color];
            return (
              <button key={d.id} onClick={() => onDemoLoad(d.id)} disabled={loading}
                className="card-hover p-5 text-left relative overflow-hidden group disabled:opacity-60 disabled:cursor-wait">
                <div className={`absolute top-0 left-0 right-0 h-1 ${c.bar}`} />
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{d.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${c.tag}`}>{d.domain}</span>
                </div>
                <div className="text-xs text-gray-400 mb-2">{d.rows} rows</div>
                <div className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{d.bias}</div>
                <div className={`flex items-center gap-1.5 text-[13px] font-semibold ${c.text} group-hover:gap-2.5 transition-all`}>
                  <Play size={14} /> Try Demo
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "csv" && (
        <div className="card p-6 opacity-75 text-center">
          <FileText size={40} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">CSV Upload Disabled in Sandbox</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            To protect your data privacy and prevent backend calls, manual CSV uploading is disabled in the interactive About sandbox. Please use the "Demo Datasets" tab.
          </p>
          <button onClick={() => setActiveTab("demo")} className="btn-primary mx-auto">
            View Live Demos
          </button>
        </div>
      )}

      {activeTab === "model" && (
        <div className="card p-6 opacity-75 text-center">
          <Box size={40} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Model Upload Disabled in Sandbox</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            Model evaluation requires heavy backend compute. This is disabled in the isolated About sandbox. Please use the "Demo Datasets" tab.
          </p>
          <button onClick={() => setActiveTab("demo")} className="btn-primary mx-auto">
            View Live Demos
          </button>
        </div>
      )}
    </div>
  );
}
