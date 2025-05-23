# AI Agent Orchestrator

A comprehensive TypeScript backend template for building standardized AI agents with orchestration capabilities. This system provides a modular architecture for managing custom functions, job queues, messaging, and multiple LLM providers.

## 🚀 Features

- **Modular Architecture**: Five core modules working together seamlessly
- **Multiple LLM Support**: OpenAI, Anthropic, and Google AI integration
- **Function Management**: Three types of functions (Helper, Runner, Worker)
- **Job Scheduling**: Instant, scheduled, and repeated execution
- **Message Queue**: RabbitMQ integration for reliable messaging
- **Web UI**: Built-in testing interface for easy development
- **Health Monitoring**: Real-time system health checks
- **TypeScript**: Fully typed for better development experience

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## ⚡ Quick Start

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd ai-agent-orchestrator
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys and configurations
```

3. **Start required services**
```bash
# Start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Start Redis
docker run -d --name redis -p 6379:6379 redis:alpine
```

4. **Run the application**
```bash
npm run dev
```

5. **Open the testing interface**
```
http://localhost:3000/testing
```

## 🏗️ Architecture Overview

### Core Modules

#### 1. AgentMaster
- Central orchestration component
- Controls all other modules 
- Handles incoming messages and coordinates responses
- Contains OrchestrationMaster for LLM-based decision making

#### 2. FunctionsManager
- Manages custom functions with hot-reloading
- Supports three function types:
  - **Helper**: Utility functions (can't import other types)
  - **Runner**: Can be scheduled/repeated 
  - **Worker**: Can create LLM instances
- Provides function validation and execution

#### 3. MessagingManager
- RabbitMQ integration for message queuing
- Validates incoming/outgoing messages
- Handles acknowledgments and error handling
- Supports multiple message handlers

#### 4. JobsQueueManager
- Redis-based job queue with Bull.js
- Three execution types:
  - **INSTANT**: Execute immediately
  - **SCHEDULE**: Execute at future time
  - **REPEAT**: Execute repeatedly with deadline
- Job monitoring and management

#### 5. LLMManager
- Multi-provider LLM support (OpenAI, Anthropic, Google)
- Instance management with different configurations
- Usage tracking and health monitoring
- Automatic cleanup of unused instances

## 🔧 Installation

### Prerequisites

- Node.js 18+ 
- TypeScript 5+
- RabbitMQ
- Redis
- API keys for LLM providers (optional but recommended)

### Step-by-step Installation

1. **Install Node.js dependencies**
```bash
npm install
```

2. **Install and start RabbitMQ**
```bash
# Using Docker
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Or install locally on Ubuntu/Debian
sudo apt-get install rabbitmq-server
sudo systemctl start rabbitmq-server
```

3. **Install and start Redis**
```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Or install locally on Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server
```

4. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# RabbitMQ Configuration
RABBITMQ_URL=amqp://127.0.0.1:5672

# Redis Configuration  
REDIS_URL=redis://localhost:6379

# LLM API Keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |
| `RABBITMQ_URL` | amqp://127.0.0.1:5672 | RabbitMQ connection URL |
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `GOOGLE_AI_API_KEY` | - | Google AI API key |
| `FUNCTION_TIMEOUT_MS` | 30000 | Default function timeout |
| `MAX_CONCURRENT_JOBS` | 10 | Maximum concurrent jobs |

### Module Configuration

Each module can be configured through the central config system:

```typescript
import { config } from './src/config';

// Access configuration
const serverPort = config.server.port;
const rabbitMQUrl = config.rabbitmq.url;
const llmConfig = config.llm.openai;
```

## 📖 Usage

### Creating Custom Functions

#### Helper Function Example
```typescript
// src/functions/helper/textProcessor.ts
import { ICustomFunction, FunctionType } from '../../types';

const textProcessor: ICustomFunction = {
  definition: {
    name: 'textProcessor',
    description: 'Process text with various operations',
    type: FunctionType.HELPER,
    parameters: [
      {
        name: 'text',
        type: 'string', 
        description: 'Text to process',
        required: true
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Operation: uppercase, lowercase, reverse',
        required: true
      }
    ]
  },
  handler: async (params, context) => {
    const { text, operation } = params;
    
    switch(operation) {
      case 'uppercase':
        return { result: text.toUpperCase() };
      case 'lowercase': 
        return { result: text.toLowerCase() };
      case 'reverse':
        return { result: text.split('').reverse().join('') };
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
};

export default textProcessor;
```

#### Worker Function Example
```typescript
// src/functions/worker/dataAnalyzer.ts
import { ICustomFunction, FunctionType } from '../../types';
import { LLMManager } from '../../modules/LLMManager';

const dataAnalyzer: ICustomFunction = {
  definition: {
    name: 'dataAnalyzer',
    description: 'Analyze data using AI',
    type: FunctionType.WORKER,
    parameters: [
      {
        name: 'data',
        type: 'string',
        description: 'Data to analyze',
        required: true
      }
    ]
  },
  handler: async (params, context) => {
    const llmManager = new LLMManager();
    
    const instanceId = llmManager.createInstance({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4',
      temperature: 0.3
    });
    
    const analysis = await llmManager.generateResponse(
      instanceId,
      `Analyze this data: ${params.data}`
    );
    
    llmManager.deleteInstance(instanceId);
    
    return { analysis: analysis.content };
  }
};

export default dataAnalyzer;
```

### Sending Messages

#### Using the Web UI
1. Navigate to `http://localhost:3000/testing`
2. Select a message template or write custom JSON
3. Click "Send Message" 
4. Monitor logs and response

#### Using the API
```typescript
// Send a test message
const response = await fetch('/api/test-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: "What's the weather like in New York?",
    metadata: {
      userId: "user123",
      sessionId: "session456"
    }
  })
});
```

#### Direct RabbitMQ Integration
```typescript
import { MessagingManager } from './src/modules/MessagingManager';

const messagingManager = new MessagingManager();

// Create and send message
const message = messagingManager.createIncomingMessage(
  "Analyze sentiment of this text: I love this product!",
  { userId: "user123" }
);

await messagingManager.sendMessage(message);
```

### Job Management

#### Schedule a Job
```typescript
import { JobsQueueManager } from './src/modules/JobsQueueManager';

const jobsManager = new JobsQueueManager(functionsManager);

// Schedule a function to run in 1 hour
const jobId = await jobsManager.addJob({
  functionName: 'weatherFunction',
  parameters: { city: 'London' },
  executionType: 'schedule',
  scheduleTime: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
});
```

#### Repeat a Job
```typescript
// Run a function every 5 minutes for 2 hours
const jobId = await jobsManager.addJob({
  functionName: 'systemHealthCheck',
  parameters: {},
  executionType: 'repeat',
  repeatInterval: 5 * 60 * 1000, // 5 minutes
  repeatDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
});
```

### System Workflow Example

1. **Message Received**: MessagingManager receives incoming message
2. **Orchestration**: AgentMaster processes message through OrchestrationMaster
3. **LLM Analysis**: LLM analyzes message and determines required function
4. **Job Creation**: JobsQueueManager creates and executes job
5. **Function Execution**: FunctionsManager executes the specified function
6. **Response Generation**: LLM crafts response based on function result
7. **Message Sent**: MessagingManager sends response back

## 🔌 API Reference

### Health Endpoints

#### GET /health
Get overall system health status
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "modules": [...]
}
```

#### GET /health/:module
Get specific module health
```json
{
  "module": "FunctionsManager",
  "status": "healthy", 
  "details": "Total: 5, Helper: 2, Runner: 1, Worker: 2",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Function Endpoints

#### GET /api/functions
List all available functions
```json
{
  "functions": [...],
  "count": 5
}
```

#### GET /api/functions/:name
Get specific function definition
```json
{
  "function": {
    "name": "weatherFunction",
    "description": "Get weather information",
    "type": "worker",
    "parameters": [...]
  }
}
```

### Job Endpoints

#### GET /api/jobs
List all jobs with statistics
```json
{
  "jobs": [...],
  "stats": {
    "waiting": 2,
    "active": 1,
    "completed": 10,
    "failed": 0,
    "delayed": 1
  }
}
```

#### GET /api/jobs/:id
Get specific job details
```json
{
  "job": {
    "id": "job-123",
    "functionName": "weatherFunction",
    "status": "completed",
    "result": {...}
  }
}
```

#### DELETE /api/jobs/:id
Cancel a job
```json
{
  "success": true,
  "message": "Job cancelled"
}
```

### Testing Endpoints

#### POST /api/test-message
Send test message for processing
```json
{
  "content": "What's the weather in Paris?",
  "metadata": {
    "userId": "test-user"
  }
}
```

#### GET /api/message-templates
Get available message templates
```json
{
  "templates": [
    {
      "name": "Weather Query",
      "content": "What's the weather like in New York?",
      "description": "Simple weather inquiry"
    }
  ]
}
```

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Using the Web Interface

1. **Open Testing UI**: Navigate to `http://localhost:3000/testing`
2. **Monitor Status**: Check module health lights in header
3. **Select Templates**: Use dropdown to load pre-built message examples
4. **Send Messages**: Enter JSON messages and send to system
5. **View Functions**: Browse available function definitions
6. **Monitor Logs**: Watch real-time system logs in console

### Manual Testing Examples

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test function listing
curl http://localhost:3000/api/functions

# Send test message
curl -X POST http://localhost:3000/api/test-message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is 2+2?", "metadata": {"userId": "test"}}'
```

## 🔍 Monitoring & Debugging

### Log Levels
- **info**: General operational messages
- **warn**: Warning conditions
- **error**: Error conditions requiring attention

### Health Monitoring
Each module provides health status:
- **healthy**: Operating normally
- **unhealthy**: Issues detected
- **unknown**: Status cannot be determined

### Performance Monitoring
- Job queue statistics
- LLM usage tracking
- Function execution times
- Memory and resource usage

## 🚨 Troubleshooting

### Common Issues

#### RabbitMQ Connection Failed
```bash
# Check if RabbitMQ is running
docker ps | grep rabbitmq

# Restart RabbitMQ
docker restart rabbitmq
```

#### Redis Connection Failed  
```bash
# Check if Redis is running
docker ps | grep redis

# Restart Redis
docker restart redis
```

#### Function Not Loading
1. Check function file location and naming
2. Verify function exports default object
3. Check function definition structure
4. Review logs for loading errors

#### LLM API Errors
1. Verify API keys in environment variables
2. Check API rate limits and quotas
3. Ensure network connectivity
4. Review LLM provider status

#### Job Execution Timeout
1. Increase function timeout in definition
2. Check function logic for infinite loops
3. Monitor system resources
4. Review job queue configuration

## 📁 Project Structure

```
ai-agent-orchestrator/
├── src/
│   ├── config/           # Configuration management
│   ├── modules/          # Core system modules
│   │   ├── AgentMaster.ts
│   │   ├── FunctionsManager.ts
│   │   ├── MessagingManager.ts
│   │   ├── JobsQueueManager.ts
│   │   └── LLMManager.ts
│   ├── functions/        # Custom functions
│   │   ├── helper/       # Helper functions
│   │   ├── runner/       # Runner functions  
│   │   └── worker/       # Worker functions
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── index.ts          # Application entry point
├── public/
│   └── testing/          # Web testing interface
├── logs/                 # Application logs
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new features
- Update documentation
- Use conventional commit messages
- Ensure all health checks pass

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with TypeScript and Node.js
- Uses Bull.js for job queue management
- Integrates with major LLM providers
- RabbitMQ for reliable messaging
- Redis for caching and job storage

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation
- Test with the built-in UI interface

---

**Happy Coding! 🚀**