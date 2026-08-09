export interface ServiceStatus {
  active: boolean;
  state: string;
  uptime?: string;
}

export type ServicesMap = Record<string, ServiceStatus>;

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

export interface LintResponse {
  success: boolean;
  message: string;
}

export interface PythonFiles {
  "app.py": string;
  "templates/index.html": string;
  "sudoers_mailadmin": string;
  "mailadmin.service": string;
  "README_DEPLOY.md": string;
}
