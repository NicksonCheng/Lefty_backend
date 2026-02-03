import dotenv from 'dotenv';
dotenv.config();

// Note: octokit v3+ is ESM only. In a CommonJS project, we use dynamic import() to load it.

/**
 * Fetches the latest run of a specific workflow (or all workflows if not specified)
 * and returns its status and conclusion.
 * @param owner GitHub repository owner
 * @param repo GitHub repository name
 */
export const getLatestWorkflowStatus = async (owner: string, repo: string): Promise<string> => {
  try {
    const { Octokit } = await import("octokit");
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // List workflow runs for the repository
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
      owner,
      repo,
      per_page: 1, // We only need the latest one
    });

    if (data.workflow_runs.length === 0) {
      return "No workflow runs found.";
    }

    const latestRun = data.workflow_runs[0];
    return `Latest run: ${latestRun.name} (ID: ${latestRun.id}) - Status: ${latestRun.status}, Conclusion: ${latestRun.conclusion}`;

  } catch (error: any) {
    return `Error fetching workflow status: ${error.message}`;
  }
};

/**
 * Triggers a workflow_dispatch event to start a deployment.
 * @param owner GitHub repository owner
 * @param repo GitHub repository name
 * @param branch Branch to trigger the workflow on
 */
export const triggerDeploy = async (owner: string, repo: string, branch: string): Promise<string> => {
  try {
    const { Octokit } = await import("octokit");
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    
    // We assume the deployment workflow file is named 'deploy.yml' based on project structure.
    const workflow_id = "deploy.yml";

    await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner,
      repo,
      workflow_id,
      ref: branch,
    });

    return `Successfully triggered deployment for ${owner}/${repo} on branch ${branch}`;
  } catch (error: any) {
    return `Error triggering deploy: ${error.message}`;
  }
};
