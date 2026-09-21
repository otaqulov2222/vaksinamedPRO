# GitHub branch protection — EXTERNAL OPS REQUIRED

Cursor/agents cannot enable required status checks without repository admin rights.

## Exact steps (GitHub UI)

1. Open repository → **Settings** → **Branches** → **Add branch protection rule** (or edit `main`/`master`).
2. Enable **Require status checks to pass before merging**.
3. Require these check names (must match workflow `name:` / job `name:`):

   - `Typecheck`
   - `Build + tests + migration + backup drill`
   - `Docker image build`

4. Optionally enable **Require branches to be up to date before merging**.
5. Do **not** allow bypass for production protectors except emergency break-glass accounts.

## Evidence

Until an admin completes the above, document:

`GITHUB_REQUIRED_CHECKS = EXTERNAL_OPS_REQUIRED`

Workflow file (repository-ready): `.github/workflows/ci.yml`
