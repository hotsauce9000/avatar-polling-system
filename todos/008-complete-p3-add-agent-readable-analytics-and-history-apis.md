---
status: complete
priority: p3
issue_id: "008"
tags: [code-review, architecture, agent-native, api]
dependencies: []
---

# Add Agent-Readable Analytics and History APIs

Provide API parity for dashboard data currently fetched directly from Supabase client.

## Problem Statement

Dashboard reads recent jobs, experiments, and analytics events directly from Supabase JS. Agents/tools using API-only access cannot retrieve equivalent data, reducing agent-native parity.

## Findings

- Dashboard reads jobs at `apps/web/src/app/dashboard/page.tsx:120`.
- Dashboard reads experiments at `apps/web/src/app/dashboard/page.tsx:125`.
- Dashboard reads analytics events at `apps/web/src/app/dashboard/page.tsx:130`.
- API currently exposes analytics write (`apps/api/app/main.py:398`) and credit operations read (`apps/api/app/main.py:382`), but no general reads for these dashboard datasets.

## Proposed Solutions

### Option 1: Add Read Endpoints in API

**Approach:** Add authenticated routes for recent jobs, experiments, and analytics summaries.

**Pros:**
- Strong agent/UI parity.
- Centralized access patterns.

**Cons:**
- Additional API surface.

**Effort:** Medium

**Risk:** Low

---

### Option 2: Publish Tooling Layer that Reads Supabase Directly

**Approach:** Expose service-role-backed agent tools for these resources.

**Pros:**
- No app API changes.

**Cons:**
- Duplicated data access policy surface.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Keep Current State, Document Limitation

**Approach:** Explicitly state UI-only read paths.

**Pros:**
- No engineering work.

**Cons:**
- Ongoing parity gap.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement Option 1 incrementally, starting with analytics read endpoint.

## Technical Details

**Affected files:**
- `apps/web/src/app/dashboard/page.tsx:120`
- `apps/web/src/app/dashboard/page.tsx:125`
- `apps/web/src/app/dashboard/page.tsx:130`
- `apps/api/app/main.py:398`

## Resources

- `apps/web/src/app/dashboard/page.tsx`
- `apps/api/app/main.py`

## Acceptance Criteria

- [x] API endpoint exists for user-scoped analytics read.
- [x] API endpoint exists for recent jobs read.
- [x] API endpoint exists for recent experiments read.
- [x] Agent/tool workflows can access same datasets as dashboard.

## Work Log

### 2026-02-11 - Initial Discovery

**By:** Codex (`workflows-review`)

**Actions:**
- Mapped UI data fetches against existing API endpoints.
- Identified parity gaps for agent-only API access.

**Learnings:**
- Product functionality exists, but API surface is uneven across clients.


### 2026-02-11 - Implementation Complete

**By:** Codex (workflows-work)

**Actions:**
- Implemented code and/or docs changes required by this todo.
- Ran relevant validation checks (tests and/or linting).
- Verified acceptance criteria against updated code paths.

**Learnings:**
- This item is now resolved in the current branch.

