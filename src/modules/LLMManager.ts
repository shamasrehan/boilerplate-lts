import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  ILLMConfig,
  ILLMResponse,
  LLMProvider,
  IHealthStatus,
} from '../types';

interface ILLMInstance {
  id: string;
  config: ILLMConfig;
  client: any;
  createdAt: Date;
  lastUsed?: Date;
}

export class LLMManager {
  private instances: Map<string, ILLMInstance> = new Map();

  constructor() {
    // Create default instances if API keys are available
    this.initializeDefaultInstances();
  }

  private initializeDefaultInstances(): void {
    // OpenAI default instance
    if (config.llm.openai.apiKey) {
      this.createInstance({
        provider: LLMProvider.OPENAI,
        apiKey: config.llm.openai.apiKey,
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: 'You are a helpful AI assistant.',
      });
    }

    // Anthropic default instance
    if (config.llm.anthropic.apiKey) {
      this.createInstance({
        provider: LLMProvider.ANTHROPIC,
        apiKey: config.llm.anthropic.apiKey,
        model: 'claude-3-sonnet-20240229',
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: 'You are a helpful AI assistant.',
      });
    }

    // Google default instance
    if (config.llm.google.apiKey) {
      this.createInstance({
        provider: LLMProvider.GOOGLE,
        apiKey: config.llm.google.apiKey,
        model: 'gemini-pro',
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: 'You are a helpful AI assistant.',
      });
    }
  }

  public createInstance(config: ILLMConfig): string {
    try {
      const instanceId = uuidv4();
      let client: any;

      switch (config.provider) {
        case LLMProvider.OPENAI:
          client = new OpenAI({
            apiKey: config.apiKey,
          });
          break;

        case LLMProvider.ANTHROPIC:
          client = new Anthropic({
            apiKey: config.apiKey,
          });
          break;

        case LLMProvider.GOOGLE:
          client = new GoogleGenerativeAI(config.apiKey);
          break;

        default:
          throw new Error(`Unsupported LLM provider: ${config.provider}`);
      }

      const instance: ILLMInstance = {
        id: instanceId,
        config,
        client,
        createdAt: new Date(),
      };

      this.instances.set(instanceId, instance);
      logger.info(`Created LLM instance: ${instanceId}`, { provider: config.provider, model: config.model });
      
      return instanceId;
    } catch (error) {
      logger.error('Error creating LLM instance:', error);
      throw error;
    }
  }

  public deleteInstance(instanceId: string): boolean {
    try {
      const deleted = this.instances.delete(instanceId);
      if (deleted) {
        logger.info(`Deleted LLM instance: ${instanceId}`);
      }
      return deleted;
    } catch (error) {
      logger.error(`Error deleting LLM instance ${instanceId}:`, error);
      return false;
    }
  }

  public editInstance(instanceId: string, newConfig: Partial<ILLMConfig>): boolean {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        return false;
      }

      // Update config
      const updatedConfig = { ...instance.config, ...newConfig };
      
      // Recreate client if provider or apiKey changed
      if (newConfig.provider || newConfig.apiKey) {
        let client: any;
        
        switch (updatedConfig.provider) {
          case LLMProvider.OPENAI:
            client = new OpenAI({ apiKey: updatedConfig.apiKey });
            break;
          case LLMProvider.ANTHROPIC:
            client = new Anthropic({ apiKey: updatedConfig.apiKey });
            break;
          case LLMProvider.GOOGLE:
            client = new GoogleGenerativeAI(updatedConfig.apiKey);
            break;
          default:
            throw new Error(`Unsupported LLM provider: ${updatedConfig.provider}`);
        }
        
        instance.client = client;
      }

      instance.config = updatedConfig;
      this.instances.set(instanceId, instance);
      
      logger.info(`Updated LLM instance: ${instanceId}`);
      return true;
    } catch (error) {
      logger.error(`Error editing LLM instance ${instanceId}:`, error);
      return false;
    }
  }

  public getInstance(instanceId: string): ILLMInstance | undefined {
    return this.instances.get(instanceId);
  }

  public getAllInstances(): ILLMInstance[] {
    return Array.from(this.instances.values());
  }

  public getInstancesByProvider(provider: LLMProvider): ILLMInstance[] {
    return Array.from(this.instances.values()).filter(
      instance => instance.config.provider === provider
    );
  }

  public async generateResponse(
    instanceId: string,
    prompt: string,
    additionalContext?: string
  ): Promise<ILLMResponse> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`LLM instance not found: ${instanceId}`);
    }

    try {
      // Update last used timestamp
      instance.lastUsed = new Date();
      this.instances.set(instanceId, instance);

      const fullPrompt = additionalContext 
        ? `${instance.config.systemPrompt || ''}\n\nContext: ${additionalContext}\n\nUser: ${prompt}`
        : `${instance.config.systemPrompt || ''}\n\nUser: ${prompt}`;

      let response: ILLMResponse;

      switch (instance.config.provider) {
        case LLMProvider.OPENAI:
          response = await this.generateOpenAIResponse(instance, fullPrompt);
          break;
        case LLMProvider.ANTHROPIC:
          response = await this.generateAnthropicResponse(instance, fullPrompt);
          break;
        case LLMProvider.GOOGLE:
          response = await this.generateGoogleResponse(instance, fullPrompt);
          break;
        default:
          throw new Error(`Unsupported provider: ${instance.config.provider}`);
      }

      logger.info(`Generated response using instance: ${instanceId}`, {
        provider: instance.config.provider,
        inputLength: prompt.length,
        outputLength: response.content.length,
      });

      return response;
    } catch (error) {
      logger.error(`Error generating response with instance ${instanceId}:`, error);
      throw error;
    }
  }

  private async generateOpenAIResponse(instance: ILLMInstance, prompt: string): Promise<ILLMResponse> {
    const completion = await instance.client.chat.completions.create({
      model: instance.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: instance.config.temperature || 0.7,
      max_tokens: instance.config.maxTokens || 2000,
    });

    const choice = completion.choices[0];
    if (!choice || !choice.message) {
      throw new Error('No response from OpenAI');
    }

    return {
      content: choice.message.content || '',
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      },
      metadata: {
        model: instance.config.model,
        finishReason: choice.finish_reason,
      },
    };
  }

  private async generateAnthropicResponse(instance: ILLMInstance, prompt: string): Promise<ILLMResponse> {
    const message = await instance.client.messages.create({
      model: instance.config.model,
      max_tokens: instance.config.maxTokens || 2000,
      temperature: instance.config.temperature || 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      content: message.content[0]?.text || '',
      usage: {
        inputTokens: message.usage?.input_tokens || 0,
        outputTokens: message.usage?.output_tokens || 0,
        totalTokens: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0),
      },
      metadata: {
        model: instance.config.model,
        stopReason: message.stop_reason,
      },
    };
  }

  private async generateGoogleResponse(instance: ILLMInstance, prompt: string): Promise<ILLMResponse> {
    const model = instance.client.getGenerativeModel({ model: instance.config.model });
    
    const generationConfig = {
      temperature: instance.config.temperature || 0.7,
      maxOutputTokens: instance.config.maxTokens || 2000,
    };

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });

    const response = result.response;
    const text = response.text();

    return {
      content: text,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      metadata: {
        model: instance.config.model,
        finishReason: response.candidates?.[0]?.finishReason,
      },
    };
  }

  public async testInstance(instanceId: string): Promise<boolean> {
    try {
      const response = await this.generateResponse(instanceId, 'Hello, please respond with "Test successful"');
      return response.content.toLowerCase().includes('test successful');
    } catch (error) {
      logger.error(`Test failed for instance ${instanceId}:`, error);
      return false;
    }
  }

  public getInstanceStats(): Record<string, any> {
    const stats = {
      totalInstances: this.instances.size,
      byProvider: {} as Record<LLMProvider, number>,
      recentlyUsed: 0,
    };

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const instance of this.instances.values()) {
      const provider = instance.config.provider;
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
      
      if (instance.lastUsed && instance.lastUsed > oneHourAgo) {
        stats.recentlyUsed++;
      }
    }

    return stats;
  }

  public getHealthStatus(): IHealthStatus {
    try {
      const stats = this.getInstanceStats();
      const healthyInstances = Array.from(this.instances.values()).length;
      
      return {
        module: 'LLMManager',
        status: healthyInstances > 0 ? 'healthy' : 'unhealthy',
        details: `Total: ${stats.totalInstances}, Recently used: ${stats.recentlyUsed}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        module: 'LLMManager',
        status: 'unhealthy',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  public cleanup(): void {
    // Remove instances that haven't been used in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [instanceId, instance] of this.instances) {
      if (instance.lastUsed && instance.lastUsed < oneDayAgo) {
        this.instances.delete(instanceId);
        logger.info(`Cleaned up unused LLM instance: ${instanceId}`);
      }
    }
  }
}