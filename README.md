# Aegis Engineering

[简体中文](README.zh-CN.md)

A configuration-only DeepSeek Harness Plugin Bundle: Lead (`reliable-dev`, displayed as **Aegis Engineering**) and six independent, continuable local subagent presets. Target: **DSH desktop 0.2.1-rc.2**, build `332895e0f7c9d4dbfb29729f5eb367fa263ff986`. Older global CLI releases are not supported. No core changes, custom session database, runtime plugin, installation scripts or machine-specific paths.

| Preset | Responsibility |
| --- | --- |
| `reliable-dev` | Investigate, obtain approval, coordinate, recover and deliver |
| `aegis-planner` | Read-only investigation and complete versioned plan |
| `aegis-coder` | Approved source/config/tests and non-UI checks |
| `aegis-knowledge-curator` | Approved knowledge documentation, or NO_CHANGE |
| `aegis-reviewer` | Independent current-diff review |
| `aegis-project-mentor` | Read-only teaching in Chinese |
| `aegis-git-operator` | Separately authorized stage, commit and push |

All seven presets mount the same workspace tool set: file read, write, edit and search, plus the platform shell pair (the Windows face resolves to Git Bash `bash`). Role boundaries are prompt-level rules, not tool restrictions. The Lead alone mounts `aegis_delegate` and `list_agents`; children gain no secondary delegation. Reviewer uses `git status`/`git diff`/`rg` for evidence instead of repeated whole-file reads.

The 0.2.1-rc.2 local `spawn` provider implements continuations automatically; the obsolete `backgroundMode` field is deliberately absent. Lead delegates through one `aegis_delegate` tool with an explicit `agent_preset`, retains the returned child id, and uses `send_message` directly; it falls back to `list_agents` only after a restart, a lost id, or genuinely ambiguous status. A finished activation releases execution resources; persisted sessions survive and can resume. The six roles start only when needed. The host's default `maxActiveSubagents` is 8; tests also exercise limits of 2 and 1. Cold recovery requires retained session storage and the same available preset IDs; it mounts the currently installed preset revision, not a frozen copy of an older bundle.

Planner, Coder, Reviewer and Git Operator can use the official `send_message` tool to ask their direct parent Lead for a decision, report a blocker or material risk, and Lead can steer them while they work. Knowledge Curator and Project Mentor are completion-only. The call returns delivery confirmation, not a reply. Unrelated or idle roles are not queried, woken or broadcast to; normal completion uses the official notice, and history recovery is only for missing results or a broken connection.

## Task tiers

Lead classifies conservatively before planning and states the tier in the approval summary.

| Tier | Use | Flow |
| --- | --- | --- |
| Small | One logical, reversible, single-module diff (roughly at most four files and 150 changed lines; text/CSS/docs-only may reach five files/200 lines with no logic or contract impact); no public API, security/permissions, payment, data/migration, dependency/toolchain, production config, destructive operation or cross-module refactor; knowledge impact none or a small knowledge-only update; verification is inspection or one existing targeted check. | Lead brief -> approval -> Coder (or Curator for a small knowledge-only update) -> Lead check; no Planner or independent Reviewer. |
| Normal | Ordinary feature or bug fix. | Planner -> approval -> Coder -> optional Curator -> focused independent Reviewer -> Lead check. Reviewer gets the diff, acceptance criteria and existing evidence; review covers changed files/direct interfaces, uses a soft ~20-30 tool-call budget and reports blocking findings only. |
| High-risk | Security/permissions, payment, data/migration, destructive operations, public API/contract, dependency/toolchain, production config, cross-module refactor, or large/uncertain diff. | Normal flow plus only the necessary extra verification and explicit risk notes; Reviewer depth may exceed the soft budget only for a specific unresolved blocking risk. |

When unsure choose normal or high-risk, never small. Do not downgrade a high-risk task because speed is requested. Scope or risk growth stops work, reclassifies and requires new approval. The user may request the normal/high-risk flow. A small-tier Lead check must inspect the actual diff and targeted evidence; if it cannot verify safely, use the normal flow. Lead final checks do not repeat the Reviewer's independent audit or rerun valid checks; a non-blocking note that does not violate an explicit acceptance criterion may be accepted without rework.

Desktop defaults to `openAt: never` for the search index. Recovery does not enable indexing: Lead reads the original child's raw events with `session_event_read`, starting at `seq: 0, after: 50`, advances using returned event sequence numbers, and fully reads the identified result. Full-text search is optional when available; disabled search falls back to raw reads without spawning another child.

## Install, update and roll back

Source repository: [EthanQing/my_workflow](https://github.com/EthanQing/my_workflow). The bundle package name remains `dsh-aegis-engineering`. No `v0.1.0` tag or GitHub Release has been created. Changing your desktop installation or replacing an existing preset requires separate authorization.

Use the **matching desktop carrier's plugin installation interface**, select the intended profile, and supply a local bundle path or the release source. Do not use an older global `dsh` CLI to manage a desktop profile. A matching standalone 0.2.1-rc.2 carrier accepts:

```text
dsh plugin --profile <profile> add /absolute/path/to/dsh-aegis-engineering
dsh plugin --profile <profile> add github:EthanQing/my_workflow#main
dsh plugin --profile <profile> add github:EthanQing/my_workflow#<actual-commit-sha>
```

After installing, create a session and select **Aegis Engineering**. Installation declares the preset automatically; it does not change your default selection. Host prerequisites are the desktop's official preset registry, local spawn/subagent services, filesystem/search, session persistence/query and shell providers. Do not install this bundle into an empty Cordis kernel without these services.

`main` is a moving branch. For reproducible installation, replace `<actual-commit-sha>` with a real commit from the repository history; do not type the placeholder literally. Update by installing a newer verified commit, or roll back by installing the previously recorded commit. Verify the seven presets and begin a new session. Preserve session storage, your profile patch and the prior commit before updating. GitHub network installation and update/rollback have not been runtime-tested. For removal use `dsh plugin --profile <profile> remove dsh-aegis-engineering` in a matching carrier. Existing sessions may need the presets restored before they can resume.

**Conflict:** duplicate `reliable-dev` IDs fail rather than overwrite another preset. The inspected desktop profile already contains an unrelated local `reliable-dev`. Do not remove it automatically. Use an independent profile first; migration/removal needs user approval. Built-in presets are not edited.

## Windows shell

The verified Windows host is DSH desktop 0.2.1-rc.2 with `dsh-gitbash-shell` 0.38.5. The plugin replaces the process-wide `ctx.shell` with Git for Windows bash (`bash.exe -c`; currently `C:/Program Files/Git/bin/bash.exe`) and, for a preset face with `pwsh` but no `bash`, activates the official `bash` tool and masks the fake `pwsh`. All seven roles therefore see `bash` with MSYS paths and must use bash syntax. If the face instead exposes a real `pwsh` tool, Git Bash integration is not active: use PowerShell syntax only for genuinely Windows-native operations and state the limitation.

All seven presets intentionally keep the official per-platform tool pair (`tool-pwsh` on win32, `tool-bash` elsewhere) as the plugin's input. Do not statically flip it to `tool-bash`: on a Windows profile without the Git Bash executor, the bash tool would dispatch to the pwsh executor — the mismatch this bundle avoids. Hosts without the plugin are outside the verified scope.

## Daily execution boundaries

Daily work uses minimal sufficient verification: inspect docs/comments/text edits; use one existing targeted check for a small fix; run one most relevant build or test for a normal feature; add only genuinely necessary checks for high-risk work; follow an explicit user request for full tests. Do not default to new smoke scripts, full suites, repeated builds, new test frameworks/dependencies, unrelated checks or large reports. When a temporary verification file is unavoidable, put it in the OS temp directory and remove it before finishing; never leave it in the business project, hide it via `.gitignore`, use `git clean`/wildcard deletion, or delete pre-existing user files or legitimate build output. Reviewer and Lead do not rerun checks whose evidence remains valid. Essential verification for security/data-integrity work is not optional, and unrun checks must be reported honestly.

These are prompt-level behavioral rules, not host enforcement; host permissions and user approval remain the final boundary.

Tool access no longer distinguishes roles. Every preset can read, write, edit and run the platform shell; Planner, Reviewer, Mentor, Lead, Curator and Git Operator stay within their prompts by discipline, not by missing tools. This is not system-level isolation. The shell itself can modify files and run Git, and on Windows the third-party Git Bash executor may run confined shell calls under different effective sandbox semantics (the plugin reports this), while file tools remain under the host sandbox policy. The user's DSH permission mode and approval still apply, and prompts cannot guarantee that a model never oversteps.

## Development and verification

No dependency installation is required when using a copied matching desktop runtime. Set `AEGIS_DSH_RUNTIME` to its directory (the directory containing `package.json` and `node_modules`). The supplied workspace defaults to `../../work/desktop-runtime`.

```text
npm test
npm run test:runtime
npm pack --dry-run
```

`AEGIS_TEST_HOME` optionally selects a new isolated test directory. Tests write only there and under the copied runtime's `aegis-test-configs/`; never point this at your installed runtime or personal home. The runtime runner sets `DSH_HOME` for its child process. Test fixtures supply deterministic model output and never load account credentials. See [validation](docs/validation.md) for actual results, installation limitations and manual checks; [architecture](docs/architecture.md) describes boundaries.

This is prompt-driven coordination, not a hardened permission system. The supported Desktop/Web composition disables base-global model tools and lets presets own their surfaces. A bare base host or additional globally registered tools can expose extra capabilities and is outside this tool-boundary guarantee. All seven presets now expose mutation and shell tools; role boundaries require correct model behavior and host permissions, and prompts are not an OS sandbox. No real-model behavioral acceptance is claimed.

## References

- [Official repository](https://github.com/deepseek-ai/deepseek-harness)
- [Plugin publishing](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
- [Agent Preset](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md)
- [Subagent mechanism](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent/README.md)
- [Delegation tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md)
- [Tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)
- [Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)

Current master references can change; the installed desktop build above is the implementation baseline. License has not been selected; the package is marked UNLICENSED pending a release decision.
