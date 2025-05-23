import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { AgentMaster } from './modules/AgentMaster';
import { IHealthStatus } from './types';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIAgentServer {
  private app: express.Application;
  private agentMaster: AgentMaster;
  private server: any;
  private io: Server | null = null;

  constructor() {
    this.app = express();
    this.agentMaster = new AgentMaster();
    this.setupMiddleware();
    this.setupWebSocket();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: config.server.nodeEnv === 'production' ? false : true,
      credentials: true,
    }));

    // Add security headers
    this.app.use((req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "connect-src 'self' ws: wss:;"
      );
      next();
    });

    // Serve static files
    this.app.use(express.static('public', {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
      }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files for testing UI
    this.app.use('/testing', express.static(path.join(__dirname, '../public/testing')));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });
      next();
    });
  }

  private setupWebSocket(): void {
    const httpServer = createServer(this.app);
    this.io = new Server(httpServer, {
      cors: {
        origin: config.server.nodeEnv === 'production' ? false : true,
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      logger.info('Client connected to WebSocket');
      
      socket.on('disconnect', () => {
        logger.info('Client disconnected from WebSocket');
      });
    });

    // Make io available to AgentMaster
    this.agentMaster.setWebSocket(this.io);
    this.server = httpServer;
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const healthStatuses = this.agentMaster.getAllHealthStatuses();
        const overallHealth = healthStatuses.every(status => status.status === 'healthy');
        
        res.status(overallHealth ? 200 : 503).json({
          status: overallHealth ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          modules: healthStatuses,
        });
      } catch (error) {
        logger.error('Health check error:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Individual module health checks
    this.app.get('/health/:module', async (req, res) => {
      const { module } = req.params;
      
      try {
        const healthStatuses = this.agentMaster.getAllHealthStatuses();
        const moduleHealth = healthStatuses.find(status => 
          status.module.toLowerCase() === module.toLowerCase()
        );

        if (!moduleHealth) {
          return res.status(404).json({
            error: `Module ${module} not found`,
            availableModules: healthStatuses.map(s => s.module),
          });
        }

        res.status(moduleHealth.status === 'healthy' ? 200 : 503).json(moduleHealth);
      } catch (error) {
        logger.error(`Health check error for module ${module}:`, error);
        res.status(503).json({
          module,
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Functions management endpoints
    this.app.get('/api/functions', (req, res) => {
      try {
        const functions = this.agentMaster.getFunctionsManager().getAllFunctions();
        res.json({
          functions: functions.map(f => f.definition),
          count: functions.length,
        });
      } catch (error) {
        logger.error('Error fetching functions:', error);
        res.status(500).json({ error: 'Failed to fetch functions' });
      }
    });

    this.app.get('/api/functions/:name', (req, res) => {
      try {
        const { name } = req.params;
        const func = this.agentMaster.getFunctionsManager().getFunction(name);
        
        if (!func) {
          return res.status(404).json({ error: `Function ${name} not found` });
        }

        res.json({ function: func.definition });
      } catch (error) {
        logger.error('Error fetching function:', error);
        res.status(500).json({ error: 'Failed to fetch function' });
      }
    });

    // Jobs management endpoints
    this.app.get('/api/jobs', async (req, res) => {
      try {
        const jobs = this.agentMaster.getJobsQueueManager().getAllJobs();
        const stats = await this.agentMaster.getJobsQueueManager().getQueueStats();
        
        res.json({
          jobs: jobs.map(job => ({
            id: job.id,
            functionName: job.data.functionName,
            status: job.status,
            executionType: job.data.executionType,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          })),
          stats,
        });
      } catch (error) {
        logger.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
      }
    });

    this.app.get('/api/jobs/:id', (req, res) => {
      try {
        const { id } = req.params;
        const job = this.agentMaster.getJobsQueueManager().getJob(id);
        
        if (!job) {
          return res.status(404).json({ error: `Job ${id} not found` });
        }

        res.json({ job });
      } catch (error) {
        logger.error('Error fetching job:', error);
        res.status(500).json({ error: 'Failed to fetch job' });
      }
    });

    this.app.delete('/api/jobs/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const cancelled = await this.agentMaster.getJobsQueueManager().cancelJob(id);
        
        res.json({ 
          success: cancelled, 
          message: cancelled ? 'Job cancelled' : 'Job not found or already completed' 
        });
      } catch (error) {
        logger.error('Error cancelling job:', error);
        res.status(500).json({ error: 'Failed to cancel job' });
      }
    });

    // New BullMQ-specific endpoints
    this.app.post('/api/jobs/:id/retry', async (req, res) => {
      try {
        const { id } = req.params;
        const retried = await this.agentMaster.getJobsQueueManager().retryJob(id);
        
        res.json({ 
          success: retried, 
          message: retried ? 'Job retry initiated' : 'Job not found or cannot be retried' 
        });
      } catch (error) {
        logger.error('Error retrying job:', error);
        res.status(500).json({ error: 'Failed to retry job' });
      }
    });

    this.app.get('/api/jobs/:id/logs', async (req, res) => {
      try {
        const { id } = req.params;
        const logs = await this.agentMaster.getJobsQueueManager().getJobLogs(id);
        
        res.json({ logs });
      } catch (error) {
        logger.error('Error getting job logs:', error);
        res.status(500).json({ error: 'Failed to get job logs' });
      }
    });

    this.app.get('/api/jobs/queue/health', async (req, res) => {
      try {
        const health = await this.agentMaster.getJobsQueueManager().getQueueHealth();
        res.json(health);
      } catch (error) {
        logger.error('Error getting queue health:', error);
        res.status(500).json({ error: 'Failed to get queue health' });
      }
    });

    this.app.post('/api/jobs/queue/pause', async (req, res) => {
      try {
        await this.agentMaster.getJobsQueueManager().pauseQueue();
        res.json({ success: true, message: 'Queue paused' });
      } catch (error) {
        logger.error('Error pausing queue:', error);
        res.status(500).json({ error: 'Failed to pause queue' });
      }
    });

    this.app.post('/api/jobs/queue/resume', async (req, res) => {
      try {
        await this.agentMaster.getJobsQueueManager().resumeQueue();
        res.json({ success: true, message: 'Queue resumed' });
      } catch (error) {
        logger.error('Error resuming queue:', error);
        res.status(500).json({ error: 'Failed to resume queue' });
      }
    });

    this.app.post('/api/jobs/queue/clean', async (req, res) => {
      try {
        await this.agentMaster.getJobsQueueManager().cleanJobs();
        res.json({ success: true, message: 'Old jobs cleaned' });
      } catch (error) {
        logger.error('Error cleaning jobs:', error);
        res.status(500).json({ error: 'Failed to clean jobs' });
      }
    });

    // LLM instances management
    this.app.get('/api/llm/instances', (req, res) => {
      try {
        const instances = this.agentMaster.getLLMManager().getAllInstances();
        const stats = this.agentMaster.getLLMManager().getInstanceStats();
        
        res.json({
          instances: instances.map(instance => ({
            id: instance.id,
            provider: instance.config.provider,
            model: instance.config.model,
            createdAt: instance.createdAt,
            lastUsed: instance.lastUsed,
          })),
          stats,
        });
      } catch (error) {
        logger.error('Error fetching LLM instances:', error);
        res.status(500).json({ error: 'Failed to fetch LLM instances' });
      }
    });

    // Test message endpoint for UI
    this.app.post('/api/test-message', async (req, res) => {
      try {
        const { content, metadata } = req.body;
        
        if (!content || typeof content !== 'string') {
          return res.status(400).json({ error: 'Content is required and must be a string' });
        }

        // Create and send test message through MessagingManager
        const messagingManager = this.agentMaster.getMessagingManager();
        const testMessage = messagingManager.createIncomingMessage(
          content,
          { ...metadata, testMode: true, timestamp: new Date().toISOString() }
        );

        // Actually send the message to the incoming queue
        await messagingManager.sendMessage(testMessage);

        logger.info('Test message sent to RabbitMQ', { 
          messageId: testMessage.id, 
          content: content.substring(0, 100) 
        });

        res.json({
          success: true,
          message: 'Test message sent to processing pipeline',
          messageId: testMessage.id,
          timestamp: testMessage.timestamp,
        });

      } catch (error) {
        logger.error('Error handling test message:', error);
        res.status(500).json({ error: 'Failed to process test message' });
      }
    });

    // Message templates for UI
    this.app.get('/api/message-templates', (req, res) => {
      const templates = [
        {
          name: 'Weather Query',
          content: 'What\'s the weather like in New York?',
          description: 'Simple weather inquiry'
        },
        {
          name: 'Sentiment Analysis',
          content: 'I am absolutely thrilled about this amazing new project. It\'s going to be fantastic and I can\'t wait to see the results!',
          description: 'Text for sentiment analysis'
        },
        {
          name: 'Math Calculation',
          content: 'Calculate the average of these numbers: 10, 20, 30, 45, 55',
          description: 'Mathematical operation request'
        },
        {
          name: 'String Processing',
          content: 'Please convert this text to uppercase: hello world',
          description: 'String manipulation task'
        },
        {
          name: 'Timer Request',
          content: 'Set a timer for 5 seconds with message "Test completed"',
          description: 'Timer function execution'
        },
        {
          name: 'System Status',
          content: 'What is the current system status?',
          description: 'System health and status inquiry'
        },
        {
          name: 'Function List',
          content: 'What functions are available?',
          description: 'List available functions'
        },
        {
          name: 'Schedule Task',
          content: 'Schedule a weather check for London in 30 seconds',
          description: 'Scheduled task execution'
        },
      ];

      res.json({ templates });
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.redirect('/testing');
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /api/functions',
          'GET /api/jobs',
          'POST /api/jobs/:id/retry',
          'GET /api/jobs/:id/logs',
          'GET /api/jobs/queue/health',
          'POST /api/jobs/queue/pause',
          'POST /api/jobs/queue/resume',
          'GET /api/llm/instances',
          'POST /api/test-message',
          'GET /api/message-templates',
          'GET /testing (UI)',
        ],
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: config.server.nodeEnv === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('SIGTERM');
    });

    // Handle process termination
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    try {
      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }

      // Shutdown AgentMaster and all modules
      await this.agentMaster.shutdown();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      this.server.listen(config.server.port, () => {
        logger.info(`🚀 AI Agent Server started on port ${config.server.port}`);
        logger.info(`🧪 Testing UI available at: http://localhost:${config.server.port}/testing`);
        logger.info(`💚 Health check: http://localhost:${config.server.port}/health`);
        logger.info(`📊 Environment: ${config.server.nodeEnv}`);
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.server.port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        process.exit(1);
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new AIAgentServer();
server.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});