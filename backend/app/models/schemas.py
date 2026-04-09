"""
Pydantic schemas for the FairnessLens API.
Covers all four pipeline phases: Inspect, Measure, Flag, Fix.
"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ──────────────────────────────────────────────
#  Enums
# ──────────────────────────────────────────────

class SeverityLevel(str, Enum):
    """Risk categorization framework from the document:
    - Low:     DI ratio >= 0.90
    - Medium:  DI ratio 0.80 - 0.90
    - High:    DI ratio 0.65 - 0.80
    - Critical: DI ratio < 0.65
    """
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MitigationTechnique(str, Enum):
    """Three mitigation techniques from the document:
    - Reweighting (pre-processing, AIF360)
    - Exponentiated Gradient (in-processing, Fairlearn)
    - Threshold Optimizer (post-processing, Fairlearn)
    - Disparate Impact Remover (pre-processing, AIF360)
    """
    REWEIGHTING = "reweighting"
    EXPONENTIATED_GRADIENT = "exponentiated_gradient"
    THRESHOLD_OPTIMIZER = "threshold_optimizer"
    DISPARATE_IMPACT_REMOVER = "disparate_impact_remover"


class FairnessConstraint(str, Enum):
    """Fairness constraints for in-processing/post-processing."""
    DEMOGRAPHIC_PARITY = "demographic_parity"
    EQUALIZED_ODDS = "equalized_odds"
    EQUAL_OPPORTUNITY = "equal_opportunity"


# ──────────────────────────────────────────────
#  INSPECT Phase Schemas
# ──────────────────────────────────────────────

class ColumnProfile(BaseModel):
    """Profile of a single column in the dataset."""
    name: str
    dtype: str
    unique_count: int
    null_count: int
    null_percentage: float
    is_protected_attribute: bool = False
    sample_values: list = []


class GroupDistribution(BaseModel):
    """Distribution of values within a protected attribute group."""
    attribute: str
    group: str
    count: int
    proportion: float
    positive_rate: float = 0.0  # rate of favorable outcome


class ProxyVariable(BaseModel):
    """A feature correlated with a protected attribute (potential proxy).
    Flagged when |correlation| > 0.3 as per document specification.
    """
    feature: str
    protected_attribute: str
    correlation: float
    correlation_type: str  # "point_biserial" or "cramers_v"
    is_proxy: bool  # True if |correlation| > 0.3


class RepresentationGap(BaseModel):
    """Gap between dataset representation and population baseline."""
    attribute: str
    group: str
    dataset_proportion: float
    baseline_proportion: Optional[float] = None
    gap: Optional[float] = None


class InspectRequest(BaseModel):
    """Request for the Inspect phase."""
    dataset_id: Optional[str] = None
    protected_attributes: list[str] = []
    label_column: str = ""
    favorable_label: Optional[str | int | float] = None


class InspectResponse(BaseModel):
    """Full dataset profile returned by the Inspect phase."""
    dataset_id: str
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    detected_protected_attributes: list[str]
    group_distributions: list[GroupDistribution]
    proxy_variables: list[ProxyVariable]
    representation_gaps: list[RepresentationGap]
    warnings: list[str] = []


# ──────────────────────────────────────────────
#  MEASURE Phase Schemas
# ──────────────────────────────────────────────

class MetricResult(BaseModel):
    """Result of a single fairness metric computation.
    Includes the metric value, threshold, and pass/fail status.
    """
    metric_name: str
    display_name: str
    value: float
    threshold: float
    passed: bool
    description: str
    privileged_group: str = ""
    unprivileged_group: str = ""
    formula: str = ""


class GroupMetrics(BaseModel):
    """Metrics computed for a specific protected attribute."""
    protected_attribute: str
    privileged_group: str
    unprivileged_group: str
    metrics: list[MetricResult]


class IntersectionalCell(BaseModel):
    """A single cell in the intersectional analysis heatmap.
    Example: race=Black × sex=Female → impact ratio = 0.62
    """
    group_a_attr: str
    group_a_value: str
    group_b_attr: str
    group_b_value: str
    selection_rate: float
    impact_ratio: float
    severity: SeverityLevel


class ShapFeatureAttribution(BaseModel):
    """SHAP feature importance for bias detection."""
    feature: str
    mean_abs_shap: float
    is_protected: bool
    bias_signal: str = ""  # e.g., "High attribution on protected attribute"


class MeasureRequest(BaseModel):
    """Request for the Measure phase."""
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float
    run_intersectional: bool = True
    run_shap: bool = False


class MeasureResponse(BaseModel):
    """Complete fairness measurement results."""
    dataset_id: str
    group_metrics: list[GroupMetrics]
    intersectional_analysis: list[IntersectionalCell] = []
    shap_attributions: list[ShapFeatureAttribution] = []
    impossibility_note: str = ""  # Chouldechova/Kleinberg impossibility theorem


# ──────────────────────────────────────────────
#  FLAG Phase Schemas
# ──────────────────────────────────────────────

class BiasFlag(BaseModel):
    """A single flagged bias issue with severity and context."""
    flag_id: str
    metric_name: str
    protected_attribute: str
    privileged_group: str
    unprivileged_group: str
    metric_value: float
    threshold: float
    severity: SeverityLevel
    description: str
    recommendation: str


class ComplianceCheck(BaseModel):
    """Regulatory compliance status check."""
    regulation: str  # "NYC_LL144", "EU_AI_ACT", "EEOC_FOUR_FIFTHS"
    status: str  # "PASS", "FAIL", "WARNING"
    details: str


class BiasScorecard(BaseModel):
    """The complete bias scorecard / report card."""
    dataset_id: str
    overall_severity: SeverityLevel
    total_flags: int
    critical_flags: int
    high_flags: int
    medium_flags: int
    low_flags: int
    flags: list[BiasFlag]
    compliance_checks: list[ComplianceCheck]
    summary: str = ""


class FlagRequest(BaseModel):
    """Request for the Flag phase."""
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float


class FlagResponse(BaseModel):
    """Complete bias flagging results."""
    scorecard: BiasScorecard
    gemini_explanation: str = ""


# ──────────────────────────────────────────────
#  FIX Phase Schemas
# ──────────────────────────────────────────────

class MetricComparison(BaseModel):
    """Before/after comparison for a single metric."""
    metric_name: str
    before: float
    after: float
    improvement: float  # percentage improvement
    passed_before: bool
    passed_after: bool


class MitigationResult(BaseModel):
    """Result of applying a single mitigation technique."""
    technique: MitigationTechnique
    technique_display_name: str
    accuracy_before: float
    accuracy_after: float
    accuracy_cost: float  # percentage points lost
    metric_comparisons: list[MetricComparison]
    overall_fairness_improvement: float
    recommendation_notes: str = ""


class FixRequest(BaseModel):
    """Request for the Fix phase."""
    dataset_id: str
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float
    techniques: list[MitigationTechnique] = [
        MitigationTechnique.REWEIGHTING,
        MitigationTechnique.THRESHOLD_OPTIMIZER,
    ]
    fairness_constraint: FairnessConstraint = FairnessConstraint.DEMOGRAPHIC_PARITY


class FixResponse(BaseModel):
    """Complete mitigation results with before/after comparisons."""
    dataset_id: str
    results: list[MitigationResult]
    recommended_technique: MitigationTechnique
    recommendation_reason: str
    gemini_explanation: str = ""


# ──────────────────────────────────────────────
#  Gemini Explanation Schema
# ──────────────────────────────────────────────

class BiasExplanation(BaseModel):
    """Structured output schema for Gemini API bias explanations.
    Directly from the document's Gemini integration pattern.
    """
    summary: str
    severity: str
    affected_groups: list[str]
    plain_english: str
    recommendations: list[str]


# ──────────────────────────────────────────────
#  Demo Dataset Schema
# ──────────────────────────────────────────────

class DemoDataset(BaseModel):
    """Available demo dataset info."""
    id: str
    name: str
    description: str
    row_count: int
    column_count: int
    protected_attributes: list[str]
    label_column: str
    favorable_label: str | int | float
    domain: str  # "hiring", "lending", "criminal_justice", "healthcare"


class DemoDatasetListResponse(BaseModel):
    """List of available demo datasets."""
    datasets: list[DemoDataset]
