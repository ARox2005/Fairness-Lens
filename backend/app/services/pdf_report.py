"""
PDF Report Generator — Complete Bias Audit Report

Generates a downloadable PDF covering all 4 pipeline phases:
1. Inspect — dataset profile, distributions, proxy variables, warnings
2. Measure — all fairness metrics with formulas, values, pass/fail
3. Flag — severity assessment, compliance checks, flagged issues
4. Fix — mitigation results, before/after comparisons, recommendation

Modeled on NYC LL144 audit report format + Google Model Cards.
Uses reportlab for PDF generation.
"""

import io
import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)


# ── Color Palette ──
BRAND_BLUE = colors.HexColor("#2563EB")
BRAND_PURPLE = colors.HexColor("#7C3AED")
DARK_TEXT = colors.HexColor("#1A202C")
GRAY_TEXT = colors.HexColor("#4A5568")
LIGHT_GRAY = colors.HexColor("#F7FAFC")
BORDER_GRAY = colors.HexColor("#E2E8F0")
GREEN = colors.HexColor("#059669")
RED = colors.HexColor("#DC2626")
ORANGE = colors.HexColor("#D97706")
YELLOW = colors.HexColor("#F59E0B")

SEVERITY_COLORS = {
    "low": GREEN,
    "medium": YELLOW,
    "high": ORANGE,
    "critical": RED,
}


def _get_styles():
    """Build custom paragraph styles."""
    base = getSampleStyleSheet()

    styles = {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"],
            fontSize=24, textColor=BRAND_BLUE, spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"],
            fontSize=11, textColor=GRAY_TEXT, spaceAfter=20,
        ),
        "h1": ParagraphStyle(
            "H1", parent=base["Heading1"],
            fontSize=16, textColor=BRAND_BLUE, spaceBefore=20, spaceAfter=10,
            fontName="Helvetica-Bold",
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"],
            fontSize=13, textColor=DARK_TEXT, spaceBefore=14, spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "h3": ParagraphStyle(
            "H3", parent=base["Heading3"],
            fontSize=11, textColor=GRAY_TEXT, spaceBefore=10, spaceAfter=4,
            fontName="Helvetica-Bold",
        ),
        "body": ParagraphStyle(
            "BodyText", parent=base["Normal"],
            fontSize=9.5, textColor=DARK_TEXT, spaceAfter=6,
            leading=14,
        ),
        "small": ParagraphStyle(
            "SmallText", parent=base["Normal"],
            fontSize=8, textColor=GRAY_TEXT, spaceAfter=4,
        ),
        "pass": ParagraphStyle(
            "Pass", parent=base["Normal"],
            fontSize=9, textColor=GREEN, fontName="Helvetica-Bold",
        ),
        "fail": ParagraphStyle(
            "Fail", parent=base["Normal"],
            fontSize=9, textColor=RED, fontName="Helvetica-Bold",
        ),
        "metric_value": ParagraphStyle(
            "MetricValue", parent=base["Normal"],
            fontSize=10, textColor=DARK_TEXT, fontName="Helvetica-Bold",
            alignment=TA_RIGHT,
        ),
        "footer": ParagraphStyle(
            "Footer", parent=base["Normal"],
            fontSize=7, textColor=GRAY_TEXT, alignment=TA_CENTER,
        ),
    }
    return styles


def _make_table(data, col_widths=None, header=True):
    """Create a styled table."""
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE if header else LIGHT_GRAY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white if header else DARK_TEXT),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GRAY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


def _severity_text(severity):
    """Return colored severity string."""
    return f'<font color="{SEVERITY_COLORS.get(severity, GRAY_TEXT).hexval()}">{severity.upper()}</font>'


def generate_bias_audit_pdf(
    inspect_data: dict,
    measure_data: dict,
    flag_data: dict,
    fix_data: dict,
    dataset_name: str = "Dataset",
) -> bytes:
    """
    Generate a complete bias audit PDF report.

    Returns raw PDF bytes that can be streamed as a download.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )
    styles = _get_styles()
    story = []
    page_width = A4[0] - 40 * mm  # usable width

    # ═══════════════════════════════════════
    #  TITLE PAGE
    # ═══════════════════════════════════════
    story.append(Spacer(1, 60))
    story.append(Paragraph("FairnessLens", styles["title"]))
    story.append(Paragraph("AI Bias Audit Report", ParagraphStyle(
        "BigSub", parent=styles["h1"], fontSize=18, textColor=BRAND_PURPLE, spaceAfter=12,
    )))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_BLUE, spaceAfter=16))

    now = datetime.datetime.now().strftime("%B %d, %Y at %H:%M")
    story.append(Paragraph(f"<b>Dataset:</b> {dataset_name}", styles["body"]))
    story.append(Paragraph(f"<b>Generated:</b> {now}", styles["body"]))

    if inspect_data:
        story.append(Paragraph(
            f"<b>Rows:</b> {inspect_data.get('row_count', 'N/A'):,} &nbsp;&nbsp; "
            f"<b>Columns:</b> {inspect_data.get('column_count', 'N/A')} &nbsp;&nbsp; "
            f"<b>Protected Attributes:</b> {', '.join(inspect_data.get('detected_protected_attributes', []))}",
            styles["body"]
        ))

    if flag_data and flag_data.get("scorecard"):
        sev = flag_data["scorecard"].get("overall_severity", "unknown")
        story.append(Spacer(1, 12))
        story.append(Paragraph(
            f'<b>Overall Risk Level:</b> <font size="14" color="{SEVERITY_COLORS.get(sev, GRAY_TEXT).hexval()}">'
            f'{sev.upper()}</font>',
            styles["body"]
        ))

    story.append(Spacer(1, 20))
    story.append(Paragraph(
        "This report presents a comprehensive bias audit following the "
        "Inspect → Measure → Flag → Fix pipeline. It covers dataset profiling, "
        "fairness metric computation, risk assessment with regulatory compliance checks "
        "(NYC LL144, EEOC Four-Fifths Rule, EU AI Act), and bias mitigation results.",
        styles["body"]
    ))
    story.append(Paragraph(
        "Pipeline: Inspect → Measure → Flag → Fix",
        ParagraphStyle("Pipeline", parent=styles["body"], textColor=BRAND_BLUE, fontName="Helvetica-Bold")
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    #  SECTION 1: INSPECT
    # ═══════════════════════════════════════
    story.append(Paragraph("1. Dataset Inspection", styles["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10))

    if inspect_data:
        story.append(Paragraph(
            f"The dataset contains <b>{inspect_data.get('row_count', 0):,}</b> rows and "
            f"<b>{inspect_data.get('column_count', 0)}</b> columns. "
            f"<b>{len(inspect_data.get('detected_protected_attributes', []))}</b> protected "
            f"attribute(s) were identified: <b>{', '.join(inspect_data.get('detected_protected_attributes', []))}</b>.",
            styles["body"]
        ))

        # Warnings
        warnings = inspect_data.get("warnings", [])
        if warnings:
            story.append(Paragraph("1.1 Warnings", styles["h2"]))
            for w in warnings:
                story.append(Paragraph(f"⚠ {w}", ParagraphStyle(
                    "Warning", parent=styles["body"], textColor=ORANGE,
                )))

        # Group distributions
        distributions = inspect_data.get("group_distributions", [])
        if distributions:
            story.append(Paragraph("1.2 Group Distributions", styles["h2"]))
            story.append(Paragraph(
                "The following table shows the representation and positive outcome rate "
                "for each group within detected protected attributes.",
                styles["small"]
            ))

            # Group by attribute
            attrs = {}
            for d in distributions:
                attrs.setdefault(d["attribute"], []).append(d)

            for attr, groups in attrs.items():
                story.append(Paragraph(f"Protected Attribute: <b>{attr}</b>", styles["h3"]))
                table_data = [["Group", "Count", "Proportion", "Positive Rate"]]
                for g in groups:
                    table_data.append([
                        g["group"],
                        f'{g["count"]:,}',
                        f'{g["proportion"] * 100:.1f}%',
                        f'{g["positive_rate"] * 100:.1f}%',
                    ])
                story.append(_make_table(table_data, col_widths=[page_width * 0.35, page_width * 0.2, page_width * 0.22, page_width * 0.23]))
                story.append(Spacer(1, 8))

        # Proxy variables
        proxies = [p for p in inspect_data.get("proxy_variables", []) if p.get("is_proxy")]
        if proxies:
            story.append(Paragraph("1.3 Proxy Variables Detected", styles["h2"]))
            story.append(Paragraph(
                "Features with |correlation| > 0.3 to a protected attribute may encode "
                "protected information even if the attribute itself is excluded from the model.",
                styles["small"]
            ))
            table_data = [["Feature", "Protected Attribute", "Correlation", "Method"]]
            for p in proxies[:10]:
                table_data.append([
                    p["feature"], p["protected_attribute"],
                    f'|r| = {p["correlation"]:.3f}', p["correlation_type"],
                ])
            story.append(_make_table(table_data, col_widths=[page_width * 0.3, page_width * 0.25, page_width * 0.2, page_width * 0.25]))

        # Representation gaps
        gaps = [g for g in inspect_data.get("representation_gaps", []) if g.get("gap") is not None]
        if gaps:
            story.append(Paragraph("1.4 Representation Gaps", styles["h2"]))
            table_data = [["Attribute", "Group", "Dataset %", "Baseline %", "Gap"]]
            for g in gaps:
                gap_str = f'{g["gap"] * 100:+.1f}%' if g["gap"] is not None else "N/A"
                table_data.append([
                    g["attribute"], g["group"],
                    f'{g["dataset_proportion"] * 100:.1f}%',
                    f'{g["baseline_proportion"] * 100:.1f}%' if g["baseline_proportion"] else "N/A",
                    gap_str,
                ])
            story.append(_make_table(table_data))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    #  SECTION 2: MEASURE
    # ═══════════════════════════════════════
    story.append(Paragraph("2. Fairness Measurement", styles["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10))

    if measure_data:
        group_metrics = measure_data.get("group_metrics", [])
        total = sum(len(gm.get("metrics", [])) for gm in group_metrics)
        passing = sum(1 for gm in group_metrics for m in gm.get("metrics", []) if m.get("passed"))
        failing = total - passing

        story.append(Paragraph(
            f"<b>{total}</b> fairness metrics were computed across "
            f"<b>{len(group_metrics)}</b> protected attribute(s). "
            f"<font color='{GREEN.hexval()}'><b>{passing}</b> passed</font>, "
            f"<font color='{RED.hexval()}'><b>{failing}</b> failed</font>.",
            styles["body"]
        ))

        for gm in group_metrics:
            attr = gm.get("protected_attribute", "")
            priv = gm.get("privileged_group", "")
            unpriv = gm.get("unprivileged_group", "")

            story.append(Paragraph(f"2.x Protected Attribute: <b>{attr}</b>", styles["h2"]))
            story.append(Paragraph(
                f"Privileged group: <b>{priv}</b> &nbsp;|&nbsp; Unprivileged group: <b>{unpriv}</b>",
                styles["small"]
            ))

            table_data = [["Metric", "Value", "Threshold", "Status", "Formula"]]
            for m in gm.get("metrics", []):
                status = "PASS" if m.get("passed") else "FAIL"
                val = m.get("value", 0)
                table_data.append([
                    m.get("display_name", "")[:40],
                    f'{val:.4f}',
                    str(m.get("threshold", "")),
                    status,
                    m.get("formula", "")[:35],
                ])

            t = _make_table(table_data, col_widths=[
                page_width * 0.28, page_width * 0.12, page_width * 0.12,
                page_width * 0.10, page_width * 0.38,
            ])
            # Color the status column
            for row_idx in range(1, len(table_data)):
                status = table_data[row_idx][3]
                color = GREEN if status == "PASS" else RED
                t.setStyle(TableStyle([
                    ("TEXTCOLOR", (3, row_idx), (3, row_idx), color),
                    ("FONTNAME", (3, row_idx), (3, row_idx), "Helvetica-Bold"),
                ]))
            story.append(t)
            story.append(Spacer(1, 6))

            # Metric explanations
            story.append(Paragraph("Metric Explanations:", styles["h3"]))
            for m in gm.get("metrics", []):
                desc = m.get("description", "")
                if desc:
                    status_icon = "✅" if m.get("passed") else "❌"
                    story.append(Paragraph(
                        f"<b>{status_icon} {m.get('display_name', '')}</b>: {desc}",
                        styles["small"]
                    ))

        # Intersectional analysis
        intersectional = measure_data.get("intersectional_analysis", [])
        if intersectional:
            story.append(Paragraph("2.x Intersectional Analysis (NYC LL144)", styles["h2"]))
            story.append(Paragraph(
                "NYC Local Law 144 requires impact ratio computation for every intersectional "
                "subgroup (e.g., race × gender). Impact ratios below 0.8 indicate adverse impact.",
                styles["small"]
            ))
            sorted_inter = sorted(intersectional, key=lambda x: x.get("impact_ratio", 1))
            table_data = [["Group A", "Group B", "Selection Rate", "Impact Ratio", "Severity"]]
            for cell in sorted_inter[:15]:
                table_data.append([
                    cell.get("group_a_value", ""),
                    cell.get("group_b_value", ""),
                    f'{cell.get("selection_rate", 0) * 100:.1f}%',
                    f'{cell.get("impact_ratio", 0):.3f}',
                    cell.get("severity", "").upper(),
                ])
            t = _make_table(table_data)
            for row_idx in range(1, len(table_data)):
                sev = sorted_inter[row_idx - 1].get("severity", "low")
                t.setStyle(TableStyle([
                    ("TEXTCOLOR", (4, row_idx), (4, row_idx), SEVERITY_COLORS.get(sev, GRAY_TEXT)),
                    ("FONTNAME", (4, row_idx), (4, row_idx), "Helvetica-Bold"),
                ]))
            story.append(t)

        # Impossibility theorem
        note = measure_data.get("impossibility_note", "")
        if note:
            story.append(Spacer(1, 10))
            story.append(Paragraph(
                f"<b>Important Note:</b> {note}",
                ParagraphStyle("Note", parent=styles["small"], textColor=BRAND_BLUE),
            ))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    #  SECTION 3: FLAG
    # ═══════════════════════════════════════
    story.append(Paragraph("3. Bias Flagging & Risk Assessment", styles["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10))

    if flag_data:
        sc = flag_data.get("scorecard", {})
        sev = sc.get("overall_severity", "unknown")

        story.append(Paragraph(
            f'Overall Risk Level: <font size="13" color="{SEVERITY_COLORS.get(sev, GRAY_TEXT).hexval()}">'
            f'<b>{sev.upper()}</b></font>',
            styles["body"]
        ))
        story.append(Paragraph(sc.get("summary", ""), styles["body"]))

        # Stats
        story.append(Paragraph(
            f"Total flags: <b>{sc.get('total_flags', 0)}</b> &nbsp;|&nbsp; "
            f"Critical: <b>{sc.get('critical_flags', 0)}</b> &nbsp;|&nbsp; "
            f"High: <b>{sc.get('high_flags', 0)}</b> &nbsp;|&nbsp; "
            f"Medium: <b>{sc.get('medium_flags', 0)}</b> &nbsp;|&nbsp; "
            f"Low: <b>{sc.get('low_flags', 0)}</b>",
            styles["body"]
        ))

        # Compliance checks
        compliance = sc.get("compliance_checks", [])
        if compliance:
            story.append(Paragraph("3.1 Regulatory Compliance", styles["h2"]))
            table_data = [["Regulation", "Status", "Details"]]
            for c in compliance:
                table_data.append([
                    c["regulation"].replace("_", " "),
                    c["status"],
                    c["details"][:120],
                ])
            t = _make_table(table_data, col_widths=[page_width * 0.2, page_width * 0.1, page_width * 0.7])
            for row_idx in range(1, len(table_data)):
                status = compliance[row_idx - 1]["status"]
                color = GREEN if status == "PASS" else RED if status == "FAIL" else ORANGE
                t.setStyle(TableStyle([
                    ("TEXTCOLOR", (1, row_idx), (1, row_idx), color),
                    ("FONTNAME", (1, row_idx), (1, row_idx), "Helvetica-Bold"),
                ]))
            story.append(t)

        # Flags
        flags = sc.get("flags", [])
        if flags:
            story.append(Paragraph("3.2 Flagged Issues", styles["h2"]))
            sort_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
            sorted_flags = sorted(flags, key=lambda f: sort_order.get(f.get("severity"), 4))

            table_data = [["Severity", "Metric", "Attribute", "Value", "Threshold"]]
            for f in sorted_flags:
                table_data.append([
                    f.get("severity", "").upper(),
                    f.get("metric_name", "")[:30],
                    f.get("protected_attribute", ""),
                    f'{f.get("metric_value", 0):.4f}',
                    str(f.get("threshold", "")),
                ])
            t = _make_table(table_data, col_widths=[
                page_width * 0.13, page_width * 0.30, page_width * 0.17,
                page_width * 0.20, page_width * 0.20,
            ])
            for row_idx in range(1, len(table_data)):
                sev = sorted_flags[row_idx - 1].get("severity", "low")
                t.setStyle(TableStyle([
                    ("TEXTCOLOR", (0, row_idx), (0, row_idx), SEVERITY_COLORS.get(sev, GRAY_TEXT)),
                    ("FONTNAME", (0, row_idx), (0, row_idx), "Helvetica-Bold"),
                ]))
            story.append(t)

            # Flag details with descriptions and recommendations
            story.append(Spacer(1, 10))
            story.append(Paragraph("3.3 Detailed Findings & Recommendations", styles["h2"]))
            for f in sorted_flags:
                sev_color = SEVERITY_COLORS.get(f.get("severity"), GRAY_TEXT).hexval()
                story.append(Paragraph(
                    f'<font color="{sev_color}"><b>[{f.get("severity", "").upper()}]</b></font> '
                    f'<b>{f.get("metric_name", "")}</b> — {f.get("protected_attribute", "")}',
                    styles["body"]
                ))
                story.append(Paragraph(f.get("description", ""), styles["small"]))
                story.append(Paragraph(
                    f'<b>Recommendation:</b> {f.get("recommendation", "")}',
                    ParagraphStyle("Rec", parent=styles["small"], textColor=BRAND_BLUE),
                ))
                story.append(Spacer(1, 4))

        # Gemini explanation
        gemini = flag_data.get("gemini_explanation", "")
        if gemini:
            story.append(Paragraph("3.4 AI-Powered Explanation", styles["h2"]))
            story.append(Paragraph(gemini, styles["body"]))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    #  SECTION 4: FIX
    # ═══════════════════════════════════════
    story.append(Paragraph("4. Bias Mitigation Results", styles["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10))

    if fix_data:
        results = fix_data.get("results", [])
        recommended = fix_data.get("recommended_technique", "")

        story.append(Paragraph(
            f"<b>{len(results)}</b> mitigation technique(s) were applied and compared.",
            styles["body"]
        ))

        if fix_data.get("recommendation_reason"):
            story.append(Paragraph(
                f'<font color="{GREEN.hexval()}"><b>★ Recommended: '
                f'{recommended.replace("_", " ").upper()}</b></font>',
                styles["body"]
            ))
            story.append(Paragraph(fix_data["recommendation_reason"], styles["small"]))
            story.append(Spacer(1, 8))

        for ri, result in enumerate(results):
            is_rec = result.get("technique") == recommended
            tech_name = result.get("technique_display_name", "")
            rec_tag = " ★ RECOMMENDED" if is_rec else ""

            story.append(Paragraph(f"4.{ri + 1} {tech_name}{rec_tag}", styles["h2"]))

            # Accuracy stats
            story.append(Paragraph(
                f"Accuracy before: <b>{result.get('accuracy_before', 0)}%</b> &nbsp;→&nbsp; "
                f"After: <b>{result.get('accuracy_after', 0)}%</b> &nbsp;|&nbsp; "
                f"Cost: <b>{result.get('accuracy_cost', 0)}pp</b> &nbsp;|&nbsp; "
                f"Fairness improvement: <b>{result.get('overall_fairness_improvement', 0)}%</b>",
                styles["body"]
            ))

            # Metric comparison table
            comparisons = result.get("metric_comparisons", [])
            if comparisons:
                table_data = [["Metric", "Before", "After", "Change", "Status"]]
                for mc in comparisons:
                    imp = mc.get("improvement", 0)
                    status_after = "PASS" if mc.get("passed_after") else "FAIL"
                    table_data.append([
                        mc.get("metric_name", "").replace("_", " ")[:28],
                        f'{mc.get("before", 0):.4f}',
                        f'{mc.get("after", 0):.4f}',
                        f'{imp:+.1f}%',
                        status_after,
                    ])
                t = _make_table(table_data, col_widths=[
                    page_width * 0.32, page_width * 0.15, page_width * 0.15,
                    page_width * 0.18, page_width * 0.20,
                ])
                for row_idx in range(1, len(table_data)):
                    # Color the change column
                    imp = comparisons[row_idx - 1].get("improvement", 0)
                    t.setStyle(TableStyle([
                        ("TEXTCOLOR", (3, row_idx), (3, row_idx), GREEN if imp > 0 else RED),
                        ("FONTNAME", (3, row_idx), (3, row_idx), "Helvetica-Bold"),
                    ]))
                    # Color the status column
                    passed = comparisons[row_idx - 1].get("passed_after", False)
                    t.setStyle(TableStyle([
                        ("TEXTCOLOR", (4, row_idx), (4, row_idx), GREEN if passed else RED),
                        ("FONTNAME", (4, row_idx), (4, row_idx), "Helvetica-Bold"),
                    ]))
                story.append(t)

            notes = result.get("recommendation_notes", "")
            if notes:
                story.append(Paragraph(f"<i>{notes}</i>", styles["small"]))
            story.append(Spacer(1, 10))

        # Gemini explanation
        gemini = fix_data.get("gemini_explanation", "")
        if gemini:
            story.append(Paragraph("4.x AI-Powered Mitigation Analysis", styles["h2"]))
            story.append(Paragraph(gemini, styles["body"]))

    # ═══════════════════════════════════════
    #  FOOTER / DISCLAIMER
    # ═══════════════════════════════════════
    story.append(Spacer(1, 30))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY, spaceAfter=8))
    story.append(Paragraph(
        f"Generated by FairnessLens — AI Bias Detection & Mitigation Platform &nbsp;|&nbsp; {now}",
        styles["footer"]
    ))
    story.append(Paragraph(
        "This report is for informational purposes. Consult qualified professionals for legal compliance decisions.",
        styles["footer"]
    ))

    # ── Build PDF ──
    doc.build(story)
    buffer.seek(0)
    return buffer.read()