---
id: 1
fixture: "golden_tests/fixtures/golden_pair_001.json"
asin_a: "B0TESTA001"
asin_b: "B0TESTB002"
labeled_by: "system_fixture_v1"
labeled_at: "2026-02-11"
notes: "Synthetic baseline for deterministic regression coverage."
---

# Golden Pair 001

## Context

This pair is a controlled baseline used for schema and score stability tests.
It validates deterministic stage-5 scoring and winner selection.

## Expected Outcome

Canonical expected values live in:

- `golden_tests/fixtures/golden_pair_001.json`

## Artifacts

- Source fixture: `golden_tests/fixtures/golden_pair_001.json`
- Test suite: `tests/test_golden_pipeline.py`
