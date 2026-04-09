"""
Gemini API Client — Natural Language Bias Explanations

From the document:
"Transform raw metrics into human-readable insights using structured output.
Use gemini-2.5-flash for cost efficiency. Always ground explanations with
the actual computed metrics to prevent hallucination."

Provides:
1. Bias explanation for the Flag phase
2. Mitigation recommendation for the Fix phase
3. Overall audit narrative for the PDF report
"""

import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Will be lazily imported to avoid crash if google-genai not installed
_genai_client = None


def _get_client():
    """Lazy-initialize the Gemini client."""
    global _genai_client
    if _genai_client is None:
        try:
            from google import genai
            api_key = os.environ.get("GOOGLE_API_KEY", "")
            if api_key:
                _genai_client = genai.Client(api_key=api_key)
            else:
                logger.warning("GOOGLE_API_KEY not set — Gemini explanations disabled")
                return None
        except ImportError:
            logger.warning("google-genai not installed — Gemini explanations disabled")
            return None
    return _genai_client


async def explain_bias(metrics_payload: dict) -> dict:
    """
    Generate a plain-English bias explanation from fairness metrics.

    Uses Gemini 2.5 Flash with structured JSON output.
    Schema matches BiasExplanation from schemas.py:
        summary, severity, affected_groups, plain_english, recommendations

    From the document:
    "If your platform lets an HR manager or a compliance officer — someone
    without ML knowledge — upload their vendor's hiring model and understand
    its fairness profile through plain language and intuitive visuals, that's
    a genuinely differentiated approach."
    """
    client = _get_client()
    if client is None:
        return _fallback_explanation(metrics_payload)

    prompt = f"""You are an AI fairness expert advising a non-technical HR compliance officer.

Analyze the following fairness metrics for a hiring/classification model and provide
a clear, actionable explanation. The audience has NO machine learning background.

METRICS DATA:
{json.dumps(metrics_payload, indent=2)}

CONTEXT:
- Disparate Impact Ratio below 0.8 violates the EEOC four-fifths rule
- NYC Local Law 144 requires annual bias audits for automated hiring tools
- The EU AI Act classifies hiring AI as high-risk with mandatory fairness requirements

Respond ONLY with a JSON object (no markdown, no backticks) matching this exact schema:
{{
    "summary": "One-sentence overall assessment",
    "severity": "low | medium | high | critical",
    "affected_groups": ["list of groups experiencing unfair treatment"],
    "plain_english": "2-3 paragraph explanation a non-technical person can understand. Explain WHAT the bias is, WHO it affects, and WHY it matters. Use concrete examples.",
    "recommendations": ["list of 3-5 specific actionable steps to address the bias"]
}}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "temperature": 0.3,  # low creativity for factual analysis
                "max_output_tokens": 1000,
            }
        )

        # Parse the response
        text = response.text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        return result

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return _fallback_explanation(metrics_payload)


async def explain_mitigation(
    technique_name: str,
    before_metrics: dict,
    after_metrics: dict,
    accuracy_cost: float
) -> str:
    """
    Generate plain-English explanation of mitigation results.

    From the document:
    "CMU research found that fairness-accuracy trade-offs are 'negligible in practice'
    — include this finding in Gemini-generated explanations to reassure users."
    """
    client = _get_client()
    if client is None:
        return _fallback_mitigation_explanation(technique_name, accuracy_cost)

    prompt = f"""You are an AI fairness expert explaining bias mitigation results
to a non-technical stakeholder.

TECHNIQUE APPLIED: {technique_name}

BEFORE MITIGATION:
{json.dumps(before_metrics, indent=2)}

AFTER MITIGATION:
{json.dumps(after_metrics, indent=2)}

ACCURACY COST: {accuracy_cost:.2f} percentage points

Write a 2-paragraph plain-English explanation:
1. What the mitigation technique did and how it improved fairness
2. Whether the accuracy trade-off is acceptable (note: CMU research by Rodolfa et al. in Nature Machine Intelligence found that fairness-accuracy trade-offs are typically negligible in practice)

Keep it under 150 words. No technical jargon. No markdown formatting.
Respond with plain text only."""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"temperature": 0.3, "max_output_tokens": 500}
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini mitigation explanation error: {e}")
        return _fallback_mitigation_explanation(technique_name, accuracy_cost)


async def generate_audit_narrative(scorecard: dict) -> str:
    """
    Generate a complete audit narrative for the PDF bias report.
    Maps to NYC LL144 compliance report format.
    """
    client = _get_client()
    if client is None:
        return "Automated audit narrative requires Gemini API configuration."

    prompt = f"""You are generating a formal bias audit report narrative for an
automated employment decision tool, following NYC Local Law 144 requirements.

AUDIT DATA:
{json.dumps(scorecard, indent=2)}

Write a professional 3-paragraph audit summary:
1. Overview of the tool assessed and protected attributes analyzed
2. Key findings including specific metric values and which groups are affected
3. Compliance status and recommended next steps

Tone: formal, factual, suitable for regulatory filing.
Keep it under 250 words. No markdown. Plain text only."""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"temperature": 0.2, "max_output_tokens": 600}
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini audit narrative error: {e}")
        return "Audit narrative generation failed. Please review metrics manually."


def _fallback_explanation(metrics: dict) -> dict:
    """Deterministic fallback when Gemini is unavailable."""
    return {
        "summary": "Bias analysis complete. Review metrics below for details.",
        "severity": "medium",
        "affected_groups": ["See flagged metrics for affected groups"],
        "plain_english": (
            "The fairness analysis has identified potential disparities in how "
            "different groups are treated by this model. Some groups may be receiving "
            "favorable outcomes at lower rates than others. Review the detailed metrics "
            "and flagged issues to understand the specific disparities."
        ),
        "recommendations": [
            "Review the flagged metrics with highest severity first",
            "Consider applying the recommended mitigation techniques",
            "Consult with domain experts to validate findings",
            "Re-run analysis after applying mitigations to verify improvement",
        ],
    }


def _fallback_mitigation_explanation(technique: str, accuracy_cost: float) -> str:
    """Deterministic fallback for mitigation explanation."""
    return (
        f"The {technique} technique was applied to reduce bias in the model's predictions. "
        f"This resulted in an accuracy change of {accuracy_cost:.2f} percentage points. "
        "Research suggests that fairness-accuracy trade-offs are typically negligible "
        "in practice across most domains."
    )
