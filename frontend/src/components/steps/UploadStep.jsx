"use client";
import { useState } from "react";
import { Upload, Play, Database, Box, FileText, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEMOS = [
  {
    id: "adult",
    name: "UCI Adult / Census Income",
    domain: "Hiring",
    rows: "32,561",
    bias: "Gender & race bias in income prediction. Men are 2x more likely to earn >$50K.",
    color: "blue",
  },
  {
    id: "german_credit",
    name: "German Credit",
    domain: "Lending",
    rows: "1,000",
    bias: "Gender & age bias in credit risk decisions from a German bank.",
    color: "amber",
  },
  {
    id: "compas",
    name: "ProPublica COMPAS",
    domain: "Criminal Justice",
    rows: "6,907",
    bias: "Black defendants ~2x more likely to be falsely flagged high-risk.",
    color: "red",
  },
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

export default function UploadStep({ onDemoLoad, onFileUpload, onModelUpload, loading }) {
  const [activeTab, setActiveTab] = useState("demo");

  const [modelFile, setModelFile] = useState(null);
  const [datasetFile, setDatasetFile] = useState(null);
  const [protectedAttrs, setProtectedAttrs] = useState("");
  const [labelColumn, setLabelColumn] = useState("");
  const [favorableLabel, setFavorableLabel] = useState("");
  const [modelUploading, setModelUploading] = useState(false);
  const [modelResult, setModelResult] = useState(null);
  const [modelError, setModelError] = useState(null);

  // CSV upload form state
  const [csvFile, setCsvFile] = useState(null);
  const [csvAttrs, setCsvAttrs] = useState("");
  const [csvLabelCol, setCsvLabelCol] = useState("");
  const [csvFavLabel, setCsvFavLabel] = useState("");

  const [predFile, setPredFile] = useState(null);
  const [predAttrs, setPredAttrs] = useState("");
  const [predActualCol, setPredActualCol] = useState("");
  const [predPredictedCol, setPredPredictedCol] = useState("");
  const [predFavLabel, setPredFavLabel] = useState("");
  const [showPredictions, setShowPredictions] = useState(false);

  const handleModelSubmit = async () => {
    if (!modelFile || !datasetFile || !protectedAttrs || !labelColumn || !favorableLabel) {
      setModelError("Please fill all fields and upload both files.");
      return;
    }
    setModelUploading(true);
    setModelError(null);
    setModelResult(null);
    try {
      const formData = new FormData();
      formData.append("model_file", modelFile);
      formData.append("dataset_file", datasetFile);
      formData.append("protected_attributes", protectedAttrs);
      formData.append("label_column", labelColumn);
      formData.append("favorable_label", favorableLabel);
      const res = await fetch(`${API_BASE}/api/model/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      setModelResult(data);
      if (onModelUpload) {
        onModelUpload(data.dataset_id, data.inspect_result, {
          protected_attributes: protectedAttrs.split(",").map(s => s.trim()),
          label_column: labelColumn,
          favorable_label: favorableLabel,
        });
      }
    } catch (e) {
      setModelError(e.message);
    }
    setModelUploading(false);
  };

  const handlePredictionsSubmit = async () => {
    if (!predFile || !predAttrs || !predFavLabel) {
      setModelError("Please fill all required fields and upload the predictions CSV.");
      return;
    }
    setModelUploading(true);
    setModelError(null);
    setModelResult(null);
    try {
      const formData = new FormData();
      formData.append("file", predFile);
      formData.append("protected_attributes", predAttrs);
      formData.append("favorable_label", predFavLabel);
      if (predActualCol) formData.append("actual_column", predActualCol);
      if (predPredictedCol) formData.append("predicted_column", predPredictedCol);
      const res = await fetch(`${API_BASE}/api/model/predictions`, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      setModelResult(data);
      if (onModelUpload) {
        onModelUpload(data.dataset_id, data.inspect_result, {
          protected_attributes: predAttrs.split(",").map(s => s.trim()),
          label_column: data.actual_column,
          favorable_label: predFavLabel,
        });
      }
    } catch (e) {
      setModelError(e.message);
    }
    setModelUploading(false);
  };

  const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none";

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Load a Dataset</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose a demo dataset, upload your own CSV, or bring your trained model for auditing.
        </p>
      </div>

      {/* Tabs */}
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

      {/* Tab 1: Demo */}
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

      {/* Tab 2: CSV */}
      {activeTab === "csv" && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={18} className="text-brand-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Upload Dataset CSV</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            Upload your CSV and specify which columns are protected attributes, the label, and the favorable outcome.
            The system will train a baseline model and audit it for bias.
          </p>

          {/* File upload */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Dataset CSV *</label>
            <div onClick={() => document.getElementById("csv-upload").click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
                ${csvFile ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-gray-300 dark:border-gray-600 hover:border-brand-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"}`}>
              {csvFile
                ? <div className="text-sm text-green-700 dark:text-green-400 font-medium">✓ {csvFile.name}</div>
                : <>
                    <Upload size={28} className="mx-auto mb-2 text-gray-400" />
                    <div className="text-sm font-medium text-gray-600 dark:text-gray-300">Click to select CSV file</div>
                    <div className="text-xs text-gray-400 mt-1">Max 50MB</div>
                  </>}
              <input id="csv-upload" type="file" accept=".csv" className="hidden"
                onChange={(e) => e.target.files[0] && setCsvFile(e.target.files[0])} />
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Protected Attributes *</label>
              <input type="text" value={csvAttrs} onChange={(e) => setCsvAttrs(e.target.value)}
                placeholder="sex, race" className={inputCls} />
              <div className="text-[10px] text-gray-400 mt-1">Comma-separated column names</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Label Column *</label>
              <input type="text" value={csvLabelCol} onChange={(e) => setCsvLabelCol(e.target.value)}
                placeholder="income" className={inputCls} />
              <div className="text-[10px] text-gray-400 mt-1">Target / outcome column</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Favorable Label *</label>
              <input type="text" value={csvFavLabel} onChange={(e) => setCsvFavLabel(e.target.value)}
                placeholder=">50K" className={inputCls} />
              <div className="text-[10px] text-gray-400 mt-1">Positive outcome value</div>
            </div>
          </div>

          <button
            onClick={() => {
              if (!csvFile) return;
              onFileUpload(csvFile, {
                protected_attributes: csvAttrs ? csvAttrs.split(",").map(s => s.trim()) : [],
                label_column: csvLabelCol,
                favorable_label: csvFavLabel,
              });
            }}
            disabled={loading || !csvFile || !csvLabelCol || !csvFavLabel}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Uploading & Inspecting...</>
              : <><Upload size={16} /> Upload & Run Inspection</>}
          </button>
        </div>
      )}

      {/* Tab 3: Model + CSV */}
      {activeTab === "model" && (
        <div className="space-y-6">
          {/* Option A: sklearn model */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-1">
              <Box size={18} className="text-brand-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Option A: Upload Trained Model + Test Data</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              Upload your sklearn model (.pkl / .joblib) and a test dataset CSV. The system will run your model's predictions and audit them for bias.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Model File (.pkl / .joblib) *</label>
                <div onClick={() => document.getElementById("model-file").click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${modelFile ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-gray-300 dark:border-gray-600 hover:border-brand-500"}`}>
                  {modelFile
                    ? <div className="text-sm text-green-700 dark:text-green-400 font-medium">✓ {modelFile.name}</div>
                    : <><Box size={20} className="mx-auto mb-1 text-gray-400" /><div className="text-xs text-gray-500">Click to select model file</div></>}
                  <input id="model-file" type="file" accept=".pkl,.pickle,.joblib" className="hidden"
                    onChange={(e) => e.target.files[0] && setModelFile(e.target.files[0])} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Test Dataset CSV *</label>
                <div onClick={() => document.getElementById("model-dataset").click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${datasetFile ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-gray-300 dark:border-gray-600 hover:border-brand-500"}`}>
                  {datasetFile
                    ? <div className="text-sm text-green-700 dark:text-green-400 font-medium">✓ {datasetFile.name}</div>
                    : <><FileText size={20} className="mx-auto mb-1 text-gray-400" /><div className="text-xs text-gray-500">Click to select CSV file</div></>}
                  <input id="model-dataset" type="file" accept=".csv" className="hidden"
                    onChange={(e) => e.target.files[0] && setDatasetFile(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Protected Attributes *</label>
                <input type="text" value={protectedAttrs} onChange={(e) => setProtectedAttrs(e.target.value)}
                  placeholder="sex, race" className={inputCls} />
                <div className="text-[10px] text-gray-400 mt-1">Comma-separated column names</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Label Column *</label>
                <input type="text" value={labelColumn} onChange={(e) => setLabelColumn(e.target.value)}
                  placeholder="income" className={inputCls} />
                <div className="text-[10px] text-gray-400 mt-1">Target / ground truth column</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Favorable Label *</label>
                <input type="text" value={favorableLabel} onChange={(e) => setFavorableLabel(e.target.value)}
                  placeholder=">50K" className={inputCls} />
                <div className="text-[10px] text-gray-400 mt-1">Positive outcome value</div>
              </div>
            </div>

            <button onClick={handleModelSubmit} disabled={modelUploading || !modelFile || !datasetFile}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {modelUploading
                ? <><Loader2 size={16} className="animate-spin" /> Uploading & Analyzing...</>
                : <><Upload size={16} /> Upload Model & Run Inspection</>}
            </button>
          </div>

          {/* Option B: Predictions CSV */}
          <div className="card overflow-hidden">
            <button onClick={() => setShowPredictions(!showPredictions)}
              className="w-full p-4 flex justify-between items-center text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-purple-600 dark:text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Option B: Upload Predictions CSV (Black-Box Model)</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">For proprietary models — export predictions and upload the CSV directly</p>
                </div>
              </div>
              {showPredictions ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>

            {showPredictions && (
              <div className="px-4 pb-5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Your CSV should contain: original features, a column with actual labels, and a column with your model's predicted labels.
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Predictions CSV *</label>
                  <div onClick={() => document.getElementById("pred-file").click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${predFile ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-gray-300 dark:border-gray-600 hover:border-purple-500"}`}>
                    {predFile
                      ? <div className="text-sm text-green-700 dark:text-green-400 font-medium">✓ {predFile.name}</div>
                      : <div className="text-xs text-gray-500">Click to select predictions CSV</div>}
                    <input id="pred-file" type="file" accept=".csv" className="hidden"
                      onChange={(e) => e.target.files[0] && setPredFile(e.target.files[0])} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Protected Attributes *</label>
                    <input type="text" value={predAttrs} onChange={(e) => setPredAttrs(e.target.value)}
                      placeholder="sex, race" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Favorable Label *</label>
                    <input type="text" value={predFavLabel} onChange={(e) => setPredFavLabel(e.target.value)}
                      placeholder=">50K" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Actual Label Column <span className="font-normal">(auto-detected if blank)</span></label>
                    <input type="text" value={predActualCol} onChange={(e) => setPredActualCol(e.target.value)}
                      placeholder="actual_label" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Predicted Label Column <span className="font-normal">(auto-detected if blank)</span></label>
                    <input type="text" value={predPredictedCol} onChange={(e) => setPredPredictedCol(e.target.value)}
                      placeholder="predicted_label" className={inputCls} />
                  </div>
                </div>

                <button onClick={handlePredictionsSubmit} disabled={modelUploading || !predFile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {modelUploading
                    ? <><Loader2 size={16} className="animate-spin" /> Processing...</>
                    : <><Upload size={16} /> Upload Predictions & Inspect</>}
                </button>
              </div>
            )}
          </div>

          {/* Error */}
          {modelError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700/50 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
              ✕ {modelError}
            </div>
          )}

          {/* Success */}
          {modelResult && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700/50 rounded-xl p-4">
              <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-1">✓ Upload Successful</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{modelResult.message}</div>
              {modelResult.model_info && (
                <div className="text-xs text-gray-500 mt-1">
                  Model: {modelResult.model_info.model_class} | Type: {modelResult.model_info.model_type}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}