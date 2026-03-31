import { useState } from "react";
import { GitBranch, Search, BookOpen, ExternalLink, Copy, Check, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import { toast } from "sonner";

interface GitCommandInfo {
  name: string;
  description: string;
  syntax: string;
  options: { flag: string; description: string }[];
  examples: { command: string; description: string }[];
  category: string;
}

const gitCommandDatabase: Record<string, GitCommandInfo> = {
  clone: {
    name: "git clone",
    description: "Clone a repository into a new directory.",
    syntax: "git clone [URL]",
    category: "Init & Clone",
    options: [
      { flag: "--depth", description: "Create a shallow clone with a history truncated to the specified number of commits." },
      { flag: "-b", description: "Instead of pointing the newly created HEAD to the branch pointed to by the cloned repository's HEAD, point to a specific branch." },
    ],
    examples: [
      { command: "git clone https://github.com/user/repo.git", description: "Clone a repository" },
      { command: "git clone --depth 1 https://github.com/user/repo.git", description: "Shallow clone (only latest commit)" },
    ],
  },
  init: {
    name: "git init",
    description: "Create an empty Git repository or reinitialize an existing one.",
    syntax: "git init [directory]",
    category: "Init & Clone",
    options: [
      { flag: "--bare", description: "Create a bare repository." },
      { flag: "-b", description: "Use the specified name for the initial branch in the newly created repository." },
    ],
    examples: [
      { command: "git init", description: "Initialize a new Git repository in the current directory" },
      { command: "git init project-name", description: "Create a new directory and initialize a Git repository in it" },
    ],
  },
  add: {
    name: "git add",
    description: "Add file contents to the index (staging area).",
    syntax: "git add [file...]",
    category: "Basic Snapshotting",
    options: [
      { flag: "-A, --all", description: "Add all tracked and untracked files." },
      { flag: "-u, --update", description: "Update tracked files, but do not add new files." },
      { flag: "-p, --patch", description: "Interactively choose hunks of patch between the index and the work tree and add them to the index." },
    ],
    examples: [
      { command: "git add .", description: "Add all current changes to the staging area" },
      { command: "git add file.txt", description: "Add a specific file to the staging area" },
      { command: "git add -p", description: "Interactively add chunks of code" },
    ],
  },
  status: {
    name: "git status",
    description: "Show the working tree status.",
    syntax: "git status",
    category: "Basic Snapshotting",
    options: [
      { flag: "-s, --short", description: "Give the output in the short-format." },
      { flag: "-b, --branch", description: "Show the branch and tracking info even in short-format." },
    ],
    examples: [
      { command: "git status", description: "Show the status of the repository" },
      { command: "git status -s", description: "Show short status output" },
    ],
  },
  commit: {
    name: "git commit",
    description: "Record changes to the repository.",
    syntax: "git commit -m [message]",
    category: "Basic Snapshotting",
    options: [
      { flag: "-m", description: "Use the given message as the commit message." },
      { flag: "-a, --all", description: "Tell the command to automatically stage files that have been modified and deleted, but new files you have not told Git about are not affected." },
      { flag: "--amend", description: "Replace the tip of the current branch by creating a new commit." },
    ],
    examples: [
      { command: "git commit -m 'Initial commit'", description: "Commit with a message" },
      { command: "git commit -am 'Fix bug'", description: "Stage tracked files and commit" },
      { command: "git commit --amend --no-edit", description: "Add changes to the last commit without changing its message" },
    ],
  },
  push: {
    name: "git push",
    description: "Update remote refs along with associated objects.",
    syntax: "git push [remote] [branch]",
    category: "Sharing & Updating",
    options: [
      { flag: "-u, --set-upstream", description: "For every branch that is up to date or successfully pushed, add upstream (tracking) reference." },
      { flag: "-f, --force", description: "Force the push even if it results in a non-fast-forward update." },
      { flag: "--tags", description: "All refs under refs/tags are pushed." },
    ],
    examples: [
      { command: "git push origin main", description: "Push local main branch to origin" },
      { command: "git push -u origin feature-branch", description: "Push a new branch and set upstream tracking" },
      { command: "git push --force origin main", description: "Force push to main (use with caution!)" },
    ],
  },
  pull: {
    name: "git pull",
    description: "Fetch from and integrate with another repository or a local branch.",
    syntax: "git pull [remote] [branch]",
    category: "Sharing & Updating",
    options: [
      { flag: "--rebase", description: "Rebase the current branch on top of the upstream branch after fetching." },
      { flag: "--no-commit", description: "Perform the merge but pretend the merge failed and do not autocommit." },
    ],
    examples: [
      { command: "git pull origin main", description: "Pull changes from origin/main into current branch" },
      { command: "git pull --rebase origin main", description: "Pull and rebase instead of merge" },
    ],
  },
  fetch: {
    name: "git fetch",
    description: "Download objects and refs from another repository.",
    syntax: "git fetch [remote]",
    category: "Sharing & Updating",
    options: [
      { flag: "--all", description: "Fetch all remotes." },
      { flag: "-p, --prune", description: "Remove any remote-tracking references that no longer exist on the remote." },
    ],
    examples: [
      { command: "git fetch origin", description: "Fetch latest changes from origin without merging" },
      { command: "git fetch --all --prune", description: "Fetch from all remotes and prune deleted branches" },
    ],
  },
  branch: {
    name: "git branch",
    description: "List, create, or delete branches.",
    syntax: "git branch [branch-name]",
    category: "Branching & Merging",
    options: [
      { flag: "-a, --all", description: "List both remote-tracking branches and local branches." },
      { flag: "-d, --delete", description: "Delete a branch. The branch must be fully merged." },
      { flag: "-D", description: "Shortcut for --delete --force." },
      { flag: "-m", description: "Move/rename a branch." },
    ],
    examples: [
      { command: "git branch", description: "List local branches" },
      { command: "git branch new-feature", description: "Create a new branch" },
      { command: "git branch -d old-feature", description: "Delete a branch" },
      { command: "git branch -a", description: "List all local and remote branches" },
    ],
  },
  checkout: {
    name: "git checkout",
    description: "Switch branches or restore working tree files.",
    syntax: "git checkout [branch-name]",
    category: "Branching & Merging",
    options: [
      { flag: "-b", description: "Create a new branch and switch to it." },
      { flag: "-", description: "Checkout the previous branch." },
      { flag: "-- [file]", description: "Discard local changes to a specific file." },
    ],
    examples: [
      { command: "git checkout main", description: "Switch to the main branch" },
      { command: "git checkout -b new-feature", description: "Create and switch to a new branch" },
      { command: "git checkout -", description: "Switch to the branch you were previously on" },
      { command: "git checkout -- file.txt", description: "Discard changes in file.txt" },
    ],
  },
  merge: {
    name: "git merge",
    description: "Join two or more development histories together.",
    syntax: "git merge [branch]",
    category: "Branching & Merging",
    options: [
      { flag: "--no-ff", description: "Create a merge commit even when the merge resolves as a fast-forward." },
      { flag: "--squash", description: "Produce the working tree and index state as if a real merge happened, but do not actually make a commit." },
      { flag: "--abort", description: "Abort the current conflict resolution process, and try to reconstruct the pre-merge state." },
    ],
    examples: [
      { command: "git merge feature-branch", description: "Merge feature-branch into the current branch" },
      { command: "git merge --no-ff feature-branch", description: "Merge and force a merge commit" },
      { command: "git merge --abort", description: "Abort an in-progress merge with conflicts" },
    ],
  },
  rebase: {
    name: "git rebase",
    description: "Reapply commits on top of another base tip.",
    syntax: "git rebase [branch]",
    category: "Branching & Merging",
    options: [
      { flag: "-i, --interactive", description: "Make a list of the commits which are about to be rebased. Let the user edit that list before rebasing." },
      { flag: "--continue", description: "Restart the rebasing process after having resolved a merge conflict." },
      { flag: "--abort", description: "Abort the rebase operation and reset HEAD to the original branch." },
    ],
    examples: [
      { command: "git rebase main", description: "Rebase current branch onto main" },
      { command: "git rebase -i HEAD~3", description: "Interactive rebase of the last 3 commits" },
      { command: "git rebase --continue", description: "Continue rebase after resolving conflicts" },
    ],
  },
  log: {
    name: "git log",
    description: "Show commit logs.",
    syntax: "git log",
    category: "Inspection & Comparison",
    options: [
      { flag: "--oneline", description: "Shorthand for '--pretty=oneline --abbrev-commit' used together." },
      { flag: "--graph", description: "Draw a text-based graphical representation of the commit history on the left hand side of the output." },
      { flag: "-n", description: "Limit the number of commits to output." },
      { flag: "-p, --patch", description: "Generate patch (see section on generating patches)." },
    ],
    examples: [
      { command: "git log", description: "Show commit history" },
      { command: "git log --oneline --graph --all", description: "Show history as a compact graph" },
      { command: "git log -n 5", description: "Show only the last 5 commits" },
    ],
  },
  diff: {
    name: "git diff",
    description: "Show changes between commits, commit and working tree, etc.",
    syntax: "git diff",
    category: "Inspection & Comparison",
    options: [
      { flag: "--staged, --cached", description: "Show changes between the index and the last commit." },
      { flag: "--stat", description: "Generate a diffstat." },
      { flag: "-w", description: "Ignore whitespace when comparing lines." },
    ],
    examples: [
      { command: "git diff", description: "Show unstaged changes" },
      { command: "git diff --staged", description: "Show staged changes" },
      { command: "git diff main feature", description: "Show differences between two branches" },
    ],
  },
  stash: {
    name: "git stash",
    description: "Stash the changes in a dirty working directory away.",
    syntax: "git stash",
    category: "Patching",
    options: [
      { flag: "list", description: "List the stash entries that you currently have." },
      { flag: "pop", description: "Remove a single stashed state from the stash list and apply it on top of the current working tree state." },
      { flag: "apply", description: "Like pop, but do not remove the state from the stash list." },
      { flag: "drop", description: "Remove a single stashed state from the stash list." },
    ],
    examples: [
      { command: "git stash", description: "Stash current changes" },
      { command: "git stash list", description: "List all stashes" },
      { command: "git stash pop", description: "Apply and remove the most recent stash" },
    ],
  },
  reset: {
    name: "git reset",
    description: "Reset current HEAD to the specified state.",
    syntax: "git reset [commit]",
    category: "Patching",
    options: [
      { flag: "--soft", description: "Does not touch the index file or the working tree at all (but resets the head to <commit>)." },
      { flag: "--mixed", description: "Resets the index but not the working tree (i.e., the changed files are preserved but not marked for commit). (Default)" },
      { flag: "--hard", description: "Resets the index and working tree. Any changes to tracked files in the working tree since <commit> are discarded." },
    ],
    examples: [
      { command: "git reset commit_hash", description: "Reset staging area to the commit, keep working directory changes" },
      { command: "git reset --hard HEAD", description: "Discard all local working directory changes" },
      { command: "git reset --soft HEAD~1", description: "Undo the last commit, but keep the changes staged" },
    ],
  },
  remote: {
    name: "git remote",
    description: "Manage set of tracked repositories.",
    syntax: "git remote",
    category: "Sharing & Updating",
    options: [
      { flag: "-v, --verbose", description: "Be a little more verbose and show remote url after name." },
      { flag: "add", description: "Adds a remote named <name> for the repository at <url>." },
      { flag: "remove, rm", description: "Remove the remote named <name>." },
    ],
    examples: [
      { command: "git remote -v", description: "List all remote repositories and their URLs" },
      { command: "git remote add origin https://github.com/user/repo.git", description: "Add a new remote" },
      { command: "git remote rm origin", description: "Remove a remote" },
    ],
  },
};

const GitCommand = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCommand, setSelectedCommand] = useState<GitCommandInfo | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleSearch = () => {
    // If the user types "git add", just match "add"
    const query = searchQuery.toLowerCase().trim().replace(/^git\s+/, "");
    if (gitCommandDatabase[query]) {
      setSelectedCommand(gitCommandDatabase[query]);
    } else {
      // Fuzzy search across names and descriptions
      const foundCmd = Object.values(gitCommandDatabase).find(
        (cmd) => cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
      );
      if (foundCmd) {
        setSelectedCommand(foundCmd);
      } else {
        toast.error(`Command related to "${searchQuery}" not found`);
        setSelectedCommand(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(text);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const allCommands = Object.keys(gitCommandDatabase).sort();

  return (
    <Sidebar>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <GitBranch className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Git Command Cheat Sheet</h1>
                <p className="text-sm text-muted-foreground">
                  Your Ultimate Guide to Version Control
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">

        {/* Search Card */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <GitBranch className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Search Git Commands</h2>
                <p className="text-sm text-muted-foreground">
                  Find commands, syntax, and examples to master Git version control
                </p>
              </div>
            </div>
            <a
              href="https://git-scm.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Git Documentation
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter command (e.g., clone, git add, stash)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} className="gap-2">
              <GitBranch className="w-4 h-4" />
              Search
            </Button>
          </div>
        </Card>

        {/* Command Result */}
        {selectedCommand && (
          <Card className="p-6 mb-6 border-primary/20 bg-card/50 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2.5 rounded-xl">
                  <GitBranch className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground font-mono">{selectedCommand.name}</h3>
                  <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-medium shadow-sm">
                    {selectedCommand.category}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-muted-foreground mb-6 text-sm">{selectedCommand.description}</p>

            {/* Syntax */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Syntax
              </h4>
              <div className="bg-background border border-border/50 rounded-xl p-3.5 font-mono text-sm flex items-center justify-between shadow-inner">
                <code className="text-foreground">{selectedCommand.syntax}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(selectedCommand.syntax)}
                  className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors hover:scale-105 active:scale-95"
                >
                  {copiedCommand === selectedCommand.syntax ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Options */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                Common Options
              </h4>
              <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <tbody>
                    {selectedCommand.options.map((option, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-muted/30" : "bg-transparent hover:bg-muted/10 transition-colors"}>
                        <td className="px-4 py-3 font-mono text-primary font-medium w-32 align-top">{option.flag}</td>
                        <td className="px-4 py-3 text-muted-foreground leading-relaxed">{option.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Examples */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Examples
              </h4>
              <div className="space-y-3">
                {selectedCommand.examples.map((example, index) => (
                  <div key={index} className="bg-background border border-border/50 rounded-xl p-3.5 shadow-sm hover:border-border transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <code className="font-mono text-sm text-foreground bg-muted/50 px-2 py-0.5 rounded">{example.command}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(example.command)}
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary/10 hover:text-primary hover:scale-105 active:scale-95 -mr-1"
                      >
                        {copiedCommand === example.command ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{example.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Available Commands */}
        <Card className="p-5 bg-card border-border/50 shadow-sm">
          <div className="flex gap-4">
            <div className="bg-secondary/50 p-2 rounded-lg h-fit">
              <Info className="w-5 h-5 text-secondary-foreground" />
            </div>
            <div className="w-full">
              <p className="font-semibold text-foreground mb-3">Available Commands Index</p>
              <div className="flex flex-wrap gap-2">
                {allCommands.map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => {
                      setSearchQuery(gitCommandDatabase[cmd].name);
                      setSelectedCommand(gitCommandDatabase[cmd]);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="px-2.5 py-1.5 bg-muted/50 border border-border/50 text-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 rounded-md text-xs font-mono font-medium transition-all shadow-sm active:scale-95"
                  >
                    {gitCommandDatabase[cmd].name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </main>
    </div>
  </Sidebar>
  );
};

export default GitCommand;
