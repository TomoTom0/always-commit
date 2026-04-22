# Claude Code との連携

`always-commit` は Claude Code と組み合わせることで、コーディングセッション中に自動的にスナップショットを保存できます。

## 仕組み

Claude Code の Hooks 機能を使い、プロンプト送信ごとに `alcom save` を自動実行します。これにより、AIが変更を加える前の状態を常に保持できます。

```
ユーザーがプロンプトを送信
    → UserPromptSubmit hook 発火
    → alcom save <timestamp>  # 自動スナップショット
    → Claude が作業を開始

セッション終了
    → alcom finish "feat: ..."  # スナップショットをまとめて1コミット
```

## セットアップ

### 自動セットアップ（推奨）

`alcom setup` コマンドでhookスクリプトの配置とClaude Codeのsettings.json登録を自動化できます。

```bash
# グローバル設定（~/.claude/settings.json）に登録
alcom setup

# プロジェクト設定（.claude/settings.json）に登録
alcom setup --project

# 変更内容を確認してから実行
alcom setup --dry-run
```

### 手動セットアップ

#### 1. always-commit のインストール

```bash
npm install -g always-commit
```

#### 2. hook スクリプトの配置

`scripts/claude-code-hook.sh` をシステムの任意の場所に配置します。

```bash
# 例: ~/.local/bin/ に配置する場合
cp scripts/claude-code-hook.sh ~/.local/bin/alcom-save.sh
chmod +x ~/.local/bin/alcom-save.sh
```

#### 3. Claude Code の settings.json に hook を登録

`~/.claude/settings.json`（グローバル設定）または `.claude/settings.json`（プロジェクト設定）を編集します。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${HOME}/.local/bin/alcom-save.sh"
          }
        ]
      }
    ]
  }
}
```

## 推奨: ブランチ切り替え時のガード

セッション中に `git checkout` / `git switch` でブランチを切り替えると、一時スナップショットが意図しないブランチに残留します。`PreToolUse` hook で防止できます（`git checkout -- <file>` などのファイル復元操作はブロックされません。`git checkout -b` / `git checkout -B` によるブランチ作成もブロック対象です）。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cmd=$(jq -r '.tool_input.command // \"\"' 2>/dev/null); if echo \"$cmd\" | grep -qE 'git checkout(\\s+-[bB]|\\s+[^\\s-]|\\s*$)' || echo \"$cmd\" | grep -qE 'git switch'; then if [ -n \"$(alcom log 2>/dev/null)\" ]; then printf '{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"permissionDecision\": \"deny\", \"permissionDecisionReason\": \"alcomの未完了コミットがあります。先にalcom finishを実行してください。なお、alcom finishを実行するとスナップショットコミットが1つにまとめられ消滅します。切り替え後に必要な作業が残っていないか（未反映の変更、別ブランチへの移植が必要な修正など）を確認してからfinishしてください。\"}}'; fi; fi"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${HOME}/.local/bin/alcom-save.sh"
          }
        ]
      }
    ]
  }
}
```

## 無効化

特定のプロジェクトで alcom を無効にしたい場合は、プロジェクトルートの `.env` または `.env.local` に以下を追記します。

```bash
ALCOM_ALLOW=false
```

環境変数でも制御できます。

```bash
ALCOM_ALLOW=false claude
```

## 典型的なワークフロー

```bash
# 1. Claude Code を起動してタスクを依頼
#    → プロンプト送信ごとに自動スナップショット

# 2. セッション中の変更状況を確認
alcom status
alcom diff

# 3. 直前のスナップショットに戻したい場合
alcom undo

# 4. セッション完了: 全スナップショットを1コミットにまとめる
alcom finish "feat: ユーザー認証の実装"

# 5. git log はクリーンな状態になる
git log --oneline
```

## alcom コマンドリファレンス（Claude Code セッション中）

| コマンド | 説明 |
|---|---|
| `alcom status` | セッション開始以降の変更ファイル一覧 |
| `alcom diff` | セッション開始以降の差分 |
| `alcom log` | 現在のセッションのスナップショット一覧 |
| `alcom undo` | 直前のスナップショットを取り消す |
| `alcom finish "<message>"` | 全スナップショットを1コミットにまとめる |
