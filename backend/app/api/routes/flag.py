from app.core.utils import is_categorical_column
"""
Flag Route — Phase 3 of the Pipeline

Transforms computed metrics into:
1. Bias flags with severity rankings (Low/Medium/High/Critical)
2. Bias scorecard (modeled on Google Model Cards)
3. Regulatory compliance checks (NYC LL144, EU AI Act, EEOC)
4. Gemini-powered plain-English explanations

Risk categorization from the document:
- Low:     DI >= 0.90 (monitor, green)
- Medium:  DI 0.80–0.90 (investigate, yellow)
- High:    DI 0.65–0.80 (immediate mitigation, orange)
- Critical: DI < 0.65 (halt deployment, red)
"""

import uuid
from fastapi import APIRouter, HTTPException
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

from app.models.schemas import (
    FlagRequest, FlagResponse, BiasFlag, BiasScorecard,
    ComplianceCheck, SeverityLevel
)
from app.core.fairness import FairnessEngine
from app.core import gemini
from app.services import dataset_manager

router = APIRouter(prefix="/api/flag", tags=["Flag"])


@router.post("/", response_model=FlagResponse)
async def flag_bias(request: FlagRequest):
    """
    Run the complete Flag pipeline:
    1. Compute all fairness metrics
    2. Generate bias flags with severity levels
    3. Run compliance checks
    4. Generate Gemini explanation
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Strip whitespace from all inputs
    request.label_column = request.label_column.strip()
    request.protected_attributes = [a.strip() for a in request.protected_attributes]

    # ── Prepare data and train baseline model ──
    df_clean = df.dropna(
        subset=[request.label_column] + request.protected_attributes
    ).copy()

    y_true, y_pred, protected_map, df_encoded = _prepare_and_predict(
        df_clean, request.label_column, request.favorable_label,
        request.protected_attributes
    )

    # ── Generate flags for each protected attribute ──
    all_flags = []

    for attr in request.protected_attributes:
        protected = protected_map[attr]
        fav_encoded = _encode_fav(request.favorable_label, df_clean[request.label_column])

        # Auto-detect privileged value
        privileged_value = _detect_priv(protected, y_true, fav_encoded)

        # Get group labels
        priv_label = str(privileged_value)
        all_vals = [str(v) for v in np.unique(protected)]
        unpriv_labels = [v for v in all_vals if v != priv_label]

        # Compute metrics
        spd = FairnessEngine.statistical_parity_difference(
            y_pred, protected, privileged_value, fav_encoded
        )
        di = FairnessEngine.disparate_impact_ratio(
            y_pred, protected, privileged_value, fav_encoded
        )
        eod = FairnessEngine.equalized_odds_difference(
            y_true, y_pred, protected, privileged_value, fav_encoded
        )
        eop = FairnessEngine.equal_opportunity_difference(
            y_true, y_pred, protected, privileged_value, fav_encoded
        )
        ppd = FairnessEngine.predictive_parity_difference(
            y_true, y_pred, protected, privileged_value, fav_encoded
        )

        metrics = [spd, di, eod, eop, ppd]

        # Generate flags for failing metrics
        for metric in metrics:
            if not metric.passed:
                severity = _metric_to_severity(metric)
                flag = BiasFlag(
                    flag_id=f"flag_{uuid.uuid4().hex[:6]}",
                    metric_name=metric.display_name,
                    protected_attribute=attr,
                    privileged_group=priv_label,
                    unprivileged_group=", ".join(unpriv_labels),
                    metric_value=metric.value,
                    threshold=metric.threshold,
                    severity=severity,
                    description=_generate_flag_description(
                        metric, attr, priv_label, unpriv_labels
                    ),
                    recommendation=_generate_recommendation(metric, severity),
                )
                all_flags.append(flag)

    # ── Compliance checks ──
    compliance = _run_compliance_checks(all_flags)

    # ── Build scorecard ──
    critical_count = sum(1 for f in all_flags if f.severity == SeverityLevel.CRITICAL)
    high_count = sum(1 for f in all_flags if f.severity == SeverityLevel.HIGH)
    medium_count = sum(1 for f in all_flags if f.severity == SeverityLevel.MEDIUM)
    low_count = sum(1 for f in all_flags if f.severity == SeverityLevel.LOW)

    # Overall severity = worst flag severity
    if critical_count > 0:
        overall = SeverityLevel.CRITICAL
    elif high_count > 0:
        overall = SeverityLevel.HIGH
    elif medium_count > 0:
        overall = SeverityLevel.MEDIUM
    else:
        overall = SeverityLevel.LOW

    scorecard = BiasScorecard(
        dataset_id=request.dataset_id,
        overall_severity=overall,
        total_flags=len(all_flags),
        critical_flags=critical_count,
        high_flags=high_count,
        medium_flags=medium_count,
        low_flags=low_count,
        flags=all_flags,
        compliance_checks=compliance,
        summary=_generate_summary(overall, all_flags, compliance),
    )

    # ── Gemini explanation ──
    gemini_explanation = ""
    try:
        metrics_payload = {
            "overall_severity": overall.value,
            "total_flags": len(all_flags),
            "flags": [
                {
                    "metric": f.metric_name,
                    "attribute": f.protected_attribute,
                    "value": f.metric_value,
                    "threshold": f.threshold,
                    "severity": f.severity.value,
                    "privileged": f.privileged_group,
                    "unprivileged": f.unprivileged_group,
                }
                for f in all_flags
            ],
            "compliance": [
                {"regulation": c.regulation, "status": c.status}
                for c in compliance
            ],
        }
        explanation = await gemini.explain_bias(metrics_payload)
        gemini_explanation = explanation.get("plain_english", "")
    except Exception:
        gemini_explanation = ""

    return FlagResponse(
        scorecard=scorecard,
        gemini_explanation=gemini_explanation,
    )


# ──────────────────────────────────────
#  Helper functions
# ──────────────────────────────────────

def _prepare_and_predict(
    df: pd.DataFrame,
    label_column: str,
    favorable_label,
    protected_attributes: list[str],
) -> tuple:
    """Encode data, train model, return predictions and protected arrays."""
    df_encoded = df.copy()
    encoders = {}

    for col in df_encoded.columns:
        if is_categorical_column(df_encoded[col]):
            le = LabelEncoder()
            df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
            encoders[col] = le

    feature_cols = [c for c in df_encoded.columns if c != label_column]
    X = df_encoded[feature_cols].values.astype(float)
    y = df_encoded[label_column].values
    X = np.nan_to_num(X, nan=0.0)

    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )

    indices = np.arange(len(df_encoded))
    _, test_indices = train_test_split(
        indices, test_size=0.3, random_state=42, stratify=y
    )

    model = LogisticRegression(max_iter=1000, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    df_test = df_encoded.iloc[test_indices].reset_index(drop=True)
    protected_map = {
        attr: df_test[attr].values for attr in protected_attributes
    }

    return y_test, y_pred, protected_map, df_test


def _encode_fav(favorable_label, series: pd.Series):
    """Encode favorable label."""
    if is_categorical_column(series):
        le = LabelEncoder()
        le.fit(series.astype(str))
        try:
            return le.transform([str(favorable_label)])[0]
        except ValueError:
            return 1
    return favorable_label


def _detect_priv(protected, y, fav):
    """Find the group with highest positive rate."""
    rates = {}
    for val in np.unique(protected):
        mask = protected == val
        rates[val] = np.mean(y[mask] == fav)
    return max(rates, key=rates.get)


def _metric_to_severity(metric) -> SeverityLevel:
    """Convert a metric result to a severity level."""
    if metric.metric_name == "disparate_impact_ratio":
        return FairnessEngine.classify_severity(metric.value)
    else:
        # For difference metrics, map deviation to DI-equivalent severity
        deviation = abs(metric.value)
        if deviation <= 0.05:
            return SeverityLevel.LOW
        elif deviation <= 0.10:
            return SeverityLevel.MEDIUM
        elif deviation <= 0.20:
            return SeverityLevel.HIGH
        else:
            return SeverityLevel.CRITICAL


def _generate_flag_description(metric, attr, priv, unpriv_labels) -> str:
    """Generate a human-readable flag description."""
    unpriv = ", ".join(unpriv_labels)

    if metric.metric_name == "disparate_impact_ratio":
        return (
            f"The selection rate for {unpriv} ({attr}) is only "
            f"{metric.value:.0%} of the rate for {priv}. "
            f"The EEOC four-fifths rule requires at least 80%."
        )
    elif metric.metric_name == "statistical_parity_difference":
        direction = "lower" if metric.value < 0 else "higher"
        return (
            f"The positive outcome rate for {unpriv} ({attr}) is "
            f"{abs(metric.value):.1%} {direction} than for {priv}."
        )
    elif metric.metric_name == "average_odds_difference":
        return (
            f"The model has unequal error rates across {attr} groups. "
            f"Average odds difference: {metric.value:.4f} (threshold: {metric.threshold})."
        )
    elif metric.metric_name == "equal_opportunity_difference":
        return (
            f"Qualified individuals in the {unpriv} group ({attr}) have a "
            f"different chance of being correctly identified compared to {priv}."
        )
    elif metric.metric_name == "predictive_parity_difference":
        return (
            f"The model's precision differs across {attr} groups. "
            f"Predictive parity difference: {metric.value:.4f}."
        )
    return f"{metric.display_name}: {metric.value:.4f}"


def _generate_recommendation(metric, severity: SeverityLevel) -> str:
    """Generate mitigation recommendation based on metric and severity."""
    recs = {
        SeverityLevel.CRITICAL: (
            "IMMEDIATE ACTION REQUIRED: Halt deployment. Apply Reweighting "
            "and Threshold Optimizer simultaneously. Re-audit before any use."
        ),
        SeverityLevel.HIGH: (
            "Apply bias mitigation techniques (Reweighting or Exponentiated "
            "Gradient). Review training data for representation gaps. "
            "Re-run audit after mitigation."
        ),
        SeverityLevel.MEDIUM: (
            "Investigate root causes. Check for proxy variables. Consider "
            "applying Disparate Impact Remover. Monitor metrics over time."
        ),
        SeverityLevel.LOW: (
            "Continue monitoring. Document findings for compliance records. "
            "Schedule periodic re-audits."
        ),
    }
    return recs.get(severity, "Review metrics and apply appropriate mitigation.")


def _run_compliance_checks(flags: list[BiasFlag]) -> list[ComplianceCheck]:
    """
    Run regulatory compliance checks.

    From the document:
    - NYC LL144: Requires DI ratio check for hiring tools
    - EU AI Act: Hiring AI is high-risk, must demonstrate fairness
    - EEOC: Four-fifths rule
    """
    checks = []

    # NYC Local Law 144
    di_flags = [f for f in flags if "Disparate Impact" in f.metric_name]
    ll144_failing = [f for f in di_flags if f.severity in [SeverityLevel.HIGH, SeverityLevel.CRITICAL]]

    checks.append(ComplianceCheck(
        regulation="NYC_LL144",
        status="FAIL" if ll144_failing else ("WARNING" if di_flags else "PASS"),
        details=(
            f"NYC Local Law 144 requires annual bias audits for automated hiring tools. "
            f"{'FAILING: ' + str(len(ll144_failing)) + ' disparate impact violations detected.' if ll144_failing else 'No disparate impact violations found.'} "
            f"Penalties: $500 first violation, $1,500/day thereafter."
        ),
    ))

    # EEOC Four-Fifths Rule
    eeoc_failing = [
        f for f in flags
        if "Disparate Impact" in f.metric_name and f.metric_value < 0.8
    ]
    checks.append(ComplianceCheck(
        regulation="EEOC_FOUR_FIFTHS",
        status="FAIL" if eeoc_failing else "PASS",
        details=(
            f"EEOC Uniform Guidelines: selection rate for any group must be >= 80% "
            f"of the highest group's rate. "
            f"{'FAILING: Impact ratio below 0.8 detected.' if eeoc_failing else 'All groups pass the four-fifths threshold.'}"
        ),
    ))

    # EU AI Act
    any_critical = any(f.severity == SeverityLevel.CRITICAL for f in flags)
    any_high = any(f.severity == SeverityLevel.HIGH for f in flags)
    checks.append(ComplianceCheck(
        regulation="EU_AI_ACT",
        status="FAIL" if any_critical else ("WARNING" if any_high else "PASS"),
        details=(
            f"EU AI Act classifies hiring AI as high-risk (Article 6). "
            f"Requires training data to be 'relevant, representative, free of errors' (Article 10). "
            f"{'CRITICAL bias detected — would not pass EU AI Act compliance.' if any_critical else 'Current bias levels within acceptable range for EU AI Act.'} "
            f"Penalties: up to €35 million or 7% of global annual turnover."
        ),
    ))

    return checks


def _generate_summary(
    overall: SeverityLevel,
    flags: list[BiasFlag],
    compliance: list[ComplianceCheck],
) -> str:
    """Generate a text summary of the bias assessment."""
    failing_regs = [c.regulation for c in compliance if c.status == "FAIL"]

    severity_text = {
        SeverityLevel.LOW: "Minor bias detected. The model shows acceptable fairness levels.",
        SeverityLevel.MEDIUM: "Moderate bias detected. Investigation and monitoring recommended.",
        SeverityLevel.HIGH: "Significant bias detected. Immediate mitigation required before deployment.",
        SeverityLevel.CRITICAL: "SEVERE bias detected. Deployment should be halted immediately.",
    }

    summary = severity_text.get(overall, "")

    if failing_regs:
        summary += f" Regulatory compliance failures: {', '.join(failing_regs)}."

    if flags:
        attrs = list(set(f.protected_attribute for f in flags))
        summary += f" Affected protected attributes: {', '.join(attrs)}."

    return summary