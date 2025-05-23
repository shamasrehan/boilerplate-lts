import axios from 'axios';
import type { ICustomFunction, IExecutionContext } from '../../types/index';
import { FunctionType, LLMProvider } from '../../types/index';
import { LLMManager } from '../../modules/LLMManager';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const weatherFunction: ICustomFunction = {
  definition: {
    name: 'weather',
    description: 'Fetches weather information for a specified city and provides AI-powered weather analysis',
    type: FunctionType.WORKER,
    parameters: [
      {
        name: 'city',
        type: 'string',
        description: 'Name of the city to get weather for',
        required: true,
      },
      {
        name: 'units',
        type: 'string',
        description: 'Temperature units: metric (Celsius) or imperial (Fahrenheit)',
        required: false,
        default: 'metric',
      },
      {
        name: 'includeAnalysis',
        type: 'boolean',
        description: 'Whether to include AI-powered weather analysis',
        required: false,
        default: true,
      },
    ],
    timeout: 30000,
    retries: 2,
  },
  handler: async (params: Record<string, any>, context?: IExecutionContext): Promise<any> => {
    const { city, units = 'metric', includeAnalysis = true } = params;

    if (!city || typeof city !== 'string') {
      throw new Error('City parameter is required and must be a string');
    }

    context?.logger?.info('Fetching weather data', { city, units, includeAnalysis });

    try {
      // Note: In a real implementation, you would use a proper weather API like OpenWeatherMap
      // For demo purposes, we'll simulate weather data
      const weatherData = await simulateWeatherAPI(city, units);

      let analysis: string | null = null;
      if (includeAnalysis) {
        // Create LLM instance for weather analysis
        const llmManager = new LLMManager();
        
        // Try to create an instance for analysis (prefer Anthropic for detailed analysis)
        let analysisInstanceId: string;
        try {
          analysisInstanceId = llmManager.createInstance({
            provider: LLMProvider.ANTHROPIC,
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-sonnet-20240229',
            temperature: 0.5,
            maxTokens: 1000,
            systemPrompt: 'You are a weather analyst. Provide helpful, concise weather insights and recommendations.',
          });
        } catch {
          // Fallback to OpenAI if Anthropic is not available
          analysisInstanceId = llmManager.createInstance({
            provider: LLMProvider.OPENAI,
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-4',
            temperature: 0.5,
            maxTokens: 1000,
            systemPrompt: 'You are a weather analyst. Provide helpful, concise weather insights and recommendations.',
          });
        }

        const analysisPrompt = `
Analyze this weather data for ${city}:
Temperature: ${weatherData.temperature}°${units === 'metric' ? 'C' : 'F'}
Condition: ${weatherData.condition}
Humidity: ${weatherData.humidity}%
Wind Speed: ${weatherData.windSpeed} ${units === 'metric' ? 'km/h' : 'mph'}
Pressure: ${weatherData.pressure} hPa

Provide a brief analysis including:
1. Overall weather assessment
2. What to expect for outdoor activities
3. Any weather-related recommendations
Keep it under 200 words and make it practical.`;

        try {
          const llmResponse = await llmManager.generateResponse(analysisInstanceId, analysisPrompt);
          if (llmResponse && llmResponse.content) {
            analysis = llmResponse.content;
          } else {
            analysis = 'Weather analysis unavailable at this time.';
          }
          context?.logger?.info('Weather analysis generated successfully');
        } catch (error) {
          context?.logger?.warn('Failed to generate weather analysis:', error);
          analysis = 'Weather analysis unavailable at this time.';
        }

        // Clean up the LLM instance
        llmManager.deleteInstance(analysisInstanceId);
      }

      const result = {
        city: weatherData.city,
        country: weatherData.country,
        temperature: weatherData.temperature,
        condition: weatherData.condition,
        description: weatherData.description,
        humidity: weatherData.humidity,
        windSpeed: weatherData.windSpeed,
        pressure: weatherData.pressure,
        units,
        timestamp: new Date().toISOString(),
        analysis: analysis || undefined,
        source: 'Simulated Weather API',
      };

      context?.logger?.info('Weather data fetched successfully', { city: result.city });
      return result;

    } catch (error) {
      context?.logger?.error('Error fetching weather data:', error);
      throw new Error(`Failed to fetch weather data for ${city}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Simulate weather API call (replace with real API in production)
async function simulateWeatherAPI(city: string, units: string): Promise<any> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Generate realistic weather data based on city name hash
  const cityHash = city.toLowerCase().split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  const conditions = ['Clear', 'Cloudy', 'Partly Cloudy', 'Rainy', 'Sunny', 'Overcast'];
  const descriptions = {
    'Clear': 'Clear sky with excellent visibility',
    'Cloudy': 'Mostly cloudy with occasional breaks',
    'Partly Cloudy': 'Mix of sun and clouds',
    'Rainy': 'Light to moderate rainfall expected',
    'Sunny': 'Bright and sunny conditions',
    'Overcast': 'Completely overcast sky',
  };

  const condition = conditions[Math.abs(cityHash) % conditions.length];
  const baseTemp = units === 'metric' ? 20 : 68;
  const tempVariation = (Math.abs(cityHash) % 30) - 15;
  
  return {
    city: city.charAt(0).toUpperCase() + city.slice(1).toLowerCase(),
    country: 'Unknown', // In real API, this would be determined
    temperature: Math.round(baseTemp + tempVariation),
    condition,
    description: descriptions[condition as keyof typeof descriptions],
    humidity: 40 + (Math.abs(cityHash) % 40),
    windSpeed: Math.round(5 + (Math.abs(cityHash) % 20)),
    pressure: 1000 + (Math.abs(cityHash) % 50),
  };
}

export default weatherFunction;