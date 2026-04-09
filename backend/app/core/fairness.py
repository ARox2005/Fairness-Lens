"""
Core Fairness Engine — AIF360 + Fairlearn Wrapper

Implements every fairness metric from the document:
1. Demographic Parity (Statistical Parity Difference)
2. Disparate Impact Ratio (four-fifths / 80% rule)
3. Equalized Odds (Average Absolute Odds Difference)
4. Equal Opportunity (Equal Opportunity Difference)
5. Predictive Parity (PPV difference)
6. Calibration
7. Individual Fairness (consistency / k-NN)
8. Counterfactual Fairness

Thresholds per document:
- Statistical Parity Difference: flag if |value| > 0.1
- Disparate Impact Ratio: flag if < 0.8 (four-fifths rule)
- Average Abs Odds Difference: flag if > 0.1
- Equal Opportunity Difference: flag if |value| > 0.1
- Predictive Parity Difference: flag if |value| > 0.1
- Counterfactual Unfairness: flag if > 0.05 (5%)

Risk categorization:
- Low:     DI >= 0.90
- Medium:  DI 0.80 – 0.90
- High:    DI 0.65 – 0.80
- Critical: DI < 0.65
"""

import numpy as np
import pandas as pd
from typing import Optional
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import accuracy_score, confusion_matrix
from app.models.schemas import (
    MetricResult, GroupMetrics, IntersectionalCell,
    SeverityLevel, MetricComparison
)


class FairnessEngine:
    """
    Stateless fairness computation engine.
    All methods are pure functions that take data in and return results out.
    """

    # ──────────────────────────────────────
    #  Threshold constants from the document
    # ──────────────────────────────────────
    STATISTICAL_PARITY_THRESHOLD = 0.1
    DISPARATE_IMPACT_THRESHOLD = 0.8  # Four-fifths rule
    EQUALIZED_ODDS_THRESHOLD = 0.1
    EQUAL_OPPORTUNITY_THRESHOLD = 0.1
    PREDICTIVE_PARITY_THRESHOLD = 0.1
    COUNTERFACTUAL_THRESHOLD = 0.05
    PROXY_CORRELATION_THRESHOLD = 0.3

    # Risk categorization boundaries
    DI_LOW_THRESHOLD = 0.90
    DI_MEDIUM_THRESHOLD = 0.80
    DI_HIGH_THRESHOLD = 0.65

    @staticmethod
    def compute_selection_rates(
        y: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> tuple[float, float]:
        """
        Compute selection (positive prediction) rates for privileged
        and unprivileged groups.

        Returns: (unprivileged_rate, privileged_rate)
        """
        priv_mask = protected == privileged_value
        unpriv_mask = ~priv_mask

        priv_positive = np.sum(y[priv_mask] == favorable_label)
        priv_total = np.sum(priv_mask)
        unpriv_positive = np.sum(y[unpriv_mask] == favorable_label)
        unpriv_total = np.sum(unpriv_mask)

        priv_rate = priv_positive / priv_total if priv_total > 0 else 0.0
        unpriv_rate = unpriv_positive / unpriv_total if unpriv_total > 0 else 0.0

        return unpriv_rate, priv_rate

    @classmethod
    def statistical_parity_difference(
        cls,
        y: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> MetricResult:
        """
        Demographic Parity / Statistical Parity Difference

        Formula: P(Ŷ=1 | A=unprivileged) - P(Ŷ=1 | A=privileged)
        Perfect parity = 0
        Threshold: flag if |value| > 0.1
        """
        unpriv_rate, priv_rate = cls.compute_selection_rates(
            y, protected, privileged_value, favorable_label
        )
        spd = unpriv_rate - priv_rate

        return MetricResult(
            metric_name="statistical_parity_difference",
            display_name="Statistical Parity Difference",
            value=round(spd, 4),
            threshold=cls.STATISTICAL_PARITY_THRESHOLD,
            passed=abs(spd) <= cls.STATISTICAL_PARITY_THRESHOLD,
            description=(
                "Measures whether the positive outcome rate is equal across groups. "
                "A value of 0 indicates perfect parity."
            ),
            formula="P(Ŷ=1|A=unprivileged) − P(Ŷ=1|A=privileged)",
        )

    @classmethod
    def disparate_impact_ratio(
        cls,
        y: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> MetricResult:
        """
        Disparate Impact Ratio — EEOC's Four-Fifths (80%) Rule

        Formula: DI = selection_rate(unprivileged) / selection_rate(privileged)
        A ratio below 0.8 constitutes adverse impact under US employment law.
        This is the primary metric required by NYC Local Law 144.
        """
        unpriv_rate, priv_rate = cls.compute_selection_rates(
            y, protected, privileged_value, favorable_label
        )
        di = unpriv_rate / priv_rate if priv_rate > 0 else 0.0

        return MetricResult(
            metric_name="disparate_impact_ratio",
            display_name="Disparate Impact Ratio (Four-Fifths Rule)",
            value=round(di, 4),
            threshold=cls.DISPARATE_IMPACT_THRESHOLD,
            passed=di >= cls.DISPARATE_IMPACT_THRESHOLD,
            description=(
                "The EEOC four-fifths rule: selection rate for any protected group "
                "must be at least 80% of the rate for the most-selected group. "
                "A ratio below 0.8 constitutes adverse impact."
            ),
            formula="selection_rate(unprivileged) / selection_rate(privileged)",
        )

    @classmethod
    def equalized_odds_difference(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> MetricResult:
        """
        Equalized Odds — Average Absolute Odds Difference

        Requires equal TPR and FPR across groups:
        P(Ŷ=1|Y=1,A=a) = P(Ŷ=1|Y=1,A=b) AND
        P(Ŷ=1|Y=0,A=a) = P(Ŷ=1|Y=0,A=b)

        Measured as average of |TPR_diff| and |FPR_diff|.
        Threshold: flag if > 0.1
        """
        priv_mask = protected == privileged_value
        unpriv_mask = ~priv_mask

        # TPR for each group
        priv_tpr = cls._true_positive_rate(y_true[priv_mask], y_pred[priv_mask], favorable_label)
        unpriv_tpr = cls._true_positive_rate(y_true[unpriv_mask], y_pred[unpriv_mask], favorable_label)

        # FPR for each group
        priv_fpr = cls._false_positive_rate(y_true[priv_mask], y_pred[priv_mask], favorable_label)
        unpriv_fpr = cls._false_positive_rate(y_true[unpriv_mask], y_pred[unpriv_mask], favorable_label)

        tpr_diff = abs(unpriv_tpr - priv_tpr)
        fpr_diff = abs(unpriv_fpr - priv_fpr)
        avg_odds_diff = (tpr_diff + fpr_diff) / 2.0

        return MetricResult(
            metric_name="average_odds_difference",
            display_name="Average Absolute Odds Difference (Equalized Odds)",
            value=round(avg_odds_diff, 4),
            threshold=cls.EQUALIZED_ODDS_THRESHOLD,
            passed=avg_odds_diff <= cls.EQUALIZED_ODDS_THRESHOLD,
            description=(
                "Strongest group fairness criterion. Requires equal TPR and FPR "
                "across groups. Best for domains where both false positives and "
                "false negatives carry serious costs."
            ),
            formula="0.5 × (|TPR_unpriv − TPR_priv| + |FPR_unpriv − FPR_priv|)",
        )

    @classmethod
    def equal_opportunity_difference(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> MetricResult:
        """
        Equal Opportunity Difference

        Relaxation of equalized odds — only requires equal TPR:
        P(Ŷ=1|Y=1,A=a) = P(Ŷ=1|Y=1,A=b)

        Ensures qualified individuals in all groups have the same chance
        of being correctly identified.
        Threshold: flag if |value| > 0.1
        """
        priv_mask = protected == privileged_value
        unpriv_mask = ~priv_mask

        priv_tpr = cls._true_positive_rate(y_true[priv_mask], y_pred[priv_mask], favorable_label)
        unpriv_tpr = cls._true_positive_rate(y_true[unpriv_mask], y_pred[unpriv_mask], favorable_label)

        eod = unpriv_tpr - priv_tpr

        return MetricResult(
            metric_name="equal_opportunity_difference",
            display_name="Equal Opportunity Difference",
            value=round(eod, 4),
            threshold=cls.EQUAL_OPPORTUNITY_THRESHOLD,
            passed=abs(eod) <= cls.EQUAL_OPPORTUNITY_THRESHOLD,
            description=(
                "Ensures qualified individuals in all groups have the same chance "
                "of being correctly identified. Best for hiring and loan approvals "
                "where we care that deserving candidates aren't missed."
            ),
            formula="TPR_unprivileged − TPR_privileged",
        )

    @classmethod
    def predictive_parity_difference(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label
    ) -> MetricResult:
        """
        Predictive Parity — PPV Difference

        Requires equal Positive Predictive Value across groups:
        P(Y=1|Ŷ=1,A=a) = P(Y=1|Ŷ=1,A=b)

        This was COMPAS creator Northpointe's defense — their tool
        had equal PPV across races.
        Threshold: flag if |value| > 0.1
        """
        priv_mask = protected == privileged_value
        unpriv_mask = ~priv_mask

        priv_ppv = cls._positive_predictive_value(
            y_true[priv_mask], y_pred[priv_mask], favorable_label
        )
        unpriv_ppv = cls._positive_predictive_value(
            y_true[unpriv_mask], y_pred[unpriv_mask], favorable_label
        )

        ppv_diff = unpriv_ppv - priv_ppv

        return MetricResult(
            metric_name="predictive_parity_difference",
            display_name="Predictive Parity Difference",
            value=round(ppv_diff, 4),
            threshold=cls.PREDICTIVE_PARITY_THRESHOLD,
            passed=abs(ppv_diff) <= cls.PREDICTIVE_PARITY_THRESHOLD,
            description=(
                "Requires equal precision (PPV) across groups. "
                "Among those predicted positive, equal fractions should truly be positive."
            ),
            formula="PPV_unprivileged − PPV_privileged",
        )

    @classmethod
    def calibration_difference(
        cls,
        y_true: np.ndarray,
        y_scores: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label,
        n_bins: int = 10
    ) -> MetricResult:
        """
        Calibration Difference

        Among all individuals assigned a risk score of p, the fraction who
        actually experience the outcome should be p, regardless of group.
        Stronger version of predictive parity.

        Computed as average absolute difference in calibration across bins.
        """
        priv_mask = protected == privileged_value
        unpriv_mask = ~priv_mask

        priv_cal = cls._calibration_error(
            y_true[priv_mask], y_scores[priv_mask], favorable_label, n_bins
        )
        unpriv_cal = cls._calibration_error(
            y_true[unpriv_mask], y_scores[unpriv_mask], favorable_label, n_bins
        )

        cal_diff = abs(priv_cal - unpriv_cal)

        return MetricResult(
            metric_name="calibration_difference",
            display_name="Calibration Difference",
            value=round(cal_diff, 4),
            threshold=0.1,
            passed=cal_diff <= 0.1,
            description=(
                "Measures whether probability estimates are equally accurate "
                "across groups. Important for credit scoring and risk assessment."
            ),
            formula="|ECE_privileged − ECE_unprivileged|",
        )

    @classmethod
    def individual_fairness_score(
        cls,
        X: np.ndarray,
        y_pred: np.ndarray,
        k: int = 5
    ) -> MetricResult:
        """
        Individual Fairness — Consistency Score (k-NN approximation)

        Similar individuals should receive similar predictions:
        d(f(x), f(x')) ≤ L·d(x, x')

        Approximated by checking whether each individual's k nearest
        neighbors receive the same prediction. Score = fraction of
        individuals whose k-NN all share the same prediction.
        """
        nn = NearestNeighbors(n_neighbors=k + 1, metric='euclidean')
        nn.fit(X)
        distances, indices = nn.kneighbors(X)

        # For each point, check if its k neighbors have the same prediction
        consistent = 0
        for i in range(len(y_pred)):
            neighbor_preds = y_pred[indices[i][1:]]  # exclude self
            if np.all(neighbor_preds == y_pred[i]):
                consistent += 1

        consistency = consistent / len(y_pred) if len(y_pred) > 0 else 0.0

        return MetricResult(
            metric_name="individual_fairness_consistency",
            display_name="Individual Fairness (Consistency Score)",
            value=round(consistency, 4),
            threshold=0.7,  # higher is better
            passed=consistency >= 0.7,
            description=(
                "Measures whether similar individuals receive similar predictions. "
                "Approximated using k-nearest neighbors consistency. "
                "Higher is better (1.0 = perfectly consistent)."
            ),
            formula="fraction of individuals whose k-NN share the same prediction",
        )

    @classmethod
    def counterfactual_fairness_score(
        cls,
        model,
        X: pd.DataFrame,
        protected_attribute: str,
        y_pred: np.ndarray
    ) -> MetricResult:
        """
        Counterfactual Fairness

        Would the prediction change if we flipped only the protected attribute?
        Create counterfactual copies with the protected attribute changed,
        run predictions on both, measure divergence.

        Unfairness score > 5% indicates direct sensitivity to protected attribute.
        """
        X_counterfactual = X.copy()

        # Flip the protected attribute
        unique_vals = X[protected_attribute].unique()
        if len(unique_vals) == 2:
            val_map = {unique_vals[0]: unique_vals[1], unique_vals[1]: unique_vals[0]}
            X_counterfactual[protected_attribute] = X[protected_attribute].map(val_map)
        else:
            # For multi-class, shift to next value cyclically
            val_list = sorted(unique_vals)
            val_map = {val_list[i]: val_list[(i + 1) % len(val_list)] for i in range(len(val_list))}
            X_counterfactual[protected_attribute] = X[protected_attribute].map(val_map)

        try:
            y_counterfactual = model.predict(X_counterfactual)
            flip_rate = np.mean(y_pred != y_counterfactual)
        except Exception:
            flip_rate = -1.0  # model doesn't support this

        return MetricResult(
            metric_name="counterfactual_fairness",
            display_name="Counterfactual Fairness (Flip Rate)",
            value=round(flip_rate, 4),
            threshold=cls.COUNTERFACTUAL_THRESHOLD,
            passed=flip_rate <= cls.COUNTERFACTUAL_THRESHOLD if flip_rate >= 0 else True,
            description=(
                "Measures if predictions change when only the protected attribute is flipped. "
                "A flip rate > 5% indicates the model is directly sensitive to the protected attribute."
            ),
            formula="fraction of predictions that change when protected attribute is flipped",
        )

    # ──────────────────────────────────────
    #  Compute ALL group metrics at once
    # ──────────────────────────────────────

    @classmethod
    def compute_all_group_metrics(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        protected: np.ndarray,
        privileged_value,
        favorable_label,
        unprivileged_label: str = "",
        privileged_label: str = "",
        y_scores: Optional[np.ndarray] = None,
    ) -> GroupMetrics:
        """
        Compute all 6 group fairness metrics for a single protected attribute.
        """
        metrics = []

        # 1. Statistical Parity Difference
        metrics.append(cls.statistical_parity_difference(
            y_pred, protected, privileged_value, favorable_label
        ))

        # 2. Disparate Impact Ratio
        metrics.append(cls.disparate_impact_ratio(
            y_pred, protected, privileged_value, favorable_label
        ))

        # 3. Equalized Odds
        metrics.append(cls.equalized_odds_difference(
            y_true, y_pred, protected, privileged_value, favorable_label
        ))

        # 4. Equal Opportunity
        metrics.append(cls.equal_opportunity_difference(
            y_true, y_pred, protected, privileged_value, favorable_label
        ))

        # 5. Predictive Parity
        metrics.append(cls.predictive_parity_difference(
            y_true, y_pred, protected, privileged_value, favorable_label
        ))

        # 6. Calibration (if scores available)
        if y_scores is not None:
            metrics.append(cls.calibration_difference(
                y_true, y_scores, protected, privileged_value, favorable_label
            ))

        return GroupMetrics(
            protected_attribute=str(protected.dtype),
            privileged_group=privileged_label or str(privileged_value),
            unprivileged_group=unprivileged_label or f"Not {privileged_value}",
            metrics=metrics,
        )

    # ──────────────────────────────────────
    #  Intersectional Analysis
    # ──────────────────────────────────────

    @classmethod
    def compute_intersectional_analysis(
        cls,
        df: pd.DataFrame,
        protected_attrs: list[str],
        label_column: str,
        favorable_label,
    ) -> list[IntersectionalCell]:
        """
        Compute intersectional fairness (e.g., race × gender).
        Required by NYC LL144 for every subgroup combination.
        Returns impact ratios for each subgroup pair.
        """
        if len(protected_attrs) < 2:
            return []

        cells = []
        attr_a, attr_b = protected_attrs[0], protected_attrs[1]

        # Overall positive rate as reference
        overall_rate = (df[label_column] == favorable_label).mean()
        if overall_rate == 0:
            return []

        # Find the maximum selection rate across all subgroups
        max_rate = 0.0
        subgroup_rates = {}
        for val_a in df[attr_a].unique():
            for val_b in df[attr_b].unique():
                mask = (df[attr_a] == val_a) & (df[attr_b] == val_b)
                subset = df[mask]
                if len(subset) < 5:  # skip tiny groups
                    continue
                rate = (subset[label_column] == favorable_label).mean()
                subgroup_rates[(val_a, val_b)] = rate
                max_rate = max(max_rate, rate)

        if max_rate == 0:
            return []

        # Compute impact ratios relative to max rate
        for (val_a, val_b), rate in subgroup_rates.items():
            impact_ratio = rate / max_rate
            severity = cls.classify_severity(impact_ratio)
            cells.append(IntersectionalCell(
                group_a_attr=attr_a,
                group_a_value=str(val_a),
                group_b_attr=attr_b,
                group_b_value=str(val_b),
                selection_rate=round(rate, 4),
                impact_ratio=round(impact_ratio, 4),
                severity=severity,
            ))

        return cells

    # ──────────────────────────────────────
    #  Risk Classification
    # ──────────────────────────────────────

    @classmethod
    def classify_severity(cls, di_ratio: float) -> SeverityLevel:
        """
        Map disparate impact ratio to severity level.

        From the document:
        - Low:      DI >= 0.90 (minor deviation, monitor)
        - Medium:   DI 0.80–0.90 (approaching 4/5ths, investigate)
        - High:     DI 0.65–0.80 (violates 4/5ths rule, immediate mitigation)
        - Critical: DI < 0.65 (severe disparate impact, halt deployment)
        """
        if di_ratio >= cls.DI_LOW_THRESHOLD:
            return SeverityLevel.LOW
        elif di_ratio >= cls.DI_MEDIUM_THRESHOLD:
            return SeverityLevel.MEDIUM
        elif di_ratio >= cls.DI_HIGH_THRESHOLD:
            return SeverityLevel.HIGH
        else:
            return SeverityLevel.CRITICAL

    @classmethod
    def get_impossibility_note(cls) -> str:
        """
        Return the impossibility theorem note from the document.
        Chouldechova (2017) and Kleinberg et al. (2016).
        """
        return (
            "IMPOSSIBILITY THEOREM: Chouldechova (2017) and Kleinberg et al. (2016) "
            "proved that when base rates differ between groups, it is mathematically "
            "impossible to simultaneously satisfy calibration, predictive parity, and "
            "equalized odds. This platform lets you choose which definition to prioritize "
            "based on your domain context."
        )

    # ──────────────────────────────────────
    #  Before/After Metric Comparison
    # ──────────────────────────────────────

    @classmethod
    def compare_metrics(
        cls,
        before_metrics: list[MetricResult],
        after_metrics: list[MetricResult],
    ) -> list[MetricComparison]:
        """
        Generate before/after metric comparisons for the Fix phase.
        """
        comparisons = []
        after_map = {m.metric_name: m for m in after_metrics}

        for before in before_metrics:
            after = after_map.get(before.metric_name)
            if after is None:
                continue

            # For DI ratio, improvement means moving toward 1.0
            if before.metric_name == "disparate_impact_ratio":
                improvement = ((after.value - before.value) / (1.0 - before.value) * 100
                               if before.value < 1.0 else 0.0)
            # For difference metrics, improvement means moving toward 0
            else:
                improvement = ((abs(before.value) - abs(after.value)) / abs(before.value) * 100
                               if abs(before.value) > 0 else 0.0)

            comparisons.append(MetricComparison(
                metric_name=before.metric_name,
                before=before.value,
                after=after.value,
                improvement=round(improvement, 2),
                passed_before=before.passed,
                passed_after=after.passed,
            ))

        return comparisons

    # ──────────────────────────────────────
    #  Private helper methods
    # ──────────────────────────────────────

    @staticmethod
    def _true_positive_rate(y_true, y_pred, favorable_label) -> float:
        """TPR = TP / (TP + FN)"""
        positives = y_true == favorable_label
        if np.sum(positives) == 0:
            return 0.0
        return np.sum((y_pred == favorable_label) & positives) / np.sum(positives)

    @staticmethod
    def _false_positive_rate(y_true, y_pred, favorable_label) -> float:
        """FPR = FP / (FP + TN)"""
        negatives = y_true != favorable_label
        if np.sum(negatives) == 0:
            return 0.0
        return np.sum((y_pred == favorable_label) & negatives) / np.sum(negatives)

    @staticmethod
    def _positive_predictive_value(y_true, y_pred, favorable_label) -> float:
        """PPV = TP / (TP + FP)"""
        predicted_positive = y_pred == favorable_label
        if np.sum(predicted_positive) == 0:
            return 0.0
        return np.sum((y_true == favorable_label) & predicted_positive) / np.sum(predicted_positive)

    @staticmethod
    def _calibration_error(y_true, y_scores, favorable_label, n_bins=10) -> float:
        """Expected Calibration Error (ECE)"""
        y_binary = (y_true == favorable_label).astype(float)

        if len(y_scores) == 0:
            return 0.0

        bin_edges = np.linspace(0, 1, n_bins + 1)
        ece = 0.0
        for i in range(n_bins):
            mask = (y_scores >= bin_edges[i]) & (y_scores < bin_edges[i + 1])
            if np.sum(mask) == 0:
                continue
            bin_acc = np.mean(y_binary[mask])
            bin_conf = np.mean(y_scores[mask])
            ece += np.sum(mask) * abs(bin_acc - bin_conf)

        return ece / len(y_scores) if len(y_scores) > 0 else 0.0
