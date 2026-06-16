// Fire a GitHub Actions `workflow_dispatch` from server code. Used by the
// Vercel cron at /api/kounta/dispatch to start the Kounta live-sales monitor
// each morning — Vercel's scheduler is reliable where GitHub's `schedule`
// trigger drops runs for hours at a time (the cause of blank-morning sales).

const GITHUB_API = 'https://api.github.com'

export type DispatchRequest = { url: string; body: string }

/**
 * Build the REST request for a workflow_dispatch. Pure (no I/O) so it can be
 * unit-tested. `repo` is `owner/name`; `workflow` is the workflow file name.
 */
export function buildWorkflowDispatch(
  repo: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>,
): DispatchRequest {
  const [owner, name] = repo.split('/')
  if (!owner || !name) throw new Error(`Invalid repo "${repo}" — expected "owner/name"`)
  return {
    url: `${GITHUB_API}/repos/${owner}/${name}/actions/workflows/${workflow}/dispatches`,
    body: JSON.stringify({ ref, inputs }),
  }
}

export type DispatchResult = { ok: true } | { ok: false; status: number; message: string }

/**
 * POST the dispatch to GitHub. Returns a structured result rather than throwing
 * so the cron route can report cleanly. A successful dispatch is HTTP 204.
 */
export async function dispatchWorkflow(
  token: string,
  repo: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string>,
): Promise<DispatchResult> {
  const { url, body } = buildWorkflowDispatch(repo, workflow, ref, inputs)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'bluepoppy-ops',
      'Content-Type': 'application/json',
    },
    body,
  })
  if (res.status === 204) return { ok: true }
  const message = await res.text().catch(() => '')
  return { ok: false, status: res.status, message: message.slice(0, 500) }
}
