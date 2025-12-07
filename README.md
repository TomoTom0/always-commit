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

詳細なドキュメントは [docs/usage/index.md](docs/usage/index.md) を参照してください。
