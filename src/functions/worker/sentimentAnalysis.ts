import { ICustomFunction, FunctionType, IExecutionContext, LLMProvider } from '../../types/index';
import { LLMManager } from '../../modules/LLMManager';

const sentimentAnalysisFunction: ICustomFunction = {
  definition: {
    name: 'sentimentAnalysis',
    description: 'Analyzes the sentiment and emotional tone of text using AI, providing detailed insights and scores',
    type: FunctionType.WORKER,
    parameters: [
      {
        name: 'text',
        type: 'string',
        description: 'Text to analyze for sentiment',
        required: true,
      },
      {
        name: 'includeEmotions',
        type: 'boolean',
        description: 'Whether to include detailed emotion analysis',
        required: false,
        default: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Language of the text (default: auto-detect)',
        required: false,
        default: 'auto',
      },
    ],
    timeout: 25000,
    retries: 2,
  },
  handler: async (params: Record<string, any>, context?: IExecutionContext): Promise<any> => {
    const { text, includeEmotions = true, language = 'auto' } = params;

    if (!text || typeof text !== 'string') {
      throw new Error('Text parameter is required and must be a string');
    }

    if (text.length > 5000) {
      throw new Error('Text too long. Maximum 5000 characters allowed.');
    }

    context?.logger?.info('Starting sentiment analysis', { 
      textLength: text.length, 
      includeEmotions, 
      language 
    });

    try {
      // Create LLM instance for sentiment analysis
      const llmManager = new LLMManager();
      
      let analysisInstanceId: string;
      try {
        // Prefer OpenAI for sentiment analysis
        analysisInstanceId = llmManager.createInstance({
          provider: LLMProvider.OPENAI,
          apiKey: process.env.OPENAI_API_KEY || '',
          model: 'gpt-4',
          temperature: 0.1, // Low temperature for consistent analysis
          maxTokens: 1500,
          systemPrompt: `You are an expert sentiment analysis AI. Analyze text sentiment with high accuracy and provide structured insights. Always respond in valid JSON format.`,
        });
      } catch {
        // Fallback to Anthropic
        analysisInstanceId = llmManager.createInstance({
          provider: LLMProvider.ANTHROPIC,
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          model: 'claude-3-sonnet-20240229',
          temperature: 0.1,
          maxTokens: 1500,
          systemPrompt: `You are an expert sentiment analysis AI. Analyze text sentiment with high accuracy and provide structured insights. Always respond in valid JSON format.`,
        });
      }

      const analysisPrompt = `
Analyze the sentiment of this text: "${text}"

Provide your analysis in this exact JSON format:
{
  "overall_sentiment": "positive" | "negative" | "neutral",
  "confidence_score": 0.0-1.0,
  "sentiment_strength": "very_weak" | "weak" | "moderate" | "strong" | "very_strong",
  "polarity_score": -1.0 to 1.0,
  "subjectivity_score": 0.0 to 1.0,
  ${includeEmotions ? `
  "emotions": {
    "joy": 0.0-1.0,
    "sadness": 0.0-1.0,
    "anger": 0.0-1.0,
    "fear": 0.0-1.0,
    "surprise": 0.0-1.0,
    "disgust": 0.0-1.0,
    "trust": 0.0-1.0,
    "anticipation": 0.0-1.0
  },
  "dominant_emotion": "emotion_name",` : ''}
  "key_phrases": ["phrase1", "phrase2"],
  "language_detected": "${language === 'auto' ? 'detected_language' : language}",
  "text_length": ${text.length},
  "summary": "Brief summary of the sentiment analysis"
}

Ensure all scores are realistic and well-calibrated. Provide accurate analysis.`;

      const llmResponse = await llmManager.generateResponse(analysisInstanceId, analysisPrompt);
      
      // Parse the JSON response
      let analysisResult;
      try {
        // Extract JSON from response
        const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in LLM response');
        }
      } catch (parseError) {
        context?.logger?.warn('Failed to parse LLM JSON response, using fallback');
        // Fallback sentiment analysis
        analysisResult = performBasicSentimentAnalysis(text, includeEmotions);
      }

      // Clean up the LLM instance
      llmManager.deleteInstance(analysisInstanceId);

      // Add metadata
      const result = {
        ...analysisResult,
        original_text: text.length > 200 ? text.substring(0, 200) + '...' : text,
        analysis_timestamp: new Date().toISOString(),
        analysis_method: 'AI-powered LLM analysis',
        jobId: context?.jobId || 'unknown',
      };

      context?.logger?.info('Sentiment analysis completed', { 
        sentiment: result.overall_sentiment,
        confidence: result.confidence_score 
      });

      return result;

    } catch (error) {
      context?.logger?.error('Error in sentiment analysis:', error);
      
      // Fallback to basic analysis if LLM fails
      context?.logger?.info('Using fallback sentiment analysis');
      const fallbackResult = performBasicSentimentAnalysis(text, includeEmotions);
      
      return {
        ...fallbackResult,
        original_text: text.length > 200 ? text.substring(0, 200) + '...' : text,
        analysis_timestamp: new Date().toISOString(),
        analysis_method: 'Fallback keyword-based analysis',
        jobId: context?.jobId || 'unknown',
        warning: 'AI analysis failed, using basic keyword-based analysis',
      };
    }
  },
};

// Basic sentiment analysis fallback
function performBasicSentimentAnalysis(text: string, includeEmotions: boolean): any {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'happy', 'joy', 'pleased', 'satisfied', 'perfect', 'awesome', 'brilliant'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'angry', 'sad', 'disappointed', 'frustrated', 'annoyed', 'furious', 'disgusted', 'upset', 'worried'];
  
  const words = text.toLowerCase().split(/\W+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  });
  
  const totalSentimentWords = positiveCount + negativeCount;
  let overall_sentiment = 'neutral';
  let polarity_score = 0;
  let confidence_score = 0.5;
  
  if (totalSentimentWords > 0) {
    polarity_score = (positiveCount - negativeCount) / totalSentimentWords;
    confidence_score = Math.min(totalSentimentWords / words.length * 4, 0.8); // Max 80% confidence for basic analysis
    
    if (polarity_score > 0.1) overall_sentiment = 'positive';
    else if (polarity_score < -0.1) overall_sentiment = 'negative';
  }
  
  const result: any = {
    overall_sentiment,
    confidence_score: Math.round(confidence_score * 100) / 100,
    sentiment_strength: confidence_score > 0.6 ? 'strong' : confidence_score > 0.3 ? 'moderate' : 'weak',
    polarity_score: Math.round(polarity_score * 100) / 100,
    subjectivity_score: Math.min(totalSentimentWords / words.length * 2, 1),
    key_phrases: words.filter(word => positiveWords.includes(word) || negativeWords.includes(word)).slice(0, 5),
    language_detected: 'unknown',
    text_length: text.length,
    summary: `Basic analysis found ${positiveCount} positive and ${negativeCount} negative sentiment indicators.`,
  };
  
  if (includeEmotions) {
    result.emotions = {
      joy: overall_sentiment === 'positive' ? confidence_score * 0.8 : 0.1,
      sadness: overall_sentiment === 'negative' ? confidence_score * 0.6 : 0.1,
      anger: negativeWords.some(word => ['angry', 'furious', 'hate'].includes(word)) ? 0.7 : 0.1,
      fear: 0.1,
      surprise: 0.1,
      disgust: negativeWords.some(word => ['disgusted', 'awful', 'terrible'].includes(word)) ? 0.6 : 0.1,
      trust: overall_sentiment === 'positive' ? confidence_score * 0.5 : 0.2,
      anticipation: 0.2,
    };
    result.dominant_emotion = overall_sentiment === 'positive' ? 'joy' : overall_sentiment === 'negative' ? 'sadness' : 'trust';
  }
  
  return result;
}

export default sentimentAnalysisFunction;