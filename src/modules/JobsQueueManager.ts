import { Queue, Worker, Job, QueueEvents, JobsOptions, RepeatOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  IJob,
  IJobData,
  JobExecutionType,
  JobStatus,
  IHealthStatus,
  IExecutionContext,
} from '../types';
import { FunctionsManager } from './FunctionsManager';

export class JobsQueueManager {
  private queue!: Queue;
  private worker!: Worker;
  private queueEvents!: QueueEvents;
  private functionsManager: FunctionsManager;
  private jobs: Map<string, IJob> = new Map();
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private repeatJobs: Map<string, NodeJS.Timeout> = new Map();
  private redisConnection: RedisOptions;

  constructor(functionsManager: FunctionsManager) {
    this.functionsManager = functionsManager;
    
    // Parse Redis URL for BullMQ connection
    this.redisConnection = this.parseRedisUrl(config.redis.url);
    
    // Initialize BullMQ components
    this.initializeQueue();
    this.initializeWorker();
    this.initializeQueueEvents();
  }

  private parseRedisUrl(url: string): RedisOptions {
    try {
      const redisUrl = new URL(url);
      return {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port) || 6379,
        password: redisUrl.password || undefined,
        db: parseInt(redisUrl.pathname.slice(1)) || 0,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        lazyConnect: true,
      };
    } catch (error) {
      logger.warn('Invalid Redis URL, using defaults:', error);
      return {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        lazyConnect: true,
      };
    }
  }

  private initializeQueue(): void {
    this.queue = new Queue('agent-jobs', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    logger.info('BullMQ Queue initialized');
  }

  private initializeWorker(): void {
    this.worker = new Worker(
      'agent-jobs',
      async (job: Job) => {
        return await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: config.functions.maxConcurrentJobs,
        limiter: {
          max: config.functions.maxConcurrentJobs,
          duration: 1000,
        },
      }
    );

    this.setupWorkerEventHandlers();
    logger.info('BullMQ Worker initialized');
  }

  private initializeQueueEvents(): void {
    this.queueEvents = new QueueEvents('agent-jobs', {
      connection: this.redisConnection,
    });

    this.setupQueueEventHandlers();
    logger.info('BullMQ QueueEvents initialized');
  }

  private setupWorkerEventHandlers(): void {
    this.worker.on('completed', (job: Job, result: any) => {
      this.updateJobStatus(job.id!, JobStatus.COMPLETED, result);
      logger.info(`Job completed: ${job.id}`, { result });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      if (job) {
        this.updateJobStatus(job.id!, JobStatus.FAILED, null, error.message);
        logger.error(`Job failed: ${job.id}`, { error: error.message });
      }
    });

    this.worker.on('active', (job: Job) => {
      this.updateJobStatus(job.id!, JobStatus.RUNNING);
      logger.info(`Job started: ${job.id}`);
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn(`Job stalled: ${jobId}`);
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Worker error:', error);
    });
  }

  private setupQueueEventHandlers(): void {
    this.queueEvents.on('waiting', ({ jobId }) => {
      this.updateJobStatus(jobId, JobStatus.PENDING);
      logger.info(`Job waiting: ${jobId}`);
    });

    this.queueEvents.on('active', ({ jobId }) => {
      this.updateJobStatus(jobId, JobStatus.RUNNING);
      logger.info(`Job active: ${jobId}`);
    });

    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      this.updateJobStatus(jobId, JobStatus.COMPLETED, returnvalue);
      logger.info(`Job completed: ${jobId}`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.updateJobStatus(jobId, JobStatus.FAILED, null, failedReason);
      logger.error(`Job failed: ${jobId}`, { reason: failedReason });
    });
  }

  private async processJob(job: Job): Promise<any> {
    const jobData = job.data as IJobData;
    const jobId = job.id!;

    try {
      logger.info(`Processing job: ${jobId}`, { functionName: jobData.functionName });

      // Validate function exists
      if (!this.functionsManager.getFunction(jobData.functionName)) {
        throw new Error(`Function ${jobData.functionName} not found`);
      }

      // Validate function call parameters
      if (!this.functionsManager.validateFunctionCall(jobData.functionName, jobData.parameters)) {
        throw new Error(`Invalid parameters for function ${jobData.functionName}`);
      }

      // Create execution context
      const context: IExecutionContext = {
        jobId,
        metadata: { 
          executionType: jobData.executionType,
          bullmqJobId: jobId,
          attempts: job.attemptsMade,
        },
        logger,
      };

      // Execute function with progress reporting
      job.updateProgress(10);
      
      const result = await this.functionsManager.executeFunction(
        jobData.functionName,
        jobData.parameters,
        context
      );

      job.updateProgress(100);
      return result;
    } catch (error) {
      logger.error(`Job execution failed: ${jobId}`, error);
      throw error;
    }
  }

  private updateJobStatus(jobId: string, status: JobStatus, result?: any, error?: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      if (result !== undefined) job.result = result;
      if (error) job.error = error;
      
      if (status === JobStatus.RUNNING) {
        job.startedAt = new Date();
      } else if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
        job.completedAt = new Date();
      }

      this.jobs.set(jobId, job);
    }
  }

  public async addJob(jobData: IJobData): Promise<string> {
    try {
      const jobId = uuidv4();
      
      // Validate function exists
      if (!this.functionsManager.getFunction(jobData.functionName)) {
        throw new Error(`Function ${jobData.functionName} not found`);
      }

      // Create job record
      const job: IJob = {
        id: jobId,
        data: jobData,
        status: JobStatus.PENDING,
        createdAt: new Date(),
      };

      this.jobs.set(jobId, job);

      // Handle different execution types
      switch (jobData.executionType) {
        case JobExecutionType.INSTANT:
          await this.addInstantJob(jobId, jobData);
          break;
        case JobExecutionType.SCHEDULE:
          await this.addScheduledJob(jobId, jobData);
          break;
        case JobExecutionType.REPEAT:
          await this.addRepeatJob(jobId, jobData);
          break;
        default:
          throw new Error(`Unsupported execution type: ${jobData.executionType}`);
      }

      logger.info(`Job added: ${jobId}`, { functionName: jobData.functionName, type: jobData.executionType });
      return jobId;
    } catch (error) {
      logger.error('Error adding job:', error);
      throw error;
    }
  }

  private async addInstantJob(jobId: string, jobData: IJobData): Promise<void> {
    const options: JobsOptions = {
      jobId,
      priority: jobData.priority || 0,
      attempts: jobData.retries || 3,
      delay: 0,
    };

    await this.queue.add('execute-function', jobData, options);
  }

  private async addScheduledJob(jobId: string, jobData: IJobData): Promise<void> {
    if (!jobData.scheduleTime) {
      throw new Error('Schedule time is required for scheduled jobs');
    }

    const delay = jobData.scheduleTime.getTime() - Date.now();
    if (delay <= 0) {
      throw new Error('Schedule time must be in the future');
    }

    const options: JobsOptions = {
      jobId,
      delay,
      priority: jobData.priority || 0,
      attempts: jobData.retries || 3,
    };

    await this.queue.add('execute-function', jobData, options);
  }

  private async addRepeatJob(jobId: string, jobData: IJobData): Promise<void> {
    if (!jobData.repeatInterval) {
      throw new Error('Repeat interval is required for repeat jobs');
    }

    // Only runner functions can be repeated
    const func = this.functionsManager.getFunction(jobData.functionName);
    if (func?.definition.type !== 'runner') {
      throw new Error('Only runner functions can be repeated');
    }

    const deadline = jobData.repeatDeadline || new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24 hours

    // Use BullMQ's built-in repeat functionality
    const repeatOptions: RepeatOptions = {
      every: jobData.repeatInterval,
      endDate: deadline,
    };

    const options: JobsOptions = {
      jobId,
      priority: jobData.priority || 0,
      attempts: jobData.retries || 3,
      repeat: repeatOptions,
    };

    await this.queue.add('execute-function', jobData, options);
  }

  public async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      // Cancel from BullMQ queue
      const bullJob = await this.queue.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
      }

      // Cancel scheduled job
      const scheduledTask = this.scheduledJobs.get(jobId);
      if (scheduledTask) {
        scheduledTask.stop();
        this.scheduledJobs.delete(jobId);
      }

      // Cancel repeat job
      const repeatInterval = this.repeatJobs.get(jobId);
      if (repeatInterval) {
        clearInterval(repeatInterval);
        this.repeatJobs.delete(jobId);
      }

      // Update job status
      this.updateJobStatus(jobId, JobStatus.CANCELLED);
      
      logger.info(`Job cancelled: ${jobId}`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling job ${jobId}:`, error);
      return false;
    }
  }

  public async removeJob(jobId: string): Promise<boolean> {
    try {
      const cancelled = await this.cancelJob(jobId);
      if (cancelled) {
        this.jobs.delete(jobId);
        logger.info(`Job removed: ${jobId}`);
      }
      return cancelled;
    } catch (error) {
      logger.error(`Error removing job ${jobId}:`, error);
      return false;
    }
  }

  public async setPriority(jobId: string, priority: number): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.changePriority(priority);
      
      // Update local job record
      const localJob = this.jobs.get(jobId);
      if (localJob) {
        localJob.data.priority = priority;
        this.jobs.set(jobId, localJob);
      }

      logger.info(`Job priority updated: ${jobId}`, { priority });
      return true;
    } catch (error) {
      logger.error(`Error setting priority for job ${jobId}:`, error);
      return false;
    }
  }

  public getJob(jobId: string): IJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): IJob[] {
    return Array.from(this.jobs.values());
  }

  public getJobsByStatus(status: JobStatus): IJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  public async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  public async pauseQueue(): Promise<void> {
    await this.queue.pause();
    logger.info('Job queue paused');
  }

  public async resumeQueue(): Promise<void> {
    await this.queue.resume();
    logger.info('Job queue resumed');
  }

  public async cleanJobs(): Promise<void> {
    const grace = 24 * 60 * 60 * 1000; // 24 hours
    await this.queue.clean(grace, 100, 'completed');
    await this.queue.clean(grace, 100, 'failed');
    logger.info('Old jobs cleaned from queue');
  }

  public async getJobLogs(jobId: string): Promise<string[]> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return [];
      }
      return job.log || [];
    } catch (error) {
      logger.error(`Error getting job logs for ${jobId}:`, error);
      return [];
    }
  }

  public async retryJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.retry();
      logger.info(`Job retry initiated: ${jobId}`);
      return true;
    } catch (error) {
      logger.error(`Error retrying job ${jobId}:`, error);
      return false;
    }
  }

  public async getQueueHealth(): Promise<{
    isReady: boolean;
    connection: string;
    memoryUsage: any;
  }> {
    try {
      const isReady = await this.queue.getJobCounts('active', 'waiting') !== null;
      const client = await this.queue.client;
      
      return {
        isReady,
        connection: client.status,
        memoryUsage: await client.info('STATS'),
      };
    } catch (error) {
      return {
        isReady: false,
        connection: 'error',
        memoryUsage: null,
      };
    }
  }

  public getHealthStatus(): IHealthStatus {
    try {
      const totalJobs = this.jobs.size;
      const activeJobs = this.getJobsByStatus(JobStatus.RUNNING).length;
      const pendingJobs = this.getJobsByStatus(JobStatus.PENDING).length;
      const repeatJobsCount = this.repeatJobs.size;

      return {
        module: 'JobsQueueManager',
        status: 'healthy',
        details: `Total: ${totalJobs}, Active: ${activeJobs}, Pending: ${pendingJobs}, Repeat: ${repeatJobsCount}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        module: 'JobsQueueManager',
        status: 'unhealthy',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down JobsQueueManager...');
      
      // Cancel all repeat jobs
      for (const [jobId, interval] of this.repeatJobs) {
        clearInterval(interval);
        logger.info(`Cancelled repeat job: ${jobId}`);
      }
      this.repeatJobs.clear();

      // Stop all scheduled jobs
      for (const [jobId, task] of this.scheduledJobs) {
        task.stop();
        logger.info(`Stopped scheduled job: ${jobId}`);
      }
      this.scheduledJobs.clear();

      // Close BullMQ components gracefully
      await this.worker.close();
      await this.queueEvents.close();
      await this.queue.close();
      
      logger.info('JobsQueueManager shutdown completed');
    } catch (error) {
      logger.error('Error during JobsQueueManager shutdown:', error);
    }
  }
}