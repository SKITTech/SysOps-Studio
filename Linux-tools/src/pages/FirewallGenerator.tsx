import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Shield, Copy, CheckCircle2, Download, Info, Terminal, Search, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Rule Analyzer Types & Logic ──

interface ParsedRule {
  raw: string;
  chain: string;
  action: string;
  protocol: string;
  port: string;
  source: string;
  destination: string;
  explanation: string;
  verdict: "allow" | "block" | "log" | "info";
}

const WELL_KNOWN_PORTS: Record<string, string> = {
  "22": "SSH", "80": "HTTP", "443": "HTTPS", "53": "DNS",
  "25": "SMTP", "110": "POP3", "143": "IMAP", "993": "IMAPS",
  "995": "POP3S", "587": "SMTP (submission)", "465": "SMTPS",
  "21": "FTP", "20": "FTP-data", "3306": "MySQL", "5432": "PostgreSQL",
  "6379": "Redis", "27017": "MongoDB", "8080": "HTTP-alt", "8443": "HTTPS-alt",
  "3389": "RDP", "5900": "VNC", "1194": "OpenVPN", "51820": "WireGuard",
  "2049": "NFS", "111": "RPCBind", "123": "NTP", "161": "SNMP",
  "162": "SNMP-trap", "514": "Syslog", "873": "rsync",
  "10000": "Webmin", "1723": "PPTP", "500": "IKE/IPSec",
};

function getPortName(port: string): string {
  return WELL_KNOWN_PORTS[port] || "";
}

function parseIptablesOutput(output: string): ParsedRule[] {
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
  const rules: ParsedRule[] = [];
  let currentChain = "";

  for (const line of lines) {
    // Chain header
    const chainMatch = line.match(/^Chain\s+(\S+)\s+\(policy\s+(\S+)/i);
    if (chainMatch) {
      currentChain = chainMatch[1];
      const policy = chainMatch[2];
      const verdict = policy === "ACCEPT" ? "allow" : policy === "DROP" || policy === "REJECT" ? "block" : "info";
      rules.push({
        raw: line,
        chain: currentChain,
        action: policy,
        protocol: "all",
        port: "*",
        source: "0.0.0.0/0",
        destination: "0.0.0.0/0",
        explanation: `Default policy for ${currentChain} chain: ${policy}. ${policy === "DROP" ? "All traffic not matching any rule below will be silently dropped (blocked)." : policy === "ACCEPT" ? "All traffic not matching any rule below will be allowed through." : `Traffic will be ${policy.toLowerCase()}ed.`}`,
        verdict,
      });
      continue;
    }

    // Skip header lines
    if (/^(target|num|pkts|\s*$)/.test(line)) continue;

    // Parse iptables -L -n -v or iptables -L -n style
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    // Detect if it has packet/byte counters (iptables -L -v -n)
    let action = "", proto = "", source = "", dest = "", extras = "";
    const hasCounters = /^\d+/.test(parts[0]);

    if (hasCounters && parts.length >= 7) {
      // pkts bytes target prot opt in out source destination ...
      action = parts[2];
      proto = parts[3];
      source = parts[7] || "0.0.0.0/0";
      dest = parts[8] || "0.0.0.0/0";
      extras = parts.slice(9).join(" ");
    } else {
      // target prot opt source destination ...
      action = parts[0];
      proto = parts[1];
      source = parts[3] || "0.0.0.0/0";
      dest = parts[4] || "0.0.0.0/0";
      extras = parts.slice(5).join(" ");
    }

    // Extract port from dpt: or dport
    let port = "*";
    const dptMatch = extras.match(/dpt:(\d+)/);
    const dptsMatch = extras.match(/dpts:(\d+:\d+)/);
    const multiportMatch = extras.match(/multiport\s+dports\s+([\d,]+)/);
    if (dptMatch) port = dptMatch[1];
    else if (dptsMatch) port = dptsMatch[1];
    else if (multiportMatch) port = multiportMatch[1];

    const portName = port !== "*" ? getPortName(port.split(":")[0].split(",")[0]) : "";
    const portLabel = portName ? `${port} (${portName})` : port;

    const isAllow = /ACCEPT/i.test(action);
    const isBlock = /DROP|REJECT/i.test(action);
    const isLog = /LOG/i.test(action);

    let explanation = "";
    if (isAllow) {
      explanation = `ALLOWS ${proto.toUpperCase()} traffic`;
      if (port !== "*") explanation += ` on port ${portLabel}`;
      if (source !== "0.0.0.0/0") explanation += ` from ${source}`;
      if (dest !== "0.0.0.0/0") explanation += ` to ${dest}`;
      if (/ESTABLISHED|RELATED/.test(extras)) explanation += " (established/related connections only)";
      explanation += ". This traffic will pass through the firewall.";
    } else if (isBlock) {
      explanation = `BLOCKS ${proto.toUpperCase()} traffic`;
      if (port !== "*") explanation += ` on port ${portLabel}`;
      if (source !== "0.0.0.0/0") explanation += ` from ${source}`;
      if (dest !== "0.0.0.0/0") explanation += ` to ${dest}`;
      explanation += action === "REJECT" ? ". Connection will be rejected with an error response." : ". Packets will be silently dropped with no response.";
    } else if (isLog) {
      const prefixMatch = extras.match(/prefix\s+"([^"]+)"/);
      explanation = `LOGS matching packets${prefixMatch ? ` with prefix "${prefixMatch[1]}"` : ""}. No action taken on traffic, only logging.`;
    } else {
      explanation = `${action} rule for ${proto} traffic. ${extras}`;
    }

    rules.push({
      raw: line,
      chain: currentChain,
      action,
      protocol: proto,
      port,
      source,
      destination: dest,
      explanation,
      verdict: isAllow ? "allow" : isBlock ? "block" : isLog ? "log" : "info",
    });
  }

  // Parse firewalld --list-all style
  if (rules.length === 0 && /^(public|trusted|drop|block|dmz|work|home|internal|external)/m.test(output)) {
    return parseFirewalldOutput(output);
  }

  return rules;
}

function parseFirewalldOutput(output: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = output.split("\n");
  let zone = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Zone detection
    const zoneMatch = trimmed.match(/^(\S+)\s*(\(active\))?/);
    if (zoneMatch && !trimmed.includes(":") && !trimmed.startsWith("target") && lines.indexOf(line) < 3) {
      zone = zoneMatch[1];
      rules.push({
        raw: trimmed,
        chain: "zone",
        action: "INFO",
        protocol: "-",
        port: "-",
        source: "-",
        destination: "-",
        explanation: `Firewalld zone: "${zone}"${zoneMatch[2] ? " (currently active)" : ""}. All rules below apply to this zone.`,
        verdict: "info",
      });
      continue;
    }

    // Target
    if (trimmed.startsWith("target:")) {
      const target = trimmed.replace("target:", "").trim();
      rules.push({
        raw: trimmed, chain: "zone", action: target, protocol: "-", port: "-",
        source: "-", destination: "-",
        explanation: `Default target: ${target}. ${target === "default" ? "Uses the zone's default behavior (typically reject for public)." : target === "ACCEPT" ? "All unmatched traffic will be accepted." : "All unmatched traffic will be blocked."}`,
        verdict: target === "ACCEPT" ? "allow" : target === "DROP" || target === "REJECT" || target === "%%REJECT%%" ? "block" : "info",
      });
      continue;
    }

    // Services
    if (trimmed.startsWith("services:")) {
      const services = trimmed.replace("services:", "").trim().split(/\s+/).filter(Boolean);
      if (services.length > 0) {
        for (const svc of services) {
          rules.push({
            raw: `service: ${svc}`, chain: zone, action: "ACCEPT", protocol: "tcp/udp",
            port: svc, source: "any", destination: "any",
            explanation: `ALLOWS the "${svc}" service. Incoming connections for ${svc} are permitted through the firewall.`,
            verdict: "allow",
          });
        }
      }
      continue;
    }

    // Ports
    if (trimmed.startsWith("ports:")) {
      const ports = trimmed.replace("ports:", "").trim().split(/\s+/).filter(Boolean);
      for (const p of ports) {
        const [portNum, proto] = p.split("/");
        const portName = getPortName(portNum);
        rules.push({
          raw: `port: ${p}`, chain: zone, action: "ACCEPT", protocol: proto || "tcp",
          port: portNum, source: "any", destination: "any",
          explanation: `ALLOWS ${(proto || "tcp").toUpperCase()} traffic on port ${portNum}${portName ? ` (${portName})` : ""}. This port is open for incoming connections.`,
          verdict: "allow",
        });
      }
      continue;
    }

    // Rich rules
    if (trimmed.startsWith("rich rules:") || trimmed.startsWith("rule ")) {
      const ruleText = trimmed.startsWith("rich rules:") ? trimmed.replace("rich rules:", "").trim() : trimmed;
      if (ruleText) {
        const isAccept = ruleText.includes("accept");
        const isDrop = ruleText.includes("drop") || ruleText.includes("reject");
        rules.push({
          raw: ruleText, chain: zone, action: isAccept ? "ACCEPT" : isDrop ? "DROP" : "CUSTOM",
          protocol: "-", port: "-", source: "-", destination: "-",
          explanation: `Rich rule: ${ruleText}. ${isAccept ? "This custom rule allows specific traffic." : isDrop ? "This custom rule blocks specific traffic." : "Custom firewall rule."}`,
          verdict: isAccept ? "allow" : isDrop ? "block" : "info",
        });
      }
    }
  }

  return rules;
}

function analyzeRules(output: string): ParsedRule[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  // Try iptables format first, then firewalld
  let rules = parseIptablesOutput(trimmed);
  if (rules.length === 0) {
    rules = parseFirewalldOutput(trimmed);
  }
  return rules;
}

// ── Main Component ──

const FirewallGenerator = () => {
  const [firewallType, setFirewallType] = useState("iptables");
  const [allowSSH, setAllowSSH] = useState(true);
  const [allowHTTP, setAllowHTTP] = useState(false);
  const [allowHTTPS, setAllowHTTPS] = useState(false);
  const [allowDNS, setAllowDNS] = useState(false);
  const [allowMySQL, setAllowMySQL] = useState(false);
  const [allowPostgreSQL, setAllowPostgreSQL] = useState(false);
  const [dropInvalid, setDropInvalid] = useState(true);
  const [logDropped, setLogDropped] = useState(true);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  // Analyzer state
  const [analyzerInput, setAnalyzerInput] = useState("");
  const [analyzedRules, setAnalyzedRules] = useState<ParsedRule[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const generateIPTablesRules = (): string => {
    let rules = `#!/bin/bash
# Generated iptables firewall rules
# Run as root: bash firewall.sh

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# Set default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
`;

    if (dropInvalid) {
      rules += "\n# Drop invalid packets\niptables -A INPUT -m conntrack --ctstate INVALID -j DROP\n";
    }

    if (allowSSH) {
      rules += "\n# Allow SSH (port 22)\niptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT\n";
    }

    if (allowHTTP) {
      rules += "\n# Allow HTTP (port 80)\niptables -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT\n";
    }

    if (allowHTTPS) {
      rules += "\n# Allow HTTPS (port 443)\niptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT\n";
    }

    if (allowDNS) {
      rules += "\n# Allow DNS (port 53)\niptables -A INPUT -p udp --dport 53 -j ACCEPT\niptables -A INPUT -p tcp --dport 53 -j ACCEPT\n";
    }

    if (allowMySQL) {
      rules += "\n# Allow MySQL (port 3306)\niptables -A INPUT -p tcp --dport 3306 -m conntrack --ctstate NEW -j ACCEPT\n";
    }

    if (allowPostgreSQL) {
      rules += "\n# Allow PostgreSQL (port 5432)\niptables -A INPUT -p tcp --dport 5432 -m conntrack --ctstate NEW -j ACCEPT\n";
    }

    if (logDropped) {
      rules += "\n# Log dropped packets\niptables -A INPUT -m limit --limit 5/min -j LOG --log-prefix \"iptables_INPUT_denied: \" --log-level 7\n";
    }

    rules += "\n# Save rules\niptables-save > /etc/iptables/rules.v4\n\necho \"Firewall rules applied successfully!\"\n";

    return rules;
  };

  const generateNFTablesRules = (): string => {
    let rules = `#!/usr/sbin/nft -f
# Generated nftables firewall rules
# Run as root: nft -f firewall.nft

flush ruleset

table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;

    # Allow loopback
    iif lo accept

    # Allow established connections
    ct state established,related accept
`;

    if (dropInvalid) {
      rules += "\n    # Drop invalid packets\n    ct state invalid drop\n";
    }

    if (allowSSH) {
      rules += "\n    # Allow SSH\n    tcp dport 22 ct state new accept\n";
    }

    if (allowHTTP) {
      rules += "\n    # Allow HTTP\n    tcp dport 80 ct state new accept\n";
    }

    if (allowHTTPS) {
      rules += "\n    # Allow HTTPS\n    tcp dport 443 ct state new accept\n";
    }

    if (allowDNS) {
      rules += "\n    # Allow DNS\n    udp dport 53 accept\n    tcp dport 53 accept\n";
    }

    if (allowMySQL) {
      rules += "\n    # Allow MySQL\n    tcp dport 3306 ct state new accept\n";
    }

    if (allowPostgreSQL) {
      rules += "\n    # Allow PostgreSQL\n    tcp dport 5432 ct state new accept\n";
    }

    if (logDropped) {
      rules += "\n    # Log dropped packets\n    limit rate 5/minute log prefix \"nftables_INPUT_denied: \"\n";
    }

    rules += `  }

  chain forward {
    type filter hook forward priority 0; policy drop;
  }

  chain output {
    type filter hook output priority 0; policy accept;
  }
}
`;

    return rules;
  };

  const generateFirewallRules = () => {
    const rules = firewallType === "iptables" ? generateIPTablesRules() : generateNFTablesRules();
    setResult(rules);
    toast.success("Firewall rules generated successfully!");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadRules = () => {
    const blob = new Blob([result], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = firewallType === "iptables" ? "firewall.sh" : "firewall.nft";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Firewall rules downloaded!");
  };

  const handleAnalyze = () => {
    if (!analyzerInput.trim()) {
      toast.error("Please paste firewall output first");
      return;
    }
    const parsed = analyzeRules(analyzerInput);
    setAnalyzedRules(parsed);
    setHasAnalyzed(true);
    if (parsed.length === 0) {
      toast.error("Could not parse any firewall rules. Make sure you pasted valid iptables or firewalld output.");
    } else {
      toast.success(`Analyzed ${parsed.length} rule(s) successfully!`);
    }
  };

  const allowCount = analyzedRules.filter((r) => r.verdict === "allow").length;
  const blockCount = analyzedRules.filter((r) => r.verdict === "block").length;
  const logCount = analyzedRules.filter((r) => r.verdict === "log").length;

  const verdictIcon = (v: ParsedRule["verdict"]) => {
    switch (v) {
      case "allow": return <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "block": return <ShieldX className="w-4 h-4 text-destructive shrink-0" />;
      case "log": return <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />;
      default: return <Info className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const verdictBadge = (v: ParsedRule["verdict"]) => {
    switch (v) {
      case "allow": return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] uppercase tracking-wider">Allow</Badge>;
      case "block": return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] uppercase tracking-wider">Block</Badge>;
      case "log": return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] uppercase tracking-wider">Log</Badge>;
      default: return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Info</Badge>;
    }
  };

  return (
    <Sidebar>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center my-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="w-10 h-10 text-primary" />
              <h1 className="text-4xl font-bold text-foreground">Firewall Rule Generator</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Generate, analyze, and understand iptables or nftables firewall rules
            </p>
          </div>

          {/* Firewall Detection Commands */}
          <Card className="mb-8 border-border/40 bg-accent/5">
            <CardContent className="p-5">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-3 w-full">
                  <div>
                    <p className="font-semibold text-foreground text-sm mb-1">How to check which firewall is active on your server</p>
                    <p className="text-xs text-muted-foreground mb-3">Run these commands on your server to identify the active firewall and get its rules:</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-muted/60 rounded-lg p-3 border border-border/50">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Check active firewall</p>
                      <code className="text-xs font-mono text-foreground block leading-relaxed">
                        # Check if iptables has rules{"\n"}
                        sudo iptables -L -n --line-numbers{"\n\n"}
                        # Check if firewalld is running{"\n"}
                        sudo systemctl status firewalld{"\n\n"}
                        # Check if nftables is active{"\n"}
                        sudo nft list ruleset{"\n\n"}
                        # Check if UFW is active{"\n"}
                        sudo ufw status verbose
                      </code>
                    </div>
                    <div className="bg-muted/60 rounded-lg p-3 border border-border/50">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Get full rule output (paste below)</p>
                      <code className="text-xs font-mono text-foreground block leading-relaxed">
                        # For iptables (most common){"\n"}
                        sudo iptables -L -n -v{"\n\n"}
                        # For firewalld{"\n"}
                        sudo firewall-cmd --list-all{"\n\n"}
                        # For nftables{"\n"}
                        sudo nft list ruleset{"\n\n"}
                        # For UFW (shows iptables){"\n"}
                        sudo iptables -L -n -v
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="generator" className="space-y-6">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
              <TabsTrigger value="generator" className="gap-2">
                <Shield className="w-4 h-4" />
                Rule Generator
              </TabsTrigger>
              <TabsTrigger value="analyzer" className="gap-2">
                <Search className="w-4 h-4" />
                Rule Analyzer
              </TabsTrigger>
            </TabsList>

            {/* ── Generator Tab ── */}
            <TabsContent value="generator">
              <div className="grid lg:grid-cols-2 gap-8">
                <Card className="border-border/40 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Firewall Configuration
                    </CardTitle>
                    <CardDescription>Select firewall type and allowed services</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label className="text-foreground mb-2 block">
                        Firewall Type <span className="text-destructive">*</span>
                      </Label>
                      <Select value={firewallType} onValueChange={setFirewallType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="iptables">iptables (Legacy)</SelectItem>
                          <SelectItem value="nftables">nftables (Modern)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-foreground">Allowed Services</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="ssh" checked={allowSSH} onCheckedChange={(checked) => setAllowSSH(checked as boolean)} />
                        <Label htmlFor="ssh" className="text-sm cursor-pointer">SSH (Port 22)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="http" checked={allowHTTP} onCheckedChange={(checked) => setAllowHTTP(checked as boolean)} />
                        <Label htmlFor="http" className="text-sm cursor-pointer">HTTP (Port 80)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="https" checked={allowHTTPS} onCheckedChange={(checked) => setAllowHTTPS(checked as boolean)} />
                        <Label htmlFor="https" className="text-sm cursor-pointer">HTTPS (Port 443)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="dns" checked={allowDNS} onCheckedChange={(checked) => setAllowDNS(checked as boolean)} />
                        <Label htmlFor="dns" className="text-sm cursor-pointer">DNS (Port 53)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="mysql" checked={allowMySQL} onCheckedChange={(checked) => setAllowMySQL(checked as boolean)} />
                        <Label htmlFor="mysql" className="text-sm cursor-pointer">MySQL (Port 3306)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="postgresql" checked={allowPostgreSQL} onCheckedChange={(checked) => setAllowPostgreSQL(checked as boolean)} />
                        <Label htmlFor="postgresql" className="text-sm cursor-pointer">PostgreSQL (Port 5432)</Label>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border">
                      <Label className="text-foreground">Security Options</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="dropInvalid" checked={dropInvalid} onCheckedChange={(checked) => setDropInvalid(checked as boolean)} />
                        <Label htmlFor="dropInvalid" className="text-sm cursor-pointer">Drop invalid packets</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="logDropped" checked={logDropped} onCheckedChange={(checked) => setLogDropped(checked as boolean)} />
                        <Label htmlFor="logDropped" className="text-sm cursor-pointer">Log dropped packets</Label>
                      </div>
                    </div>

                    <Button onClick={generateFirewallRules} className="w-full" size="lg">
                      Generate Firewall Rules
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/40 shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        Generated Rules
                      </CardTitle>
                      {result && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            Copy
                          </Button>
                          <Button variant="outline" size="sm" onClick={downloadRules} className="gap-2">
                            <Download className="w-4 h-4" />
                            Download
                          </Button>
                        </div>
                      )}
                    </div>
                    <CardDescription>Ready-to-use firewall configuration script</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!result ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>Configure options and generate rules</p>
                      </div>
                    ) : (
                      <Textarea
                        value={result}
                        readOnly
                        className="font-mono text-sm h-96 bg-muted"
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Analyzer Tab ── */}
            <TabsContent value="analyzer">
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Input */}
                <Card className="border-border/40 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Terminal className="w-5 h-5" />
                      Paste Firewall Output
                    </CardTitle>
                    <CardDescription>
                      Paste the output of <code className="bg-muted px-1 py-0.5 rounded text-xs">iptables -L -n -v</code> or <code className="bg-muted px-1 py-0.5 rounded text-xs">firewall-cmd --list-all</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={analyzerInput}
                      onChange={(e) => setAnalyzerInput(e.target.value)}
                      placeholder={`Example:\nChain INPUT (policy DROP)\ntarget     prot opt source               destination\nACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            ctstate RELATED,ESTABLISHED\nACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:22\nACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:80\nACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:443\nDROP       all  --  0.0.0.0/0            0.0.0.0/0`}
                      className="font-mono text-xs h-80 bg-muted/50"
                    />
                    <Button onClick={handleAnalyze} className="w-full gap-2" size="lg">
                      <Search className="w-4 h-4" />
                      Analyze Rules
                    </Button>
                  </CardContent>
                </Card>

                {/* Results */}
                <Card className="border-border/40 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5" />
                      Rule Analysis
                    </CardTitle>
                    {hasAnalyzed && analyzedRules.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3" /> {allowCount} Allow
                        </Badge>
                        <Badge variant="secondary" className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
                          <ShieldX className="w-3 h-3" /> {blockCount} Block
                        </Badge>
                        {logCount > 0 && (
                          <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                            <ShieldAlert className="w-3 h-3" /> {logCount} Log
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {!hasAnalyzed ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>Paste firewall output and click Analyze</p>
                      </div>
                    ) : analyzedRules.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <ShieldAlert className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p>No rules could be parsed. Check the format.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {analyzedRules.map((rule, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-1.5"
                          >
                            <div className="flex items-start gap-2">
                              {verdictIcon(rule.verdict)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  {verdictBadge(rule.verdict)}
                                  {rule.chain && (
                                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                                      {rule.chain}
                                    </Badge>
                                  )}
                                  {rule.port !== "*" && rule.port !== "-" && (
                                    <Badge variant="outline" className="text-[10px] font-mono">
                                      {rule.port}{getPortName(rule.port.split(":")[0].split(",")[0]) ? ` (${getPortName(rule.port.split(":")[0].split(",")[0])})` : ""}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-foreground leading-relaxed">{rule.explanation}</p>
                                <code className="text-[11px] text-muted-foreground font-mono mt-1 block truncate">{rule.raw}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Sidebar>
  );
};

export default FirewallGenerator;
