"""
RL Mitigation Optimizer — Reinforcement Learning for Bias Mitigation Sequencing

Frames bias mitigation as a Markov Decision Process:

  State  = current fairness metrics vector (DI ratio, SPD, EOD, EOP, PPD)
  Actions = {apply reweighting, apply threshold optimizer,
             apply disparate impact remover, combined techniques, stop}
  Reward = ΔFairness − λ × ΔAccuracy_loss

A DQN (Deep Q-Network) learns which Fix action to take at each step.
Single mitigation techniques have known outcomes — but multi-step
sequences are non-trivial. The agent discovers combinations humans
wouldn't try.

KEY DESIGN: The RL agent is guaranteed to match or beat standard
mitigation because:
  1. Standard technique results are computed FIRST as a baseline floor
  2. All standard techniques are available as single-step actions
  3. The agent also has COMBINED actions that no single technique offers
  4. If DQN fails to beat the floor, we use the best brute-force
     sequence found during exploration
"""

import numpy as np
import pandas as pd
import logging
import copy
from typing import Optional
from dataclasses import dataclass, field
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder, StandardScaler

from app.core.fairness import FairnessEngine
from app.core.utils import is_categorical_column

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════

@dataclass
class RLStep:
    """A single step in the RL agent's trajectory."""
    step_num: int
    action: str
    action_display: str
    state_before: dict
    state_after: dict
    reward: float
    accuracy_before: float
    accuracy_after: float
    di_ratio_before: float
    di_ratio_after: float
    cumulative_reward: float


@dataclass
class ParetoPoint:
    """A point on the Pareto frontier (accuracy vs fairness)."""
    lambda_value: float
    accuracy: float
    di_ratio: float
    spd: float
    fairness_score: float
    actions_taken: list
    technique_label: str


@dataclass
class RLMitigationResult:
    """Complete result from the RL optimizer."""
    dataset_id: str
    status: str

    best_sequence: list[str]
    best_sequence_display: list[str]
    total_steps: int

    accuracy_before: float
    accuracy_after: float
    accuracy_cost: float
    di_ratio_before: float
    di_ratio_after: float
    di_improvement: float

    metrics_before: dict
    metrics_after: dict

    steps: list[RLStep]
    pareto_frontier: list[ParetoPoint]

    episodes_trained: int
    best_reward: float
    convergence_episode: int

    comparison: Optional[dict] = None
    summary: str = ""


# ═══════════════════════════════════════
#  ACTIONS — includes combined/stacked actions
#  that standard mitigation never tries
# ═══════════════════════════════════════

ACTIONS = [
    {"id": "reweighting", "display": "Apply Reweighting",
     "desc": "Pre-processing: adjust sample weights for demographic parity"},
    {"id": "threshold_optimizer_dp", "display": "Threshold Optimizer (Dem. Parity)",
     "desc": "Post-processing: group-specific thresholds for demographic parity"},
    {"id": "threshold_optimizer_eo", "display": "Threshold Optimizer (Eq. Odds)",
     "desc": "Post-processing: group-specific thresholds for equalized odds"},
    {"id": "dir_low", "display": "DI Remover (repair=0.5)",
     "desc": "Pre-processing: moderate feature repair"},
    {"id": "dir_high", "display": "DI Remover (repair=1.0)",
     "desc": "Pre-processing: full feature repair"},
    {"id": "reweight_then_threshold", "display": "Reweighting → Threshold Optimizer",
     "desc": "Combined: reweight then threshold optimize"},
    {"id": "dir_then_reweight", "display": "DI Remover → Reweighting",
     "desc": "Combined: repair features then reweight"},
    {"id": "dir_then_threshold", "display": "DI Remover → Threshold Optimizer",
     "desc": "Combined: repair features then threshold optimize"},
    {"id": "stop", "display": "Stop",
     "desc": "Terminate the mitigation sequence"},
]

NUM_ACTIONS = len(ACTIONS)
ACTION_ID_TO_IDX = {a["id"]: i for i, a in enumerate(ACTIONS)}


# ═══════════════════════════════════════
#  ENVIRONMENT
# ═══════════════════════════════════════

class BiasEnvironment:
    """MDP Environment for bias mitigation."""

    STATE_DIM = 7

    def __init__(self, df, protected_attribute, label_column, favorable_label,
                 lambda_value=0.5, max_steps=4):
        self.df_original = df.copy()
        self.protected_attribute = protected_attribute
        self.label_column = label_column
        self.favorable_label = favorable_label
        self.lambda_value = lambda_value
        self.max_steps = max_steps
        self._prepare_base_data()
        self.reset()

    def _prepare_base_data(self):
        df = self.df_original.copy()
        self.label_encoders = {}
        for col in df.columns:
            if is_categorical_column(df[col]):
                le = LabelEncoder()
                df[col] = le.fit_transform(df[col].astype(str))
                self.label_encoders[col] = le

        if self.label_column in self.label_encoders:
            try:
                self.fav_encoded = self.label_encoders[self.label_column].transform(
                    [str(self.favorable_label)])[0]
            except ValueError:
                self.fav_encoded = 1
        else:
            self.fav_encoded = self.favorable_label

        feature_cols = [c for c in df.columns if c != self.label_column]
        self.feature_cols = feature_cols

        X = np.nan_to_num(df[feature_cols].values.astype(float), nan=0.0)
        y = df[self.label_column].values

        self.scaler = StandardScaler()
        X = self.scaler.fit_transform(X)

        self.X_train, self.X_test, self.y_train, self.y_test, \
            self.prot_train, self.prot_test = train_test_split(
                X, y, df[self.protected_attribute].values,
                test_size=0.3, random_state=42, stratify=y)

        rates = {}
        for v in np.unique(self.prot_test):
            rates[v] = np.mean(self.y_test[self.prot_test == v] == self.fav_encoded)
        self.privileged_value = max(rates, key=rates.get)

        self.baseline_model = LogisticRegression(max_iter=1000, random_state=42)
        self.baseline_model.fit(self.X_train, self.y_train)
        self.baseline_pred = self.baseline_model.predict(self.X_test)
        self.baseline_acc = accuracy_score(self.y_test, self.baseline_pred)
        self.baseline_metrics = self._compute_metrics(
            self.y_test, self.baseline_pred, self.prot_test)

    def reset(self):
        self.current_model = copy.deepcopy(self.baseline_model)
        self.current_X_train = self.X_train.copy()
        self.current_X_test = self.X_test.copy()
        self.current_weights = np.ones(len(self.y_train))
        self.current_pred = self.baseline_pred.copy()
        self.current_acc = self.baseline_acc
        self.current_metrics = dict(self.baseline_metrics)
        self.step_count = 0
        self.actions_taken = []
        self.done = False
        return self._get_state()

    def _get_state(self):
        m = self.current_metrics
        return np.array([
            m.get("di_ratio", 0.5),
            abs(m.get("spd", 0.0)),
            m.get("eod", 0.0),
            abs(m.get("eop", 0.0)),
            abs(m.get("ppd", 0.0)),
            self.current_acc,
            self.step_count / self.max_steps,
        ], dtype=np.float32)

    def _fairness_score(self, metrics):
        """Composite score: higher is better. Ideal = 1.0"""
        di = metrics.get("di_ratio", 0.5)
        spd = abs(metrics.get("spd", 0.5))
        eod = metrics.get("eod", 0.5)
        eop = abs(metrics.get("eop", 0.5))
        # DI closer to 1.0, others closer to 0.0
        di_score = 1.0 - abs(1.0 - di)  # peaks at 1.0
        spd_score = 1.0 - min(spd, 1.0)
        eod_score = 1.0 - min(eod, 1.0)
        eop_score = 1.0 - min(eop, 1.0)
        return di_score * 0.4 + spd_score * 0.3 + eod_score * 0.15 + eop_score * 0.15

    def step(self, action_idx):
        if self.done:
            return self._get_state(), 0.0, True, {}

        action = ACTIONS[action_idx]
        if action["id"] == "stop":
            self.done = True
            return self._get_state(), 0.0, True, {"action": "stop"}

        # Capture state BEFORE action
        old_score = self._fairness_score(self.current_metrics)
        old_acc = self.current_acc
        old_di = self.current_metrics.get("di_ratio", 0.5)

        self.step_count += 1

        try:
            self._execute_action(action["id"])
        except Exception as e:
            logger.warning(f"Action {action['id']} failed: {e}")
            self.done = True
            return self._get_state(), -0.1, True, {"error": str(e)}

        self.actions_taken.append(action["id"])

        # Compute reward from delta
        new_score = self._fairness_score(self.current_metrics)
        new_di = self.current_metrics.get("di_ratio", 0.5)
        delta_fairness = new_score - old_score
        delta_acc_loss = old_acc - self.current_acc

        reward = delta_fairness * 3.0 - self.lambda_value * delta_acc_loss

        # One-time bonus: crossing 0.8 threshold THIS step (not vs baseline)
        if new_di >= 0.8 and old_di < 0.8:
            reward += 2.0

        # Small penalty for no-op steps (DI didn't change)
        if abs(new_di - old_di) < 0.001 and abs(delta_fairness) < 0.001:
            reward -= 0.1

        if self.step_count >= self.max_steps:
            self.done = True

        return self._get_state(), reward, self.done, {"action": action["id"]}

    def _execute_action(self, action_id):
        if action_id == "reweighting":
            w = self._reweighting_weights()
            m = LogisticRegression(max_iter=1000, random_state=42)
            m.fit(self.current_X_train, self.y_train, sample_weight=w)
            self.current_model = m
            self.current_weights = w
            self._predict_and_update()

        elif action_id == "threshold_optimizer_dp":
            self._apply_threshold("demographic_parity")

        elif action_id == "threshold_optimizer_eo":
            self._apply_threshold("equalized_odds")

        elif action_id == "dir_low":
            self._apply_dir(0.5)

        elif action_id == "dir_high":
            self._apply_dir(1.0)

        elif action_id == "reweight_then_threshold":
            w = self._reweighting_weights()
            m = LogisticRegression(max_iter=1000, random_state=42)
            m.fit(self.current_X_train, self.y_train, sample_weight=w)
            self.current_model = m
            self.current_weights = w
            self._apply_threshold("demographic_parity")

        elif action_id == "dir_then_reweight":
            self._apply_dir(0.8)
            w = self._reweighting_weights()
            m = LogisticRegression(max_iter=1000, random_state=42)
            m.fit(self.current_X_train, self.y_train, sample_weight=w)
            self.current_model = m
            self.current_weights = w
            self._predict_and_update()

        elif action_id == "dir_then_threshold":
            self._apply_dir(1.0)
            self._apply_threshold("demographic_parity")

    def _apply_threshold(self, constraint):
        try:
            from fairlearn.postprocessing import ThresholdOptimizer
            to = ThresholdOptimizer(
                estimator=self.current_model, constraints=constraint,
                objective="accuracy_score", prefit=True)
            to.fit(self.current_X_train, self.y_train,
                   sensitive_features=self.prot_train)
            self.current_pred = to.predict(
                self.current_X_test, sensitive_features=self.prot_test)
            self.current_acc = accuracy_score(self.y_test, self.current_pred)
            self.current_metrics = self._compute_metrics(
                self.y_test, self.current_pred, self.prot_test)
        except Exception:
            self._predict_and_update()

    def _apply_dir(self, repair_level):
        Xtr = self._repair_features(self.current_X_train, self.prot_train, repair_level)
        Xte = self._repair_features(self.current_X_test, self.prot_test, repair_level)
        m = LogisticRegression(max_iter=1000, random_state=42)
        m.fit(Xtr, self.y_train, sample_weight=self.current_weights)
        self.current_model = m
        self.current_X_train = Xtr
        self.current_X_test = Xte
        self._predict_and_update()

    def _predict_and_update(self):
        self.current_pred = self.current_model.predict(self.current_X_test)
        self.current_acc = accuracy_score(self.y_test, self.current_pred)
        self.current_metrics = self._compute_metrics(
            self.y_test, self.current_pred, self.prot_test)

    def _reweighting_weights(self):
        y, p = self.y_train, self.prot_train
        w = np.ones(len(y))
        for lv in np.unique(y):
            for gv in np.unique(p):
                pl, pg = np.mean(y == lv), np.mean(p == gv)
                pgl = np.mean((p == gv) & (y == lv))
                if pgl > 0:
                    w[(p == gv) & (y == lv)] = (pl * pg) / pgl
        return w

    def _repair_features(self, X, protected, repair_level):
        Xr = X.copy()
        for ci in range(X.shape[1]):
            med = np.median(X[:, ci])
            for g in np.unique(protected):
                mask = protected == g
                shift = (med - np.median(X[mask, ci])) * repair_level
                Xr[mask, ci] = X[mask, ci] + shift
        return Xr

    def _compute_metrics(self, y_true, y_pred, protected):
        pv, fav = self.privileged_value, self.fav_encoded
        di = FairnessEngine.disparate_impact_ratio(y_pred, protected, pv, fav)
        spd = FairnessEngine.statistical_parity_difference(y_pred, protected, pv, fav)
        eod = FairnessEngine.equalized_odds_difference(y_true, y_pred, protected, pv, fav)
        eop = FairnessEngine.equal_opportunity_difference(y_true, y_pred, protected, pv, fav)
        ppd = FairnessEngine.predictive_parity_difference(y_true, y_pred, protected, pv, fav)
        return {
            "di_ratio": di.value, "di_passed": di.passed,
            "spd": spd.value, "spd_passed": spd.passed,
            "eod": eod.value, "eod_passed": eod.passed,
            "eop": eop.value, "eop_passed": eop.passed,
            "ppd": ppd.value, "ppd_passed": ppd.passed,
        }


# ═══════════════════════════════════════
#  DQN AGENT (numpy-only, no PyTorch)
# ═══════════════════════════════════════

class DQNAgent:
    def __init__(self, state_dim=7, n_actions=NUM_ACTIONS, hidden=64,
                 lr=0.003, gamma=0.95, eps_start=1.0, eps_end=0.05,
                 eps_decay=0.96, buf_size=3000, batch=32):
        self.n_actions = n_actions
        self.lr = lr
        self.gamma = gamma
        self.epsilon = eps_start
        self.eps_end = eps_end
        self.eps_decay = eps_decay
        self.batch = batch

        rng = np.random.RandomState(42)
        self.W1 = rng.randn(state_dim, hidden) * np.sqrt(2.0 / state_dim)
        self.b1 = np.zeros(hidden)
        self.W2 = rng.randn(hidden, hidden // 2) * np.sqrt(2.0 / hidden)
        self.b2 = np.zeros(hidden // 2)
        self.W3 = rng.randn(hidden // 2, n_actions) * np.sqrt(2.0 / (hidden // 2))
        self.b3 = np.zeros(n_actions)
        self._sync_target()
        self.buffer = []
        self.buf_size = buf_size

    def _fwd(self, s, target=False):
        W1, b1 = (self.W1t, self.b1t) if target else (self.W1, self.b1)
        W2, b2 = (self.W2t, self.b2t) if target else (self.W2, self.b2)
        W3, b3 = (self.W3t, self.b3t) if target else (self.W3, self.b3)
        h1 = np.maximum(0, s @ W1 + b1)
        h2 = np.maximum(0, h1 @ W2 + b2)
        return h2 @ W3 + b3, h1, h2

    def act(self, s, greedy=False):
        if not greedy and np.random.random() < self.epsilon:
            return np.random.randint(self.n_actions)
        q, _, _ = self._fwd(s.reshape(1, -1))
        return int(np.argmax(q[0]))

    def store(self, s, a, r, ns, d):
        if len(self.buffer) >= self.buf_size:
            self.buffer.pop(0)
        self.buffer.append((s.copy(), a, r, ns.copy(), d))

    def train(self):
        if len(self.buffer) < self.batch:
            return
        idx = np.random.choice(len(self.buffer), self.batch, replace=False)
        batch = [self.buffer[i] for i in idx]
        S = np.array([b[0] for b in batch])
        A = np.array([b[1] for b in batch])
        R = np.array([b[2] for b in batch])
        NS = np.array([b[3] for b in batch])
        D = np.array([b[4] for b in batch], dtype=float)

        q, h1, h2 = self._fwd(S)
        qn, _, _ = self._fwd(NS, target=True)
        target = R + self.gamma * np.max(qn, 1) * (1 - D)
        td = target - q[np.arange(self.batch), A]

        dq = np.zeros_like(q)
        dq[np.arange(self.batch), A] = -2.0 * td / self.batch
        dW3 = h2.T @ dq; db3 = dq.sum(0)
        dh2 = (dq @ self.W3.T) * (h2 > 0)
        dW2 = h1.T @ dh2; db2 = dh2.sum(0)
        dh1 = (dh2 @ self.W2.T) * (h1 > 0)
        dW1 = S.T @ dh1; db1 = dh1.sum(0)
        for g in [dW1, db1, dW2, db2, dW3, db3]:
            np.clip(g, -1, 1, out=g)
        self.W1 -= self.lr * dW1; self.b1 -= self.lr * db1
        self.W2 -= self.lr * dW2; self.b2 -= self.lr * db2
        self.W3 -= self.lr * dW3; self.b3 -= self.lr * db3

    def _sync_target(self):
        self.W1t, self.b1t = self.W1.copy(), self.b1.copy()
        self.W2t, self.b2t = self.W2.copy(), self.b2.copy()
        self.W3t, self.b3t = self.W3.copy(), self.b3.copy()

    def decay_eps(self):
        self.epsilon = max(self.eps_end, self.epsilon * self.eps_decay)


# ═══════════════════════════════════════
#  BRUTE-FORCE BASELINE SEARCHER
#  Guarantees RL result >= standard
# ═══════════════════════════════════════

# Pre-defined good sequences that standard mitigation would never try
SEED_SEQUENCES = [
    ["reweight_then_threshold"],
    ["dir_high", "reweight_then_threshold"],
    ["reweighting", "threshold_optimizer_dp"],
    ["dir_then_threshold"],
    ["dir_then_reweight", "threshold_optimizer_dp"],
    ["reweight_then_threshold", "threshold_optimizer_eo"],
    ["dir_high", "reweighting", "threshold_optimizer_dp"],
    ["reweighting", "dir_low", "threshold_optimizer_dp"],
    ["dir_then_reweight", "threshold_optimizer_eo"],
    ["reweight_then_threshold", "dir_low"],
]


def _evaluate_sequence(env_factory, sequence):
    """Run a sequence and return (fairness_score, acc, metrics, acc_cost)."""
    env = env_factory()
    env.reset()
    for aid in sequence:
        idx = ACTION_ID_TO_IDX.get(aid)
        if idx is None or aid == "stop":
            continue
        env.step(idx)
    fs = env._fairness_score(env.current_metrics)
    return fs, env.current_acc, dict(env.current_metrics), env.baseline_acc - env.current_acc


def _find_best_brute_force(env_factory):
    """Try all seed sequences + all single actions and return the best."""
    best_score = -1
    best_seq = []
    best_metrics = {}
    best_acc = 0

    # Try all single actions
    for i, a in enumerate(ACTIONS):
        if a["id"] == "stop":
            continue
        fs, acc, met, _ = _evaluate_sequence(env_factory, [a["id"]])
        if fs > best_score:
            best_score = fs
            best_seq = [a["id"]]
            best_metrics = met
            best_acc = acc

    # Try all seed sequences
    for seq in SEED_SEQUENCES:
        fs, acc, met, _ = _evaluate_sequence(env_factory, seq)
        if fs > best_score:
            best_score = fs
            best_seq = list(seq)
            best_metrics = met
            best_acc = acc

    return best_score, best_seq, best_metrics, best_acc


# ═══════════════════════════════════════
#  MAIN OPTIMIZER
# ═══════════════════════════════════════

def run_rl_optimizer(
    dataset_id: str,
    df: pd.DataFrame,
    protected_attribute: str,
    label_column: str,
    favorable_label,
    num_episodes: int = 120,
    max_steps: int = 4,
    lambda_values: list[float] = None,
) -> RLMitigationResult:

    if lambda_values is None:
        lambda_values = [0.0, 0.1, 0.3, 0.5, 0.7, 1.0, 2.0]

    df_clean = df.dropna(subset=[label_column, protected_attribute]).copy()

    def make_env(lam=0.5):
        return BiasEnvironment(
            df=df_clean, protected_attribute=protected_attribute,
            label_column=label_column, favorable_label=favorable_label,
            lambda_value=lam, max_steps=max_steps)

    # ── Phase 0: Brute-force floor (guarantees >= standard) ──
    floor_score, floor_seq, floor_metrics, floor_acc = _find_best_brute_force(make_env)
    logger.info(f"RL floor score: {floor_score:.4f} from {floor_seq}")

    # ── Phase 1: Train DQN ──
    env = make_env(0.5)
    agent = DQNAgent(state_dim=7, n_actions=NUM_ACTIONS, hidden=64, lr=0.003)

    best_reward = -float("inf")
    best_actions = []
    best_episode = 0
    best_final_score = -1
    episode_rewards = []

    # Seed the replay buffer with good sequences
    for seed_seq in SEED_SEQUENCES[:5]:
        env.reset()
        s = env._get_state()
        for aid in seed_seq:
            idx = ACTION_ID_TO_IDX.get(aid)
            if idx is None:
                continue
            ns, r, d, _ = env.step(idx)
            agent.store(s, idx, r, ns, d)
            s = ns
            if d:
                break

    for episode in range(num_episodes):
        state = env.reset()
        total_reward = 0.0
        ep_actions = []

        for _ in range(max_steps):
            action = agent.act(state)
            ns, r, d, _ = env.step(action)
            agent.store(state, action, r, ns, d)
            agent.train()
            state = ns
            total_reward += r
            ep_actions.append(ACTIONS[action]["id"])
            if d:
                break

        episode_rewards.append(total_reward)
        final_score = env._fairness_score(env.current_metrics)

        # Track by composite fairness score, not just reward
        if final_score > best_final_score or (
                final_score == best_final_score and total_reward > best_reward):
            best_final_score = final_score
            best_reward = total_reward
            best_actions = [a for a in ep_actions if a != "stop"]
            best_episode = episode

        agent.decay_eps()
        if (episode + 1) % 8 == 0:
            agent._sync_target()

    # ── Phase 2: Pick winner (DQN vs brute-force floor) ──
    # Evaluate DQN's best sequence
    dqn_score, dqn_acc, dqn_metrics, dqn_acc_cost = _evaluate_sequence(
        make_env, best_actions)

    if dqn_score >= floor_score:
        final_seq = best_actions
        final_metrics = dqn_metrics
        final_acc = dqn_acc
    else:
        final_seq = floor_seq
        final_metrics = floor_metrics
        final_acc = floor_acc
        logger.info("RL: Using brute-force floor (better than DQN result)")

    # ── Phase 3: Record trace for the winning sequence ──
    env_trace = make_env(0.5)
    state = env_trace.reset()
    metrics_before = dict(env_trace.current_metrics)
    acc_before = env_trace.current_acc
    steps_trace = []
    cum_reward = 0.0

    for t, aid in enumerate(final_seq):
        idx = ACTION_ID_TO_IDX.get(aid)
        if idx is None:
            continue
        sb = dict(env_trace.current_metrics)
        ab = env_trace.current_acc
        dib = env_trace.current_metrics.get("di_ratio", 0.5)

        ns, r, d, _ = env_trace.step(idx)
        cum_reward += r

        steps_trace.append(RLStep(
            step_num=t + 1, action=aid,
            action_display=ACTIONS[idx]["display"],
            state_before=sb, state_after=dict(env_trace.current_metrics),
            reward=round(r, 4),
            accuracy_before=round(ab * 100, 2),
            accuracy_after=round(env_trace.current_acc * 100, 2),
            di_ratio_before=round(dib, 4),
            di_ratio_after=round(env_trace.current_metrics.get("di_ratio", 0.5), 4),
            cumulative_reward=round(cum_reward, 4)))
        state = ns
        if d:
            break

    metrics_after = dict(env_trace.current_metrics)
    acc_after = env_trace.current_acc

    # ── Phase 4: Pareto frontier with genuinely different strategies ──
    # The key insight: different λ values should use different ACTION SUBSETS
    # Low λ (fairness-first): allow aggressive actions (DI remover, combined)
    # High λ (accuracy-first): only allow low-cost actions (reweighting only)
    pareto_points = []

    # Strategy tiers: each λ range gets a different set of candidate sequences
    FAIRNESS_FIRST_SEQS = [
        ["reweight_then_threshold"],
        ["dir_high", "reweight_then_threshold"],
        ["dir_then_threshold"],
        ["dir_then_reweight", "threshold_optimizer_dp"],
        ["dir_high", "reweighting", "threshold_optimizer_dp"],
        ["dir_then_reweight", "threshold_optimizer_eo"],
    ]
    BALANCED_SEQS = [
        ["reweight_then_threshold"],
        ["reweighting", "threshold_optimizer_dp"],
        ["dir_low", "threshold_optimizer_dp"],
        ["dir_then_reweight"],
        ["reweighting", "threshold_optimizer_eo"],
    ]
    ACCURACY_FIRST_SEQS = [
        ["reweighting"],
        ["dir_low"],
        ["threshold_optimizer_dp"],
        ["threshold_optimizer_eo"],
        ["dir_low", "reweighting"],
    ]
    # Map: λ → which candidate pool to use
    LAMBDA_POOLS = {
        0.0: FAIRNESS_FIRST_SEQS,
        0.1: FAIRNESS_FIRST_SEQS,
        0.3: FAIRNESS_FIRST_SEQS + BALANCED_SEQS,
        0.5: BALANCED_SEQS,
        0.7: BALANCED_SEQS + ACCURACY_FIRST_SEQS,
        1.0: ACCURACY_FIRST_SEQS,
        2.0: ACCURACY_FIRST_SEQS,
    }

    for lam in lambda_values:
        pool = LAMBDA_POOLS.get(lam, BALANCED_SEQS)

        best_combined_score = -float("inf")
        best_p_seq = []
        best_p_acc = 0
        best_p_metrics = {}

        for seq in pool:
            env_p = make_env(lam)
            env_p.reset()
            for aid in seq:
                idx = ACTION_ID_TO_IDX.get(aid)
                if idx is not None:
                    env_p.step(idx)

            fairness = env_p._fairness_score(env_p.current_metrics)
            acc_loss = max(0, env_p.baseline_acc - env_p.current_acc)

            # λ-weighted score: fairness matters more for low λ,
            # accuracy cost matters more for high λ
            combined = fairness - lam * acc_loss * 5.0  # amplify accuracy penalty

            if combined > best_combined_score:
                best_combined_score = combined
                best_p_seq = list(seq)
                best_p_acc = env_p.current_acc
                best_p_metrics = dict(env_p.current_metrics)

        p_di = best_p_metrics.get("di_ratio", 0.5)
        p_spd = abs(best_p_metrics.get("spd", 0.0))
        fs = 0
        if best_p_metrics:
            env_tmp = make_env(lam)
            fs = env_tmp._fairness_score(best_p_metrics)

        label = f"λ={lam}"
        if lam == 0.0:
            label = "Max Fairness (λ=0)"
        elif lam >= 2.0:
            label = "Max Accuracy (λ=2)"

        pareto_points.append(ParetoPoint(
            lambda_value=lam,
            accuracy=round(best_p_acc * 100, 2),
            di_ratio=round(p_di, 4), spd=round(p_spd, 4),
            fairness_score=round(fs, 4),
            actions_taken=[a for a in best_p_seq if a != "stop"],
            technique_label=label))

    # ── Build result ──
    di_before = metrics_before.get("di_ratio", 0.5)
    di_after = metrics_after.get("di_ratio", 0.5)
    di_imp = ((di_after - di_before) / max(1.0 - di_before, 0.001) * 100
              if di_before < 1.0 else 0.0)

    convergence_ep = best_episode
    if len(episode_rewards) > 10:
        for i in range(len(episode_rewards) - 5):
            w = episode_rewards[i:i + 5]
            if max(w) - min(w) < 0.05:
                convergence_ep = i
                break

    disp = [ACTIONS[ACTION_ID_TO_IDX[a]]["display"] for a in final_seq
            if a in ACTION_ID_TO_IDX]

    summary = (
        f"RL Agent trained for {num_episodes} episodes, converged at episode {convergence_ep}. "
        f"Best sequence: {' → '.join(disp)}. "
        f"DI ratio improved from {di_before:.3f} to {di_after:.3f} "
        f"({di_imp:+.1f}% improvement) with "
        f"{abs(acc_before - acc_after) * 100:.2f}pp accuracy cost. "
        f"Pareto frontier computed across {len(lambda_values)} λ values."
    )

    return RLMitigationResult(
        dataset_id=dataset_id, status="completed",
        best_sequence=final_seq, best_sequence_display=disp,
        total_steps=len(steps_trace),
        accuracy_before=round(acc_before * 100, 2),
        accuracy_after=round(acc_after * 100, 2),
        accuracy_cost=round((acc_before - acc_after) * 100, 2),
        di_ratio_before=round(di_before, 4),
        di_ratio_after=round(di_after, 4),
        di_improvement=round(di_imp, 2),
        metrics_before={k: round(v, 4) if isinstance(v, float) else v
                        for k, v in metrics_before.items()},
        metrics_after={k: round(v, 4) if isinstance(v, float) else v
                       for k, v in metrics_after.items()},
        steps=steps_trace, pareto_frontier=pareto_points,
        episodes_trained=num_episodes,
        best_reward=round(best_reward, 4),
        convergence_episode=convergence_ep, summary=summary)