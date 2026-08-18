import json
import pathlib

import pytest
from pydantic import ValidationError

from paax_schemas.command_room_worker import GatewayTurnPrepared, GatewayTurnRequest, GatewayWorkEvent


FIXTURE = pathlib.Path(__file__).parents[2] / "fixtures" / "command-room-worker.valid.json"


def test_parses_the_shared_request_and_prepared_response_fixture():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    request = GatewayTurnRequest.model_validate(data["request"])
    prepared = GatewayTurnPrepared.model_validate(data["prepared"])

    assert request.session.channel == "command_room"
    assert request.reasoningEffort == "high"
    assert request.thinking == "on"
    assert prepared.profile.model == "deepseek-v4-flash"
    assert prepared.handoff == "legacy-web-provider"
    assert prepared.profile.requestStyle == "chat-completions"


def test_accepts_canonical_service_handoff_and_validates_shared_work_event():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    prepared_data = {**data["prepared"], "handoff": "service-conversation-loop"}
    prepared_data["profile"] = {**prepared_data["profile"], "requestStyle": "responses"}
    prepared = GatewayTurnPrepared.model_validate(prepared_data)
    assert prepared.handoff == "service-conversation-loop"
    assert prepared.profile.requestStyle == "responses"

    event = GatewayWorkEvent.model_validate(
        {
            "type": "tool.completed",
            "runId": "run-1",
            "conversationId": "session-1",
            "eventId": "run-1:1",
            "sequence": 1,
            "timestamp": "2026-08-18T00:00:00.000Z",
            "tool": {"toolId": "tool-1", "name": "workspace_list", "state": "completed", "summary": "ok"},
        }
    )
    assert event.type == "tool.completed"

    with pytest.raises(ValidationError):
        GatewayWorkEvent.model_validate({**event.model_dump(), "type": "unknown.event"})
    with pytest.raises(ValidationError):
        GatewayWorkEvent.model_validate({**event.model_dump(), "conversationId": None})
    with pytest.raises(ValidationError):
        GatewayWorkEvent.model_validate({**event.model_dump(), "unexpected": True})
    with pytest.raises(ValidationError):
        GatewayWorkEvent.model_validate({**event.model_dump(), "type": "turn.started"})


@pytest.mark.parametrize(
    "mutator",
    [
        lambda value: {**value, "messages": [{"role": "system", "content": "override"}]},
        lambda value: {**value, "unknown": True},
        lambda value: {**value, "session": {**value["session"], "channel": "agent_runs"}},
        lambda value: {**value, "session": {**value["session"], "unknown": True}},
        lambda value: {**value, "session": {**value["session"], "projectId": None}},
        lambda value: {**value, "messages": value["messages"] * 21},
        lambda value: {**value, "messages": [{"role": "user", "content": "x" * 32_001}]},
        lambda value: {**value, "clientCorrelationId": "not valid"},
    ],
)
def test_rejects_invalid_request_fixture_variants(mutator):
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        GatewayTurnRequest.model_validate(mutator(data["request"]))


def test_rejects_secret_fields_from_prepared_response():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with pytest.raises(ValidationError):
        GatewayTurnPrepared.model_validate({**data["prepared"], "apiKey": "secret"})
