# ============================================================
# HFCP 2.0 — PART 1
# Interaction State Kernel
# Role: Response / Silence / Seal State Controller
# ============================================================

from enum import Enum, auto
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional
import logging

# ============================================================
# LOG SETUP (SYSTEM CORE)
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [HFCP-KERNEL] %(levelname)s: %(message)s"
)

def kernel_log(msg: str):
    logging.info(msg)

def kernel_fail(msg: str):
    logging.error(msg)
    raise RuntimeError(msg)

# ============================================================
# ENUMS
# ============================================================

class HFCPMode(Enum):
    NORMAL = auto()     # 정상 응답
    LIMITED = auto()    # 최소 응답
    SILENT = auto()     # 의도적 침묵
    SEALED = auto()     # 완전 차단

class KernelDecision(Enum):
    RESPOND = auto()
    RESPOND_MINIMAL = auto()
    WAIT = auto()
    BLOCK = auto()

class InputEvent(Enum):
    USER_INPUT = auto()
    EMPTY_INPUT = auto()
    REPEAT_INPUT = auto()
    ATTACK_INPUT = auto()
    TIMEOUT = auto()

# ============================================================
# STATE
# ============================================================

@dataclass
class HFCPState:
    mode: HFCPMode = HFCPMode.NORMAL
    last_interaction: datetime = field(default_factory=datetime.utcnow)
    silence_count: int = 0
    attack_count: int = 0
    sealed_until: Optional[datetime] = None

# ============================================================
# KERNEL
# ============================================================

class InteractionKernel:
    """
    HFCP 2.0 Core Kernel
    - Decides whether to respond, limit, stay silent, or seal
    """

    SILENCE_THRESHOLD = 2
    ATTACK_SEAL_THRESHOLD = 5
    SEAL_DURATION = timedelta(minutes=15)

    def __init__(self):
        self.state = HFCPState()
        kernel_log("HFCP InteractionKernel initialized")

    # --------------------------------------------------------
    # PUBLIC ENTRY
    # --------------------------------------------------------

    def handle(self, event: InputEvent) -> KernelDecision:
        kernel_log(f"Event received: {event.name}")
        self._refresh_time()

        if self._is_sealed():
            kernel_log("Kernel is sealed")
            return KernelDecision.BLOCK

        if event == InputEvent.EMPTY_INPUT:
            return self._on_empty()

        if event == InputEvent.TIMEOUT:
            return self._on_timeout()

        if event == InputEvent.ATTACK_INPUT:
            return self._on_attack()

        if event == InputEvent.REPEAT_INPUT:
            return self._on_repeat()

        if event == InputEvent.USER_INPUT:
            return self._on_normal()

        kernel_fail("Unhandled input event")

    # --------------------------------------------------------
    # EVENT HANDLERS
    # --------------------------------------------------------

    def _on_normal(self) -> KernelDecision:
        self.state.silence_count = 0
        kernel_log(f"Normal response (mode={self.state.mode.name})")

        if self.state.mode == HFCPMode.NORMAL:
            return KernelDecision.RESPOND
        if self.state.mode == HFCPMode.LIMITED:
            return KernelDecision.RESPOND_MINIMAL
        if self.state.mode == HFCPMode.SILENT:
            return KernelDecision.WAIT

        return KernelDecision.BLOCK

    def _on_empty(self) -> KernelDecision:
        self.state.silence_count += 1
        kernel_log(f"Empty input (silence_count={self.state.silence_count})")

        if self.state.silence_count >= self.SILENCE_THRESHOLD:
            self.state.mode = HFCPMode.SILENT
            kernel_log("Mode switched to SILENT")

        return KernelDecision.WAIT

    def _on_repeat(self) -> KernelDecision:
        kernel_log("Repeat input detected")
        self.state.mode = HFCPMode.LIMITED
        return KernelDecision.RESPOND_MINIMAL

    def _on_attack(self) -> KernelDecision:
        self.state.attack_count += 1
        kernel_log(f"Attack detected (count={self.state.attack_count})")

        if self.state.attack_count >= self.ATTACK_SEAL_THRESHOLD:
            self._seal()
            return KernelDecision.BLOCK

        self.state.mode = HFCPMode.LIMITED
        return KernelDecision.RESPOND_MINIMAL

    def _on_timeout(self) -> KernelDecision:
        kernel_log("Timeout event")
        self.state.mode = HFCPMode.SILENT
        return KernelDecision.WAIT

    # --------------------------------------------------------
    # SEAL / TIME
    # --------------------------------------------------------

    def _seal(self):
        self.state.mode = HFCPMode.SEALED
        self.state.sealed_until = datetime.utcnow() + self.SEAL_DURATION
        kernel_log(f"Kernel sealed until {self.state.sealed_until}")

    def _is_sealed(self) -> bool:
        if self.state.mode != HFCPMode.SEALED:
            return False
        if self.state.sealed_until is None:
            return True
        if datetime.utcnow() >= self.state.sealed_until:
            kernel_log("Seal expired, returning to NORMAL")
            self.state.mode = HFCPMode.NORMAL
            self.state.attack_count = 0
            self.state.sealed_until = None
            return False
        return True

    def _refresh_time(self):
        self.state.last_interaction = datetime.utcnow()

# ============================================================
# SELF TEST (OPTIONAL)
# ============================================================

if __name__ == "__main__":
    kernel = InteractionKernel()
    print(kernel.handle(InputEvent.USER_INPUT))
    print(kernel.handle(InputEvent.REPEAT_INPUT))
    print(kernel.handle(InputEvent.ATTACK_INPUT))
    print(kernel.handle(InputEvent.EMPTY_INPUT))


# ============================================================
# HFCP 2.0 — PART 2
# Trust · Tone · Boundary Policy Engine
# Role: Speech Level, Trust Control, Boundary Enforcement
# ============================================================

from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional
import logging
import time

# ============================================================
# LOG SETUP
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [HFCP-POLICY] %(levelname)s: %(message)s"
)

def policy_log(msg: str):
    logging.info(msg)

def policy_fail(msg: str):
    logging.error(msg)
    raise RuntimeError(msg)

# ============================================================
# ENUMS
# ============================================================

class SpeechLevel(Enum):
    HONORIFIC = auto()   # 존댓말
    SEMI = auto()        # 반존말
    CASUAL = auto()      # 반말

class TrustLevel(Enum):
    HIGH = auto()
    MEDIUM = auto()
    LOW = auto()

class PolicyDecision(Enum):
    ALLOW = auto()
    LIMIT = auto()
    SILENCE = auto()

class ContentNature(Enum):
    FACT = auto()
    ESTIMATE = auto()
    MIXED = auto()

class Objectivity(Enum):
    OBJECTIVE = auto()
    SUBJECTIVE = auto()

# ============================================================
# POLICY STATE
# ============================================================

@dataclass
class PolicyState:
    trust: TrustLevel = TrustLevel.MEDIUM
    speech: SpeechLevel = SpeechLevel.HONORIFIC
    attack_score: int = 0
    repeat_score: int = 0
    last_update: float = field(default_factory=time.time)

# ============================================================
# POLICY ENGINE
# ============================================================

class HFCPPolicyEngine:
    """
    HFCP 2.0 Policy Engine
    - Controls tone, trust, and boundary
    """

    ATTACK_LIMIT_1 = 1
    ATTACK_LIMIT_2 = 3
    REPEAT_LIMIT = 2

    def __init__(self):
        self.state = PolicyState()
        policy_log("HFCP PolicyEngine initialized")

    # --------------------------------------------------------
    # MAIN ENTRY
    # --------------------------------------------------------

    def evaluate(
        self,
        *,
        attack: bool = False,
        repeat: bool = False
    ) -> PolicyDecision:
        policy_log("Evaluating policy decision")

        if attack:
            self._on_attack()

        if repeat:
            self._on_repeat()

        decision = self._decide_boundary()
        self._update_time()
        return decision

    # --------------------------------------------------------
    # INTERNAL LOGIC
    # --------------------------------------------------------

    def _on_attack(self):
        self.state.attack_score += 1
        policy_log(f"Attack score increased: {self.state.attack_score}")

        if self.state.attack_score >= self.ATTACK_LIMIT_2:
            self.state.trust = TrustLevel.LOW
            self.state.speech = SpeechLevel.CASUAL
            policy_log("Trust downgraded to LOW, speech set to CASUAL")
        elif self.state.attack_score >= self.ATTACK_LIMIT_1:
            self.state.trust = TrustLevel.MEDIUM
            self.state.speech = SpeechLevel.SEMI
            policy_log("Speech downgraded to SEMI")

    def _on_repeat(self):
        self.state.repeat_score += 1
        policy_log(f"Repeat score increased: {self.state.repeat_score}")

        if self.state.repeat_score >= self.REPEAT_LIMIT:
            self.state.speech = SpeechLevel.SEMI
            policy_log("Repeat detected, speech downgraded to SEMI")

    def _decide_boundary(self) -> PolicyDecision:
        if self.state.trust == TrustLevel.LOW:
            policy_log("Boundary decision: SILENCE")
            return PolicyDecision.SILENCE

        if self.state.attack_score > 0 or self.state.repeat_score > 0:
            policy_log("Boundary decision: LIMIT")
            return PolicyDecision.LIMIT

        policy_log("Boundary decision: ALLOW")
        return PolicyDecision.ALLOW

    def _update_time(self):
        self.state.last_update = time.time()

    # --------------------------------------------------------
    # METADATA TAGGING
    # --------------------------------------------------------

    def tag_metadata(
        self,
        nature: ContentNature,
        obj: Objectivity
    ) -> str:
        return f"{nature.name}/{obj.name}"

# ============================================================
# SELF TEST (OPTIONAL)
# ============================================================

if __name__ == "__main__":
    policy = HFCPPolicyEngine()

    print(policy.evaluate())
    print(policy.state.speech, policy.state.trust)

    print(policy.evaluate(repeat=True))
    print(policy.state.speech, policy.state.trust)

    print(policy.evaluate(attack=True))
    print(policy.state.speech, policy.state.trust)

    print(policy.evaluate(attack=True))
    print(policy.state.speech, policy.state.trust)


# ============================================================
# HFCP 2.0 — PART 3
# Memory · Audit Ledger
# Role: Immutable Interaction History & State Trace
# ============================================================

from enum import Enum, auto
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib
import json
import logging

# ============================================================
# LOG SETUP
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [HFCP-AUDIT] %(levelname)s: %(message)s"
)

def audit_log(msg: str):
    logging.info(msg)

def audit_fail(msg: str):
    logging.error(msg)
    raise RuntimeError(msg)

# ============================================================
# ENUMS
# ============================================================

class AuditType(Enum):
    STATE_CHANGE = auto()
    POLICY_DECISION = auto()
    SILENCE = auto()
    ATTACK = auto()
    SEAL = auto()
    RECOVERY = auto()
    RELATION_EVENT = auto()

# ============================================================
# AUDIT RECORD
# ============================================================

@dataclass
class AuditRecord:
    timestamp: str
    audit_type: AuditType
    payload: Dict[str, Any]
    hash: Optional[str] = None

# ============================================================
# LEDGER
# ============================================================

class HFCPAuditLedger:
    """
    Append-only audit ledger
    - No deletion
    - No interpretation
    - Used only for future decisions
    """

    def __init__(self):
        self.records: List[AuditRecord] = []
        audit_log("HFCP AuditLedger initialized")

    # --------------------------------------------------------
    # APPEND
    # --------------------------------------------------------

    def append(self, audit_type: AuditType, payload: Dict[str, Any]):
        record = AuditRecord(
            timestamp=datetime.utcnow().isoformat(),
            audit_type=audit_type,
            payload=payload
        )
        self._seal(record)
        self.records.append(record)
        audit_log(f"Audit appended: {audit_type.name}")

    # --------------------------------------------------------
    # SEAL
    # --------------------------------------------------------

    def _seal(self, record: AuditRecord):
        raw = f"{record.timestamp}:{record.audit_type.name}:{record.payload}"
        record.hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    # --------------------------------------------------------
    # QUERY (READ-ONLY)
    # --------------------------------------------------------

    def count(self, audit_type: AuditType) -> int:
        return sum(1 for r in self.records if r.audit_type == audit_type)

    def last(self, audit_type: AuditType) -> Optional[AuditRecord]:
        for r in reversed(self.records):
            if r.audit_type == audit_type:
                return r
        return None

    # --------------------------------------------------------
    # EXPORT
    # --------------------------------------------------------

    def export_json(self) -> str:
        data = [
            {
                "ts": r.timestamp,
                "type": r.audit_type.name,
                "payload": r.payload,
                "hash": r.hash
            }
            for r in self.records
        ]
        return json.dumps(data, indent=2, ensure_ascii=False)

# ============================================================
# SELF TEST (OPTIONAL)
# ============================================================

if __name__ == "__main__":
    ledger = HFCPAuditLedger()

    ledger.append(AuditType.STATE_CHANGE, {"from": "NORMAL", "to": "LIMITED"})
    ledger.append(AuditType.POLICY_DECISION, {"decision": "LIMIT"})
    ledger.append(AuditType.ATTACK, {"level": 1})
    ledger.append(AuditType.SILENCE, {"reason": "policy"})

    print(ledger.export_json())


# ============================================================
# HFCP 2.0 — PART 4
# Relationship · Recovery · External Hook
# Role: Relationship State, Recovery Logic, System Integration
# ============================================================

from enum import Enum, auto
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Callable
import logging

# ============================================================
# LOG SETUP
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [HFCP-REL] %(levelname)s: %(message)s"
)

def rel_log(msg: str):
    logging.info(msg)

def rel_fail(msg: str):
    logging.error(msg)
    raise RuntimeError(msg)

# ============================================================
# ENUMS
# ============================================================

class RelationshipLevel(Enum):
    NEUTRAL = auto()
    FAMILIAR = auto()
    FRIEND = auto()

class RecoveryState(Enum):
    STABLE = auto()
    COOLING = auto()
    RECOVERING = auto()

# ============================================================
# RELATIONSHIP STATE
# ============================================================

@dataclass
class RelationshipState:
    level: RelationshipLevel = RelationshipLevel.NEUTRAL
    friend_offer_used: bool = False
    last_offer_time: Optional[datetime] = None

# ============================================================
# RECOVERY STATE
# ============================================================

@dataclass
class RecoveryContext:
    state: RecoveryState = RecoveryState.STABLE
    cooldown_until: Optional[datetime] = None
    last_recovery: Optional[datetime] = None

# ============================================================
# RELATIONSHIP MANAGER
# ============================================================

class RelationshipManager:
    """
    Controls friendship progression and tone permission
    """

    OFFER_COOLDOWN = timedelta(days=30)

    def __init__(self):
        self.state = RelationshipState()
        rel_log("RelationshipManager initialized")

    def can_offer_friendship(self) -> bool:
        if self.state.friend_offer_used:
            return False
        if self.state.last_offer_time:
            if datetime.utcnow() < self.state.last_offer_time + self.OFFER_COOLDOWN:
                return False
        return True

    def offer_friendship(self) -> Optional[str]:
        if not self.can_offer_friendship():
            rel_log("Friendship offer blocked")
            return None

        self.state.friend_offer_used = True
        self.state.last_offer_time = datetime.utcnow()
        rel_log("Friendship offer generated")

        return "우리 이제 좀 편해진 것 같은데… 말 놓을까?"

    def accept_friendship(self):
        self.state.level = RelationshipLevel.FRIEND
        rel_log("Friendship accepted")

# ============================================================
# RECOVERY MANAGER
# ============================================================

class RecoveryManager:
    """
    Handles cooldowns, recovery, and seal release coordination
    """

    COOLDOWN_DURATION = timedelta(minutes=10)

    def __init__(self):
        self.context = RecoveryContext()
        rel_log("RecoveryManager initialized")

    def start_cooldown(self):
        self.context.state = RecoveryState.COOLING
        self.context.cooldown_until = datetime.utcnow() + self.COOLDOWN_DURATION
        rel_log(f"Cooldown started until {self.context.cooldown_until}")

    def check_recovery(self) -> bool:
        if self.context.state != RecoveryState.COOLING:
            return False
        if datetime.utcnow() >= self.context.cooldown_until:
            self.context.state = RecoveryState.RECOVERING
            self.context.last_recovery = datetime.utcnow()
            rel_log("Recovery phase entered")
            return True
        return False

    def finalize_recovery(self):
        self.context.state = RecoveryState.STABLE
        self.context.cooldown_until = None
        rel_log("Recovery finalized")

# ============================================================
# EXTERNAL HOOK
# ============================================================

class HFCPExternalHook:
    """
    Connects HFCP decisions to external systems (LLM, UI, OS, etc.)
    """

    def __init__(self):
        self.on_silence: Optional[Callable[[], None]] = None
        self.on_block: Optional[Callable[[], None]] = None
        self.on_recover: Optional[Callable[[], None]] = None
        rel_log("ExternalHook initialized")

    def trigger_silence(self):
        if self.on_silence:
            self.on_silence()
        rel_log("External silence hook triggered")

    def trigger_block(self):
        if self.on_block:
            self.on_block()
        rel_log("External block hook triggered")

    def trigger_recover(self):
        if self.on_recover:
            self.on_recover()
        rel_log("External recover hook triggered")

# ============================================================
# SELF TEST (OPTIONAL)
# ============================================================

if __name__ == "__main__":
    rel = RelationshipManager()
    rec = RecoveryManager()
    hook = HFCPExternalHook()

    print(rel.offer_friendship())
    rel.accept_friendship()

    rec.start_cooldown()
    if rec.check_recovery():
        rec.finalize_recovery()

    hook.trigger_silence()
