# Workflow & Quality Assurance Rules

## 1. Intent Analysis & Multi-Skill Synergy
- Before taking action on any request, analyze which skills from the catalog best match the problem dimensions:
  - **Clarification & Decisions**: `grilling` (`/grill-me`)
  - **UI/UX & Feature Behavior**: `brainstorming`, `prototype`
  - **Architecture & Interfaces**: `codebase-design`
  - **Data Models & Business Logic**: `domain-modeling`
  - **Bug & Crash Diagnosis**: `diagnosing-bugs`, `systematic-debugging`
  - **Standards & Specs**: `research`
  - **Plan Structuring**: `writing-plans`
- Announce active skills and perform comprehensive analysis across all relevant perspectives.

## 2. Multi-Perspective Analysis in Implementation Plan
- Synthesize all analytical results (architecture, domain models, edge cases, UI/UX) directly into the `implementation_plan.md` artifact.
- When the user answers grilling questions, **DO NOT start executing code immediately**.
- First update `implementation_plan.md` (`RequestFeedback: true`, `UserFacing: true`) incorporating all confirmed answers, architecture decisions, and detailed file changes.
- Output a concise summary in chat and direct the user to review the plan.

## 3. Strict Approval Gate (No Premature Execution)
- The agent **MUST NEVER begin modifying code or executing commands** until the user explicitly confirms (e.g. *"เริ่มทำ"*, *"อนุมัติ"*, *"ตกลงตามแผน"*) or clicks the **Proceed** button on `implementation_plan.md`.

## 4. Mandatory Testing on Code Changes
Whenever code is modified, always verify the 4 testing suites:
1. `pnpm lint` (0 errors)
2. `pnpm type-check` (0 compiler errors)
3. `pnpm test` (100% tests passed)
4. `pnpm build` (All static pages and backend compilation OK)
