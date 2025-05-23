import { ICustomFunction, FunctionType, IExecutionContext } from '../../types';

const timerFunction: ICustomFunction = {
  definition: {
    name: 'timer',
    description: 'Simple timer function that waits for a specified duration and returns elapsed time information',
    type: FunctionType.RUNNER,
    parameters: [
      {
        name: 'duration',
        type: 'number',
        description: 'Duration to wait in milliseconds',
        required: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Optional message to include in the response',
        required: false,
        default: 'Timer completed',
      },
    ],
    timeout: 300000, // 5 minutes max
  },
  handler: async (params: Record<string, any>, context?: IExecutionContext): Promise<any> => {
    const { duration, message = 'Timer completed' } = params;

    if (typeof duration !== 'number' || duration <= 0) {
      throw new Error('Duration must be a positive number');
    }

    if (duration > 300000) { // 5 minutes max
      throw new Error('Duration cannot exceed 300000ms (5 minutes)');
    }

    const startTime = Date.now();
    
    context?.logger?.info('Timer started', { 
      duration, 
      jobId: context.jobId,
      message 
    });

    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, duration));

    const endTime = Date.now();
    const actualDuration = endTime - startTime;

    const result = {
      message,
      requestedDuration: duration,
      actualDuration,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      jobId: context?.jobId || 'unknown',
    };

    context?.logger?.info('Timer completed', result);

    return result;
  },
};

export default timerFunction;