# 開発者ガイド

## アーキテクチャ

このツールは主に4つのコンポーネントで構成されています：

1.  **CLI (`src/index.ts`)**: `commander` を使用してコマンドを解析し、ロジックを制御するエントリーポイントです。
2.  **状態管理 (`src/state.ts`)**: 一時的なスナップショットを追跡する状態ファイルを管理します。
3.  **Gitラッパー (`src/git.ts`)**: `simple-git` のラッパーで、Git操作を実行します。`CODING_AGENT_ROOT` 環境変数が設定されている場合はそのディレクトリを、未設定の場合は現在の作業ディレクトリをGit作業ディレクトリとして使用します。
4.  **セットアップ (`src/setup.ts`)**: Claude Code との連携設定（hookスクリプト配置・settings.json登録）を行います。

## 状態管理

状態ファイルは以下の優先度で検索・保存されます：

1. `.git/always-commit.json` （最優先）
2. `./always-commit.json` （.gitと同じ階層）
3. `./.always-commit.json` （.gitと同じ階層、隠しファイル）

読み込み時は存在するファイルを優先度順に探し、保存時は書き込み可能なパスを優先度順に試行します。worktree環境では `.git` が通常のディレクトリではなくファイルになるため、このフォールバック機構により正常に動作します。

```typescript
interface State {
  commits: {
    hash: string;      // 完全なSHA-1ハッシュ
    message: string;   // コミットメッセージ
    timestamp: number; // タイムスタンプ
  }[];
  undoStack: {
    hash: string;
    message: string;
    timestamp: number;
  }[];
}
```

## テスト

テストには `vitest` を使用しています。

```bash
pnpm test
```

## 開発

1.  依存関係のインストール: `pnpm install`
2.  ビルド: `pnpm run build`
3.  テスト: `pnpm test`
