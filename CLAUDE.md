# always-commit

LLM支援コーディングセッション中の一時スナップショット管理CLI。

## ランタイム

- Node.js >=18
- 配布: `dist/index.js` を `node` で実行（npm publish済み）
- Bun固有API（`Bun.spawn`, `Bun.serve`, `bun:sqlite` 等）は使用禁止。`node:*` 標準モジュール / `child_process` を使う（PR #6 参照）

## ビルド / テスト

- ビルド: `pnpm run build`（内部で `esbuild` を使用してESMバンドル + shebang付与）
- テスト: `pnpm test`（`vitest` で実行）
- 依存管理: pnpm

## 主要依存

- `commander`: CLIパース
- `simple-git`: gitラッパー
- `fs-extra`: ファイル操作

## 開発時の注意

- 子プロセスでTypeScriptを実行する場合は `tsx` を使う（`node_modules/.bin/tsx`）
- テストヘルパーは `test/helpers.ts`（`spawnSync` ベース）
