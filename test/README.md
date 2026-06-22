# テスト構成

## テストランナー

- **vitest** で実行
- 実行コマンド: `pnpm test`（`vitest run` 相当）
- 個別実行: `pnpm test test/<ファイル名>.test.ts`
- タイムアウト: `vitest.config.ts` の `testTimeout: 60000` で全テスト共通設定（WSL2等での `tsx` 起動コスト吸収）

## ディレクトリ構成

```
test/
├── README.md                                 # このファイル：テスト構成と更新方針
├── helpers.ts                                # 共通ヘルパー（spawnSync ベースのalcom実行・git操作）
├── setup.test.ts                             # setup コマンド（src/setup.ts 直import）
├── state.test.ts                             # 状態管理（src/state.ts 直import）
├── docs.test.ts                              # docs コマンド
└── verify_*.test.ts                          # 統合テスト（CLI経由で src/index.ts をtsxで実行）
```

## 命名規則

| パターン | 分類 | 対象 |
|---|---|---|
| `<unit>.test.ts` | ユニットテスト | `src/` の各モジュールを直接importしてテスト |
| `verify_<feature>.test.ts` | 統合テスト（E2E） | 一時gitリポジトリを作り、`tsx src/index.ts` 経由で実際のCLI挙動を検証 |

## 重要なテスト対象（必須）

- **finish コマンドのコミット構成** (`verify_git_rm`, `verify_merge_commit`, `verify_finish_*`)
  - `git rm` によるファイル削除が最終コミットに反映されること
  - マージコミット・多数スナップショットの圧縮が正しいこと
- **save --auto** (`verify_auto_message`)
  - 差分統計からコミットメッセージが正しく生成されること
- **undo / redo** (`verify_redo`, `verify_undo_message`)
  - 操作順序・出力メッセージ・スタック管理が正しいこと
- **状態管理** (`state.test.ts`)
  - `baseCommit` の更新・`undoStack` の整合性
- **setup** (`setup.test.ts`)
  - hookスクリプト配置・settings.json更新
- **リカバリ** (`verify_recovery`, `verify_advanced_recovery`)
  - git履歴からのセッション復元

## テストヘルパー (`helpers.ts`)

- `sh(cmd, args, { cwd })` / `shOrThrow(...)`: 汎用spawnSyncラッパー
- `alcom(args, cwd)` / `alcomOrThrow(...)`: `tsx src/index.ts` を実行
- `gitInit(cwd)`: 一時gitリポジトリを初期化（user.name/email含む）

統合テストでは必ず `mkdtemp` 等で一時ディレクトリを作り、終了時に削除すること。

## テスト更新が必要なタイミング

| 変更内容 | 必要なテスト |
|---|---|
| 新しいコマンド・オプション追加 | `verify_<feature>.test.ts` 新規作成、`docs.test.ts` のトピック確認 |
| finish/save/undo/redo の挙動変更 | 対応する `verify_*.test.ts` の更新・追加 |
| 状態ファイル（`state.ts`）の構造変更 | `state.test.ts` の更新 |
| `src/setup.ts` の変更 | `setup.test.ts` の更新 |
| リカバリ・baseCommit探索ロジックの変更 | `verify_recovery`, `verify_advanced_recovery`, `state.test.ts` の確認 |
| エラーメッセージ・出力フォーマットの変更 | `verify_output_improvements.test.ts` の更新 |

## 注意事項

1. **並列実行対応**: テストは `tmpdir()` で一意なディレクトリを使い、固定パスの競合を避けること（PR #5 で指摘）
2. **Node.js 互換性**: Bun固有APIは使わず `node:*` 標準モジュール / `child_process` を使用（PR #6 で移行）
3. **実際のgit操作**: `simple-git` をmockせず、一時リポジトリで実際のgitコマンドを扱う（本番挙動との乖離を防ぐため）
