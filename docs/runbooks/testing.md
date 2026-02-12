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

## Recommended Pre-Deploy Checks

```powershell
python -m pip install -r requirements-test.txt
python -m pytest -q
```
