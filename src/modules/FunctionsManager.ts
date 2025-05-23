import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import {
  ICustomFunction,
  IFunctionDefinition,
  IFunctionHandler,
  FunctionType,
  IHealthStatus,
  IExecutionContext,
} from '../types/index';

export class FunctionsManager {
  private functions: Map<string, ICustomFunction> = new Map();
  private functionsDirectory: string;

  constructor() {
    this.functionsDirectory = path.join(process.cwd(), 'src', 'functions');
    this.ensureDirectoriesExist();
    this.loadAllFunctions();
  }

  private ensureDirectoriesExist(): void {
    const directories = [
      path.join(this.functionsDirectory, 'helper'),
      path.join(this.functionsDirectory, 'runner'),
      path.join(this.functionsDirectory, 'worker'),
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
  }

  private async loadAllFunctions(): Promise<void> {
    try {
      await this.loadFunctionsByType(FunctionType.HELPER);
      await this.loadFunctionsByType(FunctionType.RUNNER);
      await this.loadFunctionsByType(FunctionType.WORKER);
      logger.info(`Loaded ${this.functions.size} functions total`);
    } catch (error) {
      logger.error('Error loading functions:', error);
    }
  }

  private async loadFunctionsByType(type: FunctionType): Promise<void> {
    const typeDir = path.join(this.functionsDirectory, type);
    
    if (!fs.existsSync(typeDir)) {
      return;
    }

    const files = fs.readdirSync(typeDir).filter(file => 
      file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of files) {
      try {
        const filePath = path.join(typeDir, file);
        // Convert to URL format for ES modules
        const fileUrl = `file://${filePath}`;
        const functionModule = await import(fileUrl);
        
        if (functionModule.default && typeof functionModule.default === 'object') {
          const customFunction = functionModule.default as ICustomFunction;
          
          // Validate function structure
          if (this.validateFunction(customFunction, type)) {
            this.functions.set(customFunction.definition.name, customFunction);
            logger.info(`Loaded ${type} function: ${customFunction.definition.name}`);
          } else {
            logger.warn(`Invalid function structure in ${file}`);
          }
        }
      } catch (error) {
        logger.error(`Error loading function from ${file}:`, error);
      }
    }
  }

  private validateFunction(func: ICustomFunction, expectedType: FunctionType): boolean {
    if (!func.definition || !func.handler) {
      return false;
    }

    const { definition } = func;
    return (
      typeof definition.name === 'string' &&
      typeof definition.description === 'string' &&
      definition.type === expectedType &&
      Array.isArray(definition.parameters) &&
      typeof func.handler === 'function'
    );
  }

  public addFunction(func: ICustomFunction): boolean {
    try {
      if (!this.validateFunction(func, func.definition.type)) {
        logger.error(`Invalid function structure for ${func.definition.name}`);
        return false;
      }

      this.functions.set(func.definition.name, func);
      logger.info(`Added function: ${func.definition.name}`);
      return true;
    } catch (error) {
      logger.error('Error adding function:', error);
      return false;
    }
  }

  public removeFunction(name: string): boolean {
    try {
      const deleted = this.functions.delete(name);
      if (deleted) {
        logger.info(`Removed function: ${name}`);
      }
      return deleted;
    } catch (error) {
      logger.error('Error removing function:', error);
      return false;
    }
  }

  public getFunction(name: string): ICustomFunction | undefined {
    return this.functions.get(name);
  }

  public getAllFunctions(): ICustomFunction[] {
    return Array.from(this.functions.values());
  }

  public getFunctionsByType(type: FunctionType): ICustomFunction[] {
    return Array.from(this.functions.values()).filter(
      func => func.definition.type === type
    );
  }

  public getFunctionDefinitions(): IFunctionDefinition[] {
    return Array.from(this.functions.values()).map(func => func.definition);
  }

  public exportFunctionDefinitionsAsJson(): string {
    const definitions = this.getFunctionDefinitions();
    return JSON.stringify(definitions, null, 2);
  }

  public async executeFunction(
    name: string,
    parameters: Record<string, any>,
    context?: IExecutionContext
  ): Promise<any> {
    const func = this.functions.get(name);
    
    if (!func) {
      throw new Error(`Function ${name} not found`);
    }

    try {
      logger.info(`Executing function: ${name}`, { parameters });
      
      const timeout = func.definition.timeout || 30000;
      const result = await Promise.race([
        func.handler(parameters, context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Function execution timeout')), timeout)
        )
      ]);

      logger.info(`Function ${name} executed successfully`);
      return result;
    } catch (error) {
      logger.error(`Error executing function ${name}:`, error);
      throw error;
    }
  }

  public validateFunctionCall(name: string, parameters: Record<string, any>): boolean {
    const func = this.functions.get(name);
    
    if (!func) {
      return false;
    }

    const { definition } = func;
    
    // Check required parameters
    for (const param of definition.parameters) {
      if (param.required && !(param.name in parameters)) {
        logger.warn(`Missing required parameter: ${param.name} for function ${name}`);
        return false;
      }
    }

    return true;
  }

  public getHealthStatus(): IHealthStatus {
    try {
      const functionCount = this.functions.size;
      const helperCount = this.getFunctionsByType(FunctionType.HELPER).length;
      const runnerCount = this.getFunctionsByType(FunctionType.RUNNER).length;
      const workerCount = this.getFunctionsByType(FunctionType.WORKER).length;

      return {
        module: 'FunctionsManager',
        status: 'healthy',
        details: `Total: ${functionCount}, Helper: ${helperCount}, Runner: ${runnerCount}, Worker: ${workerCount}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        module: 'FunctionsManager',
        status: 'unhealthy',
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }
  }

  public reloadFunctions(): Promise<void> {
    this.functions.clear();
    return this.loadAllFunctions();
  }
}