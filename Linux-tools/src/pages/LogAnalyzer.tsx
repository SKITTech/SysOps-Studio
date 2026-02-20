import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Search, AlertTriangle, CheckCircle2, Info,
  XCircle, Download, Copy, BarChart2, Clock, Globe,
  Filter, ChevronRight, Layers, TerminalSquare, Upload, Book,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type Severity = "ERROR" | "CRITICAL" | "FATAL" | "WARNING" | "WARN" | "INFO" | "NOTICE" | "DEBUG" | "UNKNOWN";
type SeverityFilter = Severity | "ALL";

interface ParsedLine {
  index: number;
  raw: string;
  severity: Severity;
  timestamp: string;
  component: string;
  message: string;
  ips: string[];
  httpStatus?: number;
}

interface Stats {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  debugs: number;
  unknowns: number;
  topIPs: { ip: string; count: number }[];
  topErrors: { msg: string; count: number }[];
  httpStatuses: { status: number; count: number }[];
  timeRange: { start: string; end: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; dot: string }> = {
  ERROR:    { color: "text-red-500",    bg: "bg-red-500/8",    border: "border-red-500/25",    dot: "bg-red-500" },
  CRITICAL: { color: "text-red-600",    bg: "bg-red-600/10",   border: "border-red-600/30",    dot: "bg-red-600" },
  FATAL:    { color: "text-red-700",    bg: "bg-red-700/12",   border: "border-red-700/35",    dot: "bg-rose-700" },
  WARNING:  { color: "text-amber-500",  bg: "bg-amber-500/8",  border: "border-amber-500/25",  dot: "bg-amber-500" },
  WARN:     { color: "text-amber-500",  bg: "bg-amber-500/8",  border: "border-amber-500/25",  dot: "bg-amber-500" },
  INFO:     { color: "text-blue-500",   bg: "bg-blue-500/5",   border: "border-blue-500/20",   dot: "bg-blue-500" },
  NOTICE:   { color: "text-cyan-500",   bg: "bg-cyan-500/5",   border: "border-cyan-500/20",   dot: "bg-cyan-500" },
  DEBUG:    { color: "text-slate-400",  bg: "bg-slate-500/5",  border: "border-slate-500/15",  dot: "bg-slate-400" },
  UNKNOWN:  { color: "text-muted-foreground", bg: "", border: "border-border/40", dot: "bg-muted-foreground" },
};

const IP_REGEX = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const HTTP_STATUS_REGEX = /\b([1-5]\d{2})\b/;
const TIMESTAMP_PATTERNS = [
  /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
  /([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
  /(\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2})/,
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectSeverity(line: string): Severity {
  const u = line.toUpperCase();
  if (u.includes("FATAL"))    return "FATAL";
  if (u.includes("CRITICAL")) return "CRITICAL";
  if (u.includes("ERROR"))    return "ERROR";
  if (u.includes("WARNING"))  return "WARNING";
  if (u.includes("WARN"))     return "WARN";
  if (u.includes("NOTICE"))   return "NOTICE";
  if (u.includes("DEBUG"))    return "DEBUG";
  if (u.includes("INFO"))     return "INFO";
  return "UNKNOWN";
}

function extractTimestamp(line: string): string {
  for (const pat of TIMESTAMP_PATTERNS) {
    const m = line.match(pat);
    if (m) return m[1];
  }
  return "";
}

function extractComponent(line: string): string {
  const m = line.match(/\[([^\]]{1,30})\]/);
  return m ? m[1] : "";
}

function parseLine(raw: string, index: number): ParsedLine {
  const severity = detectSeverity(raw);
  const timestamp = extractTimestamp(raw);
  const component = extractComponent(raw);
  const ips = [...new Set(raw.match(IP_REGEX) ?? [])];
  const httpMatch = raw.match(HTTP_STATUS_REGEX);
  const httpStatus = httpMatch ? parseInt(httpMatch[1]) : undefined;
  // message: strip timestamp, component, severity keyword
  let msg = raw;
  if (timestamp) msg = msg.replace(timestamp, "");
  if (component) msg = msg.replace(`[${component}]`, "");
  msg = msg.replace(/\b(FATAL|CRITICAL|ERROR|WARNING|WARN|NOTICE|DEBUG|INFO)\b/gi, "").trim().replace(/^\s*[-:|\]]+\s*/, "");
  return { index, raw, severity, timestamp, component, message: msg, ips, httpStatus };
}

function computeStats(lines: ParsedLine[]): Stats {
  let errors = 0, warnings = 0, infos = 0, debugs = 0, unknowns = 0;
  const ipMap = new Map<string, number>();
  const errMap = new Map<string, number>();
  const statusMap = new Map<number, number>();

  for (const l of lines) {
    if (l.severity === "ERROR" || l.severity === "CRITICAL" || l.severity === "FATAL") errors++;
    else if (l.severity === "WARNING" || l.severity === "WARN") warnings++;
    else if (l.severity === "INFO" || l.severity === "NOTICE") infos++;
    else if (l.severity === "DEBUG") debugs++;
    else unknowns++;

    for (const ip of l.ips) ipMap.set(ip, (ipMap.get(ip) ?? 0) + 1);

    if (l.severity === "ERROR" || l.severity === "CRITICAL" || l.severity === "FATAL") {
      const key = l.message.trim().substring(0, 80);
      if (key) errMap.set(key, (errMap.get(key) ?? 0) + 1);
    }

    if (l.httpStatus) statusMap.set(l.httpStatus, (statusMap.get(l.httpStatus) ?? 0) + 1);
  }

  const start = lines.find(l => l.timestamp)?.timestamp ?? "N/A";
  const end = [...lines].reverse().find(l => l.timestamp)?.timestamp ?? "N/A";

  return {
    total: lines.length,
    errors, warnings, infos, debugs, unknowns,
    topIPs: [...ipMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count })),
    topErrors: [...errMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([msg, count]) => ({ msg, count })),
    httpStatuses: [...statusMap.entries()].sort((a, b) => a[0] - b[0]).map(([status, count]) => ({ status, count })),
    timeRange: { start, end },
  };
}

function isSafeRegex(p: string) {
  if (/(\+|\*|\{)\s*\)\s*(\+|\*|\{)/.test(p)) return false;
  if (/\(([^)]*\|){5,}[^)]*\)[\+\*]/.test(p)) return false;
  return true;
}

function httpStatusColor(s: number) {
  if (s < 300) return "text-emerald-500";
  if (s < 400) return "text-blue-500";
  if (s < 500) return "text-amber-500";
  return "text-red-500";
}

// ── Samples ─────────────────────────────────────────────────────────────────

// ── Virtualizor Log Reference Data ──────────────────────────────────────────

interface LogRef {
  path: string;
  category: string;
  description: string;
  isCommand?: boolean;
}

const LOG_REFERENCE: LogRef[] = [
  // PHP / Panel / EMPS
  { path: "/usr/local/emps/var/log/",                          category: "PHP / Panel",    description: "PHP, MySQL and Nginx logs. Check here if panel is not loading." },
  { path: "/usr/local/emps/var/log/php-fpm-slowlog-index.log", category: "PHP / Panel",    description: "Slow loading panel — PHP-FPM slow request log." },
  { path: "/usr/local/emps/var/log/web.access.log",            category: "PHP / Panel",    description: "Web access log for the panel." },
  { path: "/usr/local/emps/var/log/nginx/error.log",           category: "PHP / Panel",    description: "Nginx error log (also use on slave nodes). Tail: tail -f /usr/local/emps/var/log/nginx/error.log" },
  // Virtualizor
  { path: "/var/virtualizor/log/",                             category: "Virtualizor",    description: "All Virtualizor logs in separate files (virtualizor.log, cron, etc.)" },
  { path: "/var/virtualizor/log/email/email.log",              category: "Virtualizor",    description: "Email log — outgoing email activity." },
  { path: "/var/virtualizor/log/backup/",                      category: "Virtualizor",    description: "VPS backup and restore logs." },
  { path: "/var/virtualizor/log/virt_sqlerror.log",            category: "Virtualizor",    description: "Virtualizor update / SQL error log." },
  { path: "/var/virtualizor/log/migrate/",                     category: "Virtualizor",    description: "Migration logs — check on both source and destination servers." },
  { path: "/var/virtualizor/log/cronm",                        category: "Virtualizor",    description: "VPS suspension log (cron managed suspensions)." },
  { path: "/var/virtualizor/dbbackups/",                       category: "Virtualizor",    description: "DB backups in SQL gzip format." },
  { path: "/var/virtualizor/kvm/",                             category: "Virtualizor",    description: "OS templates. Import templates to Virtualizor from here." },
  { path: "/var/virtualizor/",                                 category: "Virtualizor",    description: "Virtualizor root: logs, KVM related files, DB backups." },
  // System
  { path: "/var/log/messages",                                 category: "System",         description: "OS system messages log." },
  { path: "/var/log/syslog",                                   category: "System",         description: "System syslog." },
  { path: "/var/log/apache",                                   category: "System",         description: "Apache web server logs." },
  { path: "journalctl -xe",                                    category: "System",         description: "View system journalctl logs (errors and context).", isCommand: true },
  { path: "cat /etc/systemd/journald.conf",                    category: "System",         description: "Check journald configuration.", isCommand: true },
  // Libvirt / KVM
  { path: "/var/log/libvirt/qemu/vid.log",                     category: "Libvirt / KVM",  description: "Specific VPS log — replace 'vid' with the VM ID. Check for VPS creation errors." },
  { path: "/var/log/libvirt/libvirtd.log",                     category: "Libvirt / KVM",  description: "Libvirt daemon log." },
  { path: "/etc/libvirt/qemu/",                                category: "Libvirt / KVM",  description: "VPS XML config files." },
  { path: "/etc/libvirt/qemu/networks/HAProxy.xml",            category: "Libvirt / KVM",  description: "HAProxy network config file." },
  // Config / Misc
  { path: "/usr/local/virtualizor/universal.php",              category: "Config",         description: "Master/slave settings file. Contains DB credentials and all databases." },
  { path: "/etc/cron.d/virtualizor",                           category: "Config",         description: "Virtualizor cron job definitions." },
  { path: "/usr/local/emps/var/mysql/virtualizor",             category: "Config",         description: "Virtualizor database location." },
  { path: "/usr/local/virtualizor/scripts/calculate_bandwidth.php", category: "Config",   description: "Bandwidth calculation script." },
  { path: "/var/logs/cpanel-install.log",                      category: "Config",         description: "cPanel install log." },
];

const QUICK_COMMANDS: { label: string; cmd: string; desc: string }[] = [
  { label: "Time Filter (range)",   cmd: `awk '$0 >= "Jan 15 10:00" && $0 <= "Jan 15 12:30"' /var/log/syslog`,       desc: "Filter syslog for a specific time window" },
  { label: "Time Filter (pattern)", cmd: `awk '/^Jan 15 1/,/^Jan 15 2/ {print}' syslog | less`,                     desc: "Filter by line pattern range" },
  { label: "Live Nginx errors",     cmd: `tail -f /usr/local/emps/var/log/nginx/error.log`,                          desc: "Watch Nginx errors live" },
  { label: "PHP version",           cmd: `/usr/local/emps/bin/php-config`,                                           desc: "Check PHP version in CLI" },
  { label: "DB password",           cmd: `cat /usr/local/virtualizor/universal.php | grep dbpass`,                   desc: "Get DB password from master/slave settings" },
  { label: "All DBs",               cmd: `cat /usr/local/virtualizor/universal.php`,                                 desc: "Show all database config" },
  { label: "VM vCPU cores",         cmd: `grep vcpu /etc/libvirt/qemu/*`,                                            desc: "Show vCPU count of all VMs" },
  { label: "Check package (apt)",   cmd: `apt list | grep package_name`,                                             desc: "Check if a package is installed (Ubuntu)" },
  { label: "Check package (dpkg)",  cmd: `dpkg --list | grep package_name`,                                          desc: "Alternative package check" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "PHP / Panel":   "bg-violet-500/10 text-violet-600 border-violet-500/30",
  "Virtualizor":   "bg-primary/10 text-primary border-primary/30",
  "System":        "bg-slate-500/10 text-slate-500 border-slate-500/30",
  "Libvirt / KVM": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Config":        "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

const SAMPLES: Record<string, string> = {
  syslog: `2025-01-20 10:15:32 INFO [system] Server started successfully
2025-01-20 10:15:45 INFO [auth] User admin logged in from 192.168.1.100
2025-01-20 10:16:12 ERROR [database] Connection timeout to 10.0.0.5:3306
2025-01-20 10:16:15 WARNING [disk] Disk usage above 85% on /var/log
2025-01-20 10:17:23 INFO [api] GET /api/users - 200 OK - 192.168.1.100
2025-01-20 10:18:45 ERROR [network] Failed to reach external service at 203.0.113.42
2025-01-20 10:19:12 INFO [cache] Cache cleared successfully
2025-01-20 10:20:33 ERROR [auth] Failed login attempt from 192.168.1.150
2025-01-20 10:21:45 WARNING [memory] Memory usage at 92%
2025-01-20 10:22:18 CRITICAL [database] Database connection lost
2025-01-20 10:23:50 INFO [backup] Daily backup completed
2025-01-20 10:24:12 ERROR [api] POST /api/upload - 500 Internal Server Error
2025-01-20 10:25:33 WARNING [ssl] Certificate expires in 7 days
2025-01-20 10:26:45 DEBUG [scheduler] Cron job tick at 10:26:45
2025-01-20 10:27:12 ERROR [auth] Failed login attempt from 192.168.1.150`,

  nginx: `192.168.1.100 - - [20/Jan/2025:10:15:32 +0000] "GET /index.html HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
203.0.113.42 - - [20/Jan/2025:10:16:12 +0000] "POST /api/upload HTTP/1.1" 500 512 "-" "curl/7.68.0"
192.168.1.100 - - [20/Jan/2025:10:17:23 +0000] "GET /static/app.js HTTP/1.1" 304 0 "-" "Mozilla/5.0"
10.0.0.5 - admin [20/Jan/2025:10:18:45 +0000] "DELETE /api/users/5 HTTP/1.1" 403 256 "-" "PostmanRuntime"
192.168.1.150 - - [20/Jan/2025:10:20:33 +0000] "GET /admin HTTP/1.1" 401 128 "-" "python-requests/2.28"
203.0.113.42 - - [20/Jan/2025:10:21:45 +0000] "GET /wp-admin HTTP/1.1" 404 256 "-" "Googlebot/2.1"
192.168.1.100 - - [20/Jan/2025:10:24:12 +0000] "POST /api/login HTTP/1.1" 200 512 "-" "Mozilla/5.0"
203.0.113.42 - - [20/Jan/2025:10:25:33 +0000] "GET /.env HTTP/1.1" 403 64 "-" "masscan/1.0"`,

  kernel: `Jan 20 10:15:32 srv01 kernel: [12345.678901] ata1.00: exception Emask 0x0 SAct 0x0 SErr 0x0 action 0x6
Jan 20 10:15:33 srv01 kernel: [12345.678902] ata1.00: failed command: WRITE FPDMA QUEUED
Jan 20 10:16:12 srv01 kernel: [12346.123456] ERROR: EXT4-fs (sda1): IO failure
Jan 20 10:17:00 srv01 sshd[1234]: Accepted publickey for root from 192.168.1.100 port 22 ssh2
Jan 20 10:18:45 srv01 sshd[1235]: Failed password for invalid user admin from 203.0.113.42 port 54321 ssh2
Jan 20 10:19:00 srv01 kernel: [12350.000000] WARNING: CPU soft lockup detected on CPU#1
Jan 20 10:20:33 srv01 sshd[1236]: Failed password for root from 192.168.1.150 port 12345 ssh2
Jan 20 10:21:45 srv01 kernel: [12352.111111] CRITICAL: Out of memory: Kill process 5678 (mysqld) score 900`,
};

// ── Component ───────────────────────────────────────────────────────────────

const LogAnalyzer = () => {
  const [rawInput, setRawInput] = useState("");
  const [logType, setLogType] = useState("syslog");
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [refSearch, setRefSearch] = useState(""); // Added refSearch state
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse & filter ──────────────────────────────────────────────────────

  const analyze = () => {
    if (!rawInput.trim()) { toast.error("Paste log content first"); return; }
    const lines = rawInput.split("\n").filter(l => l.trim()).map((l, i) => parseLine(l, i));
    setParsed(lines);
    setHasAnalyzed(true);
    setSeverityFilter("ALL");
    setSearchTerm("");
    toast.success(`Analyzed ${lines.length} lines`);
  };

  const stats = useMemo(() => hasAnalyzed ? computeStats(parsed) : null, [parsed, hasAnalyzed]);

  const filteredLines = useMemo(() => {
    if (!hasAnalyzed) return [];
    let lines = parsed;
    if (severityFilter !== "ALL") lines = lines.filter(l => l.severity === severityFilter || (severityFilter === "WARNING" && l.severity === "WARN"));

    if (searchTerm.trim()) {
      if (!isSafeRegex(searchTerm) || searchTerm.length > 200) { return lines; }
      try {
        const re = new RegExp(searchTerm, "i");
        lines = lines.filter(l => { re.lastIndex = 0; return re.test(l.raw); });
      } catch { /* invalid regex – skip */ }
    }
    return lines;
  }, [parsed, severityFilter, searchTerm, hasAnalyzed]);

  const filteredLogReference = useMemo(() => {
    if (!refSearch.trim()) return LOG_REFERENCE;
    const lowerSearch = refSearch.toLowerCase();
    return LOG_REFERENCE.filter(
      (item) =>
        item.path.toLowerCase().includes(lowerSearch) ||
        item.description.toLowerCase().includes(lowerSearch) ||
        item.category.toLowerCase().includes(lowerSearch)
    );
  }, [refSearch]);

  const filteredQuickCommands = useMemo(() => {
    if (!refSearch.trim()) return QUICK_COMMANDS;
    const lowerSearch = refSearch.toLowerCase();
    return QUICK_COMMANDS.filter(
      (item) =>
        item.label.toLowerCase().includes(lowerSearch) ||
        item.cmd.toLowerCase().includes(lowerSearch) ||
        item.desc.toLowerCase().includes(lowerSearch)
    );
  }, [refSearch]);

  // ── File upload ───────────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File too large (max 5 MB)"); return; }
    const reader = new FileReader();
    reader.onload = ev => { setRawInput(ev.target?.result as string ?? ""); toast.success(`Loaded "${file.name}"`); };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const downloadFiltered = () => {
    const text = filteredLines.map(l => l.raw).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "filtered_logs.txt";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Downloaded filtered logs");
  };

  const copyLine = (raw: string) => {
    navigator.clipboard.writeText(raw);
    toast.success("Line copied");
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Sidebar>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">

        {/* ── Premium Header ── */}
        <header className="border-b border-border/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-blue-500/5 pointer-events-none" />
          <div className="container mx-auto px-6 py-8 relative">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">Log Analyzer</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">Virtualizor · Syslog · Nginx · Kernel · Application</p>
                </div>
              </div>
              {hasAnalyzed && stats && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Lines",  value: stats.total,    cls: "bg-muted/60 text-foreground border-border/50" },
                    { label: "Errors", value: stats.errors,   cls: stats.errors   > 0 ? "bg-red-500/10 text-red-500 border-red-500/30"    : "bg-muted/40 text-muted-foreground border-border/30" },
                    { label: "Warn",   value: stats.warnings, cls: stats.warnings > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : "bg-muted/40 text-muted-foreground border-border/30" },
                    { label: "Info",   value: stats.infos,    cls: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
                  ].map(chip => (
                    <div key={chip.label} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold", chip.cls)}>
                      <span className="font-mono">{chip.value}</span>
                      <span className="opacity-70">{chip.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="container mx-auto px-6 py-8 space-y-6">

          {/* ── Log Input (two-column) ── */}
          <Card className="border-border/40 shadow-lg overflow-hidden">
            <div className="grid lg:grid-cols-[1fr_260px]">
              {/* Left – textarea */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-400/70" />
                      <span className="w-3 h-3 rounded-full bg-amber-400/70" />
                      <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono ml-1">log input</span>
                  </div>
                  {rawInput && <span className="text-[10px] text-muted-foreground font-mono">{rawInput.split("\n").filter(l => l.trim()).length} lines</span>}
                </div>
                <Textarea
                  placeholder={"# Paste your log content here...\n# Or upload a file / load a sample →"}
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  className="font-mono text-xs rounded-none border-0 bg-[hsl(var(--muted)/0.15)] focus-visible:ring-0 min-h-[200px] resize-none placeholder:text-muted-foreground/40"
                />
              </div>
              {/* Right – controls */}
              <div className="flex flex-col gap-4 p-5 border-l border-border/40 bg-muted/10">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wider">Log Type</Label>
                  <Select value={logType} onValueChange={setLogType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="syslog">Syslog / App</SelectItem>
                      <SelectItem value="nginx">Nginx Access</SelectItem>
                      <SelectItem value="kernel">Kernel / Auth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider block">Load Data</Label>
                  <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs"
                    onClick={() => { setRawInput(SAMPLES[logType] ?? SAMPLES.syslog); toast.success("Sample loaded"); }}>
                    <Layers className="w-3.5 h-3.5" /> Load Sample
                  </Button>
                  <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload File <span className="text-[10px] text-muted-foreground ml-auto">max 5 MB</span>
                  </Button>
                  <input ref={fileRef} type="file" accept=".log,.txt,.out" className="hidden" onChange={handleFileUpload} />
                  {rawInput && (
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground h-8 text-xs"
                      onClick={() => { setRawInput(""); setParsed([]); setHasAnalyzed(false); }}>Clear</Button>
                  )}
                </div>
                <div className="mt-auto pt-2 border-t border-border/40">
                  <Button onClick={analyze} className="w-full gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                    <Search className="w-4 h-4" /> Analyze Logs
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Results tabs — Log Reference always shown, analysis tabs gated */}
          <Tabs defaultValue={hasAnalyzed ? "viewer" : "reference"} className="space-y-5">
            {/* Pill tab list */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/40 w-fit flex-wrap">
              <TabsList className="bg-transparent p-0 h-auto gap-1">
                <TabsTrigger value="viewer" disabled={!hasAnalyzed}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <FileText className="w-3.5 h-3.5" />Log Viewer
                </TabsTrigger>
                <TabsTrigger value="stats" disabled={!hasAnalyzed}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <BarChart2 className="w-3.5 h-3.5" />Summary
                </TabsTrigger>
                <TabsTrigger value="ips" disabled={!hasAnalyzed}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Globe className="w-3.5 h-3.5" />IPs &amp; HTTP
                </TabsTrigger>
                <TabsTrigger value="reference"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Book className="w-3.5 h-3.5" />Log Reference
                </TabsTrigger>
              </TabsList>
            </div>

            {hasAnalyzed && stats && (<>

              {/* ══ LOG VIEWER ══ */}
              <TabsContent value="viewer">
                <Card className="border-border/40 shadow-lg overflow-hidden">
                  {/* Sticky toolbar */}
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-4 py-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      {(["ALL", "ERROR", "WARNING", "INFO", "DEBUG"] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setSeverityFilter(s === "ALL" ? "ALL" : s as Severity)}
                          className={cn(
                            "text-[11px] px-2.5 py-0.5 rounded-full border font-semibold transition-all",
                            severityFilter === s
                              ? s === "ALL" ? "bg-foreground text-background border-foreground"
                                : s === "ERROR" ? "bg-red-500 text-white border-red-500"
                                : s === "WARNING" ? "bg-amber-500 text-white border-amber-500"
                                : s === "INFO" ? "bg-blue-500 text-white border-blue-500"
                                : "bg-slate-500 text-white border-slate-500"
                              : "border-border/50 text-muted-foreground hover:border-primary/40"
                          )}
                        >
                          {s === "ALL" ? `All (${stats.total})` : s === "ERROR" ? `Errors (${stats.errors})` : s === "WARNING" ? `Warn (${stats.warnings})` : s === "INFO" ? `Info (${stats.infos})` : `Debug (${stats.debugs})`}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                          placeholder="Regex search · e.g. timeout|refused"
                          className="pl-8 h-8 text-xs font-mono border-border/50" />
                      </div>
                      {filteredLines.length > 0 && (
                        <Button variant="outline" size="sm" onClick={downloadFiltered} className="gap-1.5 h-8 shrink-0">
                          <Download className="w-3.5 h-3.5" /> Export
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Showing <span className="font-mono font-semibold text-foreground">{filteredLines.length}</span> of {stats.total} lines
                    </p>
                  </div>
                  {/* Terminal log area */}
                  <div className="bg-[hsl(220,14%,7%)] max-h-[560px] overflow-y-auto">
                    {filteredLines.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground/50 text-sm">
                        <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />No matching log lines.
                      </div>
                    ) : (
                      filteredLines.map(line => {
                        const cfg = SEVERITY_CONFIG[line.severity];
                        return (
                          <div key={line.index}
                            className={cn("group flex items-start gap-2 px-4 py-1.5 border-b border-white/4 text-xs hover:bg-white/5 transition-colors")}
                          >
                            <span className="shrink-0 w-9 text-right font-mono text-white/20 pt-0.5 select-none leading-5">{line.index + 1}</span>
                            <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full mt-2 ring-1 ring-white/10", cfg.dot)} />
                            <div className="flex-1 min-w-0 py-0.5">
                              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                {line.timestamp && (
                                  <span className="font-mono text-white/40 text-[10px] flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" />{line.timestamp}
                                  </span>
                                )}
                                {line.severity !== "UNKNOWN" && (
                                  <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border", cfg.color, cfg.border, cfg.bg)}>
                                    {line.severity}
                                  </span>
                                )}
                                {line.component && (
                                  <span className="text-[9px] font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{line.component}</span>
                                )}
                                {line.httpStatus && (
                                  <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-white/10 bg-white/5", httpStatusColor(line.httpStatus))}>
                                    HTTP {line.httpStatus}
                                  </span>
                                )}
                              </div>
                              <p className={cn("font-mono leading-relaxed break-all text-[11px]", line.severity === "UNKNOWN" ? "text-white/70" : cfg.color)}>
                                {line.message || line.raw}
                              </p>
                              {line.ips.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {line.ips.map(ip => (
                                    <span key={ip} className="text-[9px] font-mono text-white/40 bg-white/5 px-1 rounded flex items-center gap-0.5">
                                      <Globe className="w-2 h-2" />{ip}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => copyLine(line.raw)}
                              className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-white/50 mt-0.5">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </TabsContent>

              {/* ══ SUMMARY ══ */}
              <TabsContent value="stats">
                <div className="space-y-4">
                  {/* Glow stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: "Total",    value: stats.total,    icon: FileText,     ring: "ring-border/40",       num: "text-foreground",  bg: "bg-muted/30" },
                      { label: "Errors",   value: stats.errors,   icon: XCircle,      ring: "ring-red-500/30",      num: "text-red-500",     bg: "bg-red-500/5",   shadow: "shadow-red-500/10" },
                      { label: "Warnings", value: stats.warnings, icon: AlertTriangle, ring: "ring-amber-500/30",   num: "text-amber-500",   bg: "bg-amber-500/5", shadow: "shadow-amber-500/10" },
                      { label: "Info",     value: stats.infos,    icon: Info,         ring: "ring-blue-500/30",     num: "text-blue-500",    bg: "bg-blue-500/5",  shadow: "shadow-blue-500/10" },
                      { label: "Debug",    value: stats.debugs,   icon: CheckCircle2, ring: "ring-slate-500/20",    num: "text-slate-400",   bg: "bg-slate-500/5" },
                    ].map(s => {
                      const Icon = s.icon;
                      return (
                        <Card key={s.label} className={cn("border-0 ring-1 shadow-lg", s.ring, s.shadow ?? "", s.bg)}>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Icon className={cn("w-3.5 h-3.5", s.num)} />
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{s.label}</span>
                            </div>
                            <div className={cn("text-3xl font-bold font-mono leading-none", s.num)}>{s.value}</div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Bar chart */}
                    {stats.total > 0 && (
                      <Card className="border-border/40">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-primary" />Severity Distribution
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {[
                            { label: "Errors / Critical", value: stats.errors,   color: "bg-red-500" },
                            { label: "Warnings",          value: stats.warnings, color: "bg-amber-500" },
                            { label: "Info / Notice",     value: stats.infos,    color: "bg-blue-500" },
                            { label: "Debug",             value: stats.debugs,   color: "bg-slate-400" },
                            { label: "Unknown",           value: stats.unknowns, color: "bg-muted-foreground/60" },
                          ].map(bar => (
                            <div key={bar.label} className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">{bar.label}</span>
                                <span className="font-mono font-semibold text-foreground">{bar.value}</span>
                              </div>
                              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all duration-500", bar.color)}
                                  style={{ width: `${stats.total > 0 ? (bar.value / stats.total) * 100 : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {/* Time range + top errors stacked */}
                    <div className="space-y-4">
                      <Card className="border-border/40 bg-muted/20">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold">Log Time Range</span>
                          </div>
                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40">
                              <span className="text-emerald-500 font-sans font-semibold text-[10px] uppercase w-10">First</span>
                              <span className="text-foreground/80 flex-1 truncate">{stats.timeRange.start}</span>
                            </div>
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40">
                              <span className="text-amber-500 font-sans font-semibold text-[10px] uppercase w-10">Last</span>
                              <span className="text-foreground/80 flex-1 truncate">{stats.timeRange.end}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {stats.topErrors.length > 0 && (
                        <Card className="border-red-500/20 bg-red-500/3">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-500" />Top Error Messages
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-1.5 max-h-48 overflow-y-auto">
                            {stats.topErrors.map((e, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                                <ChevronRight className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                                <p className="font-mono text-[11px] text-foreground/80 flex-1 truncate">{e.msg}</p>
                                <span className="shrink-0 text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">{e.count}×</span>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ══ IPs & HTTP ══ */}
              <TabsContent value="ips">
                <div className="grid md:grid-cols-2 gap-5">
                  <Card className="border-border/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Top IP Addresses</CardTitle>
                      <CardDescription className="text-xs">IPs appearing most frequently</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {stats.topIPs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground/60 text-sm">
                          <Globe className="w-8 h-8 mx-auto mb-2 opacity-20" />No IPs found
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {stats.topIPs.map((item, i) => {
                            const pct = (item.count / stats.topIPs[0].count) * 100;
                            return (
                              <div key={i} className="flex items-center gap-3">
                                <span className="w-5 text-center text-[10px] font-mono text-muted-foreground/60">{i + 1}</span>
                                <span className="font-mono text-xs text-foreground w-36 shrink-0 truncate">{item.ip}</span>
                                <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{item.count}×</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-accent" />HTTP Status Codes</CardTitle>
                      <CardDescription className="text-xs">Detected HTTP response codes</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {stats.httpStatuses.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground/60 text-sm">
                          <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-20" />No HTTP codes detected
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {stats.httpStatuses.map(({ status, count }) => (
                            <div key={status}
                              className={cn("flex flex-col items-center p-3 rounded-xl border bg-muted/20 min-w-[80px] hover:bg-muted/40 transition-colors", httpStatusColor(status))}>
                              <span className="text-2xl font-bold font-mono">{status}</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">{count} hit{count !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </>)}

            {/* ══ VIRTUALIZOR LOG REFERENCE ══ */}
            <TabsContent value="reference" className="space-y-5">
              {/* Search with clear button */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={refSearch}
                  onChange={e => setRefSearch(e.target.value)}
                  placeholder="Search paths, categories or descriptions..."
                  className="pl-11 h-10"
                />
                {refSearch && (
                  <button onClick={() => setRefSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Quick commands */}
              <Card className="border-border/40 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TerminalSquare className="w-4 h-4 text-primary" />Quick Commands
                  </CardTitle>
                  <CardDescription className="text-xs">Useful one-liners — click any card to copy</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {QUICK_COMMANDS.filter(c =>
                    !refSearch ||
                    c.label.toLowerCase().includes(refSearch.toLowerCase()) ||
                    c.cmd.toLowerCase().includes(refSearch.toLowerCase()) ||
                    c.desc.toLowerCase().includes(refSearch.toLowerCase())
                  ).map((c, i) => (
                    <button key={i}
                      onClick={() => { navigator.clipboard.writeText(c.cmd); toast.success("Command copied!"); }}
                      className="group text-left p-3.5 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/50 hover:border-primary/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-semibold text-foreground leading-tight">{c.label}</span>
                        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
                      </div>
                      <code className="text-[10px] font-mono text-primary block truncate mb-1.5 bg-primary/5 px-1.5 py-1 rounded">{c.cmd}</code>
                      <span className="text-[10px] text-muted-foreground leading-snug">{c.desc}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Log paths grouped by category */}
              {(() => {
                const filtered = LOG_REFERENCE.filter(r =>
                  !refSearch ||
                  r.path.toLowerCase().includes(refSearch.toLowerCase()) ||
                  r.category.toLowerCase().includes(refSearch.toLowerCase()) ||
                  r.description.toLowerCase().includes(refSearch.toLowerCase())
                );
                const categories = [...new Set(filtered.map(r => r.category))];
                return categories.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    No results for "{refSearch}"
                  </div>
                ) : categories.map(cat => (
                  <Card key={cat} className="border-border/40 overflow-hidden shadow-sm">
                    <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <Badge className={cn("text-[10px] px-2.5 py-0.5 border font-semibold uppercase tracking-wider", CATEGORY_COLORS[cat] ?? "")}>
                          {cat}
                        </Badge>
                        <span className="text-muted-foreground font-normal">{filtered.filter(r => r.category === cat).length} entries</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/30">
                        {filtered.filter(r => r.category === cat).map((ref, i) => (
                          <div key={i} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                            <div className="mt-0.5 shrink-0">
                              {ref.isCommand
                                ? <TerminalSquare className="w-3.5 h-3.5 text-muted-foreground/60" />
                                : <FileText className="w-3.5 h-3.5 text-muted-foreground/60" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <code className="text-xs font-mono text-primary font-semibold break-all leading-relaxed">{ref.path}</code>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ref.description}</p>
                            </div>
                            <button
                              onClick={() => { navigator.clipboard.writeText(ref.path); toast.success("Copied!"); }}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/60"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Sidebar>
  );
};

export default LogAnalyzer;
