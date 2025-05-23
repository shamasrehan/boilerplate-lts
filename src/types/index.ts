// Function Types
export enum FunctionType {
  HELPER = 'helper',
  RUNNER = 'runner',
  WORKER = 'worker',
}

export enum JobExecutionType {
  INSTANT = 'instant',
  SCHEDULE = 'schedule',
  REPEAT = 'repeat',
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
}

// Function Interfaces
export interface IFunctionParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}

export interface IFunctionDefinition {
  name: string;
  description: string;
  type: FunctionType;
  parameters: IFunctionParameter[];
  timeout?: number;
  retries?: number;
}

export interface IFunctionHandler {
  (params: Record<string, any>, context?: IExecutionContext): Promise<any>;
}

export interface ICustomFunction {
  definition: IFunctionDefinition;
  handler: IFunctionHandler;
}

// Job Interfaces
export interface IJobData {
  functionName: string;
  parameters: Record<string, any>;
  executionType: JobExecutionType;
  scheduleTime?: Date;
  repeatInterval?: number;
  repeatDeadline?: Date;
  priority?: number;
  retries?: number;
}

export interface IJob {
  id: string;
  data: IJobData;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

// Message Interfaces
export interface IIncomingMessage {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface IOutgoingMessage {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface IMessageAcknowledgment {
  messageId: string;
  status: 'success' | 'failure';
  reason?: string;
  timestamp: Date;
}

// LLM Interfaces
export interface ILLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ILLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

// Execution Context
export interface IExecutionContext {
  jobId: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  logger: any;
}

// Health Check Interface
export interface IHealthStatus {
  module: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  details?: string;
  timestamp: Date;
}

// Agent Master Interfaces
export interface IOrchestrationRequest {
  message: IIncomingMessage;
  context?: IExecutionContext;
}

export interface IOrchestrationResponse {
  response: IOutgoingMessage;
  executedJobs?: string[];
  status: 'success' | 'failure';
  error?: string;
}