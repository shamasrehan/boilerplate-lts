import amqp, { Channel, ConsumeMessage, Options, Connection as AmqpConnection } from 'amqplib';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  IIncomingMessage,
  IOutgoingMessage,
  IMessageAcknowledgment,
  IHealthStatus,
} from '../types/index.js';

// Helper to get RabbitMQ URL from env or config
function getRabbitMQUrl() {
  // Prefer env, fallback to config
  return process.env.RABBITMQ_URL || config.rabbitmq.url;
}

export class MessagingManager {
  private connection: any | null = null;  // Using any temporarily to bypass type issues
  private channel: amqp.Channel | null = null;
  private confirmChannel: amqp.ConfirmChannel | null = null;
  private consumeChannel: amqp.Channel | null = null;
  private messageHandlers: Map<string, (message: IIncomingMessage) => Promise<void>> = new Map();
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private incomingQueue: string;
  private outgoingQueue: string;
  private incomingExchange: string = 'agent_incoming_exchange';
  private outgoingExchange: string = 'agent_outgoing_exchange';
  private incomingRoutingKey: string = 'incoming_messages';
  private outgoingRoutingKey: string = 'outgoing_messages';
  
  // Message schemas for validation
  private incomingMessageSchema = Joi.object({
    id: Joi.string().required(),
    content: Joi.string().required(),
    metadata: Joi.object().optional(),
    timestamp: Joi.date().required(),
  });

  private outgoingMessageSchema = Joi.object({
    id: Joi.string().required(),
    content: Joi.string().required(),
    metadata: Joi.object().optional(),
    timestamp: Joi.date().required(),
  });

  constructor() {
    this.incomingQueue = config.rabbitmq.queues.incoming;
    this.outgoingQueue = config.rabbitmq.queues.outgoing;
    this.connectionPromise = this.connect();
    this.connectionPromise.catch(error => {
      logger.error('Failed to connect to RabbitMQ:', error);
      this.isConnected = false;
    });
  }

  private async connect(): Promise<void> {
    try {
      logger.info('Connecting to RabbitMQ...');
      
      this.connection = await amqp.connect(getRabbitMQUrl());
      logger.info('Successfully connected to RabbitMQ');
      
      this.channel = await this.connection.createConfirmChannel();
      this.consumeChannel = await this.connection.createChannel();
      logger.info('Channels created successfully');

      if (!this.channel) {
        throw new Error('Failed to create channel');
      }

      // Create exchanges
      await this.channel.assertExchange(this.incomingExchange, 'direct', { durable: true });
      await this.channel.assertExchange(this.outgoingExchange, 'direct', { durable: true });
      logger.info('Exchanges created');

      // Create and bind queues
      await this.channel.assertQueue(this.incomingQueue, { durable: true });
      await this.channel.assertQueue(this.outgoingQueue, { durable: true });
      
      await this.channel.bindQueue(this.incomingQueue, this.incomingExchange, this.incomingRoutingKey);
      await this.channel.bindQueue(this.outgoingQueue, this.outgoingExchange, this.outgoingRoutingKey);
      logger.info('Queues created and bound');

      this.connection.on('error', (error: Error) => {
        logger.error('RabbitMQ connection error:', error);
        this.isConnected = false;
        this.reconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        this.reconnect();
      });

      this.isConnected = true;
      logger.info('Connected to RabbitMQ successfully');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      this.isConnected = false;
      setTimeout(() => this.reconnect(), 5000);
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (!this.isConnected && !this.connectionPromise) {
      logger.info('Attempting to reconnect to RabbitMQ...');
      try {
        // Close existing channels and connection
        if (this.channel) {
          try {
            await this.channel.close();
          } catch (error) {
            logger.warn('Error closing channel:', error);
          }
        }
        if (this.consumeChannel) {
          try {
            await this.consumeChannel.close();
          } catch (error) {
            logger.warn('Error closing consume channel:', error);
          }
        }
        if (this.connection) {
          try {
            await this.connection.close();
          } catch (error) {
            logger.warn('Error closing connection:', error);
          }
        }

        // Reset state
        this.channel = null;
        this.consumeChannel = null;
        this.connection = null;
        this.connectionPromise = null;

        // Attempt to reconnect
        this.connectionPromise = this.connect();
        await this.connectionPromise;
      } catch (error) {
        logger.error('Reconnection failed:', error);
        this.connectionPromise = null;
        setTimeout(() => this.reconnect(), 5000);
      }
    }
  }

  public async waitForConnection(): Promise<void> {
    if (!this.isConnected) {
      logger.info('Waiting for RabbitMQ connection...');
      if (!this.connectionPromise) {
        this.connectionPromise = this.connect();
      }
      await this.connectionPromise;
      logger.info('RabbitMQ connection established');
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        try {
          if (this.channel.close) {
            await this.channel.close();
          }
        } catch (err) {
          const error = err as Error;
          if (error && error.message && error.message.includes('Channel closing')) {
            logger.warn('Channel was already closing or closed.');
          } else {
            throw error;
          }
        }
      }
      if (this.consumeChannel) {
        try {
          await this.consumeChannel.close();
        } catch (err) {
          logger.warn('Error closing consume channel:', err);
        }
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.isConnected = false;
      logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      logger.error('Error disconnecting from RabbitMQ:', error);
    }
  }

  public async startListening(): Promise<void> {
    try {
      logger.info('Starting to listen for messages...');
      
      await this.waitForConnection();
      
      if (!this.connection || !this.consumeChannel) {
        throw new Error('RabbitMQ connection not established');
      }

      await this.consumeChannel.prefetch(1);
      logger.info('Consume channel prefetch set');

      // Set up consumer for incoming messages
      await this.consumeChannel.consume(
        this.incomingQueue,
        async (msg) => {
          if (!msg) {
            logger.warn('Received null message');
            return;
          }

          try {
            const messageId = msg.properties.messageId || 'unknown';
            logger.info('Processing incoming message', { 
              messageId,
              queue: this.incomingQueue
            });

            const content = msg.content.toString('utf8');
            logger.info('Message content', { content });

            let message: IIncomingMessage;
            try {
              message = JSON.parse(content);
            } catch (parseError) {
              logger.error('Failed to parse message', { 
                error: parseError,
                content 
              });
              this.consumeChannel?.nack(msg, false, false);
              return;
            }

            // Validate message
            const validatedMessage = this.validateIncomingMessage(message);
            if (!validatedMessage) {
              logger.error('Invalid message format', { message });
              this.consumeChannel?.nack(msg, false, false);
              return;
            }

            // Skip if this is a response message
            if (validatedMessage.metadata?.isResponse) {
              logger.info('Skipping response message', { messageId: validatedMessage.id });
              this.consumeChannel?.ack(msg);
              return;
            }

            const handler = this.messageHandlers.get('orchestration');
            if (!handler) {
              logger.error('No message handler found');
              this.consumeChannel?.nack(msg, false, false);
              return;
            }

            await handler(validatedMessage);
            logger.info('Message processed successfully', { messageId });
            
            this.consumeChannel?.ack(msg);
            logger.info('Message acknowledged', { messageId });
          } catch (error) {
            logger.error('Error processing message:', error);
            this.consumeChannel?.nack(msg, false, true); // Requeue on error
          }
        },
        {
          noAck: false,
          exclusive: false
        }
      );

      logger.info('Message consumer set up successfully');
    } catch (error) {
      logger.error('Error starting message listener:', error);
      throw error;
    }
  }

  private validateIncomingMessage(data: any): IIncomingMessage | null {
    try {
      const { error, value } = this.incomingMessageSchema.validate(data);
      if (error) {
        logger.error('Invalid incoming message format:', error.details);
        return null;
      }
      // Ensure timestamp is a Date object
      value.timestamp = new Date(value.timestamp);
      return value as IIncomingMessage;
    } catch (error) {
      logger.error('Error validating incoming message:', error);
      return null;
    }
  }

  private validateOutgoingMessage(data: any): IOutgoingMessage | null {
    try {
      const { error, value } = this.outgoingMessageSchema.validate(data);
      if (error) {
        logger.error('Invalid outgoing message format:', error.details);
        return null;
      }
      // Ensure timestamp is a Date object
      value.timestamp = new Date(value.timestamp);
      return value as IOutgoingMessage;
    } catch (error) {
      logger.error('Error validating outgoing message:', error);
      return null;
    }
  }

  public async sendMessage(message: IOutgoingMessage): Promise<void> {
    try {
      logger.info('Preparing to send message', { 
        messageId: message.id,
        contentLength: message.content.length,
        metadata: message.metadata
      });
      
      await this.waitForConnection();
      
      if (!this.channel) {
        throw new Error('Channel not available');
      }

      const validatedMessage = this.validateOutgoingMessage(message);
      if (!validatedMessage) {
        throw new Error('Invalid message format');
      }

      const content = Buffer.from(JSON.stringify(validatedMessage), 'utf8');
      
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Message send timeout'));
        }, 5000);

        try {
          this.channel?.publish(
            this.outgoingExchange,
            this.outgoingRoutingKey,
            content,
            {
              messageId: message.id,
              persistent: true,
              contentType: 'application/json',
              contentEncoding: 'utf8',
              headers: message.metadata
            }
          );
          clearTimeout(timeout);
          logger.info('Message published successfully', { 
            messageId: message.id,
            exchange: this.outgoingExchange
          });
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          logger.error('Failed to publish message:', error);
          reject(error);
        }
      });
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  public registerMessageHandler(name: string, handler: (message: IIncomingMessage) => Promise<void>): void {
    this.messageHandlers.set(name, handler);
    logger.info(`Registered message handler: ${name}`);
  }

  public unregisterMessageHandler(name: string): boolean {
    const removed = this.messageHandlers.delete(name);
    if (removed) {
      logger.info(`Unregistered message handler: ${name}`);
    }
    return removed;
  }

  public createIncomingMessage(content: string, metadata?: Record<string, any>): IIncomingMessage {
    return {
      id: uuidv4(),
      content,
      metadata: metadata || {},
      timestamp: new Date(),
    };
  }

  public createOutgoingMessage(content: string, metadata?: Record<string, any>): IOutgoingMessage {
    return {
      id: uuidv4(),
      content,
      metadata: metadata || {},
      timestamp: new Date(),
    };
  }

  public getHealthStatus(): IHealthStatus {
    try {
      const handlerCount = this.messageHandlers.size;
      const connectionStatus = this.isConnected ? 'Connected' : 'Disconnected';
      
      return {
        module: 'MessagingManager',
        status: this.isConnected ? 'healthy' : 'unhealthy',
        details: `${connectionStatus}, Handlers: ${handlerCount}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        module: 'MessagingManager',
        status: 'unhealthy',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && this.channel !== null;
  }
}