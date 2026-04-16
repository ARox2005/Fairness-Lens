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
import re
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
            api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
            if api_key:
                _genai_client = genai.Client(api_key=api_key)
            else:
                logger.warning("GOOGLE_API_KEY not set — Gemini explanations disabled")
                return None
        except ImportError:
            logger.warning("google-genai not installed — Gemini explanations disabled")
            return None
    return _genai_client


def _safe_json_parse(text: str) -> Optional[dict]:
    """
    Attempt to parse JSON with multiple repair strategies.

    Gemini's structured output occasionally returns malformed JSON:
    - Trailing commas before } or ]
    - Unescaped quotes inside string values
    - Truncated responses (hit max_output_tokens mid-object)
    - Stray backticks / markdown fences

    Returns parsed dict on success, or None if all repair attempts fail.
    """
    if not text:
        return None

    # Clean common wrappers
    cleaned = text.strip()
    cleaned = cleaned.replace("```json", "").replace("```", "").strip()

    # Attempt 1: parse as-is
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: strip trailing commas before closing braces/brackets
    repaired = re.sub(r",(\s*[}\]])", r"\1", cleaned)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # Attempt 2.5: if the response was truncated mid-string, find the last
    # complete top-level "key": value, pair and close the root object there.
    try:
        in_string = False
        escape = False
        brace_depth = 0
        bracket_depth = 0
        last_complete_key_end = -1

        for i, ch in enumerate(repaired):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
            elif ch == "[":
                bracket_depth += 1
            elif ch == "]":
                bracket_depth -= 1
            elif ch == "," and brace_depth == 1 and bracket_depth == 0:
                last_complete_key_end = i

        if last_complete_key_end > 0:
            truncated = repaired[:last_complete_key_end] + "}"
            return json.loads(truncated)
    except (json.JSONDecodeError, IndexError):
        pass

    # Attempt 3: find the last balanced closing brace and truncate there
    # (handles truncated responses where Gemini hit max_output_tokens)
    try:
        depth = 0
        last_valid = -1
        in_string = False
        escape = False
        for i, ch in enumerate(repaired):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    last_valid = i
        if last_valid > 0:
            truncated = repaired[:last_valid + 1]
            return json.loads(truncated)
    except (json.JSONDecodeError, IndexError):
        pass

    # Attempt 4: extract just the first {...} block with regex
    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", repaired, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


# ═══════════════════════════════════════
#  NVIDIA GEMMA 3 27B CLIENT
# ═══════════════════════════════════════

NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_MODEL = "google/gemma-3-27b-it"


def _call_nvidia_gemma(prompt: str, max_tokens: int = 1500, temperature: float = 0.3) -> Optional[str]:
    """
    Call NVIDIA's hosted Gemma 3 27B model with an OpenAI-compatible request.

    Returns the response text on success, or None on any failure.
    NVIDIA free tier has much higher daily limits than Gemini, suitable
    for high-volume manual pipeline explanations.
    """
    api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not api_key:
        logger.warning("NVIDIA_API_KEY not set — LLM explanations disabled")
        return None

    try:
        import requests
    except ImportError:
        logger.error("'requests' not installed — cannot call NVIDIA API")
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "model": NVIDIA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.7,
        "stream": False,
    }

    try:
        response = requests.post(NVIDIA_API_URL, headers=headers, json=payload, timeout=45)
        if response.status_code != 200:
            logger.error(f"NVIDIA API HTTP {response.status_code}: {response.text[:300]}")
            return None
        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            logger.error(f"NVIDIA API returned no choices: {data}")
            return None
        content = choices[0].get("message", {}).get("content", "")
        return content if content else None
    except requests.exceptions.Timeout:
        logger.error("NVIDIA API request timed out after 45s")
        return None
    except Exception as e:
        logger.error(f"NVIDIA API call failed: {e}")
        return None


async def explain_bias(metrics_payload: dict) -> dict:
    """
    Generate a plain-English bias explanation from fairness metrics.

    Routes to NVIDIA's hosted Gemma 3 27B model (OpenAI-compatible API).
    Falls back to deterministic explanation if NVIDIA is unavailable.

    Schema: summary, severity, affected_groups, plain_english, recommendations
    """
    prompt = f"""You are an AI fairness expert advising a non-technical HR compliance officer.

Analyze the following fairness metrics for a hiring/classification model and provide
a clear, actionable explanation. The audience has NO machine learning background.

METRICS DATA:
{json.dumps(metrics_payload, indent=2)}

CONTEXT:
- Disparate Impact Ratio below 0.8 violates the EEOC four-fifths rule
- NYC Local Law 144 requires annual bias audits for automated hiring tools
- The EU AI Act classifies hiring AI as high-risk with mandatory fairness requirements

Respond ONLY with a JSON object (no markdown, no backticks, no prose before or after).
The JSON must match this exact schema:
{{
    "summary": "One-sentence overall assessment",
    "severity": "low | medium | high | critical",
    "affected_groups": ["list of groups experiencing unfair treatment"],
    "plain_english": "2-3 paragraph explanation a non-technical person can understand. Explain WHAT the bias is, WHO it affects, and WHY it matters. Use concrete examples.",
    "recommendations": ["list of 3-5 specific actionable steps to address the bias"]
}}"""

    text = _call_nvidia_gemma(prompt, max_tokens=2000, temperature=0.3)
    if text is None:
        return _fallback_explanation(metrics_payload)

    result = _safe_json_parse(text)
    if result is None:
        logger.error(f"Gemma JSON parse failed after all repair attempts. Raw: {text[:300]}")
        return _fallback_explanation(metrics_payload)

    # Ensure required keys exist (fill missing ones from fallback)
    fallback = _fallback_explanation(metrics_payload)
    for key in ["summary", "severity", "affected_groups", "plain_english", "recommendations"]:
        if key not in result or result[key] is None:
            result[key] = fallback[key]

    return result


async def explain_mitigation(
    technique_name: str,
    before_metrics: dict,
    after_metrics: dict,
    accuracy_cost: float
) -> str:
    """
    Generate plain-English explanation of mitigation results.

    Routes to NVIDIA's hosted Gemma 3 27B model.
    """
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

    text = _call_nvidia_gemma(prompt, max_tokens=500, temperature=0.3)
    if text is None or not text.strip():
        return _fallback_mitigation_explanation(technique_name, accuracy_cost)
    return text.strip()


async def generate_audit_narrative(scorecard: dict) -> str:
    """
    Generate a complete audit narrative for the PDF bias report.
    Routes to NVIDIA's hosted Gemma 3 27B model.
    Maps to NYC LL144 compliance report format.
    """
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

    text = _call_nvidia_gemma(prompt, max_tokens=700, temperature=0.2)
    if text is None or not text.strip():
        return "Audit narrative generation failed. Please review metrics manually."
    return text.strip()


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