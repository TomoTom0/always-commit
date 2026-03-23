# ユーザーガイド

`always-commit` は、LLMを使用したコーディングセッション中に一時的なGitスナップショットを管理するためのCLIツールです。Git履歴を汚すことなく頻繁に進捗を保存し、作業完了後にそれらをクリーンな1つのコミットにまとめることができます。

エイリアスとして `alcom` も使用可能です。

## インストール

```bash
npm install -g always-commit
```

npxで実行する場合（インストール不要）：

```bash
npx always-commit <command>
```

開発用（ソースから実行）：

```bash
git clone https://github.com/TomoTom0/always-commit.git
cd always-commit
bun install
bun link
```

## コマンド

### `save`

現在の作業内容の一時的なスナップショットを保存します。

```bash
alcom save [message]
```

- **[message]**: オプション。スナップショットの説明。デフォルトは "WIP: snapshot" です。
- **動作**: すべての変更をステージング (`git add .`) し、コミットを作成して内部状態に記録します。

### `undo`

直前のスナップショットを取り消します。

```bash
alcom undo
```

- **動作**: 最後のコミットを取り消し（前の状態へのハードリセット）、内部状態から削除します。
- **安全性**: 誤ったデータ損失を防ぐため、現在のHEADが最後に記録されたスナップショットと一致するかを確認します。

### `finish`

すべての一時的なスナップショットを1つのコミットにまとめます。

```bash
alcom finish <message>
```

- **<message>**: 必須。最終的なコミットメッセージ。
- **動作**:
    - **セッションが存在する場合**（一時スナップショットがある場合）:
        1.  ブランチを最初のスナップショット前の状態にリセット（mixed reset）し、ファイル変更は保持します。
        2.  内部状態をクリアします。
        3.  指定されたメッセージで新しいコミットを作成します。
    - **セッションが存在しない場合**（`save`を一度もしていない場合）:
        1.  現在の変更を通常のコミットとして保存します。
        2.  通常の`git commit`と同じように動作します。

**備考**: `alcom save`を使用せずに直接`alcom finish`を実行することで、通常のコミットとして変更を保存できます。

### `auto-squash`

一時スナップショット（`save` コミット）を後続の手動コミットにマージします。

```bash
alcom auto-squash
```

- **動作**: セッション内の `save` コミットを、その後に続く手動コミットに統合します。
- **制限**: セッションの最初のコミットが root commit の場合はエラーになります。
- **注意**: 履歴を書き換えるため、使用には注意が必要です。

### `base-hash`

現在のセッション（最初の一時スナップショット）の直前のコミットハッシュを表示します。

```bash
alcom base-hash
```

### `base-update`

現在のセッション状態を HEAD から再構築します。通常は自動的に実行されるため、手動で実行する必要はありません。

```bash
alcom base-update
```

- **動作**: HEAD から連続する `--alcom--` コミットを探し、セッション状態ファイルを更新します。
- **使用例**: セッション状態ファイルが壊れた場合や、手動で状態を確認したい場合に使用します。

**備考**: `alcom status` や `alcom log` などのコマンドは、実行時に自動的にセッション状態を再構築するため、通常はこのコマンドを手動で実行する必要はありません。

### `git` (パススルー)

Gitコマンドを実行します。引数内の `@base` は、セッション開始時のコミットハッシュに置換されます。

```bash
alcom git diff --stat @base
```

### `status`

セッション開始時から現在までの変更ファイル一覧を表示します。
`alcom git diff --name-status @base` のエイリアスです。

```bash
alcom status
```

### `diff`

セッション開始時から現在までの変更内容を表示します。
`alcom git diff @base` のエイリアスです。

```bash
alcom diff
```

### `log`

現在のアクティブセッションに含まれるコミットを表示します。

```bash
alcom log [options]
```

- **オプション**:
    - `-n, --number <count>`: 表示するコミット数（デフォルト: 10）
    - `-a, --all`: すべてのコミットを表示（現在は未使用）

- **動作**:
    - HEAD が `--alcom--` コミットの場合、セッションに含まれるコミットを表示します。
    - HEAD が通常のコミット（`alcom finish` 後など）の場合、何も表示しません（セッションが存在しないため）。

**例**:

```bash
# アクティブセッションがある場合
$ alcom log
2d2facd 2025-12-23 10:30:00 --alcom-- WIP: refactoring
...

# セッションがない場合（finish 後など）
$ alcom log
# （何も表示されない）
```

## セッション管理

`always-commit` は、HEAD から常に正しいセッション状態を自動的に構築します。

### 状態ファイルの保存場所

セッション状態は以下の優先度で検索・保存されます：

1. `.git/always-commit.json` （最優先）
2. `./always-commit.json` （.gitと同じ階層）
3. `./.always-commit.json` （.gitと同じ階層、隠しファイル）

読み込み時は存在するファイルを優先度順に探し、保存時は書き込み可能なパスを優先度順に試行します。

### 自動セッション構築

すべてのコマンド（`status`, `log`, `diff` など）は、実行時に以下の処理を自動的に行います：

1. HEAD が `--alcom--` コミットかどうかをチェック
2. HEAD が `--alcom--` コミットの場合、HEAD から連続する `--alcom--` コミットを収集
3. セッション状態ファイルを更新
4. HEAD が通常のコミットの場合、セッション状態をクリア

これにより：
- セッション状態ファイルが壊れても自動的に修復されます
- `alcom finish` 後は自動的にセッションがクリアされます
- 手動でセッション状態を管理する必要はありません

### Root Commit への対応

セッションの最初のコミットが root commit（親コミットが存在しない）の場合でも、正しく動作します：

- `status`, `diff` コマンドは、Git の空のツリーハッシュを base として使用します
- root commit を含むセッションでも、すべてのコマンドが正常に動作します

### `setup`

Claude Code との連携設定を自動化します。hookスクリプトの配置と `settings.json` へのhook登録を行います。

```bash
alcom setup
```

- **--project**: プロジェクト設定（`.claude/settings.json`）に登録。デフォルトはグローバル（`~/.claude/settings.json`）
- **--script-dir \<dir\>**: hookスクリプトの配置先ディレクトリ（デフォルト: `~/.local/bin`）
- **動作**:
    1. `alcom-save.sh` をスクリプトディレクトリに配置します
    2. `UserPromptSubmit` hookを `settings.json` に登録します
    3. `PreToolUse` ブランチ切り替えガードを `settings.json` に登録します

### `docs`

ドキュメントを表示します。

```bash
alcom docs [topic]
```

- **[topic]**: 表示するトピック（`usage`, `dev`, `design`）。省略するとトピック一覧を表示します。

```bash
# トピック一覧を表示
alcom docs

# ユーザーガイドを表示
alcom docs usage
```

## 活用例

### Claude Code との連携

Claude Code との連携方法（hookスクリプト・settings.json設定・ワークフロー）の詳細は [agent-integration.md](agent-integration.md) を参照してください。

```bash
# 自動セットアップ
alcom setup
```
