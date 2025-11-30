# User-Defined Categories

PA Core now supports user-defined categories that grow organically with your conversations. Instead of being limited to predefined categories, each user can create and manage their own categories based on their needs.

## How It Works

### 1. New Users Start with Zero Categories

When you first start using PA Core, you have no categories defined. The system is completely open and adapts to your usage patterns.

### 2. Automatic Category Suggestions

When auto-classification is enabled (default), the LLM analyzes your conversations:

- **If you have NO categories**: The LLM suggests a new category name based on the conversation topic
- **If you HAVE categories**: The LLM tries to match the conversation to one of your existing categories
- **If no category matches**: The conversation remains uncategorized (category = null)

### 3. User Control

You have full control over your categories:
- Accept suggested categories via the API
- Manually create your own categories at any time
- Delete categories you no longer need
- No limits on the number of categories

## API Endpoints

### Category Management

#### Get Your Categories
```http
GET /v1/categories
Authorization: Bearer {token}
```

Response:
```json
["work", "personal", "learning", "cooking"]
```

#### Add a New Category
```http
POST /v1/categories
Authorization: Bearer {token}
Content-Type: application/json

{
  "category": "work",
  "description": "Work-related conversations" // optional
}
```

#### Delete a Category
```http
DELETE /v1/categories/work
Authorization: Bearer {token}
```

### Working with Category Suggestions

#### Accept a Category Suggestion
When a conversation has a `suggestedCategory` in its metadata, you can accept it:

```http
POST /v1/conversations/{conversationId}/accept-category
Authorization: Bearer {token}
Content-Type: application/json

{
  "category": "cooking"  // Can use the suggestion or provide your own
}
```

This will:
1. Add the category to your categories list
2. Update the conversation with the accepted category
3. Remove the `suggestedCategory` from the conversation metadata

## Conversation Metadata

### When User Has No Categories

```json
{
  "id": "abc123",
  "metadata": {
    "tags": ["recipe", "baking", "bread"],
    "title": "How to make sourdough bread",
    "category": null,
    "suggestedCategory": "cooking",
    "autoClassified": true,
    "classificationConfidence": 0.92
  }
}
```

### When Category Matches Existing Category

```json
{
  "id": "def456",
  "metadata": {
    "tags": ["email", "professional", "communication"],
    "title": "Writing professional email to boss",
    "category": "work",
    "autoClassified": true,
    "classificationConfidence": 0.95
  }
}
```

### When No Category Matches

```json
{
  "id": "ghi789",
  "metadata": {
    "tags": ["javascript", "async", "programming"],
    "title": "Understanding async/await in JavaScript",
    "category": null,
    "autoClassified": true,
    "classificationConfidence": 0.88
  }
}
```

## Complete API Request Example

### Ask a Question with Auto-Classification

```http
POST /v1/complete
Authorization: Bearer {token}
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "How do I make sourdough bread?"
    }
  ],
  "options": {
    "providerId": "ollama",
    "saveToMemory": true,
    "autoClassify": true  // default: true
  }
}
```

### Disable Auto-Classification

```http
POST /v1/complete
Authorization: Bearer {token}
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather like?"
    }
  ],
  "options": {
    "providerId": "ollama",
    "saveToMemory": true,
    "autoClassify": false  // Disable auto-classification
  }
}
```

## Workflow Examples

### Example 1: First-Time User

1. User asks: "How do I make sourdough bread?"
2. LLM suggests category: "cooking"
3. Conversation is saved with `category: null` and `suggestedCategory: "cooking"`
4. User reviews and accepts the suggestion
5. "cooking" is added to user's categories
6. Future cooking questions automatically get categorized as "cooking"

### Example 2: User with Existing Categories

User has categories: `["work", "personal"]`

1. User asks: "Help me write a professional email to my boss"
2. LLM matches to existing category: "work"
3. Conversation is automatically categorized as "work"
4. No user action needed

### Example 3: No Category Match

User has categories: `["work", "personal"]`

1. User asks: "Explain async/await in JavaScript"
2. LLM finds no good match
3. Conversation saved with `category: null`
4. User can:
   - Create a new "programming" category
   - Leave it uncategorized
   - Manually assign to existing category

## Testing

Import the Postman collection to test the complete workflow:

```
postman-user-categories.json
```

The collection includes:
- **Setup**: Register user and configure provider
- **Category Management**: Create, list, and delete categories
- **Auto-Classification**: Test matching to existing categories
- **Category Suggestions**: Test suggestions for new users
- **Category Lifecycle**: Complete workflow from creation to deletion
- **Advanced Scenarios**: Custom categories and disabling auto-classification

## Database Schema

### user_categories table
```sql
CREATE TABLE user_categories (
  user_id VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, category)
);
```

## Configuration Options

Auto-classification is controlled via request options:

```typescript
interface RequestOptions {
  autoClassify?: boolean;  // Enable/disable category classification (default: true)
  autoTag?: boolean;       // Enable/disable tag generation (default: true)
  // ... other options
}
```

- `autoClassify: true` - Full classification with tags, title, and category
- `autoClassify: false, autoTag: true` - Only tags, no category
- `autoClassify: false, autoTag: false` - No automatic classification

## Best Practices

1. **Start Simple**: Let the LLM suggest categories naturally based on your conversations
2. **Accept Good Suggestions**: If the LLM suggests a category that makes sense, accept it
3. **Create Custom Categories**: Add specific categories for topics important to you
4. **Review Uncategorized**: Periodically review conversations with `category: null`
5. **Clean Up**: Delete categories you no longer use

## Implementation Details

### Files Modified

- `packages/cloud/src/memory/memory-manager.ts` - Category management methods
- `packages/cloud/src/services/conversation-classifier.ts` - Dynamic category classification
- `packages/cloud/src/orchestration/orchestrator.ts` - Category integration
- `packages/cloud/src/api/gateway.ts` - Category API endpoints

### Key Features

- Categories are stored per-user in PostgreSQL
- Categories are normalized to lowercase for consistency
- LLM dynamically builds prompts based on user's categories
- Suggestions are non-intrusive - stored in metadata only
- Full backward compatibility with existing conversations
