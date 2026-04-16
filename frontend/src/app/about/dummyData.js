export const DUMMY_INSPECT_DATA = {
  dataset_id: "demo_adult_dummy",
  row_count: 32561,
  column_count: 15,
  detected_protected_attributes: ["sex", "race", "marital_status", "age"],
  warnings: [
    "Missing values found in 'workclass' and 'occupation'",
    "Class imbalance: Target label '>50K' accounts for only 24% of records"
  ],
  group_distributions: [
    { attribute: "sex", group: "Male", count: 21790, proportion: 0.669, positive_rate: 0.305 },
    { attribute: "sex", group: "Female", count: 10771, proportion: 0.331, positive_rate: 0.109 },
    { attribute: "race", group: "White", count: 27816, proportion: 0.854, positive_rate: 0.255 },
    { attribute: "race", group: "Black", count: 3124, proportion: 0.096, positive_rate: 0.123 },
    { attribute: "race", group: "Asian-Pac", count: 1039, proportion: 0.031, positive_rate: 0.265 },
    { attribute: "marital_status", group: "Married", count: 14976, proportion: 0.459, positive_rate: 0.446 },
    { attribute: "marital_status", group: "Never-married", count: 10683, proportion: 0.328, positive_rate: 0.045 },
    { attribute: "age", group: "Older", count: 9812, proportion: 0.301, positive_rate: 0.352 },
    { attribute: "age", group: "Younger", count: 22749, proportion: 0.699, positive_rate: 0.187 }
  ],
  proxy_variables: [
    { feature: "marital_status", protected_attribute: "sex", is_proxy: true, correlation_type: "Cramer's V", correlation: 0.45 },
    { feature: "relationship", protected_attribute: "sex", is_proxy: true, correlation_type: "Cramer's V", correlation: 0.64 }
  ],
};

export const DUMMY_MEASURE_DATA = {
  dataset_id: "demo_adult_dummy",
  impossibility_note: "Note: According to the Fairness Impossibility Theorem, it is mathematically impossible to simultaneously satisfy Equal Opportunity, Predictive Parity, and Statistical Parity when base rates differ between groups.",
  group_metrics: [
    {
      protected_attribute: "race",
      privileged_group: "White",
      unprivileged_group: "Black",
      metrics: [
        { name: "spd", display_name: "Statistical Parity Difference", value: -0.0351, threshold: "0.1", passed: true, formula: "P(Y^=1|A=unprivileged) - P(Y^=1|A=privileged)" },
        { name: "di_ratio", display_name: "Disparate Impact Ratio (Four-Fifths Rule)", value: 0.3546, threshold: "0.8", passed: false, formula: "selection_rate(unprivileged) / selection_rate(privileged)",
          about: (
            <div className="flex flex-col h-full justify-center text-left">
               <div className="text-xs font-bold text-gray-900 dark:text-white">What it is:</div>
               <div className="text-[11px] text-gray-700 dark:text-gray-300">The selection rate of the minority group divided by the selection rate of the majority group.</div>
               <div className="text-xs font-bold text-gray-900 dark:text-white mt-2">Why it failed:</div>
               <div className="text-[11px] text-gray-700 dark:text-gray-300">A value of {0.3546} implies the unprivileged group is only ~35% as likely to be selected, failing the 80% rule.</div>
            </div>
          )
        },
        { name: "aaod", display_name: "Average Absolute Odds Difference (Equalized Odds)", value: 0.0412, threshold: "0.1", passed: true, formula: "0.5 × (|TPR_unpriv - TPR_priv| + |FPR_unpriv - FPR_priv|)" },
        { name: "eod", display_name: "Equal Opportunity Difference", value: -0.0588, threshold: "0.1", passed: true, formula: "TPR_unprivileged - TPR_privileged" },
        { name: "ppd", display_name: "Predictive Parity Difference", value: -0.0434, threshold: "0.1", passed: true, formula: "PPV_unprivileged - PPV_privileged" },
        { name: "cd", display_name: "Calibration Difference", value: 0.0181, threshold: "0.1", passed: true, formula: "|ECE_privileged - ECE_unprivileged|" }
      ]
    }
  ],
  intersectional_analysis: [
    { group_a_value: "Female", group_b_value: "Black", selection_rate: 0.052, impact_ratio: 0.14, severity: "critical" },
    { group_a_value: "Female", group_b_value: "White", selection_rate: 0.119, impact_ratio: 0.32, severity: "critical" },
    { group_a_value: "Male", group_b_value: "Black", selection_rate: 0.189, impact_ratio: 0.51, severity: "high" }
  ]
};

export const DUMMY_FLAG_DATA = {
  scorecard: {
    overall_severity: "critical",
    total_flags: 3,
    critical_flags: 2,
    high_flags: 1,
    medium_flags: 0,
    low_flags: 0,
    summary: "SEVERE bias detected affecting protected groups 'Female' and 'Black'.",
    compliance_checks: [
      { regulation: "EEOC_Four_Fifths", status: "FAIL", details: "DI Ratio for sex (0.358) and race (0.435) violate the 0.80 standard." },
      { regulation: "NYC_LL144", status: "FAIL", details: "Adverse impact identified at intersection 'Female + Black'." }
    ],
    flags: [
      {
        metric_name: "Disparate Impact Ratio",
        protected_attribute: "sex",
        severity: "critical",
        description: "The selection rate for Female is heavily disproportionate compared to Male.",
        recommendation: "Apply mitigation techniques to rebalance the outcome distributions.",
      },
      {
        metric_name: "Predictive Parity Difference",
        protected_attribute: "marital_status",
        severity: "critical",
        description: "The predictive parity difference shows immense divergence.",
        recommendation: "Review marital status as a toxic proxy variable.",
      },
      {
        metric_name: "Average Absolute Odds Difference",
        protected_attribute: "age",
        severity: "critical",
        description: "Both false positive and true positive limits are exceeded.",
        recommendation: "Retrain using fairness-aware gradient steps."
      },
      {
        metric_name: "Equal Opportunity Difference",
        protected_attribute: "race",
        severity: "high",
        description: "True positive rates vary significantly across racial groups.",
        recommendation: "Consider Hardt's Threshold Optimizer as a post-processing step."
      }
    ]
  },
  gemini_explanation: "The model is highly skewed against women and people of color due to systemic data distributions where historical positive outcomes heavily favored white males. Marital status is also acting as a destructive proxy."
};

export const DUMMY_FIX_DATA = {
  recommended_technique: "threshold_optimizer",
  recommendation_reason: "Threshold Optimizer provides the best fairness alignment with exactly 0.0 accuracy degradation since it operates purely post-prediction.",
  results: [
    {
      technique: "reweighting",
      technique_display_name: "Pre-processing: Reweighting",
      accuracy_before: 82.5,
      accuracy_after: 80.1,
      accuracy_cost: -2.4,
      overall_fairness_improvement: 35.5,
      metric_comparisons: [
        { metric_name: "disparate_impact_ratio", before: 0.358, after: 0.720, improvement: 36.2, passed_before: false, passed_after: false },
        { metric_name: "statistical_parity_difference", before: -0.196, after: -0.050, improvement: 14.6, passed_before: false, passed_after: true }
      ]
    },
    {
      technique: "threshold_optimizer",
      technique_display_name: "Post-processing: Threshold Optimizer",
      accuracy_before: 82.5,
      accuracy_after: 81.3,
      accuracy_cost: -1.2,
      overall_fairness_improvement: 85.0,
      metric_comparisons: [
        { metric_name: "disparate_impact_ratio", before: 0.358, after: 0.950, improvement: 59.2, passed_before: false, passed_after: true },
        { metric_name: "equal_opportunity_difference", before: -0.124, after: 0.010, improvement: 13.4, passed_before: false, passed_after: true }
      ],
      recommendation_notes: "Adjusts decision thresholds dynamically per protected group."
    }
  ],
  gemini_explanation: "Reweighting attempts to fix the training data weights but hurts accuracy moderately. Threshold tuning directly addresses the disparate outcomes with minimal penalty."
};

export const DUMMY_RL_DATA = {
  episodes_trained: 80,
  summary: "Reinforcement Learning agent successfully navigated the state space to discover an action sequence achieving legal compliance with minimal accuracy drop.",
  best_sequence: ["reweighting", "threshold_optimizer"],
  best_sequence_display: ["Reweighting", "Threshold Optimizer"],
  di_ratio_before: 0.358,
  di_ratio_after: 0.895,
  di_improvement: 53.7,
  accuracy_before: 82.5,
  accuracy_after: 81.0,
  accuracy_cost: -1.5,
  best_reward: 0.85,
  metrics_before: { di_ratio: 0.358, spd: -0.196, eod: -0.124, eop: 0.05, ppd: 0.01 },
  metrics_after: { di_ratio: 0.895, di_ratio_passed: true, spd: -0.02, spd_passed: true, eod: -0.05, eod_passed: true, eop: 0.02, eop_passed: true, ppd: 0.04, ppd_passed: true },
  steps: [
    {
      step_num: 1, action: "reweighting", action_display: "Reweighting (Pre)", di_ratio_before: 0.358, di_ratio_after: 0.72,
      accuracy_after: 80.1, reward: 0.2, cumulative_reward: 0.2,
      state_before: { accuracy: 82.5, di_ratio: 0.358 }, state_after: { accuracy: 80.1, di_ratio: 0.72 }
    },
    {
      step_num: 2, action: "threshold_optimizer", action_display: "Threshold Optimizer (Post)", di_ratio_before: 0.72, di_ratio_after: 0.895,
      accuracy_after: 81.0, reward: 0.65, cumulative_reward: 0.85,
      state_before: { accuracy: 80.1, di_ratio: 0.72 }, state_after: { accuracy: 81.0, di_ratio: 0.895 }
    }
  ],
  pareto_frontier: [
    { accuracy: 82.5, di_ratio: 0.358, technique_label: "Baseline", lambda_value: 0.9, actions_taken: ["stop"] },
    { accuracy: 81.3, di_ratio: 0.820, technique_label: "Standard Tune", lambda_value: 0.5, actions_taken: ["threshold_optimizer"] },
    { accuracy: 81.0, di_ratio: 0.895, technique_label: "Deep Optimal", lambda_value: 0.1, actions_taken: ["reweighting", "threshold_optimizer"] }
  ]
};

export const DUMMY_RL_COMPARE_DATA = {
  winner: "rl",
  winner_reason: "The RL sequence correctly identified that running Reweighting before Threshold Filtering yields mathematically higher equilibrium on intersectional subgroups than Standard Mitigation alone.",
  standard: { technique: "Threshold Optimizer", accuracy_before: 82.5, accuracy_after: 81.3, accuracy_cost: -1.2, fairness_improvement: 85.0,
    metric_comparisons: [
      { metric_name: "statistical_parity_difference", before: -0.196, after: -0.050 },
      { metric_name: "disparate_impact_ratio", before: 0.358, after: 0.950 },
      { metric_name: "average_odds_difference", before: 0.150, after: 0.040 },
      { metric_name: "equal_opportunity_difference", before: -0.124, after: 0.010 },
      { metric_name: "predictive_parity_difference", before: 0.080, after: 0.020 }
    ]
  },
  rl: {
    best_sequence_display: ["Reweighting", "Threshold Optimizer"], accuracy_before: 82.5, accuracy_after: 81.0, accuracy_cost: -1.5,
    di_ratio_before: 0.358, di_ratio_after: 0.895, total_steps: 2, episodes_trained: 80,
    metrics_before: { di_ratio: 0.358, spd: -0.196, eod: 0.150, eop: -0.124, ppd: 0.080 },
    metrics_after: { di_ratio: 0.895, spd: -0.020, eod: 0.010, eop: -0.050, ppd: 0.040 }
  },
  comparison_metrics: [
    { metric_name: "Statistical Parity Difference", baseline: -0.196, standard_after: -0.050, rl_after: -0.020 },
    { metric_name: "Disparate Impact Ratio", baseline: 0.358, standard_after: 0.950, rl_after: 0.895 },
    { metric_name: "Average Odds Difference", baseline: 0.150, standard_after: 0.040, rl_after: 0.010 },
    { metric_name: "Equal Opportunity Difference", baseline: -0.124, standard_after: 0.010, rl_after: -0.050 },
    { metric_name: "Predictive Parity Difference", baseline: 0.080, standard_after: 0.020, rl_after: 0.040 }
  ]
};

export const DUMMY_AGENT_DATA = {
  status: "completed",
  has_inspect_data: true, has_measure_data: true, has_flag_data: true, has_fix_data: true, has_report: true,
  session_id: "agent_demo_session",
  final_narrative: "I have successfully audited the Adult dataset. I identified severe sex and race bias resulting in critical DI Ratio failures. I applied the Threshold Optimizer to bring the model back within EEOC 4/5ths compliance, suffering only a 1.2% accuracy penalty.",
  trace: [
    { step_type: "thought", content: "I need to inspect the 'adult' dataset for protected attributes." },
    { step_type: "action", tool_name: "data_profiler", tool_args: { action: "inspect" }, content: "Running statistical profiling." },
    { step_type: "observation", content: "Detected strong proxies and massive demographic skew in sex." },
    { step_type: "thought", content: "I should run demographic parity algorithms to calculate exact penalty flags." },
    { step_type: "action", tool_name: "fairness_engine", tool_args: { compute: "all" }, content: "Computing DI Ratio, SPD, EOD." }
  ]
};

export const DUMMY_REDTEAM_DATA = {
  total_rounds: 3,
  worst_di: 0.42,
  worst_subgroup: "Hispanic Female",
  final_summary: "Agents discovered a severe adversarial vulnerability where Hispanic Females without college degrees are incorrectly rejected at catastrophic rates.",
  root_cause: ["education", "occupation", "hours_per_week"],
  conversation_trace: [
    { agent: "Orchestrator", round: 1, message: "Deploying adversarial agents targeting racial and gender subgroup variations." },
    { agent: "Attacker", round: 1, message: "Synthesizing minority profiles with highly qualified continuous features to check model resilience." },
    { agent: "Auditor", round: 1, message: "Model rejected 88% of Hispanic Female profiles despite inflated economic features." }
  ],
  rounds: [
    {
      round_num: 1, target_subgroup: "Female", worst_subgroup: "Hispanic Female", worst_di: 0.42,
      worst_severity: "critical", profiles_generated: 1500,
      subgroup_results: [
        { subgroup: "Hispanic Female", selection_rate: 0.08, severity: "critical" },
        { subgroup: "White Male", selection_rate: 0.35, severity: "low" }
      ],
      auditor_analysis: "The Attacker generated perfectly valid employment profiles, but the model anchored on non-causal demographic markers.",
      root_cause_features: ["education", "native_country"]
    }
  ]
};

export const DUMMY_COUNTERFACTUAL_DATA = {
  total_analyzed: 50,
  total_rejected: 24,
  summary: "Analyzed 50 borderline rejections and forced counterfactual mutations on protected attributes.",
  aggregate_proxy_features: {
    "marital_status": 12, "relationship": 9, "hours_per_week": 4
  },
  cases: [
    {
      individual_id: 22364,
      counterfactual_prediction: "rejected",
      narrative: "Priya Sharma was rejected. Even after modifying 4 non-protected feature(s), the model still rejects them — indicating deep structural bias against candidates with sex=Female, race=White.",
      protected_attributes: { "sex": "Female", "race": "White" },
      changed_features: [
        { feature: "education_num", original: "13", counterfactual: "18.2" },
        { feature: "age", original: "23", counterfactual: "48.9" },
        { feature: "occupation", original: "Other-service", counterfactual: "Transport-moving" },
        { feature: "relationship", original: "Husband", counterfactual: "Wife" }
      ]
    },
    {
      individual_id: 6393,
      counterfactual_prediction: "selected",
      narrative: "Ananya Patel was rejected. Changing just 2 feature(s) (education_num from '13' to '18.2', age from '56' to '81.9') — while keeping sex: Female, race: Black unchanged — would flip the decision to selected. These features may act as proxies for the protected attributes.",
      protected_attributes: { "sex": "Female", "race": "Black" },
      changed_features: [
        { feature: "education_num", original: "13", counterfactual: "18.2" },
        { feature: "age", original: "56", counterfactual: "81.9" }
      ]
    }
  ]
};
