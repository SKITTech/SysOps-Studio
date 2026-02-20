import { useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LucideIcon, Menu, Activity, Network, Wifi, Globe, Shield, FileText, ShieldAlert, Terminal, GitCompare, ChevronLeft, Server, LayoutDashboard, Sun, Moon, Search, X, ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

interface SidebarItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const navItems: SidebarItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/bridge-generator", icon: Activity, label: "Bridge Generator" },
  { to: "/subnet-calculator", icon: Network, label: "Subnet Calculator" },
  { to: "/network-diagnostics", icon: Wifi, label: "Network Diagnostics" },
  { to: "/ipv6-converter", icon: Globe, label: "IPv6 Converter" },
  { to: "/firewall-generator", icon: Shield, label: "Firewall Generator" },
  { to: "/log-analyzer", icon: FileText, label: "Log Analyzer" },
  { to: "/security-audit", icon: ShieldAlert, label: "Security Audit" },
  { to: "/command-library", icon: Terminal, label: "Command Library" },
  { to: "/database-comparator", icon: GitCompare, label: "DB Comparator" },
];

interface SidebarProps {
  children: React.ReactNode;
}

export const Sidebar = ({ children }: SidebarProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const filteredItems = useMemo(
    () => navItems.filter((item) => item.label.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-card/80 backdrop-blur-xl border-r border-border/50 transition-all duration-300 ease-in-out",
          isOpen ? "w-[260px]" : "w-[60px]"
        )}
      >
        {/* Header / Logo */}
        <div className="flex items-center justify-between px-3 h-16 border-b border-border/50">
          {isOpen ? (
            <div className="flex items-center gap-3 overflow-hidden">
              {/* Logo mark */}
              <div className="relative shrink-0">
                {/* Outer glow ring */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/10 blur-sm" />
                {/* Icon container */}
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <ServerCog className="w-5 h-5 text-white" strokeWidth={1.75} />
                </div>
              </div>
              {/* Wordmark */}
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-extrabold tracking-tight text-foreground">
                  Sys<span className="text-blue-500">Admin</span>
                </span>
                <span className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-[0.18em] mt-0.5">Tools</span>
              </div>
            </div>
          ) : (
            /* Collapsed icon-only logo */
            <div className="relative mx-auto">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/10 blur-sm" />
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <ServerCog className="w-5 h-5 text-white" strokeWidth={1.75} />
              </div>
            </div>
          )}
          {isOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="h-8 w-8 shrink-0 hover:bg-muted/80 rounded-lg ml-1"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Search */}
        {isOpen && (
          <div className="px-2 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools..."
                className="h-8 pl-8 pr-7 text-xs bg-muted/50 border-border/50 rounded-lg"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="p-2 space-y-0.5 mt-2">
          {/* Collapsed: hamburger toggle at top */}
          {!isOpen && (
            <button
              onClick={() => setIsOpen(true)}
              className="w-full flex items-center justify-center py-2 mb-1 rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative",
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                title={!isOpen ? item.label : undefined}
              >
                <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-transform duration-200", !isActive && "group-hover:scale-110")} />
                {isOpen && <span className="text-[13px] font-medium truncate">{item.label}</span>}
                {isOpen && isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                )}
              </Link>
            );
          })}
          {isOpen && search && filteredItems.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No tools found</p>
          )}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border/50 space-y-2">
          <Button
            variant="ghost"
            size={isOpen ? "default" : "icon"}
            onClick={toggleTheme}
            className={cn("w-full hover:bg-muted/80 rounded-lg text-foreground", isOpen ? "justify-start gap-2.5 px-3" : "h-9 w-9 mx-auto")}
          >
            {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            {isOpen && <span className="text-[13px] font-medium">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </Button>
          {isOpen && (
            <div className="flex items-center justify-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-blue-500/60" />
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">v2.0 · 2026</span>
              <div className="w-1 h-1 rounded-full bg-cyan-500/60" />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300 ease-in-out",
          isOpen ? "ml-[260px]" : "ml-[60px]"
        )}
      >
        {children}
      </main>
    </div>
  );
};
