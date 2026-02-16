# Testing Runbook

## Golden Tests

Install test dependencies:

```powershell
python -m pip install -r requirements-test.txt
```

Run deterministic pipeline regression tests:

```powershell
python -m pytest tests/test_golden_pipeline.py -q
```

Coverage:

- Stage 4 avatar output shape (exactly 3 personas)
- Stage 5 deterministic verdict stability
- Winner and score drift checks against `golden_tests/fixtures/golden_pair_001.json`

## Stage-Gate and Operational Tests

Run schema gate tests for stages 0-5 and worker operational behavior:

```powershell
python -m pytest tests/test_pipeline_stage_gates.py tests/test_worker_recovery_sweep.py -q
```

## Recommended Pre-Deploy Checks

```powershell
python -m pip install -r requirements-test.txt
python -m pytest -q
```
