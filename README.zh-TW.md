# Agent Bridge

[English](README.md)

讓 ZCode 連接你已安裝的 Codex、Cursor 和 Claude Code CLI。每個 CLI 保留自己的帳戶登入；GLM 使用 ZCode 原生帳戶連接，並可選用 profile 工作流。

這是本機 bridge，不是託管模型服務。它只監聽 `127.0.0.1`，驗證原生模型及 session 證據，並把憑證和執行紀錄存於已忽略的 `.bridge/`。它不會替你安裝上游應用程式，也不包含模型訂閱。

## 選擇連接方式

| 連接 | 任務執行方式 | 帳戶 | ZCode 裏的 provider |
| --- | --- | --- | --- |
| Codex | 回傳文字或經驗證的工具呼叫，由 ZCode 執行工具 | 現有 Codex 登入 | Agent Bridge |
| Cursor | 原生 ask mode 回傳文字或工具呼叫，由 ZCode 執行工具 | 現有 Cursor 登入 | Agent Bridge |
| Claude Code | 使用自己的工具執行委派任務，可修改當前工作區 | 現有 Claude Code 登入 | Claude Bridge |
| GLM | ZCode 原生模型；可選用 plan-mode profile worker | ZCode 桌面登入；profile 工作流另用獨立 CLI 登入 | ZCode 原生 provider |

目標平台是 Windows、macOS 和 Linux。[驗證狀態](docs/compatibility.md) 會分開列出離線測試、安裝檢查和已登入帳戶的實際請求。模型存取仍取決於你的帳戶、CLI 版本和選擇的模型。

## 1. 安裝必要工具

安裝 Git、**Node.js 24 或以上**、[ZCode](https://zcode.z.ai/en/docs/install)，以及你要使用的 CLI。先開啟 ZCode 並完成首次設定，讓它建立 provider 設定檔。只有 GLM profile 工作流需要個人 agent profiles。

```sh
git clone https://github.com/Phlegonlabs/agent-bridge.git
cd agent-bridge
npm ci --ignore-scripts
node --version
```

使用以下官方安裝方式。安裝後若找不到指令，先開啟新的終端機。Bridge 不會自動執行這些安裝器。

| CLI | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/setup) | `irm https://claude.ai/install.ps1 \| iex` | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Codex](https://github.com/openai/codex/blob/main/README.md) | `irm https://chatgpt.com/codex/install.ps1 \| iex` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| [Cursor CLI](https://cursor.com/docs/cli/installation) | `irm 'https://cursor.com/install?win32=true' \| iex` | `curl https://cursor.com/install -fsS \| bash` |

直線前的反斜線只用來處理 Markdown 表格；實際指令使用普通的 `|`。Windows 上 Claude 的工作區 shell 工具需要 Git for Windows，讓原生 CLI 提供 Bash。Claude／Codex 要使用原生 executable，不要選 npm `.cmd` launcher。Cursor CLI 的指令是 `agent`，不是編輯器的 `cursor` launcher。

分別執行 `claude --version`、`codex --version` 或 `agent --version` 確認所選 CLI。可選的 `scripts/setup-cursor.ps1` 會保留已驗證的舊 Windows x64 套件於 `.bridge/tools`，它不是跨平台安裝入口。

## 2. 登入並檢查模型

針對你要使用的 provider 執行對應指令：

```sh
node bin/bridge.mjs login --provider claude
node bin/bridge.mjs login --provider codex
node bin/bridge.mjs login --provider cursor
node bin/bridge.mjs doctor --provider claude
node bin/bridge.mjs doctor --provider codex
node bin/bridge.mjs doctor --provider cursor
node bin/bridge.mjs models --provider claude
node bin/bridge.mjs models --provider codex
node bin/bridge.mjs models --provider cursor
```

Login 呼叫該 provider 的官方 CLI，容許約五分鐘完成瀏覽器授權。已登入的使用者可略過 login，直接執行 doctor。原始登入輸出保留在私人紀錄，公開結果只包含狀態，不包含帳戶憑證。

Doctor 分開顯示 `installed`、`authenticated`、`modelSelectable` 和 `requestVerified`。Preflight 通過**不代表模型請求成功**。Codex 讀取本機模型 cache；缺少 cache 時，登入後先開啟官方 `codex`，讓 CLI 建立它。Cursor 讀取原生 catalog。Claude 顯示的是 adapter 候選模型，不是帳戶權益清單；你可指定其他完整的 `claude-...` ID，再以實際請求驗證。

`doctor --provider all` 檢查四個 provider。未安裝的 provider 可能讓總檢查 exit 1；只安裝部分 CLI 時，使用個別檢查即可。

## 3. 設定 Bridge

在互動式終端機啟動設定引導：

```sh
node bin/bridge.mjs setup
```

引導會詢問 providers、在需要時提供登入、顯示模型選項、要求完整模型 ID 和 fallback 選擇，然後展示設定，再儲存並註冊至 ZCode。可以只設定一個 provider，不必安裝其餘 CLI。

Claude 預設為 `workspace-write`：Read／Glob／Grep、`./**` 內的 Edit／Write，以及畫面列出的 shell 指令模式。這些模式包含語言及建置工具和本機 Git 指令。這是 CLI 權限政策，不是作業系統 sandbox。請檢查列出的規則；worker 任務仍禁止 publish、刪除、背景服務和繞過權限。唯讀委派可加上 `--write-mode read-only`。

要重複使用相同設定，可明確指定所有選項。以下模型 ID 是範例，請換成你的 catalog 裏的 ID：

```sh
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback off --dry-run
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback off
node bin/bridge.mjs setup --providers cursor --models cursor:composer-2.5 --fallback off
```

這些是不同的替代設定。後一次 setup 會先備份，再替換 Bridge 所選的 routes；請一次列出所有要保留的 provider／模型。其他 ZCode providers 和 manual overrides 會保留。重複相同設定不會新增重複 provider，也不會改寫相同內容。

`--dry-run` 只檢查並展示設定，不儲存或註冊。`--port 32147` 指定本機連接埠。`--config FILE` 指定儲存位置；啟動及註冊該設定時也要使用相同選項。

設定讀取順序：

1. 明確指定的 `--config FILE`。
2. Setup 建立的 `.bridge/config/native-provider.json`。
3. 現有的 `config/native-provider.json`。

Setup 不改寫受 Git 管理的舊設定，也不遷移既有 sessions。已變更的本機設定及 ZCode 註冊檔會備份至 `.bridge/`。備份同樣要保密。

### 可選的 Claude fallback

選擇 `off`，或一個已選用的 Codex 模型 ID。目標必須存在於產生的 routes，並支援要求的 reasoning effort：

```sh
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback gpt-6.1-sol --fallback-effort xhigh
```

Fallback 在 Claude timeout 或 rate／usage limit 後，先完成 worker cleanup，再讓 Codex 透過 ZCode 工具延續任務。它會先檢查部分完成的工作，保留原本的檔案及指令限制，不重跑失敗的 Claude turn。權限拒絕、取消、模型不符、protocol failure 和未確認的 cleanup 不觸發 fallback。帶有 session 識別的 Claude turn 會先送出 heartbeat，再回傳已驗證的最終文字。其他 provider routes 保留原本選擇的模型。

## 4. 啟動 Provider 並連接 ZCode

讓以下前景程序在終端機保持執行：

```sh
node bin/provider.mjs
```

自訂設定使用 `node bin/provider.mjs --config FILE`。成功會顯示 `ready: true` 和本機位址。已通過驗證、設定相同的 Bridge 會被重用。其他服務或不同設定占用連接埠時，會回報 `PORT_IN_USE`；重新啟動前先檢查既有程序。Bridge 不會自動換連接埠或終止其他服務。

在 ZCode 的模型選單，Codex／Cursor 選 **Agent Bridge**，Claude 選 **Claude Bridge**，再選設定好的模型及 reasoning level。註冊使用 OpenAI Chat Completions，預設位址為 `http://127.0.0.1:32147/v1`。Setup 處理本機 token，不需要把 CLI 帳戶 token 貼到 ZCode。

送出第一個任務：**不要使用工具或改動檔案，只回覆 BRIDGE_PROBE_OK。** 確認回覆。Claude 需要開啟專案工作區；可寫委派也需要 ZCode 提供 session ID 和工作目錄 context。

`http://127.0.0.1:32147/health` 只代表服務 ready。需要驗證的 `/status` 和 `/v1/models` 顯示 queues 及 routes，兩者都不能證明帳戶／模型存取成功。`/v1/chat/completions` 處理模型請求，接受文字及 function schemas，不接受圖片輸入。

也可獨立驗證原生 CLI 請求：

```sh
node bin/bridge.mjs doctor --provider codex --live --model gpt-6.1-sol --cwd .
node bin/bridge.mjs doctor --provider claude --live --model claude-opus-5-5 --cwd .
node bin/bridge.mjs doctor --provider cursor --live --model composer-2.5 --cwd . --trust-workspace
```

`requestVerified: true` 代表該 CLI 回傳正確 marker，且具備原生完成／模型證據；它不代表 ZCode UI 的完整連接已驗證。檢查 UI 請求時，在本機查看 `.bridge/provider/requests` 裏的已驗證結果，不要上傳原始紀錄。

按 Ctrl+C 停止前景程序。`node scripts/stop-provider.mjs` 對目前設定的 provider 要求 graceful shutdown，也會取消執行中的請求；自訂設定請加上 `--config FILE`。舊的 Windows scheduled-task 安裝器仍供現有使用者使用；這版不包含跨平台開機啟動。Scheduled task 可能重新啟動已停止的 Windows provider。

## GLM：原生連接及 Profile 工作流

一般 GLM 聊天使用 [ZCode Connect Models](https://zcode.z.ai/en/docs/configuration)，並選擇原生 GLM 模型，不需要註冊 Agent Bridge provider。

若使用可選的 CLI profile 工作流，不會假設桌面登入已授權獨立 CLI 帳戶：

```sh
node bin/bridge.mjs login --provider zcode
node scripts/install-example-agents.mjs
node bin/bridge.mjs profiles
node bin/bridge.mjs models --provider zcode
node bin/bridge.mjs doctor --provider zcode
node bin/bridge.mjs run --provider zcode --agent bridge-explorer --cwd . --task-file examples/probe-task.txt
```

範例安裝器在你的使用者 `.zcode/agents` 目錄建立 `bridge-explorer.md` 和 `bridge-reviewer.md`。任一檔案已存在就拒絕覆寫。執行前確認它們的 provider-qualified 模型 ID 適用於你的帳戶。這些是通用範例，repo 不包含個人 profiles。

Profiles 必須使用 `permissionMode: plan`、明確的唯讀工具，且不啟用 agent memory。可寫 profile 或被專案同名 profile 遮蔽的項目會被拒絕。`--expected-model PROVIDER/MODEL` 只驗證模型，不會覆寫 profile 的模型。成功需要 `ok: true`、預期的 actual model 和原生 child-session 證據，CLI exit 0 並不足夠。

把這個 checkout 開成 ZCode 專案，要求以 `CreateWorkflow` 執行 `saved.name: glm-parallel-probe`、`saved.scope: project`。`glm-cursor-probe` 再加入明確信任工作區的 Cursor probe。先檢查儲存檔案裏的模型 ID、trust 和 deadlines。工作流使用範例 profile 名稱；若用其他名稱，也要修改工作流指令。

## 單次任務及儲存工作流

```sh
node bin/bridge.mjs run --provider claude --model claude-opus-5-5 --cwd . --task-file examples/probe-task.txt
node bin/bridge.mjs run --provider codex --model gpt-6.1-sol --cwd . --task-file examples/probe-task.txt
node bin/bridge.mjs run --provider cursor --model composer-2.5 --cwd . --task-file examples/probe-task.txt --trust-workspace
node bin/bridge.mjs presets
```

Standalone Claude 維持唯讀；可寫執行和持續 session 屬於已設定的 native delegate routes。Cursor trust 只接受指定工作區，ask mode 不啟用可寫 worker。外部 workers 不會繼承 ZCode 桌面的 Computer Use。

`model-bridge` 是已儲存的批次工作流。受 Git 管理的 preset 使用特定 Cursor／Claude 模型，只是範例，不是所有帳戶的 catalog。使用前複製並調整成你帳戶的模型，CLI workflow／presets 指令以 `--config FILE` 指定；自訂桌面工作流指令也要使用同一份檔案。Codex 可使用 native provider routes 及單次任務，既有批次 preset adapter 尚不支援它。

批次工作流可接收明確的獨立 `{id, worker, task}` jobs，或使用 ZCode 原生 planning actor。相依階段分成後續批次。上限是 14 個執行中的 jobs，不代表要建立 14 個 jobs。Preset fallback 與 Claude native-provider fallback 各自獨立，範例的 preset fallback 預設關閉。[工作流設定](docs/workflow-presets.md) 包含 deadlines、候選規則及完整結果讀取方式。

## 圖片、Sessions 及維護

- **Codex 圖片：** 把描述寫入 UTF-8 prompt 檔案，再執行 `node bin/codex-image.mjs --cwd . --prompt-file PROMPT_FILE`。使用原生 Codex 圖片生成及現有登入，不會改用付費 Image API。已驗證的 PNG 複製至新的 `generated-images/codex-UUID/image.png` 目錄。安裝附帶的 [ZCode skill](skills/codex-imagegen/SKILL.md) 前，要填入你的 checkout 路徑；此入口不支援參考圖片編輯。
- **Claude sessions：** 已完成 turns 延續原生 session，重複的已完成請求使用儲存結果。工作區／政策改變或未確認的中斷寫入會被拒絕。使用 `node scripts/claude-session-recovery.mjs .bridge/provider/sessions inspect --session-id ID --session-type TYPE` 檢查。Recovery 前必須確認原生歷史、檔案及程序狀態，詳見 [recovery 說明](docs/native-provider.md)。
- **更新：** 檢查執行中的工作，再停止自己的 provider、pull repo、執行 `npm ci --ignore-scripts`，檢查 catalog 改變，然後重新 setup 或執行 `node scripts/register-provider.mjs --update`。自訂註冊使用 `--config FILE`。明確重新啟動，既有 sessions 不會被自動重跑或遷移。
- **上限：** 全域 14、Codex 4、Claude 4、Cursor 12。Claude 預設單次 attempt 75 分鐘，含排隊的 request 90 分鐘。可在 provider 設定中調整 `claudeDelegate.attemptTimeoutMs` 及 `claudeDelegate.requestTimeoutMs`。未設定時使用這些預設值，不改寫既有檔案。Codex 及 Cursor 保留通用設定中的上限；批次 preset 的期限獨立計算。本機上限不計算其他應用程式消耗的訂閱額度。不支援的 reasoning strength 會明確失敗。
- **私人資料：** 不要公開 `.bridge`、`.env`、CLI 憑證、個人 profiles 或原始對話。Windows 使用本機帳戶繼承權限。Provider 保持只監聽 loopback。

## 疑難排解

Claude 長任務重連時，使用相同的 session headers、模型、effort 及請求內容。
Bridge 會接回原本的任務，切換串流或一次回傳也適用。
已完成的重複請求會回傳已驗證結果，不會再次執行 Claude。
同一 session 的其他執行中 turn 會收到 `SESSION_BUSY`。
關閉連線只會離開等待；worker 會繼續至完成、期限到達，或通過驗證的 provider shutdown。
重連不會重設期限，provider shutdown 會等待 worker cleanup 完成。
服務崩潰後，未完成的 session 必須先檢查，再進行 recovery。
通過驗證的 `/status` 會顯示執行中的 delegate jobs、等待連線及暫存結果數。
結果最多暫存 15 分鐘，並受數量及記憶體上限限制。
已完成的 Claude receipt 也能在暫存到期或服務重啟後回傳結果。
HTTP 重連不能保證主程式畫面只顯示一次結果。

| 結果 | 下一步 |
| --- | --- |
| `*_NOT_INSTALLED`／`*_RUNTIME_INVALID` | 使用官方原生安裝器，重開終端機，或設定下方的 executable／bundle 路徑。 |
| `AUTH_REQUIRED` | 登入該 provider，再執行 doctor。 |
| `ZCODE_CONFIG_REQUIRED` | 註冊前先開啟 ZCode 並完成首次設定。 |
| `CODEX_MODEL_CATALOG_UNAVAILABLE` | 登入後開啟官方 Codex CLI，讓它建立本機 cache。 |
| `MODEL_UNAVAILABLE`／reasoning error | 重新列出模型，選完整 ID 及已宣告的 reasoning strength。 |
| `PORT_IN_USE` | 檢查 listener，重用或明確停止正確的 provider，再重新啟動。 |
| `AGENT_NOT_FOUND`／`PROFILE_NOT_READ_ONLY` | 安裝及檢查通用 plan-mode profiles，或明確選擇既有相容 profile。 |
| Session uncertainty／工具被拒絕 | 檢查已完成的部分工作和原生證據，不重跑寫入或繞過權限。 |
| CLI 正常，但 ZCode 無法連接 | 確認 provider 已啟動、選對已註冊的 provider／模型，並讓 `localhost,127.0.0.1` bypass proxy。 |

可選環境變數：`ZCODE_BRIDGE_CLI`（官方 `zcode.cjs`）、`CLAUDE_BRIDGE_BIN`／`CODEX_BRIDGE_BIN`（原生 executable）、`CURSOR_BRIDGE_BIN`（官方 `agent` executable）、`CURSOR_BRIDGE_DIR`（官方 runtime 套件目錄）及 `CODEX_HOME`（既有 Codex state）。在執行 setup／provider 的終端機設定，Bridge 不會改寫 shell profile。Linux AppImage 使用者可先 extract 應用程式，再把 `ZCODE_BRIDGE_CLI` 指向它的 `resources/glm/zcode.cjs`。

## 開發及驗證證據

執行 `npm test` 做離線檢查。GitHub Actions 在 Windows、macOS 和 Linux 執行 Node 24 測試，不提供帳戶憑證。已登入帳戶的實際請求另記於 [compatibility notes](docs/compatibility.md)。[文件索引](docs/DOCUMENTS.md) 連結詳細教學及歷史實作紀錄。

這個 repo 以 Git checkout 分發，npm publish 維持停用。
