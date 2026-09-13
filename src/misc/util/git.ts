export interface IGitCommit {
  hash: string;
  date: Date;
  author: string;
  message: {
    subject: string;
    body: string | null;
  };
}

export const FORK_GITHUB_REPO = "lovelyspacedog/material-e621";
export const UPSTREAM_GITHUB_REPO = "avoonix/material-e621";

/** Authors treated as this fork's personal commits (vs upstream Material e621). */
export const isForkAuthor = (author: string) =>
  /tony\s*pup/i.test(author.trim());

export const commitGithubUrl = (entry: IGitCommit) => {
  const repo = isForkAuthor(entry.author)
    ? FORK_GITHUB_REPO
    : UPSTREAM_GITHUB_REPO;
  return `https://github.com/${repo}/commit/${entry.hash}`;
};

export const getGitBranchInfo = () => String(import.meta.env.VITE_GIT_BRANCH);

export const getGitInfo = (): IGitCommit[] =>
  String(import.meta.env.VITE_GIT_COMMIT_INFO)
    .split(";;;;;")
    .filter((s) => s)
    .map((commitStr) => {
      const parts = commitStr.split(";", 4);
      const text = parts[3].trim();
      const hasBody = text.indexOf("\n") !== -1;
      const subject = hasBody ? text.substring(0, text.indexOf("\n")) : text;
      const body = hasBody ? text.substring(text.indexOf("\n") + 1) : null;
      const author = parts[2].trim();
      return {
        hash: parts[0].trim(),
        date: new Date(parts[1].trim()),
        author,
        message: {
          subject,
          body,
        },
      };
    });

export const createIssueLink = (args: { title: string; body: string }) => {
  const params = new URLSearchParams(Object.entries(args)).toString()
  return `https://github.com/avoonix/material-e621/issues/new?${params}`;
}
