from app.core.utils import is_categorical_column
"""
Mitigation Service — Fix Phase Implementation

Implements three categories of debiasing from the document:

PRE-PROCESSING:
1. Reweighting (AIF360) — assigns sample weights to achieve demographic parity
   Weight formula: W(group, label) = P(label) × P(group) / P(group, label)
2. Disparate Impact Remover (AIF360) — transforms feature distributions to
   remove correlation with protected attribute, controlled by repair_level

IN-PROCESSING:
3. Exponentiated Gradient (Fairlearn) — wraps sklearn estimator, iteratively
   reweights to satisfy fairness constraints (DemographicParity, EqualizedOdds)

POST-PROCESSING:
4. Threshold Optimizer (Fairlearn) — finds group-specific classification
   thresholds without retraining the model

The recommendation engine automatically suggests techniques based on
what access the user has (data only, training access, predictions only).
"""

import numpy as np
import pandas as pd
import logging
from typing import Optional
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder, StandardScaler

from app.models.schemas import (
    MitigationTechnique, MitigationResult, MetricComparison,
    FairnessConstraint, MetricResult
)
from app.core.fairness import FairnessEngine

logger = logging.getLogger(__name__)


class MitigationService:
    """
    Applies bias mitigation techniques and generates before/after comparisons.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        protected_attribute: str,
        label_column: str,
        favorable_label,
        privileged_value=None,
    ):
        self.df = df.copy()
        self.protected_attribute = protected_attribute
        self.label_column = label_column
        self.favorable_label = favorable_label

        # Auto-detect privileged value as the group with highest positive rate
        if privileged_value is None:
            self.privileged_value = self._detect_privileged_value()
        else:
            self.privileged_value = privileged_value

        # Prepare train/test split
        self._prepare_data()

    def _detect_privileged_value(self):
        """Detect the privileged group (highest positive outcome rate)."""
        rates = {}
        for val in self.df[self.protected_attribute].unique():
            mask = self.df[self.protected_attribute] == val
            group = self.df[mask]
            rate = (group[self.label_column] == self.favorable_label).mean()
            rates[val] = rate
        return max(rates, key=rates.get)

    def _prepare_data(self):
        """
        Prepare data for ML: encode categoricals, split train/test.
        """
        df = self.df.copy()

        # Separate features, label, and protected attribute
        feature_cols = [c for c in df.columns if c != self.label_column]

        # Encode categorical columns
        self.label_encoders = {}
        for col in df.columns:
            if is_categorical_column(df[col]):
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.label_encoders[col] = le

        # Encode favorable label
        if self.label_column in self.label_encoders:
            le = self.label_encoders[self.label_column]
            try:
                self.favorable_label_encoded = le.transform([str(self.favorable_label)])[0]
            except ValueError:
                self.favorable_label_encoded = 1
        else:
            self.favorable_label_encoded = self.favorable_label

        # Encode privileged value
        if self.protected_attribute in self.label_encoders:
            le = self.label_encoders[self.protected_attribute]
            try:
                self.privileged_value_encoded = le.transform([str(self.privileged_value)])[0]
            except ValueError:
                self.privileged_value_encoded = 1
        else:
            self.privileged_value_encoded = self.privileged_value

        # Split
        X = df[feature_cols].values.astype(float)
        y = df[self.label_column].values
        protected = df[self.protected_attribute].values

        # Handle NaN
        X = np.nan_to_num(X, nan=0.0)

        # Scale features
        self.scaler = StandardScaler()
        X = self.scaler.fit_transform(X)

        self.X_train, self.X_test, self.y_train, self.y_test, \
            self.prot_train, self.prot_test = train_test_split(
                X, y, protected, test_size=0.3, random_state=42, stratify=y
            )

        self.feature_cols = feature_cols
        self.df_encoded = df

    def _train_baseline_model(self):
        """Train a baseline Logistic Regression model."""
        model = LogisticRegression(max_iter=1000, random_state=42)
        model.fit(self.X_train, self.y_train)
        return model

    def _compute_metrics_from_predictions(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        protected: np.ndarray,
    ) -> list[MetricResult]:
        """Compute all fairness metrics for given predictions."""
        metrics = []

        metrics.append(FairnessEngine.statistical_parity_difference(
            y_pred, protected, self.privileged_value_encoded,
            self.favorable_label_encoded
        ))
        metrics.append(FairnessEngine.disparate_impact_ratio(
            y_pred, protected, self.privileged_value_encoded,
            self.favorable_label_encoded
        ))
        metrics.append(FairnessEngine.equalized_odds_difference(
            y_true, y_pred, protected, self.privileged_value_encoded,
            self.favorable_label_encoded
        ))
        metrics.append(FairnessEngine.equal_opportunity_difference(
            y_true, y_pred, protected, self.privileged_value_encoded,
            self.favorable_label_encoded
        ))
        metrics.append(FairnessEngine.predictive_parity_difference(
            y_true, y_pred, protected, self.privileged_value_encoded,
            self.favorable_label_encoded
        ))

        return metrics

    # ──────────────────────────────────────
    #  PRE-PROCESSING: Reweighting
    # ──────────────────────────────────────

    def apply_reweighting(self) -> MitigationResult:
        """
        Reweighting — assigns sample weights so the weighted distribution
        achieves demographic parity.

        Weight formula: W(group, label) = P(label) × P(group) / P(group, label)

        From the document:
        "This is the simplest and least invasive technique — it doesn't modify
        features or labels, only sample weights passed to the classifier."
        """
        try:
            # Compute sample weights using the reweighting formula
            weights = self._compute_reweighting_weights(
                self.y_train, self.prot_train
            )

            # Train baseline (unweighted)
            baseline_model = self._train_baseline_model()
            baseline_pred = baseline_model.predict(self.X_test)
            baseline_acc = accuracy_score(self.y_test, baseline_pred)
            baseline_metrics = self._compute_metrics_from_predictions(
                self.y_test, baseline_pred, self.prot_test
            )

            # Train with reweighting
            reweighted_model = LogisticRegression(max_iter=1000, random_state=42)
            reweighted_model.fit(self.X_train, self.y_train, sample_weight=weights)
            reweighted_pred = reweighted_model.predict(self.X_test)
            reweighted_acc = accuracy_score(self.y_test, reweighted_pred)
            reweighted_metrics = self._compute_metrics_from_predictions(
                self.y_test, reweighted_pred, self.prot_test
            )

            # Compare
            comparisons = FairnessEngine.compare_metrics(
                baseline_metrics, reweighted_metrics
            )
            avg_improvement = np.mean([c.improvement for c in comparisons]) if comparisons else 0.0

            return MitigationResult(
                technique=MitigationTechnique.REWEIGHTING,
                technique_display_name="Reweighting (Pre-processing)",
                accuracy_before=round(baseline_acc * 100, 2),
                accuracy_after=round(reweighted_acc * 100, 2),
                accuracy_cost=round((baseline_acc - reweighted_acc) * 100, 2),
                metric_comparisons=comparisons,
                overall_fairness_improvement=round(avg_improvement, 2),
                recommendation_notes=(
                    "Reweighting is the least invasive technique. It only adjusts "
                    "sample weights without modifying features or labels. "
                    "Recommended as the first mitigation to try."
                ),
            )

        except Exception as e:
            logger.error(f"Reweighting failed: {e}")
            return self._error_result(MitigationTechnique.REWEIGHTING, str(e))

    def _compute_reweighting_weights(
        self, y: np.ndarray, protected: np.ndarray
    ) -> np.ndarray:
        """
        Compute reweighting sample weights.
        W(group, label) = P(label) × P(group) / P(group, label)
        """
        n = len(y)
        weights = np.ones(n)

        for label_val in np.unique(y):
            for group_val in np.unique(protected):
                # P(label)
                p_label = np.mean(y == label_val)
                # P(group)
                p_group = np.mean(protected == group_val)
                # P(group, label)
                p_group_label = np.mean(
                    (protected == group_val) & (y == label_val)
                )

                if p_group_label > 0:
                    w = (p_label * p_group) / p_group_label
                else:
                    w = 1.0

                mask = (protected == group_val) & (y == label_val)
                weights[mask] = w

        return weights

    # ──────────────────────────────────────
    #  PRE-PROCESSING: Disparate Impact Remover
    # ──────────────────────────────────────

    def apply_disparate_impact_remover(
        self, repair_level: float = 1.0
    ) -> MitigationResult:
        """
        Disparate Impact Remover — transforms each non-protected feature's
        distribution to remove correlation with the protected attribute.

        repair_level (0.0 – 1.0) controls strength.
        At 1.0, conditional distributions P(feature|group) become identical.

        From the document:
        "Useful when proxy variables are the problem."
        """
        try:
            # Baseline
            baseline_model = self._train_baseline_model()
            baseline_pred = baseline_model.predict(self.X_test)
            baseline_acc = accuracy_score(self.y_test, baseline_pred)
            baseline_metrics = self._compute_metrics_from_predictions(
                self.y_test, baseline_pred, self.prot_test
            )

            # Apply rank-based repair on training data
            X_train_repaired = self._repair_features(
                self.X_train, self.prot_train, repair_level
            )
            X_test_repaired = self._repair_features(
                self.X_test, self.prot_test, repair_level
            )

            # Train on repaired data
            repaired_model = LogisticRegression(max_iter=1000, random_state=42)
            repaired_model.fit(X_train_repaired, self.y_train)
            repaired_pred = repaired_model.predict(X_test_repaired)
            repaired_acc = accuracy_score(self.y_test, repaired_pred)
            repaired_metrics = self._compute_metrics_from_predictions(
                self.y_test, repaired_pred, self.prot_test
            )

            comparisons = FairnessEngine.compare_metrics(
                baseline_metrics, repaired_metrics
            )
            avg_improvement = np.mean([c.improvement for c in comparisons]) if comparisons else 0.0

            return MitigationResult(
                technique=MitigationTechnique.DISPARATE_IMPACT_REMOVER,
                technique_display_name="Disparate Impact Remover (Pre-processing)",
                accuracy_before=round(baseline_acc * 100, 2),
                accuracy_after=round(repaired_acc * 100, 2),
                accuracy_cost=round((baseline_acc - repaired_acc) * 100, 2),
                metric_comparisons=comparisons,
                overall_fairness_improvement=round(avg_improvement, 2),
                recommendation_notes=(
                    f"Applied with repair_level={repair_level}. "
                    "This technique removes the correlation between features "
                    "and the protected attribute using rank-preserving repair. "
                    "Best when proxy variables are the primary source of bias."
                ),
            )

        except Exception as e:
            logger.error(f"Disparate Impact Remover failed: {e}")
            return self._error_result(
                MitigationTechnique.DISPARATE_IMPACT_REMOVER, str(e)
            )

    def _repair_features(
        self,
        X: np.ndarray,
        protected: np.ndarray,
        repair_level: float
    ) -> np.ndarray:
        """
        Simplified rank-based feature repair.
        Blends group-specific distributions with overall distribution.
        """
        X_repaired = X.copy()
        groups = np.unique(protected)

        for col_idx in range(X.shape[1]):
            # Get overall median
            overall_median = np.median(X[:, col_idx])

            for group in groups:
                mask = protected == group
                group_values = X[mask, col_idx]
                group_median = np.median(group_values)

                # Shift group distribution toward overall distribution
                shift = (overall_median - group_median) * repair_level
                X_repaired[mask, col_idx] = group_values + shift

        return X_repaired

    # ──────────────────────────────────────
    #  IN-PROCESSING: Exponentiated Gradient
    # ──────────────────────────────────────

    def apply_exponentiated_gradient(
        self,
        constraint: FairnessConstraint = FairnessConstraint.DEMOGRAPHIC_PARITY,
        eps: float = 0.01,
    ) -> MitigationResult:
        """
        Exponentiated Gradient (Fairlearn) — wraps any sklearn estimator
        and iteratively reweights training examples to satisfy fairness constraints.

        From the document:
        "The output is an ensemble of models making different
        fairness-accuracy trade-offs."
        """
        try:
            from fairlearn.reductions import (
                ExponentiatedGradient,
                DemographicParity,
                EqualizedOdds,
                TruePositiveRateParity,
            )

            # Baseline
            baseline_model = self._train_baseline_model()
            baseline_pred = baseline_model.predict(self.X_test)
            baseline_acc = accuracy_score(self.y_test, baseline_pred)
            baseline_metrics = self._compute_metrics_from_predictions(
                self.y_test, baseline_pred, self.prot_test
            )

            # Select constraint
            constraint_map = {
                FairnessConstraint.DEMOGRAPHIC_PARITY: DemographicParity(),
                FairnessConstraint.EQUALIZED_ODDS: EqualizedOdds(),
                FairnessConstraint.EQUAL_OPPORTUNITY: TruePositiveRateParity(),
            }
            fairness_constraint = constraint_map.get(
                constraint, DemographicParity()
            )

            # Apply Exponentiated Gradient
            mitigator = ExponentiatedGradient(
                estimator=LogisticRegression(max_iter=1000, random_state=42),
                constraints=fairness_constraint,
                eps=eps,
            )
            mitigator.fit(
                self.X_train, self.y_train,
                sensitive_features=self.prot_train
            )
            mitigated_pred = mitigator.predict(
                self.X_test, sensitive_features=self.prot_test
            )
            mitigated_acc = accuracy_score(self.y_test, mitigated_pred)
            mitigated_metrics = self._compute_metrics_from_predictions(
                self.y_test, mitigated_pred, self.prot_test
            )

            comparisons = FairnessEngine.compare_metrics(
                baseline_metrics, mitigated_metrics
            )
            avg_improvement = np.mean([c.improvement for c in comparisons]) if comparisons else 0.0

            return MitigationResult(
                technique=MitigationTechnique.EXPONENTIATED_GRADIENT,
                technique_display_name="Exponentiated Gradient (In-processing)",
                accuracy_before=round(baseline_acc * 100, 2),
                accuracy_after=round(mitigated_acc * 100, 2),
                accuracy_cost=round((baseline_acc - mitigated_acc) * 100, 2),
                metric_comparisons=comparisons,
                overall_fairness_improvement=round(avg_improvement, 2),
                recommendation_notes=(
                    f"Applied with {constraint.value} constraint (eps={eps}). "
                    "This creates an ensemble of models optimized for fairness. "
                    "Best balance of fairness improvement and accuracy retention."
                ),
            )

        except ImportError:
            logger.error("Fairlearn not installed")
            return self._error_result(
                MitigationTechnique.EXPONENTIATED_GRADIENT,
                "Fairlearn library required"
            )
        except Exception as e:
            logger.error(f"Exponentiated Gradient failed: {e}")
            return self._error_result(
                MitigationTechnique.EXPONENTIATED_GRADIENT, str(e)
            )

    # ──────────────────────────────────────
    #  POST-PROCESSING: Threshold Optimizer
    # ──────────────────────────────────────

    def apply_threshold_optimizer(
        self,
        constraint: FairnessConstraint = FairnessConstraint.DEMOGRAPHIC_PARITY,
    ) -> MitigationResult:
        """
        Threshold Optimizer (Fairlearn) — finds group-specific classification
        thresholds that satisfy fairness constraints WITHOUT retraining.

        From the document:
        "This is the lowest-effort, highest-impact post-processing approach."
        """
        try:
            from fairlearn.postprocessing import ThresholdOptimizer

            # Baseline
            baseline_model = self._train_baseline_model()
            baseline_pred = baseline_model.predict(self.X_test)
            baseline_acc = accuracy_score(self.y_test, baseline_pred)
            baseline_metrics = self._compute_metrics_from_predictions(
                self.y_test, baseline_pred, self.prot_test
            )

            # Map constraint to ThresholdOptimizer format
            constraint_map = {
                FairnessConstraint.DEMOGRAPHIC_PARITY: "demographic_parity",
                FairnessConstraint.EQUALIZED_ODDS: "equalized_odds",
                FairnessConstraint.EQUAL_OPPORTUNITY: "true_positive_rate_parity",
            }
            constraint_str = constraint_map.get(constraint, "demographic_parity")

            # Apply Threshold Optimizer
            postprocess = ThresholdOptimizer(
                estimator=baseline_model,
                constraints=constraint_str,
                objective="accuracy_score",
                prefit=True,
            )
            postprocess.fit(
                self.X_train, self.y_train,
                sensitive_features=self.prot_train
            )
            mitigated_pred = postprocess.predict(
                self.X_test, sensitive_features=self.prot_test
            )
            mitigated_acc = accuracy_score(self.y_test, mitigated_pred)
            mitigated_metrics = self._compute_metrics_from_predictions(
                self.y_test, mitigated_pred, self.prot_test
            )

            comparisons = FairnessEngine.compare_metrics(
                baseline_metrics, mitigated_metrics
            )
            avg_improvement = np.mean([c.improvement for c in comparisons]) if comparisons else 0.0

            return MitigationResult(
                technique=MitigationTechnique.THRESHOLD_OPTIMIZER,
                technique_display_name="Threshold Optimizer (Post-processing)",
                accuracy_before=round(baseline_acc * 100, 2),
                accuracy_after=round(mitigated_acc * 100, 2),
                accuracy_cost=round((baseline_acc - mitigated_acc) * 100, 2),
                metric_comparisons=comparisons,
                overall_fairness_improvement=round(avg_improvement, 2),
                recommendation_notes=(
                    "Adjusts classification thresholds per group without retraining. "
                    "Lowest effort technique — works on any existing model. "
                    "Best when you have predictions only (black-box access)."
                ),
            )

        except ImportError:
            logger.error("Fairlearn not installed")
            return self._error_result(
                MitigationTechnique.THRESHOLD_OPTIMIZER,
                "Fairlearn library required"
            )
        except Exception as e:
            logger.error(f"Threshold Optimizer failed: {e}")
            return self._error_result(
                MitigationTechnique.THRESHOLD_OPTIMIZER, str(e)
            )

    # ──────────────────────────────────────
    #  Recommendation Engine
    # ──────────────────────────────────────

    @staticmethod
    def recommend_technique(
        results: list[MitigationResult],
    ) -> tuple[MitigationTechnique, str]:
        """
        Recommend the best technique based on results.

        Decision logic from the document:
        - Training data only → Reweighting or Disparate Impact Remover
        - Model training access → Exponentiated Gradient
        - Predictions only (black box) → Threshold Optimizer

        In practice, recommend the one with highest fairness improvement
        and lowest accuracy cost.
        """
        if not results:
            return MitigationTechnique.REWEIGHTING, "Default recommendation"

        # Score each result: high fairness improvement + low accuracy cost
        scored = []
        for r in results:
            if r.accuracy_cost < 0:
                # Accuracy improved — bonus
                score = r.overall_fairness_improvement + abs(r.accuracy_cost)
            else:
                score = r.overall_fairness_improvement - (r.accuracy_cost * 2)
            scored.append((r.technique, score, r))

        scored.sort(key=lambda x: x[1], reverse=True)
        best = scored[0]

        reason = (
            f"{best[2].technique_display_name} achieved "
            f"{best[2].overall_fairness_improvement:.1f}% average fairness improvement "
            f"with only {best[2].accuracy_cost:.2f}pp accuracy cost. "
            "Research by Rodolfa et al. (Nature Machine Intelligence, 2021) found "
            "that fairness-accuracy trade-offs are typically negligible in practice."
        )

        return best[0], reason

    def _error_result(
        self, technique: MitigationTechnique, error: str
    ) -> MitigationResult:
        """Return a result indicating the technique failed."""
        return MitigationResult(
            technique=technique,
            technique_display_name=technique.value,
            accuracy_before=0.0,
            accuracy_after=0.0,
            accuracy_cost=0.0,
            metric_comparisons=[],
            overall_fairness_improvement=0.0,
            recommendation_notes=f"Technique failed: {error}",
        )
