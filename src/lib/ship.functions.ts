/**
 * Shipping a generated project out of Nexura.
 *
 * The chat never hands the user code to paste — the project lives in the live
 * workspace and leaves it as a zip, a GitHub repository, or a deploy bundle.
 * GitHub pushes run server-side so the personal access token never touches the
 * browser bundle or our database: it is used for the request and discarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const pushInput = z.object({
  token: z.string().min(20, "Paste a GitHub personal access token with repo scope."),
  repo: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, "Repository name may only contain letters, numbers, . _ and -"),
  owner: z.string().optional(),
  private: z.boolean().default(true),
  message: z.string().default("Update from Nexura AI"),
  files: z.record(z.string(), z.string()),
});

const API = "https://api.github.com";

async function gh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "nexura-ai",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { ok: res.ok, status: res.status, json };
}

/** Create the repo if needed, then commit every project file in one tree. */
export const pushProjectToGitHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pushInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sign in to push a project to GitHub.");

    const me = await gh(data.token, "/user");
    if (!me.ok) throw new Error("GitHub rejected the token. Check that it has `repo` scope.");
    const owner = data.owner?.trim() || (me.json["login"] as string);

    let repoRes = await gh(data.token, `/repos/${owner}/${data.repo}`);
    if (!repoRes.ok) {
      const created = data.owner
        ? await gh(data.token, `/orgs/${owner}/repos`, {
            method: "POST",
            body: JSON.stringify({ name: data.repo, private: data.private, auto_init: true }),
          })
        : await gh(data.token, "/user/repos", {
            method: "POST",
            body: JSON.stringify({ name: data.repo, private: data.private, auto_init: true }),
          });
      if (!created.ok) {
        throw new Error(
          `Could not create ${owner}/${data.repo}: ${String(created.json["message"] ?? created.status)}`,
        );
      }
      repoRes = await gh(data.token, `/repos/${owner}/${data.repo}`);
    }

    const branch = (repoRes.json["default_branch"] as string) || "main";

    // Existing head (empty repos have none).
    const refRes = await gh(data.token, `/repos/${owner}/${data.repo}/git/ref/heads/${branch}`);
    const baseCommit = refRes.ok
      ? ((refRes.json["object"] as { sha?: string } | undefined)?.sha ?? null)
      : null;

    let baseTree: string | null = null;
    if (baseCommit) {
      const commit = await gh(data.token, `/repos/${owner}/${data.repo}/git/commits/${baseCommit}`);
      baseTree = ((commit.json["tree"] as { sha?: string } | undefined)?.sha ?? null);
    }

    // Blobs → tree → commit → ref (one commit for the whole project).
    const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const [path, content] of Object.entries(data.files)) {
      const blob = await gh(data.token, `/repos/${owner}/${data.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content, encoding: "utf-8" }),
      });
      if (!blob.ok) throw new Error(`Failed to upload ${path}: ${String(blob.json["message"] ?? blob.status)}`);
      tree.push({ path, mode: "100644", type: "blob", sha: blob.json["sha"] as string });
    }

    const treeRes = await gh(data.token, `/repos/${owner}/${data.repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify(baseTree ? { base_tree: baseTree, tree } : { tree }),
    });
    if (!treeRes.ok) throw new Error(`Failed to build tree: ${String(treeRes.json["message"] ?? treeRes.status)}`);

    const commitRes = await gh(data.token, `/repos/${owner}/${data.repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: data.message,
        tree: treeRes.json["sha"],
        parents: baseCommit ? [baseCommit] : [],
      }),
    });
    if (!commitRes.ok)
      throw new Error(`Failed to commit: ${String(commitRes.json["message"] ?? commitRes.status)}`);

    const commitSha = commitRes.json["sha"] as string;
    const update = await gh(data.token, `/repos/${owner}/${data.repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitSha, force: true }),
    });
    if (!update.ok) {
      const create = await gh(data.token, `/repos/${owner}/${data.repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }),
      });
      if (!create.ok)
        throw new Error(`Failed to update ${branch}: ${String(create.json["message"] ?? create.status)}`);
    }

    return {
      ok: true as const,
      repoUrl: `https://github.com/${owner}/${data.repo}`,
      branch,
      commit: commitSha.slice(0, 7),
      files: Object.keys(data.files).length,
    };
  });
