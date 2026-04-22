# Unreleased

## Fix

- `PreToolUse` hook の正規表現を `-[bc]` から `-[bB]` に修正（`-c` は `git checkout` に存在しないオプション、`-B` 抜けで `git checkout -B` がブロック対象外になっていた）

