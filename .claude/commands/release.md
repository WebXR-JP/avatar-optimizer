---
allowed-tools:
  - Bash(git status:*)
  - Bash(git fetch:*)
  - Bash(git checkout:*)
  - Bash(git pull:*)
  - Bash(git merge:*)
  - Bash(git push:*)
  - Bash(git branch:*)
  - Bash(gh run:*)
  - Bash(gh pr:*)
  - Bash(ls:*)
  - Bash(cat:*)
  - Bash(npm view:*)
---

現在のブランチを main にマージし、npm パッケージを公開する。

## 実行手順

### 1. 事前確認

作業ディレクトリの状態と Changeset の存在を確認:

```bash
git status --porcelain
ls .changeset/*.md 2>/dev/null | grep -v README.md | head -5
```

- uncommitted changes がある場合は警告して中断
- Changeset ファイルがない場合は `pnpm changeset` の実行を促す

### 2. main にマージ

現在のブランチ名を保存し、main にマージ:

```bash
CURRENT_BRANCH=$(git branch --show-current)
git fetch origin main
git checkout main
git pull origin main
git merge $CURRENT_BRANCH --no-edit
git push origin main
```

マージコンフリクトが発生した場合は手動解決を促す。

### 3. Release PR の待機

GitHub Actions の release.yml が完了するまで待機:

```bash
gh run watch $(gh run list --branch main --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Release PR が作成されたか確認:

```bash
gh pr list --base main --head changeset-release/main --json number,title,url
```

### 4. Release PR を自動マージ

PR が見つかったら auto-merge を有効化:

```bash
PR_NUMBER=$(gh pr list --base main --head changeset-release/main --json number -q '.[0].number')
gh pr merge $PR_NUMBER --auto --squash
```

### 5. 公開完了の確認

Release PR マージ後の publish ワークフローを監視:

```bash
gh run watch $(gh run list --branch main --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

完了したら npm パッケージの公開状況を報告。

## 注意事項

- Changeset ファイルがない場合、Release PR は作成されない
- `gh auth login` 済みであること
- Release PR の auto-merge にはリポジトリ設定で有効化が必要
