import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672',
    queues: {
      incoming: process.env.RABBITMQ_QUEUE_INCOMING || 'agent_incoming',
      outgoing: process.env.RABBITMQ_QUEUE_OUTGOING || 'agent_outgoing',
    },
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  llm: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
    google: {
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
    },
  },
  functions: {
    timeoutMs: parseInt(process.env.FUNCTION_TIMEOUT_MS || '30000'),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '10'),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
    encryptionKey: process.env.ENCRYPTION_KEY || 'default-encryption-key',
  },
};