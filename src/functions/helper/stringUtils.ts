import { ICustomFunction, FunctionType, IExecutionContext } from '../../types';

const stringUtilsFunction: ICustomFunction = {
  definition: {
    name: 'stringUtils',
    description: 'Utility functions for string manipulation including uppercase, lowercase, reverse, and character count',
    type: FunctionType.HELPER,
    parameters: [
      {
        name: 'text',
        type: 'string',
        description: 'The text to process',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Operation to perform: uppercase, lowercase, reverse, count, or wordCount',
        required: true,
      },
    ],
    timeout: 5000,
  },
  handler: async (params: Record<string, any>, context?: IExecutionContext): Promise<any> => {
    const { text, operation } = params;

    if (!text || typeof text !== 'string') {
      throw new Error('Text parameter is required and must be a string');
    }

    if (!operation || typeof operation !== 'string') {
      throw new Error('Operation parameter is required and must be a string');
    }

    context?.logger?.info('Processing string operation', { operation, textLength: text.length });

    switch (operation.toLowerCase()) {
      case 'uppercase':
        return {
          original: text,
          result: text.toUpperCase(),
          operation: 'uppercase',
        };

      case 'lowercase':
        return {
          original: text,
          result: text.toLowerCase(),
          operation: 'lowercase',
        };

      case 'reverse':
        return {
          original: text,
          result: text.split('').reverse().join(''),
          operation: 'reverse',
        };

      case 'count':
        return {
          original: text,
          result: text.length,
          operation: 'character count',
        };

      case 'wordcount':
        const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        return {
          original: text,
          result: wordCount,
          operation: 'word count',
        };

      default:
        throw new Error(`Unsupported operation: ${operation}. Supported operations: uppercase, lowercase, reverse, count, wordCount`);
    }
  },
};

export default stringUtilsFunction;