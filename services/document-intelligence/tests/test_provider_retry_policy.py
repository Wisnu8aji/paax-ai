from app.transcription.providers.base import DEM_RETRY_POLICY

def test_dem_retry_policy_is_bounded_and_transient_only():
    assert DEM_RETRY_POLICY.should_retry(failure_kind="transient", prior_attempts=0)
    assert not DEM_RETRY_POLICY.should_retry(failure_kind="transient", prior_attempts=2)
    assert not DEM_RETRY_POLICY.should_retry(failure_kind="permanent", prior_attempts=0)
