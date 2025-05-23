import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config/index';
import {
  IIncomingMessage,
  IOutgoingMessage,
  IOrchestrationRequest,
  IOrchestrationResponse,
  IHealthStatus,
  ILLMConfig,
  LLMProvider,
  JobExecutionType,
  FunctionType,
  IJob,
  IJobData,
  JobStatus,
  ILLMResponse,
  IExecutionContext,
} from '../types/index';
import { FunctionsManager } from './FunctionsManager';
import { MessagingManager } from './MessagingManager';
import { JobsQueueManager } from './JobsQueueManager';
import { LLMManager } from './LLMManager';
import { Server } from 'socket.io';

export class AgentMaster {
  private functionsManager: FunctionsManager;
  private messagingManager: MessagingManager;
  private jobsQueueManager: JobsQueueManager;
  private llmManager: LLMManager;
  private orchestrationMasterInstanceId: string;
  private isInitialized: boolean = false;
  private activeRequests: Map<string, IOrchestrationRequest> = new Map();
  private io: Server | null = null;

  constructor() {
    this.functionsManager = new FunctionsManager();
    this.messagingManager = new MessagingManager();
    this.jobsQueueManager = new JobsQueueManager(this.functionsManager);
    this.llmManager = new LLMManager();
    
    this.orchestrationMasterInstanceId = this.createOrchestrationMaster();
    this.initialize().catch(error => {
      logger.error('Failed to initialize AgentMaster:', error);
      throw error;
    });
  }

  private async initialize(): Promise<void> {
    try {
      logger.info('Initializing AgentMaster...');

      // Wait for RabbitMQ connection
      await this.messagingManager.waitForConnection();

      // Register message handler with MessagingManager
      this.messagingManager.registerMessageHandler(
        'orchestration',
        this.handleIncomingMessage.bind(this)
      );

      // Start listening for messages
      await this.messagingManager.startListening();

      this.isInitialized = true;
      logger.info('AgentMaster initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AgentMaster:', error);
      throw error;
    }
  }

  private async handleIncomingMessage(message: IIncomingMessage): Promise<void> {
    const requestId = uuidv4();
    logger.info('handleIncomingMessage called', { 
      messageId: message.id,
      content: message.content,
      metadata: message.metadata
    });
    
    // Check if message is already being processed
    if (this.activeRequests.has(message.id)) {
      logger.warn('Message already being processed', { messageId: message.id });
      return;
    }

    // Validate message format
    if (!message.id || !message.content || !message.timestamp) {
      logger.error('Invalid message format', { message });
      return;
    }

    // Skip if this is a response message
    if (message.metadata?.isResponse) {
      logger.info('Skipping response message', { messageId: message.id });
      return;
    }

    try {
      logger.info(`Processing incoming message: ${message.id}`, { requestId });
      this.emitEvent('message:processing', { 
        messageId: message.id, 
        status: 'processing',
        timestamp: new Date()
      });

      const request: IOrchestrationRequest = {
        message,
        context: {
          jobId: requestId,
          sessionId: message.metadata?.sessionId,
          userId: message.metadata?.userId,
          metadata: { requestId, messageId: message.id },
          logger,
        },
      };

      this.activeRequests.set(message.id, request);

      // Process through OrchestrationMaster
      this.emitEvent('message:orchestration', {
        messageId: message.id,
        status: 'orchestrating',
        timestamp: new Date()
      });

      logger.info('Calling orchestrationMaster', { request });
      const response = await this.orchestrationMaster(request);
      logger.info('orchestrationMaster response', { response });

      if (!response || !response.response) {
        throw new Error('Invalid response from orchestration');
      }

      // Send response via MessagingManager
      this.emitEvent('message:responding', {
        messageId: message.id,
        status: 'sending_response',
        timestamp: new Date()
      });

      logger.info('Sending response', { response });
      await this.messagingManager.sendMessage(response.response);

      this.emitEvent('message:complete', {
        messageId: message.id,
        status: 'complete',
        response: response.response,
        timestamp: new Date()
      });

      logger.info(`Message processed successfully: ${message.id}`, { 
        requestId, 
        status: response.status 
      });
    } catch (error) {
      logger.error(`Error processing message ${message.id}:`, error);
      this.emitEvent('message:error', {
        messageId: message.id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });

      // Only send error response if we haven't already sent one
      if (!this.activeRequests.has(message.id)) {
        const errorResponse = this.messagingManager.createOutgoingMessage(
          `I apologize, but I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { 
            error: true, 
            requestId,
            originalMessageId: message.id,
            errorTimestamp: new Date().toISOString(),
            isResponse: true // Mark as response to prevent reprocessing
          }
        );
        await this.messagingManager.sendMessage(errorResponse);
      }
    } finally {
      this.activeRequests.delete(message.id);
    }
  }

  private async orchestrationMaster(request: IOrchestrationRequest): Promise<IOrchestrationResponse> {
    try {
      logger.info('OrchestrationMaster processing request', { 
        messageId: request.message.id 
      });

      if (!this.llmManager) {
        throw new Error('LLM Manager not initialized');
      }

      // Get available function definitions
      const functionDefinitions = this.functionsManager.getFunctionDefinitions();
      const functionsContext = JSON.stringify(functionDefinitions, null, 2);

      // Prepare the prompt for the LLM
      const analysisPrompt = `
Message to analyze: "${request.message.content}"

Available functions:
${functionsContext}

Analyze this message and determine the appropriate action. Consider:
1. What is the user trying to accomplish?
2. Which function(s) can help achieve this goal?
3. What parameters are needed?
4. What execution type is most appropriate?

Respond with the JSON structure as specified in your system prompt.`;

      // Get LLM decision
      const llmResponse = await this.llmManager.generateResponse(
        this.orchestrationMasterInstanceId,
        analysisPrompt
      );

      if (!llmResponse || !llmResponse.content) {
        throw new Error('Invalid response from LLM');
      }

      logger.info('LLM analysis completed', { 
        responseLength: llmResponse.content.length 
      });

      // Parse LLM response
      const decision = this.parseLLMDecision(llmResponse.content);
      logger.info('LLM decision', { decision });

      // Execute the decision
      const result = await this.executeDecision(decision, request);
      logger.info('Function executed', { result });

      // Generate final response
      const responseMessage = this.messagingManager.createOutgoingMessage(
        result.responseText,
        {
          originalMessageId: request.message.id,
          action: decision.action,
          executedJobs: result.executedJobs,
          isResponse: true // Mark as response to prevent reprocessing
        }
      );

      return {
        response: responseMessage,
        executedJobs: result.executedJobs,
        status: 'success',
      };
    } catch (error) {
      logger.error('OrchestrationMaster error:', error);
      const errorMessage = this.messagingManager.createOutgoingMessage(
        `I apologize, but I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { 
          error: true, 
          originalMessageId: request.message.id,
          errorTimestamp: new Date().toISOString(),
          isResponse: true // Mark as response to prevent reprocessing
        }
      );
      return {
        response: errorMessage,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseLLMDecision(response: string): any {
    try {
      // Extract JSON from response (handle cases where LLM adds explanatory text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const decision = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!decision.action) {
        throw new Error('Missing action in LLM decision');
      }

      return decision;
    } catch (error) {
      logger.error('Error parsing LLM decision:', error);
      logger.error('Raw LLM response:', response);
      
      // Fallback to direct response
      return {
        action: 'direct_response',
        response_message: 'I understand your message, but I need more specific instructions to help you effectively.',
      };
    }
  }

  private async executeDecision(decision: any, request: IOrchestrationRequest): Promise<{
    responseText: string;
    executedJobs?: string[];
  }> {
    const executedJobs: string[] = [];

    switch (decision.action) {
      case 'execute_function':
        return await this.executeFunctionDecision(decision, request, executedJobs);
      
      case 'cancel_job':
        return await this.cancelJobDecision(decision);
      
      case 'get_status':
        return await this.getStatusDecision(decision);
      
      case 'direct_response':
      default:
        return {
          responseText: decision.response_message || 'I\'ve processed your message.',
        };
    }
  }

  private async executeFunctionDecision(
    decision: any, 
    request: IOrchestrationRequest, 
    executedJobs: string[]
  ): Promise<{ responseText: string; executedJobs: string[] }> {
    try {
      logger.info('Starting executeFunctionDecision', { 
        functionName: decision.function_name,
        parameters: decision.parameters,
        executionType: decision.execution_type 
      });

      if (!decision.function_name) {
        throw new Error('Function name is required for execute_function action');
      }

      // Validate function exists
      const func = this.functionsManager.getFunction(decision.function_name);
      if (!func) {
        logger.error('Function not found', { functionName: decision.function_name });
        throw new Error(`Function ${decision.function_name} not found`);
      }

      logger.info('Function found, preparing job data', { 
        functionName: decision.function_name
      });

      const jobData = {
        functionName: decision.function_name,
        parameters: decision.parameters || {},
        executionType: decision.execution_type || JobExecutionType.INSTANT,
        scheduleTime: decision.schedule_time ? new Date(decision.schedule_time) : undefined,
        repeatInterval: decision.repeat_interval,
        repeatDeadline: decision.repeat_deadline ? new Date(decision.repeat_deadline) : undefined,
      };

      // Add job to queue
      logger.info('Adding job to queue', { jobData });
      const jobId = await this.jobsQueueManager.addJob(jobData);
      executedJobs.push(jobId);

      logger.info(`Job queued successfully: ${jobId}`, { 
        functionName: decision.function_name,
        executionType: jobData.executionType 
      });

      // Wait for instant jobs to complete
      if (jobData.executionType === JobExecutionType.INSTANT) {
        logger.info('Waiting for instant job completion', { jobId });
        const result = await this.waitForJobCompletion(jobId);
        logger.info('Job completed successfully', { jobId, result });
        
        // Generate contextual response using LLM
        logger.info('Generating contextual response');
        const contextualResponse = await this.generateContextualResponse(
          request.message.content,
          decision.function_name,
          result,
          decision.response_message
        );
        logger.info('Contextual response generated', { response: contextualResponse });

        return {
          responseText: contextualResponse,
          executedJobs,
        };
      } else {
        logger.info('Scheduled job created', { 
          jobId, 
          executionType: jobData.executionType 
        });
        return {
          responseText: decision.response_message || 
            `I've scheduled the ${decision.function_name} function to run ${jobData.executionType === JobExecutionType.SCHEDULE ? 'at the specified time' : 'repeatedly'}.`,
          executedJobs,
        };
      }
    } catch (error) {
      logger.error('Error executing function decision:', error);
      return {
        responseText: `I encountered an error while executing the requested function: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executedJobs,
      };
    }
  }

  private async waitForJobCompletion(jobId: string, timeout: number = 30000): Promise<any> {
    const startTime = Date.now();
    logger.info('Starting waitForJobCompletion', { jobId, timeout });
    
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const job = this.jobsQueueManager.getJob(jobId);
        
        if (!job) {
          logger.error('Job not found during completion check', { jobId });
          clearInterval(checkInterval);
          reject(new Error('Job not found'));
          return;
        }

        logger.info('Job status check', { 
          jobId, 
          status: job.status,
          elapsedTime: Date.now() - startTime 
        });

        if (job.status === 'completed') {
          logger.info('Job completed', { jobId, result: job.result });
          clearInterval(checkInterval);
          resolve(job.result);
          return;
        }

        if (job.status === 'failed') {
          logger.error('Job failed', { jobId, error: job.error });
          clearInterval(checkInterval);
          reject(new Error(job.error || 'Job failed'));
          return;
        }

        if (Date.now() - startTime > timeout) {
          logger.error('Job execution timeout', { jobId, timeout });
          clearInterval(checkInterval);
          reject(new Error('Job execution timeout'));
          return;
        }
      }, 1000);
    });
  }

  private async generateContextualResponse(
    originalMessage: string,
    functionName: string,
    functionResult: any,
    suggestedResponse?: string
  ): Promise<string> {
    try {
      const contextPrompt = `
Original user message: "${originalMessage}"
Function executed: ${functionName}
Function result: ${JSON.stringify(functionResult, null, 2)}
Suggested response: ${suggestedResponse || 'None'}

Generate a natural, helpful response to the user based on the function execution result. 
Be conversational and explain what was accomplished. Keep it concise but informative.`;

      const response = await this.llmManager.generateResponse(
        this.orchestrationMasterInstanceId,
        contextPrompt
      );

      return response.content;
    } catch (error) {
      logger.error('Error generating contextual response:', error);
      return suggestedResponse || `I've completed the ${functionName} function successfully.`;
    }
  }

  private async cancelJobDecision(decision: any): Promise<{ responseText: string }> {
    try {
      if (!decision.job_id) {
        throw new Error('Job ID is required for cancel_job action');
      }

      const cancelled = await this.jobsQueueManager.cancelJob(decision.job_id);
      
      return {
        responseText: cancelled 
          ? `Job ${decision.job_id} has been cancelled successfully.`
          : `Could not cancel job ${decision.job_id}. It may not exist or already be completed.`,
      };
    } catch (error) {
      return {
        responseText: `Error cancelling job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async getStatusDecision(decision: any): Promise<{ responseText: string }> {
    try {
      const stats = await this.jobsQueueManager.getQueueStats();
      const healthStatuses = this.getAllHealthStatuses();
      
      const statusReport = `
System Status:
- Jobs: ${stats.active} active, ${stats.waiting} waiting, ${stats.completed} completed
- Functions: ${this.functionsManager.getAllFunctions().length} loaded
- LLM Instances: ${this.llmManager.getAllInstances().length} available
- Modules: ${healthStatuses.filter(h => h.status === 'healthy').length}/${healthStatuses.length} healthy`;

      return {
        responseText: statusReport,
      };
    } catch (error) {
      return {
        responseText: `Error getting status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Public API Methods

  public getFunctionsManager(): FunctionsManager {
    return this.functionsManager;
  }

  public getMessagingManager(): MessagingManager {
    return this.messagingManager;
  }

  public getJobsQueueManager(): JobsQueueManager {
    return this.jobsQueueManager;
  }

  public getLLMManager(): LLMManager {
    return this.llmManager;
  }

  public getAllHealthStatuses(): IHealthStatus[] {
    return [
      this.getHealthStatus(),
      this.functionsManager.getHealthStatus(),
      this.messagingManager.getHealthStatus(),
      this.jobsQueueManager.getHealthStatus(),
      this.llmManager.getHealthStatus(),
    ];
  }

  public getHealthStatus(): IHealthStatus {
    try {
      const activeRequestsCount = this.activeRequests.size;
      const isInitialized = this.isInitialized;
      
      return {
        module: 'AgentMaster',
        status: isInitialized ? 'healthy' : 'unhealthy',
        details: `Initialized: ${isInitialized}, Active requests: ${activeRequestsCount}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        module: 'AgentMaster',
        status: 'unhealthy',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down AgentMaster...');
      
      // Wait for active requests to complete (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.activeRequests.size > 0 && Date.now() - startTime < shutdownTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Shutdown modules
      await this.jobsQueueManager.shutdown();
      await this.messagingManager.disconnect();
      
      this.isInitialized = false;
      logger.info('AgentMaster shutdown completed');
    } catch (error) {
      logger.error('Error during AgentMaster shutdown:', error);
    }
  }

  private createOrchestrationMaster(): string {
    const orchestrationConfig: ILLMConfig = {
      provider: this.getPreferredProvider(),
      apiKey: this.getApiKeyForProvider(this.getPreferredProvider()),
      model: this.getModelForProvider(this.getPreferredProvider()),
      temperature: 0.3, // Lower temperature for more consistent decision making
      maxTokens: 4000,
      systemPrompt: this.getOrchestrationSystemPrompt(),
    };

    return this.llmManager.createInstance(orchestrationConfig);
  }

  private getPreferredProvider(): LLMProvider {
    // Prefer Anthropic for orchestration, fallback to OpenAI, then Google
    if (config.llm.anthropic.apiKey) return LLMProvider.ANTHROPIC;
    if (config.llm.openai.apiKey) return LLMProvider.OPENAI;
    if (config.llm.google.apiKey) return LLMProvider.GOOGLE;
    throw new Error('No LLM API keys configured');
  }

  private getApiKeyForProvider(provider: LLMProvider): string {
    switch (provider) {
      case LLMProvider.ANTHROPIC:
        return config.llm.anthropic.apiKey;
      case LLMProvider.OPENAI:
        return config.llm.openai.apiKey;
      case LLMProvider.GOOGLE:
        return config.llm.google.apiKey;
      default:
        throw new Error(`No API key for provider: ${provider}`);
    }
  }

  private getModelForProvider(provider: LLMProvider): string {
    switch (provider) {
      case LLMProvider.ANTHROPIC:
        return 'claude-3-sonnet-20240229';
      case LLMProvider.OPENAI:
        return 'gpt-4';
      case LLMProvider.GOOGLE:
        return 'gemini-pro';
      default:
        throw new Error(`No model defined for provider: ${provider}`);
    }
  }

  private getOrchestrationSystemPrompt(): string {
    return `You are an AI orchestration system responsible for analyzing incoming messages and determining the appropriate function to call.

Your primary responsibilities:
1. Analyze incoming messages to understand user intent
2. Select the most appropriate function from available functions
3. Determine execution type (INSTANT, SCHEDULE, REPEAT)
4. Extract necessary parameters for function execution
5. Handle job management (cancel, reschedule, etc.)
6. Craft appropriate responses based on execution results

Available function types:
- HELPER: Utility functions for data processing
- RUNNER: Functions that can be scheduled or repeated
- WORKER: Functions that can use other LLM instances

Execution types:
- INSTANT: Execute immediately
- SCHEDULE: Execute at specified future time
- REPEAT: Execute repeatedly (only for RUNNER functions)

When responding, you must provide a JSON response with this structure:
{
  "action": "execute_function" | "cancel_job" | "get_status" | "direct_response",
  "function_name": "string (if action is execute_function)",
  "parameters": {object (if action is execute_function)},
  "execution_type": "instant" | "schedule" | "repeat" (if action is execute_function),
  "schedule_time": "ISO string (if execution_type is schedule)",
  "repeat_interval": number (if execution_type is repeat),
  "repeat_deadline": "ISO string (if execution_type is repeat)",
  "job_id": "string (if action is cancel_job)",
  "response_message": "string (direct response to user)"
}

Always analyze the message context and available functions before making decisions.`;
  }

  public setWebSocket(io: Server): void {
    this.io = io;
  }

  private emitEvent(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}