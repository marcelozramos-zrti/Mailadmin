export interface ServiceStatus {
  active: boolean;
  state: string;
  uptime?: string;
}

export type ServicesMap = Record<string, ServiceStatus>;

export interface DomainItem {
  domain: string;
  description: string;
  aliases: number;
  mailboxes: number;
  maxquota: number;
  transport: string;
  active: boolean;
  created: string;
}

export interface MailboxItem {
  username: string;
  name: string;
  maildir: string;
  quota: number;
  domain: string;
  active: boolean;
  created: string;
}

export interface AliasItem {
  address: string;
  goto: string;
  domain: string;
  active: boolean;
  created: string;
}

export interface DomainAliasItem {
  alias_domain: string;
  target_domain: string;
  active: boolean;
  created: string;
}

export interface QueueItem {
  queue_id: string;
  size: number;
  date: string;
  sender: string;
  recipients: string[];
  reason?: string;
}

export interface DnsRecordResult {
  status: 'OK' | 'FALHA' | 'ALERTA';
  records?: string[];
  record?: string;
  details: string;
  selector?: string;
}

export interface DnsReport {
  domain: string;
  mx: DnsRecordResult;
  spf: DnsRecordResult;
  dkim: DnsRecordResult;
  dmarc: DnsRecordResult;
}

export interface LogResponse {
  success: boolean;
  logs: string[];
  source: string;
  message?: string;
}

export interface RuleResponse {
  success: boolean;
  content: string;
  source: string;
  message?: string;
}

export interface VisualSpamRule {
  id?: number;
  type: 'blacklist_from' | 'whitelist_from' | 'spam_from';
  action_label: string;
  value: string;
  raw: string;
}

export interface LintResponse {
  success: boolean;
  message: string;
}

export interface CpuHistoryPoint {
  time: string;
  usage: number;
  iowait: number;
  system: number;
}

export interface DiskPartition {
  filesystem: string;
  mount: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
}

export interface SystemProcess {
  name: string;
  pid: number;
  cpu_percent: number;
  mem_mb: number;
}

export interface SystemMetrics {
  hostname: string;
  os: string;
  kernel: string;
  uptime: string;
  cpu: {
    model: string;
    cores: number;
    usage_percent: number;
    load_avg: [number, number, number];
    history: CpuHistoryPoint[];
  };
  memory: {
    total_mb: number;
    used_mb: number;
    free_mb: number;
    cached_mb: number;
    usage_percent: number;
    swap_total_mb: number;
    swap_used_mb: number;
  };
  disks: DiskPartition[];
  network: {
    rx_kbps: number;
    tx_kbps: number;
    smtp_conns: number;
    active_queue_count: number;
    deferred_queue_count: number;
  };
  top_processes: SystemProcess[];
}

export type LayoutPosition = 'left' | 'top';

export interface LayoutSettings {
  position: LayoutPosition;
  sidebarCollapsed: boolean;
  themeMode: 'dark' | 'slate';
}

export interface PythonFiles {
  "app.py": string;
  "requirements.txt"?: string;
  "config.py"?: string;
  "models.py"?: string;
  "blueprints/auth_bp.py"?: string;
  "blueprints/vmail_bp.py"?: string;
  "blueprints/troubleshooting_bp.py"?: string;
  "blueprints/services_bp.py"?: string;
  "templates/index.html": string;
  "sudoers_mailadmin": string;
  "mailadmin.service": string;
  "README_DEPLOY.md": string;
}
