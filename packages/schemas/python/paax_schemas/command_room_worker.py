"""Pydantic mirror of the Command Room worker gateway wire contract."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator

GatewayChannel = Literal["command_room", "agent_runs"]
GatewayRequestStyle = Literal["chat-completions", "responses"]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, value: Any) -> Any:
        """Mirror Zod optional fields: omitted is valid, explicit null is not."""
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("null is not allowed for this wire contract")
        return value


class GatewaySessionSource(_StrictModel):
    channel: GatewayChannel
    conversationId: StrictStr = Field(min_length=1, max_length=256)
    projectId: StrictStr | None = Field(default=None, min_length=1, max_length=256)
    threadId: StrictStr | None = Field(default=None, min_length=1, max_length=256)
    workspaceId: StrictStr | None = Field(default=None, min_length=1, max_length=256)
    snapshotId: StrictStr | None = Field(default=None, min_length=1, max_length=256)
    documentRevisionId: StrictStr | None = Field(default=None, min_length=1, max_length=256)


class GatewayCommandRoomSessionSource(GatewaySessionSource):
    channel: Literal["command_room"]


class GatewayTurnMessage(_StrictModel):
    role: Literal["user", "assistant"]
    content: StrictStr = Field(min_length=1, max_length=32_000)


class GatewayTurnRequest(_StrictModel):
    mode: Literal["work"]
    runId: StrictStr | None = Field(default=None, min_length=1, max_length=256)
    session: GatewayCommandRoomSessionSource
    messages: list[GatewayTurnMessage] = Field(min_length=1, max_length=40)
    modelAlias: StrictStr = Field(min_length=1, max_length=64)
    reasoningEffort: Literal["low", "medium", "high", "max"] = "high"
    thinking: Literal["on", "off"] = "on"
    clientCorrelationId: StrictStr | None = Field(
        default=None,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
    )


class GatewayBinding(_StrictModel):
    channel: StrictStr = Field(min_length=1)
    tenantId: StrictStr = Field(min_length=1)
    actorId: StrictStr = Field(min_length=1)
    conversationId: StrictStr = Field(min_length=1)
    projectId: StrictStr | None = Field(default=None, min_length=1)
    threadId: StrictStr | None = Field(default=None, min_length=1)
    workspaceId: StrictStr | None = Field(default=None, min_length=1)
    snapshotId: StrictStr | None = Field(default=None, min_length=1)
    documentRevisionId: StrictStr | None = Field(default=None, min_length=1)


class GatewayModelProfile(_StrictModel):
    alias: StrictStr = Field(min_length=1)
    provider: StrictStr = Field(min_length=1)
    model: StrictStr = Field(min_length=1)
    transport: Literal["openai-compatible", "native"]
    requestStyle: GatewayRequestStyle = "chat-completions"
    supportsThinking: StrictBool
    selectedEffort: Literal["low", "medium", "high", "max"]
    thinking: Literal["on", "off"]
    reasoningEffortMap: dict[StrictStr, StrictStr] | None = None


class GatewayPromptSectionSizes(_StrictModel):
    stable: StrictInt = Field(ge=0)
    context: StrictInt = Field(ge=0)
    volatile: StrictInt = Field(ge=0)


class GatewayPromptMetadata(_StrictModel):
    version: StrictStr = Field(min_length=1)
    stableHash: StrictStr = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    sectionSizes: GatewayPromptSectionSizes
    injectionFindings: list[StrictStr]


class GatewayTurnPrepared(_StrictModel):
    protocolVersion: Literal["command-room.gateway.v1"]
    runId: StrictStr = Field(min_length=1)
    sessionId: StrictStr = Field(min_length=1)
    sessionKeyFingerprint: StrictStr = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    binding: GatewayBinding
    profile: GatewayModelProfile
    prompt: GatewayPromptMetadata
    handoff: Literal["service-conversation-loop", "legacy-web-provider"]


GatewayWorkEventType = Literal[
    "turn.started", "status.update", "assistant.interim", "reasoning.delta", "plan.updated",
    "tool.generating", "tool.started", "tool.progress", "tool.completed", "tool.output_risk",
    "approval.requested", "approval.resolved", "subagent.started", "subagent.progress",
    "subagent.completed", "background.completed", "artifact.created", "log.line",
    "assistant.delta", "turn.completed", "error",
]


class GatewayWorkTask(_StrictModel):
    id: StrictStr = Field(min_length=1, max_length=256)
    title: StrictStr = Field(min_length=1, max_length=256)
    state: Literal["pending", "in_progress", "completed", "failed", "cancelled"]
    detail: StrictStr | None = Field(default=None, max_length=16_000)
    startedAt: StrictStr | None = Field(default=None, min_length=1)
    completedAt: StrictStr | None = Field(default=None, min_length=1)


class GatewayWorkTool(_StrictModel):
    toolId: StrictStr = Field(min_length=1, max_length=256)
    name: StrictStr = Field(min_length=1, max_length=256)
    state: Literal["generating", "running", "completed", "failed"]
    args: Any | None = None
    result: Any | None = None
    summary: StrictStr | None = Field(default=None, max_length=16_000)
    progress: StrictStr | None = Field(default=None, max_length=16_000)
    durationMs: StrictInt | None = Field(default=None, ge=0)
    startedAt: StrictStr | None = Field(default=None, min_length=1)
    completedAt: StrictStr | None = Field(default=None, min_length=1)


class GatewayWorkApproval(_StrictModel):
    approvalId: StrictStr = Field(min_length=1, max_length=256)
    action: StrictStr = Field(min_length=1, max_length=256)
    reason: StrictStr = Field(min_length=1, max_length=16_000)
    args: Any | None = None
    createdAt: StrictStr = Field(min_length=1)
    expiresAt: StrictStr = Field(min_length=1)
    state: Literal["pending", "approved", "denied", "expired"]


class GatewayWorkArtifact(_StrictModel):
    artifactId: StrictStr = Field(min_length=1, max_length=256)
    name: StrictStr = Field(min_length=1, max_length=256)
    kind: StrictStr | None = Field(default=None, max_length=256)
    uri: StrictStr | None = Field(default=None, max_length=2_048)
    sizeBytes: StrictInt | None = Field(default=None, ge=0)
    summary: StrictStr | None = Field(default=None, max_length=16_000)
    createdAt: StrictStr | None = Field(default=None, min_length=1)


class GatewayWorkLog(_StrictModel):
    level: Literal["debug", "info", "warn", "error"]
    text: StrictStr = Field(min_length=1, max_length=16_000)


class GatewayWorkEvent(_StrictModel):
    type: GatewayWorkEventType
    runId: StrictStr = Field(min_length=1, max_length=256)
    conversationId: StrictStr = Field(min_length=1, max_length=256)
    eventId: StrictStr = Field(min_length=1, max_length=256)
    sequence: StrictInt = Field(ge=0)
    timestamp: StrictStr = Field(min_length=1)
    phase: StrictStr | None = Field(default=None, max_length=256)
    statusLabel: StrictStr | None = Field(default=None, max_length=256)
    statusDetail: StrictStr | None = Field(default=None, max_length=16_000)
    delta: StrictStr | None = Field(default=None, max_length=16_000)
    message: StrictStr | None = Field(default=None, max_length=16_000)
    summary: StrictStr | None = Field(default=None, max_length=16_000)
    tasks: list[GatewayWorkTask] | None = None
    tool: GatewayWorkTool | None = None
    approval: GatewayWorkApproval | None = None
    artifact: GatewayWorkArtifact | None = None
    progress: StrictStr | None = Field(default=None, max_length=16_000)
    log: GatewayWorkLog | None = None
    finalMarkdown: StrictStr | None = Field(default=None, max_length=32_000)
    stopReason: StrictStr | None = Field(default=None, max_length=256)
    errorCode: StrictStr | None = Field(default=None, max_length=256)
    errorMessage: StrictStr | None = Field(default=None, max_length=16_000)
    retryable: StrictBool | None = None

    @model_validator(mode="after")
    def validate_event_payload(self) -> "GatewayWorkEvent":
        common = {"type", "runId", "conversationId", "eventId", "sequence", "timestamp"}
        allowed_by_type = {
            "turn.started": {"phase", "statusLabel", "statusDetail"},
            "status.update": {"phase", "statusLabel", "statusDetail"},
            "assistant.interim": {"message"},
            "reasoning.delta": {"delta"},
            "plan.updated": {"tasks"},
            "tool.generating": {"tool"},
            "tool.started": {"tool"},
            "tool.progress": {"tool", "progress"},
            "tool.completed": {"tool"},
            "tool.output_risk": {"tool", "summary"},
            "approval.requested": {"approval"},
            "approval.resolved": {"approval"},
            "subagent.started": {"summary"},
            "subagent.progress": {"progress"},
            "subagent.completed": {"summary"},
            "background.completed": {"summary"},
            "artifact.created": {"artifact"},
            "log.line": {"log"},
            "assistant.delta": {"delta"},
            "turn.completed": {"finalMarkdown", "stopReason"},
            "error": {"errorCode", "errorMessage", "retryable"},
        }
        unexpected = self.model_fields_set - common - allowed_by_type.get(self.type, set())
        if unexpected:
            raise ValueError(f"event {self.type} contains fields for another event type: {sorted(unexpected)}")
        required = {
            "assistant.interim": ("message",),
            "reasoning.delta": ("delta",),
            "plan.updated": ("tasks",),
            "tool.generating": ("tool",),
            "tool.started": ("tool",),
            "tool.completed": ("tool",),
            "tool.output_risk": ("tool",),
            "approval.requested": ("approval",),
            "approval.resolved": ("approval",),
            "artifact.created": ("artifact",),
            "log.line": ("log",),
            "assistant.delta": ("delta",),
        }.get(self.type, ())
        if any(getattr(self, field) is None for field in required):
            raise ValueError(f"event {self.type} is missing its required payload")
        return self
