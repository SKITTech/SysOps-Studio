import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Github, Search, GitBranch, GitCommit, Copy, Check, Terminal, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface GitCommand {
  command: string;
  description: string;
  example: string;
}

interface GitCategory {
  title: string;
  icon: any;
  commands: GitCommand[];
}

const gitData: Record<string, GitCategory> = {
  basics: {
    title: "Basics & Setup",
    icon: Terminal,
    commands: [
      { command: "git config --global user.name \"[name]\"", description: "Sets the name you want attached to your commit transactions", example: "git config --global user.name \"John Doe\"" },
      { command: "git config --global user.email \"[email]\"", description: "Sets the email you want attached to your commit transactions", example: "git config --global user.email \"john@example.com\"" },
      { command: "git init", description: "Creates a new local repository", example: "git init" },
      { command: "git clone [url]", description: "Downloads a project and its entire version history", example: "git clone https://github.com/user/repo.git" }
    ]
  },
  snapshot: {
    title: "Working with Changes",
    icon: GitCommit,
    commands: [
      { command: "git status", description: "Lists all new or modified files to be committed", example: "git status" },
      { command: "git add [file]", description: "Snapshots the file in preparation for versioning", example: "git add index.html\ngit add ." },
      { command: "git commit -m \"[message]\"", description: "Records file snapshots permanently in version history", example: "git commit -m \"Add navigation bar\"" },
      { command: "git diff", description: "Shows file differences not yet staged", example: "git diff" },
      { command: "git diff --staged", description: "Shows file differences between staging and the last file version", example: "git diff --staged" }
    ]
  },
  branching: {
    title: "Branching & Merging",
    icon: GitBranch,
    commands: [
      { command: "git branch", description: "Lists all local branches in the current repository", example: "git branch" },
      { command: "git branch [branch-name]", description: "Creates a new branch", example: "git branch feature/login" },
      { command: "git checkout [branch-name]", description: "Switches to the specified branch and updates the working directory", example: "git checkout feature/login" },
      { command: "git checkout -b [branch-name]", description: "Creates a new branch and switches to it", example: "git checkout -b feature/login" },
      { command: "git merge [branch-name]", description: "Combines the specified branch's history into the current branch", example: "git merge feature/login" }
    ]
  },
  remote: {
    title: "Remote & GitHub",
    icon: Github,
    commands: [
      { command: "git remote add [name] [url]", description: "Adds a remote repository", example: "git remote add origin https://github.com/user/repo.git" },
      { command: "git fetch [remote]", description: "Downloads all history from the remote tracking branches", example: "git fetch origin" },
      { command: "git pull [remote] [branch]", description: "Fetches and merges the remote branch into your current branch", example: "git pull origin main" },
      { command: "git push [remote] [branch]", description: "Uploads all local branch commits to GitHub", example: "git push origin main\ngit push -u origin feature/login" },
      { command: "git remote -v", description: "Shows all configured remotes with their URLs", example: "git remote -v" },
      { command: "git stash", description: "Temporarily stores all modified tracked files", example: "git stash\ngit stash pop" }
    ]
  }
};

const GitStudyTool = () => {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(text);
    toast.success("Command copied to clipboard!");
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const filteredData = Object.entries(gitData).map(([key, category]) => {
    const filteredCommands = category.commands.filter(cmd => 
      cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) || 
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return {
      key,
      ...category,
      commands: filteredCommands
    };
  }).filter(category => category.commands.length > 0);

  return (
    <Sidebar>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <Github className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Git & GitHub Study Tool</h1>
                <p className="text-sm text-muted-foreground">
                  Master version control with this comprehensive reference guide
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Card className="p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Search className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Search Commands</h2>
              </div>
              <a
                href="https://git-scm.com/doc"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline text-sm"
              >
                Official Git Docs
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search commands or descriptions (e.g., 'commit', 'branch', 'remote')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12"
              />
            </div>
          </Card>

          {searchQuery ? (
            <div className="space-y-8">
              {filteredData.length > 0 ? filteredData.map((category) => (
                <div key={category.key}>
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <category.icon className="w-5 h-5 text-primary" />
                    {category.title}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {category.commands.map((cmd, idx) => (
                      <CommandCard 
                        key={idx} 
                        command={cmd.command} 
                        description={cmd.description} 
                        example={cmd.example}
                        copiedCommand={copiedCommand}
                        copyToClipboard={copyToClipboard}
                      />
                    ))}
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 text-muted-foreground">
                  No commands found matching "{searchQuery}"
                </div>
              )}
            </div>
          ) : (
            <Tabs defaultValue="basics" className="w-full">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 mb-8">
                {Object.entries(gitData).map(([key, category]) => (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                    <category.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{category.title}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(gitData).map(([key, category]) => (
                <TabsContent key={key} value={key} className="mt-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    {category.commands.map((cmd, idx) => (
                      <CommandCard 
                        key={idx} 
                        command={cmd.command} 
                        description={cmd.description} 
                        example={cmd.example}
                        copiedCommand={copiedCommand}
                        copyToClipboard={copyToClipboard}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </main>
      </div>
    </Sidebar>
  );
};

const CommandCard = ({ 
  command, 
  description, 
  example, 
  copiedCommand, 
  copyToClipboard 
}: { 
  command: string, 
  description: string, 
  example: string, 
  copiedCommand: string | null, 
  copyToClipboard: (t: string) => void 
}) => (
  <Card className="p-5 flex flex-col h-full bg-card/50 hover:bg-card transition-colors">
    <div className="mb-3">
      <h4 className="font-mono font-bold text-primary mb-2 text-lg">{command}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <div className="mt-auto pt-4">
      <div className="bg-muted rounded-md p-3 relative group">
        <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{example}</pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background/50 hover:bg-background"
          onClick={() => copyToClipboard(example)}
        >
          {copiedCommand === example ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>
  </Card>
);

export default GitStudyTool;
