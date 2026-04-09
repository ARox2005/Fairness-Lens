# FairnessLens Backend

AI Bias Detection & Mitigation API — built for Google Solution Challenge 2026 India.

## Architecture

```
Modular Monolith (FastAPI)
├── /api/inspect   → Dataset profiling, proxy detection, representation gaps
├── /api/measure   → 8 fairness metrics, intersectional analysis, SHAP
├── /api/flag      → Risk categorization, bias scorecard, compliance checks
├── /api/fix       → 4 mitigation techniques with before/after comparison
├── /core/fairness → Metric computation engine (all formulas + thresholds)
├── /core/gemini   → Gemini API structured output for plain-English explanations
└── /services/     → Data profiler, dataset manager, mitigation service
```

## Fairness Metrics Implemented

| Metric | Formula | Threshold | Source |
|--------|---------|-----------|--------|
| Statistical Parity Difference | P(Ŷ=1\|A=unpriv) − P(Ŷ=1\|A=priv) | \|val\| ≤ 0.1 | AIF360 |
| Disparate Impact Ratio | rate(unpriv) / rate(priv) | ≥ 0.8 (EEOC 4/5ths) | EEOC/LL144 |
| Equalized Odds (Avg Abs Odds Diff) | 0.5×(\|ΔTPR\| + \|ΔFPR\|) | ≤ 0.1 | Hardt et al. |
| Equal Opportunity Difference | TPR_unpriv − TPR_priv | \|val\| ≤ 0.1 | Hardt et al. |
| Predictive Parity Difference | PPV_unpriv − PPV_priv | \|val\| ≤ 0.1 | Northpointe |
| Calibration Difference | \|ECE_priv − ECE_unpriv\| | ≤ 0.1 | Kleinberg |
| Individual Fairness (k-NN) | Consistency score | ≥ 0.7 | Dwork et al. |
| Counterfactual Fairness | Flip rate on attribute swap | ≤ 0.05 | Kusner et al. |

## Mitigation Techniques

1. **Reweighting** (pre-processing): W(g,l) = P(l)×P(g) / P(g,l)
2. **Disparate Impact Remover** (pre-processing): Rank-preserving feature repair
3. **Exponentiated Gradient** (in-processing): Fairlearn constrained optimization
4. **Threshold Optimizer** (post-processing): Group-specific decision thresholds

## Quick Start

```bash
cd backend
pip install -r requirements.txt
python -m app.main
# API docs at http://localhost:8000/docs
```

## Deploy to Cloud Run

```bash
gcloud run deploy fairness-lens-api \
  --source . \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --set-env-vars "GOOGLE_API_KEY=your_key"
```

## Google Technologies Used

- **Gemini API** — Plain-English bias explanations via structured output
- **Cloud Run** — Serverless backend deployment
- **Firebase/Firestore** — Auth + audit result storage
- **Cloud Storage** — Dataset uploads via signed URLs
