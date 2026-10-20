# Aegis Engineering

[English](README.md)

纯配置的 DeepSeek Harness Plugin Bundle，安装后注册 **Aegis Engineering**，主预设 ID 为 `reliable-dev`。支持桌面端 **0.2.1-rc.2**，源码构建 `332895e0f7c9d4dbfb29729f5eb367fa263ff986`；不支持拿旧版全局 CLI 代替桌面端。不修改 DSH 本体，不自建会话数据库，不含自定义运行时或安装脚本。

七个角色共享同一套工作区工具：文件读取、写入、编辑、搜索和平台 Shell（Windows 上最终为 Git Bash `bash`）。职责由提示词约束，不再靠隐藏工具区分；Lead 仍独占 `aegis_delegate`/`list_agents`，子角色没有二次委派。六个独立子预设分别为 `aegis-planner`、`aegis-coder`、`aegis-knowledge-curator`、`aegis-reviewer`、`aegis-project-mentor`、`aegis-git-operator`。内部指令为英文，与用户交流默认简体中文。

## 可续聊机制

该版本本地 `spawn` 原生提供 Continuable，不再使用 `backgroundMode`。Lead 通过单一 `aegis_delegate` 工具和显式 `agent_preset` 启动角色，首次启动后保留返回的子会话 ID；后续直接用该 ID 调用 `send_message`，不先 `list_agents`。仅在会话恢复、ID 丢失或状态确实不明时用 `list_agents` 定位。角色按需启动；一次完成会释放活动实例，持久会话及 ID 可继续使用。宿主默认 `maxActiveSubagents` 为 8，测试也覆盖容量 2 和 1。

Planner、Coder、Reviewer、Git Operator 可通过官方 `send_message` 向直接父 Lead 请求决策、报告阻塞或重要风险；Knowledge Curator、Project Mentor 为完成通知单向汇报。Lead 也可在子工作期间直接补充或纠偏。消息只返回交付确认；不相关或空闲的角色不会被查询、唤醒或广播，正常完成使用官方通知，只有结果缺失或断线才进入历史恢复。

冷恢复依赖官方会话持久化、现存会话文件及相同 ID 的当前预设。恢复使用当前安装的预设版本，不保留旧插件实现副本。`session_event_search` / `session_event_read` 的跨会话查询要求工作区 cwd 字符串完全相同。缺失服务、预设或历史时应报告，不能无声新建替代会话。

桌面默认 `openAt: never`，全文索引未启用。Lead 不改变该设置；使用原子会话 ID 的 `session_event_read`，从 `seq: 0, after: 50` 读取原始事件窗口，依据返回序号继续分页，定位计划后完整读取该事件。全文搜索仅在可用时使用，禁用时转为原始读取，不能重建 Planner。

## 开发流程与批准

Lead 调查并保守分级 → 小任务：Lead brief → 明确批准 → Coder（或小知识任务用 Curator）→ Lead 核对；一般/高风险：Planner 完整计划 → 明确批准 → Coder → 按需 Curator → 聚焦的独立 Reviewer → Lead 核对。一般/高风险的完整计划留在 Planner 会话；执行角色只接收紧凑 execution brief，Reviewer 只接收 diff、验收标准和已有证据；小任务使用 Lead brief。审批提供“批准实施 / 修改计划 / 暂不实施”。拒绝或未答复时不写入。Lead 终检不重复 Reviewer 的独立审查，也不重跑仍有效的检查；非阻塞备注若不违反明确验收标准，可直接接受，不必返工。

## 任务分级

Lead 在规划前保守分级，并在审批摘要中写明层级：

| 层级 | 适用 | 流程 |
| --- | --- | --- |
| 小 | 单一逻辑、单模块、小 diff、可逆（约 ≤4 个文件、150 行；纯文本/CSS/文档且无逻辑或契约影响时可到 5 个文件/200 行）；不涉及公共 API、安全/权限、支付、数据完整性/迁移、依赖/工具链、生产配置、破坏性操作、跨模块重构；知识影响为空或仅限小知识任务；验证为检查或一项已有针对性检查 | Lead brief → 批准 → Coder（或小知识任务用 Curator）→ Lead 核对；不启动 Planner/Reviewer |
| 一般 | 普通功能/修复 | Planner → 批准 → Coder → 按需 Curator → 聚焦的独立 Reviewer → Lead 核对。Reviewer 只审查改动文件及其直接依赖，软预算约 20–30 次工具调用，只报阻塞项 |
| 高风险 | 安全/权限、支付、数据/迁移、破坏性操作、公共 API/契约、依赖/工具链、生产配置、跨模块重构、大范围/不确定 diff | 一般流程 + 真正必要的额外验证和风险说明；Reviewer 仅在确有未解决的具体阻塞风险时可超出软预算 |

不确定时归为一般/高风险；不因用户要求速度而降级高风险；范围/风险扩大时停止、重新分级并取得新批准；用户可要求完整流程。小任务的 Lead 核对必须查看实际 diff 和针对性证据；无法安全核对时按一般流程处理。Lead 终检不重复 Reviewer 的独立审查，也不重跑仍有效的检查；非阻塞备注不违反明确验收标准时可直接接受，不必返工。

新任务、新工作区和实质范围变化重新规划审批；历史上下文不等于永久授权。写入角色串行执行，知识库 NO_CHANGE 直接跳过。审查和最终核对合计最多三轮返工，同一问题连续两轮无实质进展提前停下。只读问题可由 Lead 回答；教学直接调用 Mentor；纯知识库任务跳过 Coder，保留规划、批准和审查。Git 暂存、提交、推送分别取得当前任务的明确授权。

## 安装、升级与回滚

源码仓库为 [EthanQing/my_workflow](https://github.com/EthanQing/my_workflow)，Bundle 包名保持 `dsh-aegis-engineering`。本次交付源码；没有创建 `v0.1.0` 标签或 GitHub Release。

优先在**同版本桌面端的插件安装入口**选择目标 profile，输入本地 Bundle 目录或发布来源。不要用旧全局 CLI 管理桌面 profile。对应 0.2.1-rc.2 独立运行载体的命令语法为：

```text
dsh plugin --profile <profile> add /absolute/path/to/dsh-aegis-engineering
dsh plugin --profile <profile> add github:EthanQing/my_workflow#main
dsh plugin --profile <profile> add github:EthanQing/my_workflow#<actual-commit-sha>
```

安装后在新会话选择 **Aegis Engineering**，无需创造模式。插件自动声明预设，但不强行改变默认选项。依赖桌面自带的 preset registry、本地 spawn、文件与搜索、会话持久化与查询、Shell 服务；不是单独的 DSH 宿主。

`main` 会随推送移动。需要固定版本时，将 `<actual-commit-sha>` 替换为仓库历史中真实存在的提交 SHA，不要直接输入占位符。升级时安装较新的已核实提交；回滚时安装之前记录的提交，并在新会话核实七预设。保留旧提交、profile patch 和会话存储。GitHub 网络安装、升级与回滚尚未做运行时验证。移除语法为 `dsh plugin --profile <profile> remove dsh-aegis-engineering`；移除后原会话可能需恢复预设才能续聊。

**ID 冲突：**重复 `reliable-dev` 会显式失败，不自动覆盖。已检查的用户桌面 profile 中有另一个本地包占用此 ID，应先用独立 profile 测试，迁移或移除须单独批准。本项目不会修改它或官方内置预设。修改当前桌面安装仍需单独批准。

## Windows 与工具边界

Windows 宿主以 DSH desktop 0.2.1-rc.2 + `dsh-gitbash-shell` 0.38.5 为已验证组合。插件把进程级 `ctx.shell` 换成 Git for Windows bash（`bash.exe -c`，当前解析到 `C:/Program Files/Git/bin/bash.exe`），并在会话创建时把“有 pwsh、无 bash”的工具面替换为官方 `bash` 工具、遮蔽伪 `pwsh`。因此七个角色在 Windows 上都应看到 **`bash`**（MSYS 路径，如 `/c/Users/...`），必须使用 bash 语法；不得对 `bash` 写 PowerShell 语法，也不得把 `pwsh` 当作 Git Bash 使用。若工具面只剩真正的 `pwsh`，说明 Git Bash 集成未生效：使用 PowerShell 方言时须明确说明这一限制，不要伪造工具名。

七个预设都保留官方平台工具行（win32 下 `tool-pwsh`、非 win32 下 `tool-bash`）；这是 `dsh-gitbash-shell` 行内补丁的输入，不是最终模型工具名。不要把它静态翻成 `tool-bash`：在未装或未启用 Git Bash 执行器的 Windows profile 上，`bash` 工具会落到 pwsh 执行器，反而制造错配。插件不固化本机可执行文件路径；未安装该插件的 Windows profile 不在本次验证范围内。

支持的 Desktop/Web 组合会禁用 base 层全局模型工具，由各预设提供工具。裸 base 宿主不属于支持范围；用户另装的全局工具插件也可能扩大实际暴露面。

工具访问权限不再用于区分角色。七个预设都能读写文件并运行平台 Shell；Planner、Reviewer、Mentor、Lead、Curator、Git Operator 的只读、只审查、只写知识、只做 Git 等边界都靠提示词自律，而不是靠缺少工具。**这不是系统级安全隔离**：Shell 本身可以修改文件、执行 Git；Windows 上第三方 Git Bash 执行器在受限模式下的实际沙箱行为可能与文件工具不同（插件会标注），文件工具仍受宿主沙箱策略约束。用户选择的 DSH 宿主权限和沙箱、以及用户审批仍然是有效边界；不能声称提示词能百分之百阻止越权行为。真实模型是否遵守流程需另做验收。

## 日常执行边界

日常开发遵循最小充分验证：文档、注释、简单文案修改只检查修改内容；小范围代码修复优先用一项已有针对性检查；一般功能执行一次最相关的构建或测试；高风险改动只补真正必要的验证；用户明确要求全面测试时按要求执行。默认不新建烟测脚本、不跑全量套件、不重复相同构建、不引入新测试框架或依赖、不做无关检查、不为小任务生成大量报告。确实需要临时验证文件时放在 OS 临时目录，结束前清理自己创建的文件；不得留在业务项目目录，不得改写 `.gitignore` 隐藏，不得用 `git clean` 或通配符删除处理项目文件，也不得删除用户已有文件或合法构建产物。Reviewer 和 Lead 不重复已执行且结果仍有效的检查；安全/数据完整性等高风险改动的关键验证不能省略，未执行项必须如实列为限制。

这些是提示词行为约束，不是系统级强制执行；宿主权限、沙箱模式和用户审批仍是最终边界。工具统一不等于提升权限：本 bundle 不会把会话改成 `danger-full-access`，也不会绕过宿主已经拒绝的操作。

## 测试与人工验收

从同版本桌面端隔离复制运行时后，将 `AEGIS_DSH_RUNTIME` 指向含 `package.json`、`node_modules` 的复制目录。当前工作区默认 `../../work/desktop-runtime`，无需新增依赖。

```text
npm test
npm run test:runtime
npm pack --dry-run
```

`AEGIS_TEST_HOME` 可指定新的隔离目录；测试会写该目录及复制运行时的 `aegis-test-configs/`，不能指向正式安装或个人 home。运行脚本为测试子进程设置隔离 `DSH_HOME`。使用可控模型适配器，不读取用户模型凭据。真实模型连接本次由用户选择暂不提供，因此未执行真实模型行为验收。完整证据与限制见[验证说明](docs/validation.md)，职责和恢复机制见[架构说明](docs/architecture.md)。

桌面交互、视觉和真实模型审批遵守情况等待用户验收，代理未操作 GUI。许可证尚待决定，当前包标记 UNLICENSED；本次不创建版本标签或 Release。官方参考链接见英文 README。
