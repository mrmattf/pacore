# Workflow Intent Detection in Chat - Implementation Complete

## Overview

The PA Core chat interface now supports **dual workflow intent detection**:

1. **CREATE Intent** - Detects when users want to create new automated workflows
2. **EXECUTE Intent** - Detects when users want to run existing workflows

Both intents are automatically detected from natural language messages and presented to the user with contextual UI banners.

## Features Implemented

### Backend (Complete ✅)

#### 1. Intent Detection Enhancement
- **File:** `packages/cloud/src/workflow/workflow-builder.ts`
- **Method:** `detectIntent(userId, userMessage, conversationHistory)`
- Fetches user's existing workflows for execution matching
- Enhanced LLM prompt to distinguish CREATE vs EXECUTE intents
- Returns structured intent with `intentType`, `confidence`, `workflowId`

#### 2. Automatic Workflow Execution
- **File:** `packages/cloud/src/orchestration/orchestrator.ts`
- **Method:** `processRequest()`
- Detects EXECUTE intent with confidence > 0.7
- Automatically executes the matched workflow
- Returns `executionId` in response
- Handles execution errors gracefully

#### 3. Type Definitions
- **File:** `packages/core/src/types/workflow.ts`
- Added `intentType?: 'create' | 'execute'`
- Added `workflowId?: string` for execution matching
- Updated `OrchestrationResponse` to include workflow intent details

### Frontend (Complete ✅)

#### 1. Intent State Management
- **File:** `packages/web/src/hooks/useChat.ts`
- Added `WorkflowIntent` interface
- State: `workflowIntent` and `setWorkflowIntent`
- Detects intent from API response
- Provides `clearWorkflowIntent()` method

#### 2. Visual Feedback Component
- **File:** `packages/web/src/components/WorkflowIntentBanner.tsx`
- **New Component** - Displays workflow intent suggestions
- Three variants:
  - **Green** (Execute) - Shows execution success with "View Execution Results" button
  - **Blue** (Create) - Shows creation opportunity with "Create Workflow" button
  - **Purple** (Generic) - Shows general automation opportunity
- Displays confidence percentage
- Dismissible with X button

#### 3. Chat Page Integration
- **File:** `packages/web/src/pages/ChatPage.tsx`
- Integrated `WorkflowIntentBanner` component
- Handles `onViewExecution` (prepared for execution viewer)
- Handles `onCreateWorkflow` (prepared for workflow builder UI)
- Displays banner above chat messages

## User Experience Flow

### Execute Intent Flow

1. **User types:** "Run my daily Gmail summary"
2. **Backend:**
   - Detects EXECUTE intent
   - Matches to existing "Daily Gmail Summary" workflow
   - Executes workflow automatically
   - Returns executionId
3. **Frontend:**
   - Shows chat response
   - Displays **green banner**: "Workflow Executed"
   - Shows confidence: 95%
   - Provides "View Execution Results" button

### Create Intent Flow

1. **User types:** "I want to automate checking Gmail and Slack daily"
2. **Backend:**
   - Detects CREATE intent
   - Analyzes automation opportunity
   - Returns suggestion
3. **Frontend:**
   - Shows chat response
   - Displays **blue banner**: "Workflow Creation Opportunity"
   - Shows confidence: 88%
   - Provides "Create Workflow" button

## API Response Format

### Execute Intent Response
```json
{
  "response": "I've executed your Gmail summary workflow. The workflow has fetched your recent emails.",
  "provider": "anthropic",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 45
  },
  "workflowIntent": {
    "detected": true,
    "intentType": "execute",
    "confidence": 0.95,
    "description": "User wants to execute the Daily Gmail Summary workflow",
    "workflowId": "wf_abc123",
    "executionId": "exec_xyz789"
  }
}
```

### Create Intent Response
```json
{
  "response": "I can help you create a workflow to automate your Gmail and Slack checks. This would fetch data from both services and compile a daily summary.",
  "provider": "anthropic",
  "usage": {
    "promptTokens": 180,
    "completionTokens": 52
  },
  "workflowIntent": {
    "detected": true,
    "intentType": "create",
    "confidence": 0.88,
    "description": "User wants to create a workflow for automated Gmail and Slack checking with daily summary"
  }
}
```

## Configuration

### Enable/Disable Intent Detection

Intent detection is **enabled by default**. To disable:

```typescript
// In chat request
{
  messages: [...],
  options: {
    detectWorkflowIntent: false  // Disable intent detection
  }
}
```

### Confidence Threshold

Automatic actions (execution) only trigger when `confidence > 0.7` (70%).

Lower confidence detections still appear in responses but don't auto-execute.

## Testing

See [TESTING_WORKFLOW_INTENT_CHAT.md](./TESTING_WORKFLOW_INTENT_CHAT.md) for:
- Detailed test scenarios
- Example messages for both CREATE and EXECUTE intents
- curl commands for API testing
- Expected visual results
- Troubleshooting guide

## Files Changed

### Backend
1. `packages/core/src/types/workflow.ts` - Type definitions
2. `packages/cloud/src/workflow/workflow-builder.ts` - Enhanced intent detection
3. `packages/cloud/src/orchestration/orchestrator.ts` - Automatic execution

### Frontend
1. `packages/web/src/hooks/useChat.ts` - Intent state management
2. `packages/web/src/components/WorkflowIntentBanner.tsx` - **NEW** Visual component
3. `packages/web/src/pages/ChatPage.tsx` - UI integration

### Documentation
1. `WORKFLOW_INTENT_DETECTION.md` - Backend implementation guide
2. `TESTING_WORKFLOW_INTENT_CHAT.md` - Testing guide
3. `WORKFLOW_INTENT_CHAT_COMPLETE.md` - This summary

## Current Limitations & Future Enhancements

### Current Limitations
- "Create Workflow" button logs to console (workflow builder UI not yet implemented)
- "View Execution Results" button logs to console (execution viewer UI not yet implemented)
- No visual workflow builder integrated into chat
- No preview before workflow creation

### Planned Enhancements
1. **Workflow Builder UI**
   - Visual workflow editor
   - Node configuration interface
   - Preview before saving
   - Test workflow before deploying

2. **Execution Results Viewer**
   - Show execution status
   - Display node outputs
   - Error details and logs
   - Retry failed executions

3. **Smart Suggestions**
   - Suggest similar existing workflows before creating new ones
   - Recommend workflow templates
   - Learn from user patterns

4. **Inline Workflow Creation**
   - Create workflows directly in chat
   - Iterative refinement via conversation
   - Natural language node configuration

## Example Chat Interactions

### Execute Intent Examples
- ✅ "Run my daily Gmail summary"
- ✅ "Execute the email workflow"
- ✅ "Send me my morning briefing"
- ✅ "Trigger the data sync workflow"
- ✅ "Start the backup process"

### Create Intent Examples
- ✅ "I want to automate checking Gmail and Slack every morning"
- ✅ "Create a workflow that sends daily reports via email"
- ✅ "Build me a workflow to sync data between my calendar and task manager"
- ✅ "Set up an automation for tracking GitHub issues"
- ✅ "Can you automate my weekly status updates?"

### No Intent Examples
- ❌ "What's the weather like?"
- ❌ "Explain how workflows work"
- ❌ "Help me debug this code"
- ❌ "Write a Python function for sorting"

## Technical Architecture

```
Chat Input
    ↓
useChat Hook
    ↓
POST /v1/complete
    ↓
Orchestrator.processRequest()
    ↓
WorkflowBuilder.detectIntent() ← Fetches existing workflows
    ↓                             ← LLM analyzes intent
    ↓
[High Confidence EXECUTE?]
    ↓ YES
WorkflowExecutor.execute() → Returns executionId
    ↓
OrchestrationResponse with workflowIntent
    ↓
Frontend receives response
    ↓
WorkflowIntentBanner displays
    ↓
User clicks "View Results" or "Create Workflow"
```

## Success Criteria ✅

- [x] Backend detects CREATE intent from chat messages
- [x] Backend detects EXECUTE intent from chat messages
- [x] Backend automatically executes workflows on EXECUTE intent
- [x] Frontend displays workflow intent banners
- [x] Different visual styles for CREATE vs EXECUTE
- [x] Confidence scores displayed
- [x] Dismissible banners
- [x] Type-safe TypeScript implementation
- [x] Comprehensive documentation
- [x] Testing guide created

## Conclusion

The dual workflow intent detection feature is **fully implemented and ready for testing**. Users can now:

1. **Execute workflows** via natural language without navigating to workflow pages
2. **Get suggestions** for workflow automation opportunities during conversations
3. **See visual feedback** about detected intents with clear action buttons

The feature seamlessly integrates into the existing chat experience while preparing for future enhancements like inline workflow creation and execution monitoring.
