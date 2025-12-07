
### 1\. プロジェクト概要

**ツール名**: `always-commit` (仮)
**目的**: Coding LLM（Cursor, Aider等）を使用した開発において、会話ごとに「一時的なGitスナップショット」を作成し、作業完了後にそれらの履歴を破棄して「現在のファイル状態に基づいたクリーンな1コミット」を作成する。
**主要機能**:

1.  `save`: 会話の節目で現状を強制的にコミット保存する。
2.  `undo`: 直前のsave状態まで完全に巻き戻す（ファイル破壊対策）。
3.  `finish`: 蓄積した一時コミット履歴をリセットし、最終的な成果物として1つのコミットにまとめる。

### 2\. 技術スタック

  * **Runtime**: Node.js
  * **Language**: TypeScript
  * **Libraries**:
      * `commander`: CLI構築
      * `simple-git`: Git操作
      * `fs-extra`: ファイル操作 (JSON State管理)
      * `path`: パス操作

### 3\. データ構造 (State Management)

ツールが生成したコミットを追跡するために、プロジェクトルートに `.task-memory.json` を生成して管理する。

```typescript
interface State {
  // スタック形式で保存（末尾が最新）
  commits: {
    hash: string;      // コミットハッシュ (Full SHA-1)
    message: string;   // コミットメッセージ
    timestamp: number; // 保存日時
  }[];
}
```

### 4\. コマンド仕様詳説

#### 共通仕様

  * 成功・失敗時の標準出力は、他ツール連携のため **JSON形式** で行う。
  * エラー時は `process.exit(1)` する。

#### A. `save` コマンド

  * **引数**: `[message]` (デフォルト: "WIP: snapshot")
  * **動作**:
    1.  `git add .` を実行（すべての変更をステージング）。
    2.  `git commit` を実行。
    3.  生成されたコミットハッシュを取得し、`.task-memory.json` の配列末尾に追加して保存する。
  * **除外処理**: 特別なignoreオプションは不要（`finish`時に整理されるため、save時はゴミファイルが含まれても許容する）。

#### B. `undo` コマンド

  * **動作**:
    1.  `.task-memory.json` を読み込む。履歴がなければエラー。
    2.  **安全装置**: 現在の `HEAD` ハッシュと、JSON末尾のハッシュが一致するか確認。一致しない場合（ユーザーが手動でコミットした場合など）はエラーとして停止する。
    3.  `git reset --hard HEAD^` を実行。
    4.  JSON末尾のデータを削除して保存。

#### C. `finish` コマンド

  * **引数**: `<message>` (必須: 最終コミットメッセージ)
  * **動作**:
    1.  `.task-memory.json` の **先頭（最古）** の要素を取得。
    2.  そのコミットの「親ハッシュ (`commit^`)」を特定する。これを `BaseHash` とする。
    3.  `git reset --mixed BaseHash` を実行。
          * *重要*: `--mixed` を使うことで、コミット履歴は巻き戻るが、ワーキングディレクトリのファイル変更（最新の状態）は維持される。インデックス（Staging）はリセットされる。
    4.  `.task-memory.json` をファイル削除する（次のコミットに含めないため）。
    5.  `git add .` を実行。
          * *重要*: この時点でプロジェクトの `.gitignore` が適用されるため、WIP中に生成されたゴミファイル（ログ等）がignore対象ならステージングから外れる。また、削除されたファイルは正しく削除扱いになる。
    6.  `git commit -m <message>` を実行。

### 5\. 実装ファイル構成案

  * `src/index.ts`: エントリーポイント
  * `src/git.ts`: simple-gitのラッパー
  * `src/state.ts`: JSON操作ロジック

### 6\. 出力形式（JSON）

LLMが結果をパースしやすいように、コンソールログは以下の形式で統一する。

  * 成功時: `{"status": "ok", "action": "save", "hash": "..."}`
  * スキップ時: `{"status": "skipped", "reason": "no_changes"}`
  * エラー時: `{"status": "error", "message": "..."}`

-----

### 依頼事項

上記の仕様に基づき、`package.json` の依存関係定義と、`src/index.ts` を中心とした完全な実装コードを作成してください。