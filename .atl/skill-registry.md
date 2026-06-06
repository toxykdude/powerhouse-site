# Skill Registry — powerhouse-site

**Generated**: 2026-06-06
**Project**: powerhouse-site
**Scan paths**: `~/.config/opencode/skills/`

## Available Skills

| Skill                | Trigger                                                              | Path                                                          | Scope |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----- |
| branch-pr            | Creating, opening, or preparing PRs for review                       | `/root/.config/opencode/skills/branch-pr/SKILL.md`            | user  |
| chained-pr           | PRs over 400 lines, stacked PRs, review slices                       | `/root/.config/opencode/skills/chained-pr/SKILL.md`           | user  |
| cognitive-doc-design | Writing guides, READMEs, RFCs, onboarding, architecture docs         | `/root/.config/opencode/skills/cognitive-doc-design/SKILL.md` | user  |
| comment-writer       | PR feedback, issue replies, reviews, Slack messages, GitHub comments | `/root/.config/opencode/skills/comment-writer/SKILL.md`       | user  |
| go-testing           | Go tests, go test coverage, Bubbletea teatest, golden files          | `/root/.config/opencode/skills/go-testing/SKILL.md`           | user  |
| issue-creation       | Creating GitHub issues, bug reports, feature requests                | `/root/.config/opencode/skills/issue-creation/SKILL.md`       | user  |
| judgment-day         | Dual review, adversarial review, blind review                        | `/root/.config/opencode/skills/judgment-day/SKILL.md`         | user  |
| plane-sync           | Sync project to Plane, workspace setup                               | `/root/.config/opencode/skills/plane-sync/SKILL.md`           | user  |
| sdd-apply            | Implement SDD tasks from specs and design                            | `/root/.config/opencode/skills/sdd-apply/SKILL.md`            | user  |
| sdd-archive          | Archive completed SDD change, sync delta specs                       | `/root/.config/opencode/skills/sdd-archive/SKILL.md`          | user  |
| sdd-design           | Create SDD technical design and architecture                         | `/root/.config/opencode/skills/sdd-design/SKILL.md`           | user  |
| sdd-explore          | Explore SDD ideas before committing to change                        | `/root/.config/opencode/skills/sdd-explore/SKILL.md`          | user  |
| sdd-onboard          | Walk users through SDD workflow on codebase                          | `/root/.config/opencode/skills/sdd-onboard/SKILL.md`          | user  |
| sdd-propose          | Create SDD change proposal                                           | `/root/.config/opencode/skills/sdd-propose/SKILL.md`          | user  |
| sdd-spec             | Write SDD delta specs with requirements and scenarios                | `/root/.config/opencode/skills/sdd-spec/SKILL.md`             | user  |
| sdd-tasks            | Break SDD change into implementation tasks                           | `/root/.config/opencode/skills/sdd-tasks/SKILL.md`            | user  |
| sdd-verify           | Verify SDD change against specs, design, and tasks                   | `/root/.config/opencode/skills/sdd-verify/SKILL.md`           | user  |
| skill-creator        | New skills, agent instructions, AI usage patterns                    | `/root/.config/opencode/skills/skill-creator/SKILL.md`        | user  |
| skill-improver       | Improve, audit, refactor skills                                      | `/root/.config/opencode/skills/skill-improver/SKILL.md`       | user  |
| work-unit-commits    | Plan commits as reviewable work units                                | `/root/.config/opencode/skills/work-unit-commits/SKILL.md`    | user  |

## Project Convention Files

| File      | Path                               |
| --------- | ---------------------------------- |
| AGENTS.md | `/root/.config/opencode/AGENTS.md` |

## Notes

- `_shared` and `skill-registry` are infrastructure skills — excluded from dispatch.
- `sdd-*` skills are orchestrator-managed; loaded via the SDD workflow, not manually.
- No project-level skills detected in `{project-root}/.opencode/skills/` or `{project-root}/.atl/skills/`.
