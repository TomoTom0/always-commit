# 開発者ガイド

## アーキテクチャ

このツールは主に3つのコンポーネントで構成されています：

1.  **CLI (`src/index.ts`)**: `commander` を使用してコマンドを解析し、ロジックを制御するエントリーポイントです。
2.  **状態管理 (`src/state.ts`)**: 一時的なスナップショットを追跡する `.task-memory.json` ファイルを管理します。
3.  **Gitラッパー (`src/git.ts`)**: `simple-git` のラッパーで、Git操作を実行します。

## 状態管理

状態はプロジェクトルートの `.task-memory.json` に保存されます。

```typescript
interface State {
  commits: {
    hash: string;      // 完全なSHA-1ハッシュ
    message: string;   // コミットメッセージ
    timestamp: number; // タイムスタンプ
  }[];
}
```

## テスト

テストには `bun:test` を使用しています。

```bash
bun test
```

## 開発

1.  依存関係のインストール: `bun install`
2.  ツールの実行: `bun run src/index.ts`
