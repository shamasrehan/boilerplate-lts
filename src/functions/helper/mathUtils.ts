import type { ICustomFunction, IExecutionContext } from '../../types/index';
import { FunctionType } from '../../types/index';

const mathUtilsFunction: ICustomFunction = {
  definition: {
    name: 'mathUtils',
    description: 'Mathematical utility functions for basic calculations, statistics, and number operations',
    type: FunctionType.HELPER,
    parameters: [
      {
        name: 'numbers',
        type: 'array',
        description: 'Array of numbers to process',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Math operation: sum, average, min, max, median, or factorial (for single number)',
        required: true,
      },
    ],
    timeout: 10000,
  },
  handler: async (params: Record<string, any>, context?: IExecutionContext): Promise<any> => {
    const { numbers, operation } = params;

    if (!numbers || !Array.isArray(numbers)) {
      throw new Error('Numbers parameter is required and must be an array');
    }

    if (!operation || typeof operation !== 'string') {
      throw new Error('Operation parameter is required and must be a string');
    }

    // Validate all elements are numbers
    const numArray = numbers.map((n: any) => {
      const num = Number(n);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${n}`);
      }
      return num;
    });

    context?.logger?.info('Processing math operation', { 
      operation, 
      count: numArray.length,
      sample: numArray.slice(0, 3) 
    });

    switch (operation.toLowerCase()) {
      case 'sum':
        const sum = numArray.reduce((acc, num) => acc + num, 0);
        return {
          operation: 'sum',
          input: numArray,
          result: sum,
          count: numArray.length,
        };

      case 'average':
        if (numArray.length === 0) throw new Error('Cannot calculate average of empty array');
        const avg = numArray.reduce((acc, num) => acc + num, 0) / numArray.length;
        return {
          operation: 'average',
          input: numArray,
          result: Math.round(avg * 100) / 100, // Round to 2 decimal places
          count: numArray.length,
        };

      case 'min':
        if (numArray.length === 0) throw new Error('Cannot find minimum of empty array');
        return {
          operation: 'minimum',
          input: numArray,
          result: Math.min(...numArray),
          count: numArray.length,
        };

      case 'max':
        if (numArray.length === 0) throw new Error('Cannot find maximum of empty array');
        return {
          operation: 'maximum',
          input: numArray,
          result: Math.max(...numArray),
          count: numArray.length,
        };

      case 'median':
        if (numArray.length === 0) throw new Error('Cannot find median of empty array');
        const sorted = [...numArray].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[middle - 1] + sorted[middle]) / 2
          : sorted[middle];
        return {
          operation: 'median',
          input: numArray,
          result: median,
          count: numArray.length,
        };

      case 'factorial':
        if (numArray.length !== 1) {
          throw new Error('Factorial operation requires exactly one number');
        }
        const num = numArray[0];
        if (num < 0 || !Number.isInteger(num)) {
          throw new Error('Factorial requires a non-negative integer');
        }
        if (num > 20) {
          throw new Error('Factorial calculation limited to numbers <= 20 to prevent overflow');
        }
        
        let factorial = 1;
        for (let i = 2; i <= num; i++) {
          factorial *= i;
        }
        
        return {
          operation: 'factorial',
          input: num,
          result: factorial,
        };

      default:
        throw new Error(`Unsupported operation: ${operation}. Supported operations: sum, average, min, max, median, factorial`);
    }
  },
};

export default mathUtilsFunction;