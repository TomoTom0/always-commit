# 次期バージョン（未リリース）

## New Features

- `alcom save --auto`: 変更ファイルの差分情報からコミットメッセージを自動生成する機能を追加。変更量が多い順に `path (+added/-deleted)` 形式でソート・表示される (#38)
- `alcom status --short`: ファイル件数とtruncated listで簡易表示するオプションを追加
- `alcom log --long`: メッセージを省略せずに全文表示するオプションを追加
- `alcom undo`/`alcom redo`: 実行後にstderrで残りスナップショット数と現在の変更状況を表示
- `alcom log`: メッセージの省略制限を30文字から60文字に拡大、`--alcom--`プレフィクスを非表示に変更
- `CODING_AGENT_ROOT` 環境変数サポート: 設定されている場合、そのディレクトリの`.git`を作業ディレクトリとして使用

## Bug Fixes

（変更内容をここに記載）

## Changes

（変更内容をここに記載）

## Performance

（変更内容をここに記載）

## Refactoring

（変更内容をここに記載）

## Repository Management

（変更内容をここに記載）

## Internal Improvements

（変更内容をここに記載）

## Known Issues

（変更内容をここに記載）
