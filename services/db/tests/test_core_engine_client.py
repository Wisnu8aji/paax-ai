import pytest
from paax_db.core_engine_client import CoreEngineClient, CoreEngineUnavailable


class Response:
    status_code = 200
    def json(self): return {"status": "complete", "result": 0.56, "unit": "m3"}


class Transport:
    def __init__(self): self.calls = []
    def post(self, path, *, json, headers, timeout):
        self.calls.append((path, json, headers, timeout)); return Response()


def test_client_sends_authenticated_idempotent_typed_request():
    transport = Transport(); client = CoreEngineClient(transport, internal_key="test")
    request = {"project_id": "P", "snapshot_id": "S", "measurement_fact_ids": ["W"], "calculation_type": "length", "inputs": [], "requested_by": "U"}
    assert client.calculate(request)["unit"] == "m3"
    assert transport.calls[0][0] == "/calculations" and "Idempotency-Key" in transport.calls[0][2]


def test_client_blocks_after_bounded_transient_retries():
    class Down:
        def post(self, *args, **kwargs): raise TimeoutError()
    with pytest.raises(CoreEngineUnavailable):
        CoreEngineClient(Down(), internal_key="test").calculate({"x": 1})
