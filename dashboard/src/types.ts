export interface QueueEvent {
  reason: string;
  issueId: string | null;
  timestamp: number;
}

export interface AgentStatus {
  name: string;
  status: 'idle' | 'busy' | 'error' | 'never';
  pid: number | null;
  runStart: number | null;
  lastRunAt: number | null;
  lastSummary: string | null;
  scriptPath: string;
  queueDepth: number;
  queueEvents: QueueEvent[];
  resting: boolean;
  restUntil: number | null;
  restRemaining: number | null;
}

export type ModelName = 'haiku' | 'sonnet' | 'opus';

export interface ProgrammerFlags {
  skipCodeReview: boolean;
  bypassDesignApproval: boolean;
}

export interface StatusResponse {
  agents: AgentStatus[];
  serverTime: number;
  paused: boolean;
  pausedUntil: string | null;
  restMinutes: number;
  models: Record<string, ModelName>;
  programmerFlags: ProgrammerFlags;
}

export interface RunInfo {
  file: string;
  startedAt: string | null;
  summary: string | null;
}
