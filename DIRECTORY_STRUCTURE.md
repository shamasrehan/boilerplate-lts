# Directory Structure

This document provides a comprehensive overview of the AI Agent Orchestrator project structure.

## Complete Directory Tree

```
ai-agent-orchestrator/
├── 📁 src/                           # Source code directory
│   ├── 📁 config/                    # Configuration management
│   │   └── 📄 index.ts               # Central configuration file
│   │
│   ├── 📁 modules/                   # Core system modules
│   │   ├── 📄 AgentMaster.ts         # Central orchestration component
│   │   ├── 📄 FunctionsManager.ts    # Custom functions management
│   │   ├── 📄 MessagingManager.ts    # RabbitMQ messaging handler
│   │   ├── 📄 JobsQueueManager.ts    # Job scheduling and execution
│   │   └── 📄 LLMManager.ts          # LLM provider management
│   │
│   ├── 📁 functions/                 # Custom function definitions
│   │   ├── 📁 helper/                # Helper functions (utilities)
│   │   │   ├── 📄 stringUtils.ts     # String manipulation functions
│   │   │   ├── 📄 mathUtils.ts       # Mathematical utility functions
│   │   │   └── 📄 [custom].ts        # Additional helper functions
│   │   │
│   │   ├── 📁 runner/                # Runner functions (schedulable)
│   │   │   ├── 📄 timerFunction.ts   # Timer and delay functions
│   │   │   └── 📄 [custom].ts        # Additional runner functions
│   │   │
│   │   └── 📁 worker/                # Worker functions (LLM-enabled)
│   │       ├── 📄 weatherFunction.ts # Weather API integration
│   │       ├── 📄 sentimentAnalysis.ts # AI sentiment analysis
│   │       └── 📄 [custom].ts        # Additional worker functions
│   │
│   ├── 📁 types/                     # TypeScript type definitions
│   │   └── 📄 index.ts               # Central type definitions
│   │
│   ├── 📁 utils/                     # Utility functions and helpers
│   │   ├── 📄 logger.ts              # Winston logging configuration
│   │   └── 📄 [helpers].ts           # Additional utility functions
│   │
│   └── 📄 index.ts                   # Application entry point
│
├── 📁 public/                        # Static web assets
│   └── 📁 testing/                   # Web testing interface
│       ├── 📄 index.html             # Testing UI main page
│       ├── 📄 style.css              # UI styling (optional)
│       └── 📄 script.js              # UI JavaScript (optional)
│
├── 📁 dist/                          # Compiled TypeScript output
│   ├── 📁 config/
│   ├── 📁 modules/
│   ├── 📁 functions/
│   ├── 📁 types/
│   ├── 📁 utils/
│   └── 📄 index.js
│
├── 📁 logs/                          # Application log files
│   ├── 📄 app.log                    # General application logs
│   ├── 📄 error.log                  # Error-specific logs
│   └── 📄 access.log                 # HTTP access logs (optional)
│
├── 📁 node_modules/                  # NPM dependencies
│
├── 📁 docs/                          # Additional documentation
│   ├── 📄 API.md                     # API documentation
│   ├── 📄 FUNCTIONS.md               # Function development guide
│   └── 📄 DEPLOYMENT.md              # Deployment instructions
│
├── 📁 tests/                         # Test files (optional)
│   ├── 📁 unit/
│   ├── 📁 integration/
│   └── 📄 setup.ts
│
├── 📄 package.json                   # NPM package configuration
├── 📄 package-lock.json              # NPM lock file
├── 📄 tsconfig.json                  # TypeScript configuration
├── 📄 .env                           # Environment variables (local)
├── 📄 .env.example                   # Environment template
├── 📄 .gitignore                     # Git ignore rules
├── 📄 README.md                      # Main documentation
├── 📄 SETUP.md                       # Setup instructions
├── 📄 DIRECTORY_STRUCTURE.md         # This file
└── 📄 LICENSE                        # Software license
```

## Directory Descriptions

### 📁 `/src` - Source Code
Main application source code written in TypeScript.

**Key Files:**
- `index.ts` - Application entry point, server setup, and middleware configuration

### 📁 `/src/config` - Configuration Management
Centralized configuration system for all modules.

**Key Files:**
- `index.ts` - Main configuration file that loads environment variables and provides typed configuration objects

**Purpose:**
- Environment variable management
- Default value handling
- Configuration validation
- Centralized settings access

### 📁 `/src/modules` - Core System Modules
The five main modules that form the backbone of the system.

#### AgentMaster.ts
- Central orchestration component
- Handles message routing and processing
- Contains OrchestrationMaster LLM logic
- Coordinates all other modules

#### FunctionsManager.ts
- Loads and manages custom functions
- Validates function definitions
- Executes functions with timeout handling
- Provides function hot-reloading

#### MessagingManager.ts
- RabbitMQ integration and message handling
- Message validation and acknowledgment
- Queue management and connection handling
- Event-driven message processing

#### JobsQueueManager.ts
- Job scheduling and execution with Bull.js
- Supports instant, scheduled, and repeated jobs
- Job status tracking and management
- Redis-based persistence

#### LLMManager.ts
- Multi-provider LLM integration
- Instance management and configuration
- Usage tracking and health monitoring
- Automatic cleanup and optimization

### 📁 `/src/functions` - Custom Functions
User-defined functions organized by type.

#### 📁 `/helper` - Helper Functions
- Pure utility functions
- Cannot import runner/worker functions
- Used for data processing and transformation
- Examples: string manipulation, math operations

#### 📁 `/runner` - Runner Functions  
- Functions that can be scheduled or repeated
- Can import helper functions
- Used for recurring tasks and scheduled operations
- Examples: cleanup tasks, periodic checks

#### 📁 `/worker` - Worker Functions
- Functions that can create LLM instances
- Can import helper functions
- Used for AI-powered operations
- Examples: data analysis, content generation

**Function File Structure:**
```typescript
// Standard function export pattern
import { ICustomFunction, FunctionType } from '../../types';

const functionName: ICustomFunction = {
  definition: {
    name: 'functionName',
    description: 'Function description',
    type: FunctionType.HELPER, // or RUNNER, WORKER
    parameters: [...],
    timeout: 30000
  },
  handler: async (params, context) => {
    // Function implementation
    return result;
  }
};

export default functionName;
```

### 📁 `/src/types` - Type Definitions
TypeScript interfaces and types for the entire application.

**Key Types:**
- Function-related interfaces (ICustomFunction, IFunctionDefinition)
- Job-related interfaces (IJob, IJobData, JobStatus)
- Message interfaces (IIncomingMessage, IOutgoingMessage)
- LLM interfaces (ILLMConfig, ILLMResponse)
- System interfaces (IHealthStatus, IExecutionContext)

### 📁 `/src/utils` - Utility Functions
Shared utility functions and helpers.

**Key Files:**
- `logger.ts` - Winston-based logging configuration with multiple transports

### 📁 `/public` - Static Web Assets
Web-based testing interface and static files.

#### 📁 `/testing` - Web Testing Interface
- Complete HTML/CSS/JS testing application
- Real-time system monitoring
- Function definition viewer
- Message template system
- Interactive console with logs

**Features:**
- Status light indicators for all modules
- JSON message editor with templates
- Response viewer with copy functionality
- Real-time system logs and monitoring
- Function definition popup modals

### 📁 `/dist` - Compiled Output
TypeScript compilation output (created by `npm run build`).

**Auto-generated files:**
- JavaScript equivalents of all TypeScript files
- Source maps for debugging
- Declaration files for type information

### 📁 `/logs` - Application Logs
Runtime log files created by the Winston logger.

**Log Files:**
- `app.log` - General application logs (all levels)
- `error.log` - Error-specific logs only
- Rotated log files (when rotation is enabled)

### 📁 `/node_modules` - Dependencies
NPM package dependencies (auto-generated by `npm install`).

## File Naming Conventions

### TypeScript Files
- **PascalCase** for classes and modules: `AgentMaster.ts`
- **camelCase** for utilities and functions: `stringUtils.ts`
- **lowercase** for configuration: `index.ts`

### Directory Names
- **lowercase** with hyphens for multi-word: `test-results/`
- **camelCase** for single concepts: `functions/`

### Environment Files
- `.env` - Local environment variables
- `.env.example` - Template with example values
- `.env.production` - Production-specific variables

## Import Patterns

### Module Imports
```typescript
// Relative imports within same directory level
import { logger } from '../utils/logger';

// Named imports for specific functionality
import { ICustomFunction, FunctionType } from '../../types';

// Default imports for modules
import AgentMaster from './modules/AgentMaster';
```

### Function Imports
```typescript
// Helper functions can be imported by any type
import stringUtils from '../helper/stringUtils';

// Worker functions can import helpers but not other workers
import mathUtils from '../helper/mathUtils';
```

## Build Output Structure

After running `npm run build`, the `/dist` directory mirrors the `/src` structure:

```
dist/
├── config/
│   └── index.js
├── modules/
│   ├── AgentMaster.js
│   ├── FunctionsManager.js
│   └── ...
├── functions/
│   ├── helper/
│   ├── runner/
│   └── worker/
└── index.js
```

## Development Workflow

### Adding New Functions
1. Create file in appropriate `/src/functions/[type]/` directory
2. Follow function template pattern
3. Export as default
4. System auto-loads on startup or reload

### Adding New Modules
1. Create in `/src/modules/`
2. Implement required interfaces
3. Add to AgentMaster initialization
4. Update health check endpoints

### Modifying Configuration
1. Update `/src/config/index.ts`
2. Add environment variables to `.env.example`
3. Update type definitions if needed
4. Document in setup guide

## Security Considerations

### File Permissions
```bash
# Secure log directory
chmod 750 logs/

# Protect environment file
chmod 600 .env

# Make scripts executable
chmod +x scripts/*.sh
```

### Sensitive Files
Files that should never be committed:
- `.env` (contains API keys)
- `logs/` (may contain sensitive data)
- `node_modules/` (large, generated)
- `dist/` (compiled output)

## Maintenance

### Regular Cleanup
```bash
# Clean compiled output
npm run clean

# Remove old logs
find logs/ -name "*.log" -mtime +30 -delete

# Update dependencies
npm audit && npm update
```

###