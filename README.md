# always-commit

# always-commit

LLMを使用したコーディングセッション中に、一時的なGitスナップショットを管理するためのCLIツールです。

## インストール

```bash
bun install
bun link
```

## 使い方

`always-commit` または短縮エイリアス `alcom` コマンドが使用できます。

### スナップショットの保存

```bash
alcom save "WIP: 実装中"
```

### 直前のスナップショットの取り消し

```bash
alcom undo
```

### 作業の完了（コミットの統合）

```bash
alcom finish "feat: 新機能の実装完了"
```

### 履歴の確認

```bash
$ alcom log
2d2facd --alcom-- test prefix
...
```

### Gitコマンドの実行（パススルー）

`alcom git` を使用して、任意のGitコマンドを実行できます。`@base` はセッション開始時のコミットハッシュに置換されます。

```bash
alcom git diff --stat @base
```

### Claude Code Hook Example

Claude Codeの `user_prompt_submit` フックなどで使用するスクリプト例です。プロンプトの冒頭30文字をコミットメッセージとして保存します。

```bash
#!/bin/bash
input=$(cat)
prompt=$(echo "$input" | jq -r .prompt | sed -E 's/^(.{30}).*$/\1/')
alcom save "$prompt"
```

詳細なドキュメントは [docs/usage/index.md](docs/usage/index.md) を参照してください。
