# H25 - Accumulated Token Usage Across Resumed Sessions

## Problem

The Run Detail page displayed only the token total of the most recent run. When a staged workflow resumed after a human input request, the visible total appeared to reset even though earlier runs in the same workflow had already consumed tokens.

## Root Cause

The web state already exposed pipeline-level token totals, but Run Detail rendered `totalTokens` from the latest run. In addition, the pipeline aggregate grouped only by pipeline, which could include token usage from unrelated features running in that pipeline.

## Resolution

- Aggregate pipeline usage by both pipeline and feature.
- Display the accumulated feature total in Run Detail as `Tokens Consumed`.
- Preserve the current run total for session-specific telemetry and context calculations.

## Verification

- DB query regression test confirms the aggregate is scoped to pipeline and feature.
- Run Detail regression test confirms the accumulated token value is rendered.
