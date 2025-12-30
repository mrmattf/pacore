# Testing Workflow Intent Detection from Chat

This guide shows how to test the dual workflow intent detection feature (CREATE and EXECUTE) from the chat interface.

## Prerequisites

1. Backend running with workflow system configured
2. Frontend running at http://localhost:3001
3. User logged in
4. MCP servers registered (for CREATE intent testing)
5. Existing workflows created (for EXECUTE intent testing)

## Test Scenario 1: Execute Intent Detection

### Setup
First, create a workflow that can be executed:

```bash
# Create a test workflow
curl -X POST http://localhost:3000/v1/workflows \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Gmail Summary",
    "description": "Fetch recent emails from Gmail",
    "category": "work",
    "nodes": [
      {
        "id": "fetch_emails",
        "type": "mcp_fetch",
        "description": "Fetch recent emails",
        "config": {
          "serverId": "YOUR_GMAIL_MCP_SERVER_ID",
          "serverName": "Gmail",
          "toolName": "list_messages",
          "parameters": {
            "maxResults": 10
          }
        },
        "inputs": []
      }
    ]
  }'
```

### Test Steps

1. Open the chat interface at http://localhost:3001
2. Type a message that indicates you want to execute the workflow:

**Example Messages:**
- "Run my daily Gmail summary"
- "Execute the Gmail workflow"
- "Send me my email summary"
- "Trigger the daily email check"

3. **Expected Result:**
   - The chat responds with the LLM's answer
   - A **green banner** appears with:
     - Title: "Workflow Executed"
     - Description from the AI about what was executed
     - Confidence percentage
     - "View Execution Results" button
     - executionId in the response

4. **Response Format:**
```json
{
  "response": "I've executed your Gmail summary workflow...",
  "provider": "anthropic",
  "workflowIntent": {
    "detected": true,
    "intentType": "execute",
    "confidence": 0.95,
    "description": "User wants to execute the Daily Gmail Summary workflow",
    "workflowId": "workflow_123",
    "executionId": "exec_456"
  }
}
```

## Test Scenario 2: Create Intent Detection

### Test Steps

1. Type a message that describes a workflow you want to create:

**Example Messages:**
- "I want to automate checking my Gmail and Slack every morning"
- "Create a workflow that fetches data from my calendar and sends me a summary"
- "Can you set up an automation to track my GitHub issues?"
- "Build me a workflow to send daily reports via email"

2. **Expected Result:**
   - The chat responds with the LLM's answer
   - A **blue banner** appears with:
     - Title: "Workflow Creation Opportunity"
     - Description from the AI about what could be automated
     - Confidence percentage
     - "Create Workflow" button (currently logs to console)

3. **Response Format:**
```json
{
  "response": "I can help you create a workflow to automate...",
  "provider": "anthropic",
  "workflowIntent": {
    "detected": true,
    "intentType": "create",
    "confidence": 0.88,
    "description": "User wants to create a workflow for automated email and Slack checking"
  }
}
```

## Test Scenario 3: No Intent Detection

### Test Steps

1. Type regular chat messages that don't involve workflows:

**Example Messages:**
- "What's the weather like today?"
- "Explain quantum computing"
- "Help me write a Python function"

2. **Expected Result:**
   - Normal chat response
   - **No workflow intent banner** appears
   - Response does not include `workflowIntent` field

## Visual Indicators

### Execute Intent (Green Banner)
- ✅ Green background (#f0fdf4)
- ✅ Green left border
- ✅ CheckCircle icon
- ✅ "View Execution Results" button
- Shows execution ID

### Create Intent (Blue Banner)
- 🔷 Blue background (#eff6ff)
- 🔷 Blue left border
- 🔷 Zap (lightning) icon
- 🔷 "Create Workflow" button
- No execution ID (workflow not created yet)

### Generic Intent (Purple Banner)
- 🟣 Purple background (#faf5ff)
- 🟣 Purple left border
- 🟣 AlertCircle icon
- Intent detected but type unclear

## Confidence Threshold

The backend only triggers workflow intent actions when confidence > 0.7 (70%).

Lower confidence intents are still returned in the response but may not trigger automatic execution.

## Current Behavior

### Execute Intent
- ✅ Automatically executes the matched workflow
- ✅ Returns executionId in response
- ✅ Shows green success banner with execution details
- ✅ Provides "View Execution Results" button

### Create Intent
- ✅ Detects creation opportunity
- ✅ Returns suggestion in response
- ✅ Shows blue banner with creation prompt
- ✅ Provides "Create Workflow" button
- ⚠️ Button currently logs to console (workflow builder UI to be implemented)

## Testing with curl

You can also test the chat endpoint directly:

### Execute Intent Test
```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Run my daily Gmail summary workflow"
      }
    ],
    "options": {
      "saveToMemory": true,
      "detectWorkflowIntent": true
    }
  }'
```

### Create Intent Test
```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "I want to create a workflow that sends me a daily summary of my emails"
      }
    ],
    "options": {
      "saveToMemory": true,
      "detectWorkflowIntent": true
    }
  }'
```

## Troubleshooting

### No Intent Detected
- Verify workflows exist in the database
- Check that workflowBuilder is initialized in orchestrator
- Ensure LLM provider (Anthropic) is configured
- Check confidence score in response

### Workflow Not Executing
- Verify workflow belongs to the user
- Check that workflow ID is valid
- Ensure credentials are configured for MCP servers
- Check backend logs for execution errors

### Banner Not Appearing
- Check browser console for errors
- Verify frontend is receiving `workflowIntent` in response
- Check that confidence > 0.7
- Ensure `detectWorkflowIntent` option is enabled (default: true)

## Files Modified

### Backend
- `packages/cloud/src/orchestration/orchestrator.ts` - Intent handling and execution
- `packages/cloud/src/workflow/workflow-builder.ts` - Intent detection
- `packages/core/src/types/workflow.ts` - Type definitions

### Frontend
- `packages/web/src/hooks/useChat.ts` - Intent state management
- `packages/web/src/pages/ChatPage.tsx` - Banner display
- `packages/web/src/components/WorkflowIntentBanner.tsx` - New component

## Next Steps

To fully implement the workflow creation flow from chat:
1. Create a workflow builder UI component
2. Integrate with `/v1/workflows/build` endpoint
3. Show workflow preview before saving
4. Allow user to edit generated workflow
5. Implement execution results viewer
