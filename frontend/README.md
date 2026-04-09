# FairnessLens Frontend

Next.js + Tailwind CSS dashboard for the AI Bias Detection & Mitigation platform.

## Quick Start

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

Make sure the backend is running on `http://localhost:8000` first.

## Architecture

```
src/
├── app/
│   ├── layout.js          # Root layout with fonts + metadata
│   ├── globals.css         # Tailwind + custom styles
│   └── page.js             # Main pipeline orchestrator
├── components/
│   ├── Header.jsx          # Logo + dark mode toggle
│   ├── Sidebar.jsx         # Step navigation with progress bar
│   ├── ui.jsx              # Shared components (badges, cards, stats)
│   └── steps/
│       ├── UploadStep.jsx   # Demo dataset cards + CSV upload
│       ├── InspectStep.jsx  # Data profiling + distributions
│       ├── MeasureStep.jsx  # Fairness metrics + radar chart
│       ├── FlagStep.jsx     # Risk assessment + compliance
│       └── FixStep.jsx      # Mitigation before/after
└── lib/
    └── api.js              # Backend API client
```

## Features

- Step-by-step wizard: Upload → Inspect → Measure → Flag → Fix
- 3 pre-loaded demo datasets (Adult, German Credit, COMPAS)
- Interactive charts (Recharts): bar, radar, before/after comparison
- Traffic-light severity badges (colorblind-safe)
- Intersectional analysis table (NYC LL144 format)
- Regulatory compliance checks (LL144, EEOC, EU AI Act)
- Dark mode toggle
- Gemini AI explanation panels
- Responsive layout
