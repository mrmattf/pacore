import { Message, LLMProvider } from '@pacore/core';

export interface ClassificationResult {
  tags: string[];
  title: string;
  category: string | null; // null if no existing category matches
  suggestedCategory?: string; // New category suggestion if category is null
  confidence: number;
}

/**
 * Service for automatically classifying and tagging conversations using LLM
 */
export class ConversationClassifier {
  constructor(private provider: LLMProvider) {}

  private buildSystemPrompt(userCategories: string[]): string {
    if (userCategories.length === 0) {
      return `You are a conversation classifier. Analyze the conversation and provide:
1. Tags: 3-5 relevant tags (single words or short phrases, lowercase)
2. Title: A brief, descriptive title (max 60 characters)
3. Category: Suggest a single-word or short category name that best describes this conversation
4. Confidence: Your confidence level (0.0-1.0)

Respond ONLY with valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "title": "Brief conversation title",
  "category": "suggested-category",
  "confidence": 0.95
}`;
    }

    return `You are a conversation classifier. Analyze the conversation and provide:
1. Tags: 3-5 relevant tags (single words or short phrases, lowercase)
2. Title: A brief, descriptive title (max 60 characters)
3. Category: Choose the BEST matching category from this list: ${userCategories.join(', ')}
   - If one fits well, use it
   - If none fit well (confidence < 0.6), respond with "none"
4. SuggestedCategory: If no existing category fits well, suggest a better single-word or short category name
5. Confidence: Your confidence level (0.0-1.0) in the category match

Respond ONLY with valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "title": "Brief conversation title",
  "category": "one-of-the-categories-or-none",
  "suggestedCategory": "new-category-name-if-needed",
  "confidence": 0.95
}

If category is "none", you MUST provide a suggestedCategory.`;
  }

  /**
   * Classify a conversation and generate tags, title, and category
   */
  async classifyConversation(
    messages: Message[],
    userCategories: string[] = []
  ): Promise<ClassificationResult> {
    try {
      // Build conversation text from messages
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      // Use LLM to classify
      const systemPrompt = this.buildSystemPrompt(userCategories);
      const response = await this.provider.complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Classify this conversation:\n\n${conversationText}` }
      ], {
        temperature: 0.3, // Lower temperature for more consistent classification
        maxTokens: 200,
      });

      // Parse JSON response
      const result = this.parseClassificationResponse(response.content, userCategories);

      return result;
    } catch (error) {
      console.error('Classification error:', error);
      // Return default classification on error
      return this.getDefaultClassification(messages);
    }
  }

  /**
   * Generate just tags for a conversation (faster, cheaper)
   */
  async generateTags(messages: Message[]): Promise<string[]> {
    try {
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await this.provider.complete([
        {
          role: 'system',
          content: 'You are a tagging system. Analyze the conversation and respond with ONLY a JSON array of 3-5 relevant tags (lowercase, single words or short phrases). Example: ["javascript", "async", "promises"]'
        },
        { role: 'user', content: `Generate tags for:\n\n${conversationText}` }
      ], {
        temperature: 0.3,
        maxTokens: 100,
      });

      // Try to parse as JSON array
      const cleaned = response.content.trim();
      const match = cleaned.match(/\[.*\]/s);
      if (match) {
        return JSON.parse(match[0]);
      }

      // Fallback: split by comma
      return cleaned
        .replace(/[\[\]"']/g, '')
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0)
        .slice(0, 5);
    } catch (error) {
      console.error('Tag generation error:', error);
      return this.extractKeywordsFromMessages(messages);
    }
  }

  /**
   * Generate a title for a conversation
   */
  async generateTitle(messages: Message[]): Promise<string> {
    try {
      // Use first user message for title if it's short enough
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage && firstUserMessage.content.length < 60) {
        return firstUserMessage.content;
      }

      const conversationText = messages
        .slice(0, 4) // Only use first 2 exchanges
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await this.provider.complete([
        {
          role: 'system',
          content: 'Generate a brief, descriptive title (max 60 characters) for this conversation. Respond with ONLY the title, no quotes or extra text.'
        },
        { role: 'user', content: conversationText }
      ], {
        temperature: 0.4,
        maxTokens: 50,
      });

      return response.content.trim().replace(/^["']|["']$/g, '').slice(0, 60);
    } catch (error) {
      console.error('Title generation error:', error);
      // Fallback to first user message
      const firstUserMessage = messages.find(m => m.role === 'user');
      return firstUserMessage
        ? firstUserMessage.content.slice(0, 60) + (firstUserMessage.content.length > 60 ? '...' : '')
        : 'Conversation';
    }
  }

  private parseClassificationResponse(
    content: string,
    userCategories: string[]
  ): ClassificationResult {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.map((t: string) => t.toLowerCase().trim()).slice(0, 5)
        : [];

      const title = typeof parsed.title === 'string'
        ? parsed.title.slice(0, 60)
        : 'Conversation';

      const confidence = typeof parsed.confidence === 'number'
        ? Math.min(Math.max(parsed.confidence, 0), 1)
        : 0.5;

      // Handle category based on user's categories
      const suggestedCat = parsed.category?.toLowerCase().trim();
      const newCategorySuggestion = parsed.suggestedCategory?.toLowerCase().trim();

      if (userCategories.length === 0) {
        // User has no categories yet - suggest the one from LLM
        return {
          tags,
          title,
          category: null,
          suggestedCategory: suggestedCat || 'general',
          confidence,
        };
      }

      // User has categories - check if LLM's choice matches
      const normalizedUserCats = userCategories.map(c => c.toLowerCase());
      if (suggestedCat && suggestedCat !== 'none' && normalizedUserCats.includes(suggestedCat)) {
        // LLM found a matching category
        return {
          tags,
          title,
          category: suggestedCat,
          confidence,
        };
      }

      // No match found - return the LLM's suggestion for a new category
      return {
        tags,
        title,
        category: null,
        suggestedCategory: newCategorySuggestion || suggestedCat || 'general',
        confidence,
      };
    } catch (error) {
      throw new Error(`Failed to parse classification: ${error}`);
    }
  }

  private getDefaultClassification(messages: Message[]): ClassificationResult {
    return {
      tags: this.extractKeywordsFromMessages(messages),
      title: this.extractTitleFromMessages(messages),
      category: null,
      confidence: 0.3,
    };
  }

  private extractKeywordsFromMessages(messages: Message[]): string[] {
    // Simple keyword extraction as fallback
    const text = messages
      .map(m => m.content)
      .join(' ')
      .toLowerCase();

    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'what', 'how', 'why', 'when', 'where', 'who']);

    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.has(w));

    // Count frequency
    const frequency = new Map<string, number>();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    // Return top 5 most frequent
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private extractTitleFromMessages(messages: Message[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      return firstUserMessage.content.slice(0, 60) +
        (firstUserMessage.content.length > 60 ? '...' : '');
    }
    return 'Conversation';
  }
}
