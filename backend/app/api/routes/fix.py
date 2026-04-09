"""
Fix Route — Phase 4 of the Pipeline

Applies bias mitigation techniques and generates before/after comparisons.

From the document:
"The Fix phase is your strongest differentiator. Most hackathon projects
detect bias; yours fixes it."

Techniques implemented:
1. Reweighting (pre-processing) — W(g,l) = P(l) × P(g) / P(g,l)
2. Disparate Impact Remover (pre-processing) — rank-preserving repair
3. Exponentiated Gradient (in-processing) — Fairlearn constrained optimization
4. Threshold Optimizer (post-processing) — group-specific thresholds

Includes recommendation engine and Gemini-powered explanations.
"""

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    FixRequest, FixResponse, MitigationTechnique, MitigationResult,
    FairnessConstraint
)
from app.services.mitigation import MitigationService
from app.core import gemini
from app.services import dataset_manager

router = APIRouter(prefix="/api/fix", tags=["Fix"])


@router.post("/", response_model=FixResponse)
async def fix_bias(request: FixRequest):
    """
    Apply selected mitigation techniques and return before/after comparisons.

    The response includes:
    - Results for each technique with accuracy cost and fairness improvement
    - Recommended technique (best fairness/accuracy trade-off)
    - Gemini-powered plain-English explanation
    """
    df = dataset_manager.get_dataset(request.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Strip whitespace from all inputs
    request.label_column = request.label_column.strip()
    request.protected_attributes = [a.strip() for a in request.protected_attributes]

    if request.label_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Label column '{request.label_column}' not found"
        )

    # Use the first protected attribute for mitigation
    # (multi-attribute mitigation can be done sequentially)
    if not request.protected_attributes:
        raise HTTPException(
            status_code=400,
            detail="At least one protected attribute is required"
        )

    primary_attr = request.protected_attributes[0]
    if primary_attr not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attribute '{primary_attr}' not found"
        )

    # Clean data
    df_clean = df.dropna(
        subset=[request.label_column, primary_attr]
    ).copy()

    if len(df_clean) < 100:
        raise HTTPException(
            status_code=400,
            detail="Dataset too small for mitigation (need at least 100 rows)"
        )

    # Initialize mitigation service
    service = MitigationService(
        df=df_clean,
        protected_attribute=primary_attr,
        label_column=request.label_column,
        favorable_label=request.favorable_label,
    )

    # ── Apply each requested technique ──
    results: list[MitigationResult] = []

    for technique in request.techniques:
        if technique == MitigationTechnique.REWEIGHTING:
            result = service.apply_reweighting()
            results.append(result)

        elif technique == MitigationTechnique.DISPARATE_IMPACT_REMOVER:
            result = service.apply_disparate_impact_remover(repair_level=1.0)
            results.append(result)

        elif technique == MitigationTechnique.EXPONENTIATED_GRADIENT:
            result = service.apply_exponentiated_gradient(
                constraint=request.fairness_constraint,
                eps=0.01,
            )
            results.append(result)

        elif technique == MitigationTechnique.THRESHOLD_OPTIMIZER:
            result = service.apply_threshold_optimizer(
                constraint=request.fairness_constraint,
            )
            results.append(result)

    if not results:
        raise HTTPException(
            status_code=400,
            detail="No techniques were successfully applied"
        )

    # ── Get recommendation ──
    recommended, reason = MitigationService.recommend_technique(results)

    # ── Gemini explanation ──
    gemini_explanation = ""
    try:
        # Use the best result for explanation
        best_result = next(
            (r for r in results if r.technique == recommended), results[0]
        )

        before_metrics = {
            c.metric_name: c.before for c in best_result.metric_comparisons
        }
        after_metrics = {
            c.metric_name: c.after for c in best_result.metric_comparisons
        }

        gemini_explanation = await gemini.explain_mitigation(
            technique_name=best_result.technique_display_name,
            before_metrics=before_metrics,
            after_metrics=after_metrics,
            accuracy_cost=best_result.accuracy_cost,
        )
    except Exception:
        gemini_explanation = ""

    return FixResponse(
        dataset_id=request.dataset_id,
        results=results,
        recommended_technique=recommended,
        recommendation_reason=reason,
        gemini_explanation=gemini_explanation,
    )


@router.post("/all", response_model=FixResponse)
async def fix_bias_all_techniques(request: FixRequest):
    """
    Apply ALL four mitigation techniques for comparison.
    This is the "compare all" mode for the dashboard.
    """
    # Override techniques to include all four
    request.techniques = [
        MitigationTechnique.REWEIGHTING,
        MitigationTechnique.DISPARATE_IMPACT_REMOVER,
        MitigationTechnique.EXPONENTIATED_GRADIENT,
        MitigationTechnique.THRESHOLD_OPTIMIZER,
    ]
    return await fix_bias(request)