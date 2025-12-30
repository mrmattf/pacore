# Workflow Intent Detection

## Overview
The system now detects two types of workflow intents from chat messages:
1. **Create Intent**: User wants to create a new workflow
2. **Execute Intent**: User wants to run an existing workflow

## How It Works

### Detection Process
When a user sends a chat message via `/v1/complete`:

1. **Intent Analysis**: The WorkflowBuilder analyzes the message using an LLM to determine:
   - Whether it's a workflow-related request
   - Whether the user wants to CREATE or EXECUTE
   - Which existing workflow matches (for execution)
   - Confidence level (0.0-1.0)

2. **Automatic Execution**: If execution intent is detected with >70% confidence:
   - The matching workflow is retrieved
   - The workflow is executed automatically
   - Results are included in the response

3. **Creation Suggestion**: If creation intent is detected:
   - The system suggests creating a workflow
   - Frontend can show workflow builder UI

## Example Messages

### Execute Intent
- "Please send the demo email"
- "Run the AI-powered email assistant workflow"
- "Execute the demo workflow"
- "Send an email about our platform"

### Create Intent
- "Create a workflow to fetch data from Gmail and summarize it"
- "I want to automate sending weekly reports"
- "Build a workflow that gets Box files and analyzes them"
- "Set up automation to draft emails using AI"

## Response Format

The `/v1/complete` endpoint returns:

```json
{
  "response": "AI assistant response...",
  "provider": "ollama",
  "workflowIntent": {
    "detected": true,
    "intentType": "execute",  // or "create"
    "confidence": 0.95,
    "description": "User wants to execute the demo email workflow",
    "workflowId": "NjHT7cc47yywO8L9e11ds",
    "executionId": "exec_1766792629415_0fue4lq"
  }
}
```

## Testing

### Test Execute Intent
```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Please send the demo email about our AI platform"}
    ],
    "options": {}
  }'
```

### Test Create Intent
```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Create a workflow to fetch emails from Gmail and summarize them"}
    ],
    "options": {}
  }'
```

## Configuration

Intent detection requires:
- Anthropic provider configured (for LLM-based intent analysis)
- At least one workflow created (for execute intent)
- Ollama configured (for workflow execution with local LLM)

## Files Modified

1. `packages/core/src/types/workflow.ts`
   - Added `intentType` and `workflowId` to WorkflowIntent interface

2. `packages/cloud/src/workflow/workflow-builder.ts`
   - Enhanced `detectIntent()` to detect both create and execute intents
   - Lists user's existing workflows for matching

3. `packages/cloud/src/orchestration/orchestrator.ts`
   - Added automatic workflow execution when execute intent detected
   - Returns intent information in response

## Future Enhancements

- [ ] Ask for confirmation before executing workflows
- [ ] Support workflow parameters from chat
- [ ] Scheduled workflow execution
- [ ] Workflow result formatting in chat response
