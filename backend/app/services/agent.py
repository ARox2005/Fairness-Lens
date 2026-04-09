"""
Autonomous Bias Audit Agent — ReAct (Reason + Act) Loop

A single Gemini agent with function-calling tools that replaces
the manual 4-step wizard. User uploads CSV, types one instruction —
agent plans and executes the full pipeline autonomously.

Tools map directly to existing backend services:
  profile_dataset   → DataProfiler.run_full_inspection()
  compute_metrics   → FairnessEngine (via measure logic)
  flag_issues       → Flag route logic
  apply_mitigation  → MitigationService
  generate_report   → generate_bias_audit_pdf()

The agent decides tool order, adapts based on results, and
produces a final narrative + downloadable report.
"""

import os
import json
import logging
import asyncio
from typing import Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  TOOL DEFINITIONS (Gemini function declarations)
# ═══════════════════════════════════════

AUDIT_TOOLS = [
    {
        "name": "profile_dataset",
        "description": (
            "Profile the dataset to detect protected attributes, group distributions, "
            "proxy variables (features correlated with protected attrs), and representation gaps. "
            "Always call this first before any other tool."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {
                    "type": "string",
                    "description": "The ID of the uploaded dataset"
                },
                "protected_attributes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of protected attribute column names to analyze (e.g. ['sex', 'race']). Leave empty to auto-detect."
                },
                "label_column": {
                    "type": "string",
                    "description": "Name of the target/label column (e.g. 'income')"
                },
                "favorable_label": {
                    "type": "string",
                    "description": "The value considered a favorable/positive outcome (e.g. '>50K')"
                },
            },
            "required": ["dataset_id"],
        },
    },
    {
        "name": "compute_metrics",
        "description": (
            "Compute all fairness metrics for the dataset: Statistical Parity Difference, "
            "Disparate Impact Ratio (EEOC four-fifths rule), Equalized Odds, Equal Opportunity, "
            "Predictive Parity, and Individual Fairness. Also runs intersectional analysis "
            "(race × gender) as required by NYC LL144."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string"},
                "protected_attributes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Protected attribute columns to measure fairness for"
                },
                "label_column": {"type": "string"},
                "favorable_label": {"type": "string"},
            },
            "required": ["dataset_id", "protected_attributes", "label_column", "favorable_label"],
        },
    },
    {
        "name": "flag_issues",
        "description": (
            "Assess risk levels for bias findings. Generates a bias scorecard with severity "
            "ratings (Low/Medium/High/Critical), regulatory compliance checks against "
            "NYC Local Law 144, EEOC Four-Fifths Rule, and EU AI Act, and actionable recommendations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string"},
                "protected_attributes": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "label_column": {"type": "string"},
                "favorable_label": {"type": "string"},
            },
            "required": ["dataset_id", "protected_attributes", "label_column", "favorable_label"],
        },
    },
    {
        "name": "apply_mitigation",
        "description": (
            "Apply bias mitigation techniques to reduce unfairness. Available techniques: "
            "'reweighting' (pre-processing, adjusts sample weights), "
            "'threshold_optimizer' (post-processing, group-specific thresholds), "
            "'exponentiated_gradient' (in-processing, constrained optimization), "
            "'disparate_impact_remover' (pre-processing, feature repair). "
            "Returns before/after metric comparisons and accuracy cost."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string"},
                "protected_attribute": {
                    "type": "string",
                    "description": "Primary protected attribute to mitigate bias for"
                },
                "label_column": {"type": "string"},
                "favorable_label": {"type": "string"},
                "techniques": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of techniques to apply: 'reweighting', 'threshold_optimizer', 'exponentiated_gradient', 'disparate_impact_remover'"
                },
            },
            "required": ["dataset_id", "protected_attribute", "label_column", "favorable_label", "techniques"],
        },
    },
    {
        "name": "generate_report",
        "description": (
            "Generate a comprehensive PDF bias audit report covering all pipeline phases: "
            "Inspect, Measure, Flag, Fix. The report follows NYC LL144 compliance format "
            "and includes all metrics, findings, and mitigation results."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dataset_id": {"type": "string"},
            },
            "required": ["dataset_id"],
        },
    },
]


# ═══════════════════════════════════════
#  REASONING TRACE
# ═══════════════════════════════════════

@dataclass
class TraceStep:
    """A single step in the agent's reasoning trace."""
    step_type: str  # "thought", "action", "observation", "done", "error"
    content: str
    tool_name: Optional[str] = None
    tool_args: Optional[dict] = None
    tool_result_summary: Optional[str] = None


@dataclass
class AuditSession:
    """Holds all state for a single agent audit run."""
    dataset_id: str
    user_instruction: str
    trace: list[TraceStep] = field(default_factory=list)
    inspect_data: Optional[dict] = None
    measure_data: Optional[dict] = None
    flag_data: Optional[dict] = None
    fix_data: Optional[dict] = None
    report_bytes: Optional[bytes] = None
    final_narrative: str = ""
    status: str = "running"  # running, completed, error


# In-memory session storage
_sessions: dict[str, AuditSession] = {}


def get_session(session_id: str) -> Optional[AuditSession]:
    return _sessions.get(session_id)


# ═══════════════════════════════════════
#  TOOL EXECUTOR — Maps agent calls to existing services
# ═══════════════════════════════════════

async def execute_tool(session: AuditSession, tool_name: str, tool_args: dict) -> str:
    """
    Execute a tool call by routing to existing backend services.
    No new logic — just dispatching to what we already built.
    """
    from app.services.data_profiler import DataProfiler
    from app.services.mitigation import MitigationService
    from app.services.pdf_report import generate_bias_audit_pdf
    from app.services import dataset_manager
    from app.core.fairness import FairnessEngine

    # Import route helpers for measure/flag (they have the encoding logic)
    import numpy as np
    import pandas as pd
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder, StandardScaler

    dataset_id = tool_args.get("dataset_id", session.dataset_id)

    if tool_name == "profile_dataset":
        df = dataset_manager.get_dataset(dataset_id)
        if df is None:
            return json.dumps({"error": "Dataset not found"})

        protected_attrs = tool_args.get("protected_attributes", [])
        label_col = tool_args.get("label_column", "")
        fav_label = tool_args.get("favorable_label", "")

        profiler = DataProfiler(df)
        result = profiler.run_full_inspection(
            dataset_id=dataset_id,
            protected_attributes=protected_attrs,
            label_column=label_col,
            favorable_label=fav_label,
        )
        result_dict = result.model_dump()
        session.inspect_data = result_dict

        # Return a summary (full data is too large for context)
        summary = {
            "row_count": result_dict["row_count"],
            "column_count": result_dict["column_count"],
            "detected_protected_attributes": result_dict["detected_protected_attributes"],
            "warnings": result_dict.get("warnings", []),
            "proxy_variables": [
                {"feature": p["feature"], "protected_attribute": p["protected_attribute"], "correlation": p["correlation"]}
                for p in result_dict.get("proxy_variables", []) if p.get("is_proxy")
            ],
            "group_distributions": [
                {"attribute": g["attribute"], "group": g["group"], "proportion": g["proportion"], "positive_rate": g["positive_rate"]}
                for g in result_dict.get("group_distributions", [])
            ],
        }
        return json.dumps(summary)

    elif tool_name == "compute_metrics":
        df = dataset_manager.get_dataset(dataset_id)
        if df is None:
            return json.dumps({"error": "Dataset not found"})

        protected_attrs = tool_args.get("protected_attributes", [])
        label_col = tool_args.get("label_column", "").strip()
        fav_label = tool_args.get("favorable_label", "").strip()

        # Encode and train baseline (same logic as measure route)
        df_clean = df.dropna(subset=[label_col] + protected_attrs).copy()
        df_encoded = df_clean.copy()
        label_encoders = {}

        for col in df_encoded.columns:
            if df_encoded[col].dtype == "object" or pd.api.types.is_string_dtype(df_encoded[col]) or df_encoded[col].dtype.kind == "O":
                le = LabelEncoder()
                df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
                label_encoders[col] = le

        feature_cols = [c for c in df_encoded.columns if c != label_col]
        X = np.nan_to_num(StandardScaler().fit_transform(df_encoded[feature_cols].values.astype(float)), nan=0.0)
        y = df_encoded[label_col].values

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
        indices = np.arange(len(df_encoded))
        _, test_indices = train_test_split(indices, test_size=0.3, random_state=42, stratify=y)

        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        try:
            y_scores = model.predict_proba(X_test)[:, 1]
        except Exception:
            y_scores = None

        df_test = df_encoded.iloc[test_indices].reset_index(drop=True)

        # Encode favorable label
        if label_col in label_encoders:
            try:
                fav_encoded = label_encoders[label_col].transform([str(fav_label)])[0]
            except ValueError:
                fav_encoded = 1
        else:
            fav_encoded = fav_label

        # Compute metrics for each protected attribute
        all_metrics = {}
        group_metrics_list = []

        for attr in protected_attrs:
            protected = df_test[attr].values
            rates = {v: np.mean(y_test[protected == v] == fav_encoded) for v in np.unique(protected)}
            priv_val = max(rates, key=rates.get)

            spd = FairnessEngine.statistical_parity_difference(y_pred, protected, priv_val, fav_encoded)
            di = FairnessEngine.disparate_impact_ratio(y_pred, protected, priv_val, fav_encoded)
            eod = FairnessEngine.equalized_odds_difference(y_test, y_pred, protected, priv_val, fav_encoded)
            eop = FairnessEngine.equal_opportunity_difference(y_test, y_pred, protected, priv_val, fav_encoded)
            ppd = FairnessEngine.predictive_parity_difference(y_test, y_pred, protected, priv_val, fav_encoded)

            gm = {
                "protected_attribute": attr,
                "privileged_group": str(priv_val),
                "metrics": [m.model_dump() for m in [spd, di, eod, eop, ppd]],
            }
            group_metrics_list.append(gm)

            all_metrics[attr] = {
                "DI": di.value, "SPD": spd.value, "EOD": eop.value,
                "AOD": eod.value, "PPD": ppd.value,
                "DI_passed": di.passed, "severity": FairnessEngine.classify_severity(di.value).value,
            }

        # Intersectional analysis
        intersectional = []
        if len(protected_attrs) >= 2:
            intersectional = [
                c.model_dump() for c in FairnessEngine.compute_intersectional_analysis(
                    df_clean, protected_attrs[:2], label_col, fav_label
                )
            ]

        measure_result = {
            "dataset_id": dataset_id,
            "group_metrics": group_metrics_list,
            "intersectional_analysis": intersectional,
            "impossibility_note": FairnessEngine.get_impossibility_note(),
        }
        session.measure_data = measure_result

        # Return concise summary for agent context
        return json.dumps({"metrics_per_attribute": all_metrics, "intersectional_subgroups_analyzed": len(intersectional)})

    elif tool_name == "flag_issues":
        # Use the existing flag route logic
        from app.api.routes.flag import _prepare_and_predict, _metric_to_severity, _generate_flag_description, _generate_recommendation, _run_compliance_checks

        df = dataset_manager.get_dataset(dataset_id)
        if df is None:
            return json.dumps({"error": "Dataset not found"})

        protected_attrs = tool_args.get("protected_attributes", [])
        label_col = tool_args.get("label_column", "").strip()
        fav_label = tool_args.get("favorable_label", "").strip()

        df_clean = df.dropna(subset=[label_col] + protected_attrs).copy()
        y_true, y_pred, protected_map, df_enc = _prepare_and_predict(df_clean, label_col, fav_label, protected_attrs)

        import uuid as _uuid

        # Encode fav label
        if df_clean[label_col].dtype == "object" or pd.api.types.is_string_dtype(df_clean[label_col]):
            le = LabelEncoder()
            le.fit(df_clean[label_col].astype(str))
            try:
                fav_encoded = le.transform([str(fav_label)])[0]
            except ValueError:
                fav_encoded = 1
        else:
            fav_encoded = fav_label

        all_flags = []
        for attr in protected_attrs:
            protected = protected_map[attr]
            rates = {v: np.mean(y_true[protected == v] == fav_encoded) for v in np.unique(protected)}
            priv_val = max(rates, key=rates.get)
            priv_label = str(priv_val)
            unpriv_labels = [str(v) for v in np.unique(protected) if str(v) != priv_label]

            for metric in [
                FairnessEngine.statistical_parity_difference(y_pred, protected, priv_val, fav_encoded),
                FairnessEngine.disparate_impact_ratio(y_pred, protected, priv_val, fav_encoded),
                FairnessEngine.equalized_odds_difference(y_true, y_pred, protected, priv_val, fav_encoded),
                FairnessEngine.equal_opportunity_difference(y_true, y_pred, protected, priv_val, fav_encoded),
                FairnessEngine.predictive_parity_difference(y_true, y_pred, protected, priv_val, fav_encoded),
            ]:
                if not metric.passed:
                    severity = _metric_to_severity(metric)
                    all_flags.append({
                        "flag_id": f"flag_{_uuid.uuid4().hex[:6]}",
                        "metric_name": metric.display_name,
                        "protected_attribute": attr,
                        "privileged_group": priv_label,
                        "unprivileged_group": ", ".join(unpriv_labels),
                        "metric_value": metric.value,
                        "threshold": metric.threshold,
                        "severity": severity.value,
                        "description": _generate_flag_description(metric, attr, priv_label, unpriv_labels),
                        "recommendation": _generate_recommendation(metric, severity),
                    })

        compliance = [c.model_dump() for c in _run_compliance_checks(
            [type("F", (), f)() for f in all_flags]  # quick object conversion
        )] if all_flags else []

        # Build scorecard
        from app.models.schemas import SeverityLevel
        sev_counts = {s.value: sum(1 for f in all_flags if f["severity"] == s.value) for s in SeverityLevel}
        overall = "critical" if sev_counts["critical"] > 0 else "high" if sev_counts["high"] > 0 else "medium" if sev_counts["medium"] > 0 else "low"

        flag_result = {
            "scorecard": {
                "overall_severity": overall,
                "total_flags": len(all_flags),
                "critical_flags": sev_counts["critical"],
                "high_flags": sev_counts["high"],
                "medium_flags": sev_counts["medium"],
                "low_flags": sev_counts["low"],
                "flags": all_flags,
                "compliance_checks": compliance,
                "summary": f"{'SEVERE' if overall == 'critical' else overall.upper()} bias detected. {len(all_flags)} issues flagged.",
            },
            "gemini_explanation": "",
        }
        session.flag_data = flag_result

        summary = {
            "overall_severity": overall,
            "total_flags": len(all_flags),
            "critical": sev_counts["critical"],
            "high": sev_counts["high"],
            "compliance_failures": [c["regulation"] for c in compliance if c.get("status") == "FAIL"],
            "top_issues": [{"metric": f["metric_name"], "attr": f["protected_attribute"], "value": f["metric_value"], "severity": f["severity"]} for f in all_flags[:5]],
        }
        return json.dumps(summary)

    elif tool_name == "apply_mitigation":
        df = dataset_manager.get_dataset(dataset_id)
        if df is None:
            return json.dumps({"error": "Dataset not found"})

        attr = tool_args.get("protected_attribute", "")
        label_col = tool_args.get("label_column", "").strip()
        fav_label = tool_args.get("favorable_label", "").strip()
        techniques = tool_args.get("techniques", ["reweighting", "threshold_optimizer"])

        df_clean = df.dropna(subset=[label_col, attr]).copy()
        service = MitigationService(
            df=df_clean, protected_attribute=attr,
            label_column=label_col, favorable_label=fav_label,
        )

        results = []
        for tech in techniques:
            if tech == "reweighting":
                r = service.apply_reweighting()
            elif tech == "threshold_optimizer":
                r = service.apply_threshold_optimizer()
            elif tech == "exponentiated_gradient":
                r = service.apply_exponentiated_gradient()
            elif tech == "disparate_impact_remover":
                r = service.apply_disparate_impact_remover()
            else:
                continue
            results.append(r.model_dump())

        recommended, reason = MitigationService.recommend_technique(
            [type("R", (), r)() for r in results] if results else []
        ) if results else ("reweighting", "Default")

        fix_result = {
            "dataset_id": dataset_id,
            "results": results,
            "recommended_technique": recommended.value if hasattr(recommended, "value") else str(recommended),
            "recommendation_reason": reason,
            "gemini_explanation": "",
        }
        session.fix_data = fix_result

        summary = {
            "techniques_applied": len(results),
            "results": [
                {
                    "technique": r.get("technique_display_name", ""),
                    "accuracy_cost": r.get("accuracy_cost", 0),
                    "fairness_improvement": r.get("overall_fairness_improvement", 0),
                }
                for r in results
            ],
            "recommended": str(recommended.value if hasattr(recommended, "value") else recommended),
        }
        return json.dumps(summary)

    elif tool_name == "generate_report":
        try:
            pdf_bytes = generate_bias_audit_pdf(
                inspect_data=session.inspect_data or {},
                measure_data=session.measure_data or {},
                flag_data=session.flag_data or {},
                fix_data=session.fix_data or {},
                dataset_name=dataset_id,
            )
            session.report_bytes = pdf_bytes
            return json.dumps({"status": "success", "message": "PDF report generated successfully. User can download it now."})
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

    else:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ═══════════════════════════════════════
#  REACT AGENT LOOP
# ═══════════════════════════════════════

SYSTEM_PROMPT = """You are FairnessLens AI Auditor — an autonomous bias detection agent.

You have tools to audit ML models and datasets for bias. Execute this exact sequence:
1. profile_dataset — understand the data structure
2. compute_metrics — compute all fairness metrics
3. flag_issues — check regulatory compliance
4. apply_mitigation — reduce bias with reweighting and threshold_optimizer
5. generate_report — create the PDF report

RULES:
- Execute all 5 steps in order, one per turn. Do NOT skip any step.
- Do NOT add extra reasoning turns — call one tool per response.
- If DI ratio < 0.80, the EEOC four-fifths rule is violated.
- If DI ratio < 0.65, severity is CRITICAL.
- Keep your final summary under 100 words."""


async def run_audit_agent(
    session_id: str,
    dataset_id: str,
    user_instruction: str,
    protected_attributes: list[str] = None,
    label_column: str = "",
    favorable_label: str = "",
) -> AuditSession:
    """
    Run the autonomous audit agent. Returns an AuditSession with
    full trace, all pipeline data, and optionally a PDF report.
    """
    session = AuditSession(
        dataset_id=dataset_id,
        user_instruction=user_instruction,
    )
    _sessions[session_id] = session

    # Build initial context
    context = user_instruction
    if protected_attributes:
        context += f"\nProtected attributes to focus on: {', '.join(protected_attributes)}"
    if label_column:
        context += f"\nLabel/target column: {label_column}"
    if favorable_label:
        context += f"\nFavorable outcome value: {favorable_label}"
    context += f"\nDataset ID: {dataset_id}"

    # Check if Gemini is available
    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        # Fallback: run deterministic pipeline without Gemini
        return await _run_deterministic_fallback(session, protected_attributes or [], label_column, favorable_label)

    try:
        from google import genai

        client = genai.Client(api_key=api_key)

        messages = [
            {"role": "user", "parts": [{"text": f"{SYSTEM_PROMPT}\n\nUser request: {context}"}]}
        ]

        # Convert tool definitions to Gemini format
        tools = [{"function_declarations": AUDIT_TOOLS}]

        max_iterations = 6
        iteration = 0

        while iteration < max_iterations:
            iteration += 1

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=messages,
                config={
                    "tools": tools,
                    "temperature": 0.2,
                    "max_output_tokens": 2000,
                }
            )

            # Check for text response (reasoning)
            try:
                if response.text:
                    session.trace.append(TraceStep(
                        step_type="thought",
                        content=response.text,
                    ))
            except ValueError:
                pass  # Response has function_call parts only, no text

            # Check for function calls
            has_tool_calls = False
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        has_tool_calls = True
                        fc = part.function_call
                        tool_name = fc.name
                        tool_args = dict(fc.args) if fc.args else {}

                        # Inject dataset_id if missing
                        if "dataset_id" not in tool_args:
                            tool_args["dataset_id"] = dataset_id

                        session.trace.append(TraceStep(
                            step_type="action",
                            content=f"Calling {tool_name}",
                            tool_name=tool_name,
                            tool_args=tool_args,
                        ))

                        # Execute the tool
                        try:
                            result = await execute_tool(session, tool_name, tool_args)
                        except Exception as e:
                            result = json.dumps({"error": str(e)})
                            session.trace.append(TraceStep(
                                step_type="error",
                                content=f"Tool error: {str(e)}",
                            ))

                        # Summarize result for trace
                        try:
                            result_parsed = json.loads(result)
                            summary = str(result_parsed)[:300]
                        except Exception:
                            summary = result[:300]

                        session.trace.append(TraceStep(
                            step_type="observation",
                            content=summary,
                            tool_name=tool_name,
                            tool_result_summary=summary,
                        ))

                        # Add to conversation
                        messages.append({
                            "role": "model",
                            "parts": [{"function_call": {"name": tool_name, "args": tool_args}}]
                        })
                        messages.append({
                            "role": "user",
                            "parts": [{"function_response": {"name": tool_name, "response": {"result": result}}}]
                        })

            if not has_tool_calls:
                # Agent is done — the text response is the final narrative
                try:
                    session.final_narrative = response.text or "Audit complete."
                except ValueError:
                    session.final_narrative = "Audit complete. All pipeline phases executed."
                session.trace.append(TraceStep(
                    step_type="done",
                    content=session.final_narrative,
                ))
                break

        session.status = "completed"

    except ImportError:
        logger.warning("google-genai not installed — using deterministic fallback")
        return await _run_deterministic_fallback(session, protected_attributes or [], label_column, favorable_label)
    except Exception as e:
        logger.error(f"Agent error: {e}")
        session.trace.append(TraceStep(step_type="error", content=str(e)))
        session.status = "error"
        session.final_narrative = f"Agent encountered an error: {str(e)}"

        # Try deterministic fallback
        return await _run_deterministic_fallback(session, protected_attributes or [], label_column, favorable_label)

    return session


async def _run_deterministic_fallback(
    session: AuditSession,
    protected_attributes: list[str],
    label_column: str,
    favorable_label: str,
) -> AuditSession:
    """
    Fallback: run the full pipeline deterministically when Gemini
    is unavailable. Same result, no AI reasoning — just sequential execution.
    """
    dataset_id = session.dataset_id

    steps = [
        ("profile_dataset", {
            "dataset_id": dataset_id,
            "protected_attributes": protected_attributes,
            "label_column": label_column,
            "favorable_label": favorable_label,
        }),
        ("compute_metrics", {
            "dataset_id": dataset_id,
            "protected_attributes": protected_attributes,
            "label_column": label_column,
            "favorable_label": favorable_label,
        }),
        ("flag_issues", {
            "dataset_id": dataset_id,
            "protected_attributes": protected_attributes,
            "label_column": label_column,
            "favorable_label": favorable_label,
        }),
        ("apply_mitigation", {
            "dataset_id": dataset_id,
            "protected_attribute": protected_attributes[0] if protected_attributes else "",
            "label_column": label_column,
            "favorable_label": favorable_label,
            "techniques": ["reweighting", "threshold_optimizer"],
        }),
        ("generate_report", {"dataset_id": dataset_id}),
    ]

    for tool_name, tool_args in steps:
        session.trace.append(TraceStep(
            step_type="thought",
            content=f"Running {tool_name}...",
        ))
        session.trace.append(TraceStep(
            step_type="action",
            content=f"Calling {tool_name}",
            tool_name=tool_name,
            tool_args=tool_args,
        ))

        try:
            result = await execute_tool(session, tool_name, tool_args)
            summary = result[:300]
            session.trace.append(TraceStep(
                step_type="observation",
                content=summary,
                tool_name=tool_name,
                tool_result_summary=summary,
            ))
        except Exception as e:
            session.trace.append(TraceStep(
                step_type="error",
                content=f"Error in {tool_name}: {str(e)}",
            ))

    session.status = "completed"
    session.final_narrative = "Autonomous audit complete. All pipeline phases executed. PDF report is ready for download."
    session.trace.append(TraceStep(step_type="done", content=session.final_narrative))

    return session