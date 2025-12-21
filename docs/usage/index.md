# ユーザーガイド

`always-commit` は、LLMを使用したコーディングセッション中に一時的なGitスナップショットを管理するためのCLIツールです。Git履歴を汚すことなく頻繁に進捗を保存し、作業完了後にそれらをクリーンな1つのコミットにまとめることができます。

エイリアスとして `alcom` も使用可能です。

## インストール

```bash
bun install
```

## コマンド

### `save`

現在の作業内容の一時的なスナップショットを保存します。

```bash
bun run src/index.ts save [message]
```

- **[message]**: オプション。スナップショットの説明。デフォルトは "WIP: snapshot" です。
- **動作**: すべての変更をステージング (`git add .`) し、コミットを作成して内部状態に記録します。

### `undo`

直前のスナップショットを取り消します。

```bash
bun run src/index.ts undo
```

- **動作**: 最後のコミットを取り消し（前の状態へのハードリセット）、内部状態から削除します。
- **安全性**: 誤ったデータ損失を防ぐため、現在のHEADが最後に記録されたスナップショットと一致するかを確認します。

### `finish`

すべての一時的なスナップショットを1つのコミットにまとめます。

```bash
bun run src/index.ts finish <message>
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
### `base-hash`

現在のセッション（最初の一時スナップショット）の直前のコミットハッシュを表示します。

```bash
alcom base-hash
```

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

直近のコミット履歴を表示します。デフォルトでは `alcom save` による自動保存コミットのみを表示します。

```bash
alcom log [options]
```

- **オプション**:
    - `-n, --number <count>`: 表示するコミット数（デフォルト: 10）
    - `-a, --all`: すべてのコミットを表示（手動コミットも含む）
    - `--manual-depth <count>`: 直近のN個の手動コミットまでの履歴を表示

**例**:

```bash
$ alcom log
2d2facd --alcom-- test prefix
...

$ alcom log --all
7fbc848 refactor: update docs and index
2d2facd --alcom-- test prefix
...
```

## 活用例

### Claude Code Hook

Claude Codeの `user_prompt_submit` フックなどで使用するスクリプト例です。プロンプトの冒頭30文字をコミットメッセージとして保存します。

```bash
#!/bin/bash
input=$(cat)
prompt=$(echo "$input" | jq -r .prompt | sed -E 's/^(.{30}).*$/\1/')
alcom save "$prompt"
```
