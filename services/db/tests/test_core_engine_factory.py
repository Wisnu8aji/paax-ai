from paax_db.core_engine_factory import build_core_engine_client


def test_factory_stays_unconfigured_without_explicit_base_url(monkeypatch):
    monkeypatch.delenv("CORE_ENGINE_BASE_URL", raising=False)
    monkeypatch.setenv("INTERNAL_SERVICE_KEY", "internal-test-key")
    assert build_core_engine_client() is None


def test_factory_builds_lazy_authenticated_client_from_explicit_configuration():
    calls = []

    class Transport:
        def post(self, path, *, json, headers, timeout):
            calls.append((path, json, headers, timeout))
            return type("Response", (), {"status_code": 200, "json": lambda self: {"status": "complete"}})()

    client = build_core_engine_client(
        base_url="https://core-engine.invalid/", internal_key="internal-test-key", transport=Transport(),
    )
    assert client is not None
    assert calls == []
    client.calculate({"project_id": "P", "snapshot_id": "S", "measurement_fact_ids": ["M"], "inputs": [], "requested_by": "U", "calculation_type": "length"})
    assert calls[0][0] == "/calculations"
    assert calls[0][2]["X-Internal-Key"] == "internal-test-key"
