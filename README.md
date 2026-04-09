# FairnessLens — AI Bias Detection & Mitigation Platform

Built for **Google Solution Challenge 2026 India** | Theme: Unbiased AI Decision

## Quick Start

### 1. Start the Backend
```bash
cd backend
pip install -r requirements.txt
python -m app.main
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

### 3. Use the App
- Click **"Try Demo"** on the Adult dataset card
- Step through: **Inspect → Measure → Flag → Fix**

## Pipeline

| Phase | What it does |
|-------|-------------|
| **Inspect** | Profile dataset, detect protected attributes, find proxy variables |
| **Measure** | Compute 8 fairness metrics, intersectional analysis, SHAP |
| **Flag** | Risk categorization, bias scorecard, LL144/EEOC/EU AI Act compliance |
| **Fix** | Reweighting, Threshold Optimizer, Exponentiated Gradient, DI Remover |

## Google Technologies

- **Gemini API** — Plain-English bias explanations
- **Cloud Run** — Backend deployment
- **Firebase** — Auth + Firestore + Hosting
- **Cloud Storage** — Dataset uploads

## Tech Stack

- **Backend**: FastAPI, AIF360, Fairlearn, scikit-learn, SHAP
- **Frontend**: Next.js 14, Tailwind CSS, Recharts, Lucide Icons
