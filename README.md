# always-commit

LLMを使用したコーディングセッション中に、一時的なGitスナップショットを管理するためのCLIツールです。

## インストール

### npm

```bash
npm install -g always-commit
```

### npx (インストールなしで実行)

```bash
npx always-commit <command>
```

### 開発用

```bash
git clone https://github.com/TomoTom0/always-commit.git
cd always-commit
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

### 変更状況の確認

```bash
# セッション開始からの変更ファイル一覧
alcom status

# セッション開始からの差分
alcom diff
```

### 履歴の確認

現在のアクティブセッションに含まれるコミットを表示します。

```bash
$ alcom log
2d2facd 2025-12-23 10:30:00 --alcom-- test prefix
...
```

### セッション状態の再構築

通常は自動的に実行されますが、手動でセッション状態を再構築できます。

```bash
alcom base-update
```

### Gitコマンドの実行（パススルー）

`alcom git` を使用して、任意のGitコマンドを実行できます。`@base` はセッション開始時のコミットハッシュに置換されます。

```bash
alcom git diff --stat @base
```

## Claude Code との連携

Claude Codeの `user_prompt_submit` フックで使用するスクリプト例です。プロンプトの冒頭30文字をコミットメッセージとして保存します。

```bash
#!/bin/bash
input=$(cat)
prompt=$(echo "$input" | jq -r .prompt | sed -E 's/^(.{30}).*$/\1/')
alcom save "$prompt"
```

詳細なドキュメントは [docs/usage/index.md](docs/usage/index.md) を参照してください。

## License

[MIT](./LICENSE)
