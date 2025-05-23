{
  "name": "ai-agent-boilerplate",
  "version": "1.0.0",
  "description": "Standardized AI Agent boilerplate with function management, messaging, job queue, and LLM integration",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write 'src/**/*.ts'"
  },
  "keywords": [
    "ai",
    "agent",
    "typescript",
    "llm",
    "function-management",
    "messaging",
    "job-queue"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.41.0",
    "amqplib": "^0.10.3",
    "axios": "^1.6.8",
    "bullmq": "^5.4.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "ioredis": "^5.3.2",
    "jsonschema": "^1.4.1",
    "langchain": "^0.1.25",
    "openai": "^4.28.4",
    "socket.io": "^4.8.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.4",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.30",
    "@typescript-eslint/eslint-plugin": "^7.6.0",
    "@typescript-eslint/parser": "^7.6.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "prettier": "^3.2.5",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  }
}
