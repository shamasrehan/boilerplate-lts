# Setup Guide

This guide will walk you through setting up the AI Agent Orchestrator from scratch.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm or yarn** - Comes with Node.js
- **Docker** (recommended) - [Download here](https://www.docker.com/)
- **Git** - [Download here](https://git-scm.com/)

## Step 1: Clone and Install

### 1.1 Clone the Repository
```bash
git clone <repository-url>
cd ai-agent-orchestrator
```

### 1.2 Install Dependencies
```bash
npm install
```

### 1.3 Verify Installation
```bash
npm run build
```

## Step 2: Set Up External Services

### 2.1 RabbitMQ Setup

#### Option A: Using Docker (Recommended)
```bash
# Start RabbitMQ with management interface
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=admin \
  rabbitmq:3-management

# Verify RabbitMQ is running
docker ps | grep rabbitmq
```

#### Option B: Local Installation (Ubuntu/Debian)
```bash
# Install RabbitMQ
sudo apt-get update
sudo apt-get install rabbitmq-server

# Start RabbitMQ
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server

# Enable management plugin
sudo rabbitmq-plugins enable rabbitmq_management
```

#### Verify RabbitMQ Installation
- Open http://localhost:15672 in your browser
- Login with admin/admin (Docker) or guest/guest (local)
- You should see the RabbitMQ management interface

### 2.2 Redis Setup

#### Option A: Using Docker (Recommended)
```bash
# Start Redis
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:alpine

# Verify Redis is running
docker ps | grep redis
```

#### Option B: Local Installation (Ubuntu/Debian)
```bash
# Install Redis
sudo apt-get update
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Verify Redis Installation
```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

### 2.3 Service Health Check
```bash
# Check all Docker containers
docker ps

# Should show both rabbitmq and redis containers running
```

## Step 3: Environment Configuration

### 3.1 Create Environment File
```bash
cp .env.example .env
```

### 3.2 Configure Environment Variables

Edit `.env` file with your settings:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# RabbitMQ Configuration
RABBITMQ_URL=amqp://admin:admin@127.0.0.1:5672
RABBITMQ_QUEUE_INCOMING=agent_incoming
RABBITMQ_QUEUE_OUTGOING=agent_outgoing

# Redis Configuration
REDIS_URL=redis://localhost:6379

# LLM API Keys (Optional but recommended)
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
GOOGLE_AI_API_KEY=your_google_ai_key_here

# Function Execution Configuration
FUNCTION_TIMEOUT_MS=30000
MAX_CONCURRENT_JOBS=10

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security (Change these in production)
JWT_SECRET=your-super-secret-jwt-key-here
ENCRYPTION_KEY=your-32-character-encryption-key
```

### 3.3 API Keys Setup (Optional)

#### OpenAI API Key
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Add to `.env` as `OPENAI_API_KEY`

#### Anthropic API Key  
1. Visit https://console.anthropic.com/
2. Get your API key
3. Add to `.env` as `ANTHROPIC_API_KEY`

#### Google AI API Key
1. Visit https://makersuite.google.com/app/apikey
2. Create an API key
3. Add to `.env` as `GOOGLE_AI_API_KEY`

**Note**: The system works without API keys, but LLM features will be limited.

## Step 4: Directory Structure Setup

### 4.1 Create Required Directories
```bash
# Create logs directory
mkdir -p logs

# Create function directories (if not exists)
mkdir -p src/functions/helper
mkdir -p src/functions/runner  
mkdir -p src/functions/worker

# Create public directory for UI
mkdir -p public/testing
```

### 4.2 Verify Directory Structure
```bash
tree -L 3
```

Should show:
```
.
├── src/
│   ├── functions/
│   │   ├── helper/
│   │   ├── runner/
│   │   └── worker/
│   └── ...
├── public/
│   └── testing/
├── logs/
└── ...
```

## Step 5: Build and Test

### 5.1 Build the Application
```bash
npm run build
```

### 5.2 Run Development Mode
```bash
npm run dev
```

### 5.3 Verify Services
Open multiple terminal tabs to monitor:

#### Terminal 1: Application Logs
```bash
npm run dev
```

#### Terminal 2: Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "modules": [...]
}
```

#### Terminal 3: RabbitMQ Monitoring
- Open http://localhost:15672
- Check connections and queues

#### Terminal 4: Redis Monitoring
```bash
redis-cli monitor
```

### 5.4 Test the Web Interface
1. Open http://localhost:3000/testing
2. Check status lights (should be green)
3. Try sending a test message
4. Monitor console logs

## Step 6: Validation Tests

### 6.1 Function Loading Test
```bash
curl http://localhost:3000/api/functions
```

Should return available functions.

### 6.2 Message Processing Test
```bash
curl -X POST http://localhost:3000/api/test-message \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, system!", "metadata": {"userId": "test"}}'
```

### 6.3 Job Queue Test
```bash
curl http://localhost:3000/api/jobs
```

Should return job statistics.

### 6.4 LLM Integration Test (if API keys configured)
```bash
curl -X POST http://localhost:3000/api/test-message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is 2+2?", "metadata": {"userId": "test"}}'
```

## Step 7: Production Configuration

### 7.1 Environment Variables for Production
```env
NODE_ENV=production
LOG_LEVEL=warn
PORT=3000

# Use secure passwords and keys
RABBITMQ_URL=amqp://secure_user:secure_pass@127.0.0.1:5672
JWT_SECRET=very-long-random-secret-key
ENCRYPTION_KEY=32-character-random-encryption-key
```

### 7.2 Process Management
```bash
# Install PM2 for process management
npm install -g pm2

# Start application with PM2
pm2 start dist/index.js --name "ai-agent"

# Save PM2 configuration
pm2 save
pm2 startup
```

### 7.3 Monitoring Setup
```bash
# PM2 monitoring
pm2 monit

# Application logs
pm2 logs ai-agent
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: RabbitMQ Connection Failed
```
Error: Connection failed to RabbitMQ
```

**Solution:**
```bash
# Check RabbitMQ status
docker logs rabbitmq

# Restart RabbitMQ
docker restart rabbitmq

# Verify connection URL in .env
RABBITMQ_URL=amqp://admin:admin@127.0.0.1:5672
```

#### Issue: Redis Connection Failed
```
Error: Redis connection refused
```

**Solution:**
```bash
# Check Redis status
docker logs redis

# Restart Redis
docker restart redis

# Test Redis connection
redis-cli ping
```

#### Issue: Functions Not Loading
```
Loaded 0 functions total
```

**Solution:**
```bash
# Check function directory exists
ls -la src/functions/

# Verify function file format
cat src/functions/helper/stringUtils.ts

# Check TypeScript compilation
npm run build
```

#### Issue: LLM API Errors
```
Error: LLM instance creation failed
```

**Solution:**
```bash
# Check API keys in .env
grep API_KEY .env

# Test API key validity (OpenAI example)
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### Issue: Port Already in Use
```
Error: Port 3000 is already in use
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill the process or change port in .env
PORT=3001
```

### Health Check Commands

```bash
# System health
curl http://localhost:3000/health

# Individual module health
curl http://localhost:3000/health/AgentMaster
curl http://localhost:3000/health/FunctionsManager
curl http://localhost:3000/health/MessagingManager
curl http://localhost:3000/health/JobsQueueManager
curl http://localhost:3000/health/LLMManager
```

### Log Analysis

```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# PM2 logs (if using PM2)
pm2 logs ai-agent
```

## Next Steps

After successful setup:

1. **Explore the Web Interface**: Visit http://localhost:3000/testing
2. **Create Custom Functions**: Add your own functions in `src/functions/`
3. **Review Documentation**: Read through API documentation
4. **Test Message Processing**: Send various message types
5. **Monitor System Health**: Use health endpoints and logs
6. **Scale for Production**: Configure load balancing and clustering

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Review application logs
3. Verify all services are running
4. Test individual components
5. Create an issue on GitHub with error details

---

**Setup Complete! 🎉**

Your AI Agent Orchestrator is now ready for development and testing.