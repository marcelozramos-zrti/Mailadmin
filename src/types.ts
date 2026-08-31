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

export interface DkimKeyInfo {
  domain: string;
  selector: string;
  key_size: number;
  public_key_b64: string;
  private_key_pem?: string;
  dns_record_name: string;
  dns_record_type: string;
  dns_record_value: string;
  opendkim_table_line?: string;
  rspamd_dkim_conf?: string;
  created_at: string;
}

export interface SuggestedDnsRecord {
  type: string;
  host: string;
  value: string;
  priority?: number;
  ttl?: number;
  description: string;
}

export interface DnsRecordResult {
  status: 'OK' | 'FALHA' | 'ALERTA';
  records?: string[];
  record?: string;
  details: string;
  selector?: string;
  diagnosis?: string;
  solution?: string;
  importance?: 'Alta' | 'Média' | 'Crítica';
  suggested_record?: SuggestedDnsRecord;
  dkim_key?: DkimKeyInfo;
  is_local?: boolean;
}

export interface DnsReport {
  domain: string;
  is_local_domain: boolean;
  health_score: number;
  total_checks: number;
  passed_checks: number;
  overall_status: 'EXCELLENT' | 'ATTENTION' | 'CRITICAL';
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

export interface CustomRegexRule {
  id: string | number;
  name: string;
  target: 'Subject' | 'From' | 'Reply-To' | 'To' | 'Received' | 'Message-ID' | 'Body' | 'URI' | string;
  match_mode?: 'regex' | 'phrase' | 'contains' | 'obfuscated';
  pattern: string;
  score: number;
  describe: string;
  enabled?: boolean;
  category?: 'phishing' | 'obfuscation' | 'hijack' | 'banking_pix' | 'fake_invoice' | 'custom';
  action_type?: 'quarantine' | 'mark_spam' | 'reject';
  hits_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SslCertificateInfo {
  domain: string;
  valid: boolean;
  issuer: string;
  subject: string;
  valid_from: string;
  valid_to: string;
  days_remaining: number;
  auto_renew_active: boolean;
  cert_path: string;
  key_path: string;
}

export interface ServerServiceDetail {
  id: 'postfix' | 'amavis' | 'clamav-daemon' | 'spamassassin';
  name: string;
  service_unit: string;
  display_name: string;
  status: 'active' | 'inactive' | 'failed' | 'degraded';
  pid: number | null;
  memory_mb: number;
  cpu_percent: number;
  uptime: string;
  ports: number[];
  config_file: string;
  config_content: string;
  features: Record<string, any>;
  ssl_info?: SslCertificateInfo;
  recent_logs: string[];
}

export interface RegexRuleTestResult {
  matched: boolean;
  total_score: number;
  is_spam: boolean;
  rules_triggered: {
    name: string;
    target: string;
    pattern: string;
    score: number;
    describe: string;
    matched_value?: string;
  }[];
  breakdown_text: string;
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

export interface HourlyDistribution {
  hour: string;
  received: number;
  sent: number;
  spam: number;
  bounced: number;
  total: number;
}

export interface TopSenderDomain {
  domain: string;
  count: number;
  spam_count: number;
  clean_count: number;
  reputation: 'Boa' | 'Suspeita' | 'Crítica';
}

export interface TopRecipientDomain {
  domain: string;
  count: number;
  mailboxes_active: number;
}

export interface SpamRuleTriggered {
  rule: string;
  description: string;
  hits: number;
  score_impact: string;
}

export interface DailyMailMetric {
  date: string;
  displayDate: string;
  weekday: string;
  received: number;
  sent: number;
  spam_blocked: number;
  virus_blocked: number;
  rejected_bounced: number;
  total_processed: number;
  spam_pct: number;
  clean_delivery_rate: number;
  avg_latency_ms: number;
  hourly_distribution: HourlyDistribution[];
  top_sender_domains: TopSenderDomain[];
  top_recipient_domains: TopRecipientDomain[];
  spam_rules_triggered: SpamRuleTriggered[];
}

export interface MailTrafficSummary {
  total_processed_7d: number;
  total_received_7d: number;
  total_sent_7d: number;
  total_spam_blocked_7d: number;
  total_virus_blocked_7d: number;
  total_rejected_bounced_7d: number;
  avg_daily_volume: number;
  overall_spam_pct: number;
  clean_delivery_rate_pct: number;
  avg_latency_overall_ms: number;
  spam_trend: string;
  data_source: string;
  retention_policy: string;
  latest_update: string;
}

export interface MailStatsResponse {
  success: boolean;
  source: string;
  retention_days: number;
  retention_notice: string;
  summary: MailTrafficSummary;
  daily_metrics: DailyMailMetric[];
  aggregated_top_senders?: TopSenderDomain[];
  aggregated_top_recipients?: TopRecipientDomain[];
  aggregated_spam_rules?: SpamRuleTriggered[];
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
  "blueprints/automation_bp.py"?: string;
  "blueprints/audit_helper.py"?: string;
  "templates/index.html": string;
  "sudoers_mailadmin": string;
  "mailadmin.service": string;
  "README_DEPLOY.md": string;
}

