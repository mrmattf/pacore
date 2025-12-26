# MCP Demo: Rube + Box Integration - Enterprise Automation Demo

## Executive Summary

Build a compelling customer demonstration showcasing PA Core's enterprise workflow automation by integrating two powerful MCP servers: **Rube** (500+ business app integrations) and **Box** (enterprise content management). This demo will illustrate how PA Core bridges AI conversations with real enterprise systems to automate complex business processes.

## MCP Servers Overview

### Rube MCP Server (by Composio)
- **Purpose**: Connect AI to 500+ business and productivity applications
- **Key Apps**: Gmail, Slack, Notion, GitHub, Linear, Airtable, Salesforce, HubSpot, Jira, etc.
- **Capabilities**:
  - OAuth 2.1 authentication
  - Natural language → API calls
  - Multi-app workflows
  - Team credential sharing
  - SOC 2 compliant
- **Installation**: `npx @composiohq/mcp-server-composio`
- **Setup**: Composio API key + app authentications

### Box MCP Server
- **Purpose**: Enterprise content management and collaboration
- **Capabilities**:
  - File/folder operations (13 tool categories)
  - Search (AI-powered + standard)
  - Collaboration & sharing
  - Metadata management
  - User/group management
  - Document generation
- **Installation**: Python-based, `uv` package manager
- **Authentication**: OAuth2.0, CCG, JWT
- **Transport**: STDIO or HTTP/SSE

## Demo Use Case: **Contract Review & Approval Workflow**

### Scenario Overview

**Customer Profile:** Legal/Sales Operations at mid-size enterprise
**Problem:** Manual contract review process is slow, error-prone, and doesn't scale
**Solution:** Automated workflow that retrieves contracts from Box, analyzes them with AI, creates tasks in project management tools, and notifies stakeholders via Slack/email

### User Story

> "As a legal operations manager, I want new contracts automatically reviewed, summarized, routed to the right approvers, and tracked in our project management system - all without manual coordination."

## Demo Workflow Architecture

```
User Conversation:
"Review the latest contract in Box, create a summary, assign it to the legal team
in Linear, and notify them in Slack"

                    ↓
    Workflow Intent Detection (Orchestrator)
                    ↓
    ┌────────────────────────────────────────────────────────┐
    │              Workflow DAG Generated                     │
    ├────────────────────────────────────────────────────────┤
    │ Node 1: [mcp_tool] Box - Search Files                  │
    │   Server: Box MCP                                       │
    │   Tool: box_search_files                                │
    │   Input: { query: "contract", type: "pdf",              │
    │            created_after: "last 7 days" }               │
    │   Output: List of recent contract files                 │
    ├────────────────────────────────────────────────────────┤
    │ Node 2: [mcp_tool] Box - Download File                 │
    │   Server: Box MCP                                       │
    │   Tool: box_download_file                               │
    │   Input: { file_id: "{{nodes.1.files[0].id}}" }        │
    │   Output: Contract PDF content                          │
    ├────────────────────────────────────────────────────────┤
    │ Node 3: [transform] AI Contract Analysis               │
    │   Server: PA Core (Claude)                              │
    │   Input: Contract content from Node 2                   │
    │   Prompt: "Analyze contract: key terms, obligations,    │
    │            risks, renewal dates, payment terms"         │
    │   Output: Structured contract summary                   │
    ├────────────────────────────────────────────────────────┤
    │ Node 4: [mcp_tool] Rube - Create Linear Issue          │
    │   Server: Rube MCP                                      │
    │   Tool: composio_linear_create_issue                    │
    │   Input: {                                              │
    │     title: "Review: {{nodes.1.files[0].name}}",        │
    │     description: "{{nodes.3.summary}}",                │
    │     team: "legal",                                      │
    │     priority: "high"                                    │
    │   }                                                     │
    │   Output: Linear issue URL                              │
    ├────────────────────────────────────────────────────────┤
    │ Node 5: [mcp_tool] Rube - Send Slack Message           │
    │   Server: Rube MCP                                      │
    │   Tool: composio_slack_send_message                     │
    │   Input: {                                              │
    │     channel: "#legal-review",                           │
    │     message: "New contract for review:                  │
    │              {{nodes.4.issue_url}}"                     │
    │   }                                                     │
    │   Output: Slack message confirmation                    │
    ├────────────────────────────────────────────────────────┤
    │ Node 6: [mcp_tool] Rube - Send Gmail Notification      │
    │   Server: Rube MCP                                      │
    │   Tool: composio_gmail_send_email                       │
    │   Input: {                                              │
    │     to: "legal@company.com",                            │
    │     subject: "Contract Review Required",                │
    │     body: "{{nodes.3.summary}}"                         │
    │   }                                                     │
    │   Output: Email sent confirmation                       │
    ├────────────────────────────────────────────────────────┤
    │ Node 7: [action] Save Workflow Results                 │
    │   Save conversation with category: "contracts"          │
    │   Store workflow execution log                          │
    └────────────────────────────────────────────────────────┘
```

## Why This Demo is Compelling

### 1. Real Enterprise Integration
- **Not just search APIs** - actual business system automation
- **Box**: Where enterprises store contracts, documents, files
- **Rube**: Access to tools they already use (Slack, Gmail, Linear, Notion, etc.)

### 2. Complete Business Process
- Ingestion (Box file retrieval)
- Analysis (AI contract review)
- Task Management (Linear issue creation)
- Communication (Slack + Email notifications)
- Audit Trail (PA Core conversation history)

### 3. Multi-System Orchestration
- 3 distinct systems working together
- No manual copy-paste between tools
- Single conversation triggers entire workflow

### 4. Enterprise Security
- OAuth for all connections
- Credentials encrypted in PA Core
- SOC 2 compliant (Rube) + enterprise-grade (Box)
- Audit logs throughout

## Implementation Steps

### Step 1: Deploy MCP Servers Locally

**Deploy Rube Server:**
```bash
# Install Composio MCP server
npx @composiohq/mcp-server-composio

# Get Composio API key from https://app.composio.dev/
# Setup wizard will guide through app authentications:
# - Connect to Gmail (OAuth)
# - Connect to Slack (OAuth)
# - Connect to Linear (OAuth)

# Server exposes HTTP endpoint: http://localhost:3000
# 500+ tools available across all integrated apps
```

**Deploy Box Server:**
```bash
# Clone Box MCP server
git clone https://github.com/box-community/mcp-server-box.git
cd mcp-server-box

# Install dependencies
uv pip install -e .

# Configure Box authentication (choose one):
# Option 1: OAuth2.0 (recommended for demo)
# Option 2: Client Credentials Grant
# Set environment variables in .env file

# Run server
python -m mcp_server_box --transport http --port 3001

# Or for STDIO:
python -m mcp_server_box
```

### Step 2: Get Required Credentials

**Composio/Rube:**
1. Sign up at https://app.composio.dev/
2. Get API key
3. Connect apps via OAuth (Slack, Gmail, Linear, etc.)
4. All connections managed through Composio dashboard

**Box:**
1. Box Enterprise or Business account
2. Create Box App at https://app.box.com/developers/console
3. Choose authentication method:
   - OAuth2.0 for user-based access
   - JWT for service account
4. Get Client ID, Client Secret, and generate tokens
5. Set folder permissions for demo content

### Step 3: Register MCP Servers in PA Core

**Via MCPServersPage UI:**

1. **Register Rube Server**
   - Name: "Rube - Business Apps"
   - Endpoint URL: http://localhost:3000
   - Protocol: HTTP
   - Categories: ["productivity", "communication"]
   - Credentials:
     - API Key: [Composio API Key]
   - Test Connection ✓
   - Tools Available: 500+ (Gmail, Slack, Linear, Notion, GitHub, etc.)

2. **Register Box Server**
   - Name: "Box Enterprise Content"
   - Endpoint URL: http://localhost:3001
   - Protocol: HTTP
   - Categories: ["files", "collaboration"]
   - Credentials:
     - API Key: [Box OAuth Token or JWT]
     - Custom Headers: { "Box-API-Version": "2.0" }
   - Test Connection ✓
   - Tools Available: 13 categories (files, folders, search, collaboration, etc.)

### Step 4: Prepare Demo Data

**In Box:**
1. Create folder: "Demo Contracts"
2. Upload 2-3 sample contracts (PDFs)
3. Add metadata: contract_type, client_name, date
4. Set up sample folder structure

**In Connected Apps:**
1. Slack: Create #legal-review channel
2. Linear: Create "Legal" team/project
3. Gmail: Ensure sending permissions
4. Test individual tool access through Composio dashboard

### Step 5: Demo Script Execution

**Live Demo Flow:**

```
Scene 1: Show MCP Servers (30 seconds)
----------------------------------------------
Presenter: "We've connected PA Core to two powerful MCP servers:
            - Rube gives us access to 500+ business apps
            - Box manages our enterprise content
            All credentials encrypted and secure."

[Navigate to /mcp page]
[Show both servers with ✓ Authenticated badges]
[Click to show tool lists]

Scene 2: Create Workflow via Conversation (2 minutes)
----------------------------------------------
Presenter: "Watch what happens when I describe a business process..."

[Type in chat]:
"Look for the latest contract PDF uploaded to Box in the last week.
Download it, analyze the key terms and risks, create a high-priority
issue in Linear for the legal team, and notify them in Slack and via email."

[AI Response]:
"I detected a workflow opportunity! This involves:
- Searching Box for recent contracts
- Downloading and analyzing content
- Creating tasks in Linear
- Sending notifications via Slack and Gmail
Would you like me to create this automation?"

[Click "Create Workflow"]

Scene 3: Show Generated Workflow DAG (1 minute)
----------------------------------------------
[WorkflowPreviewModal appears]

Presenter: "PA Core automatically generated a 7-node workflow:
- Nodes 1-2: Box operations (search + download)
- Node 3: AI analysis with Claude
- Nodes 4-6: Task creation and notifications via Rube
- Node 7: Save audit trail"

[Show DAG visualization with node connections]
[Hover over nodes to show details]

Scene 4: Execute Workflow (2 minutes)
----------------------------------------------
[Click "Execute Workflow"]

Presenter: "Now watch it run in real-time..."

[Execution progress shows]:
✓ Node 1: Box Search → Found 1 contract (3 seconds)
✓ Node 2: Box Download → Retrieved PDF (2 seconds)
⟳ Node 3: AI Analysis → Processing... (8 seconds)
✓ Node 3: Analysis Complete →
    Key Terms: $50k license, 12-month term, auto-renewal
    Risks: Unlimited liability clause, 30-day termination
✓ Node 4: Linear Issue Created → Issue #123
✓ Node 5: Slack Notified → Posted to #legal-review
✓ Node 6: Email Sent → legal@company.com
✓ Node 7: Saved → Conversation logged

[Total execution: 15-20 seconds]

Scene 5: Show Results (1 minute)
----------------------------------------------
Presenter: "Let's verify the results..."

[Switch to Slack] → Message visible in #legal-review
[Switch to Linear] → Issue created with summary
[Switch to Gmail] → Email in sent folder
[Back to PA Core] → Workflow execution log saved

Scene 6: Reusability & Customization (30 seconds)
----------------------------------------------
Presenter: "This workflow is now saved and can be:
- Run on-demand with different files
- Scheduled (daily contract review)
- Customized (different channels, teams, templates)
- Shared with colleagues"
```

## Chat Window Script - Exact Text to Type

This section provides the **exact text to type** in the PA Core chat interface during the demo, along with expected AI responses and UI interactions.

### Primary Demo Script

**STEP 1: Open PA Core**
- Navigate to: `http://localhost:3001/chat`
- Ensure you're on the main chat page
- Category selector should show your current category (or "general")

---

**STEP 2: Type the Workflow Creation Request**

**USER TYPES IN CHAT INPUT:**
```
I need to automate our contract review process. When a new contract is uploaded to Box, I want to automatically download it, analyze the key terms and potential risks using AI, create a high-priority issue in Linear for the legal team, and notify them both in our #legal-review Slack channel and via email to legal@company.com. Can you create a workflow for this?
```

**Press Enter or click Send**

---

**STEP 3: AI Workflow Creation Response**

**PA CORE AI RESPONDS:**
```
I'll help you create an automated workflow for contract review! Let me design this process:

**Workflow Overview:**
I can create a workflow that automates your contract review process across multiple systems:

1. **Box Integration** - Monitor for new contract uploads or search existing contracts
2. **Document Retrieval** - Automatically download the PDF content
3. **AI-Powered Analysis** - Extract key terms, identify risks, review obligations and dates
4. **Task Management** - Create high-priority Linear issue for legal team review
5. **Team Notifications** - Alert via Slack (#legal-review) and email (legal@company.com)

**Systems Required:**
✓ Box - Already connected (13 tools available)
✓ Linear - Available via Rube MCP (create_issue)
✓ Slack - Available via Rube MCP (send_message)
✓ Gmail - Available via Rube MCP (send_email)
✓ Claude AI - For contract analysis

I've detected all necessary MCP connections are available. Would you like me to generate the workflow DAG for this automation?

[Button: Generate Workflow] [Button: Customize First] [Button: Cancel]
```

**WHAT YOU SEE:**
- The AI has analyzed which MCP tools are available
- Shows a clear breakdown of the 5-step process
- Confirms all required systems are connected
- Button to generate the actual workflow

---

**STEP 4: Click "Generate Workflow" Button**

**USER ACTION:** Click the blue "Generate Workflow" button

**PA CORE RESPONSE:**
```
Generating workflow... analyzing available tools and building DAG...

✓ Identified 7 workflow nodes
✓ Mapped MCP tools to tasks
✓ Configured data flow between nodes
✓ Validated all connections

Workflow generated successfully!
```

---

**STEP 5: Workflow Preview Modal Appears**

**MODAL DISPLAYS:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Create Workflow: "Contract Review & Approval Process"          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Workflow Name: [Contract Review & Approval Process        ]    │
│  Description:   [Automatically review contracts from Box... ]   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Generated Workflow (7 nodes)                │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │      ┌──────────┐                                       │  │
│  │      │   Box    │                                       │  │
│  │      │  Search  │ ← Node 1: Search for contracts       │  │
│  │      └────┬─────┘                                       │  │
│  │           │                                             │  │
│  │      ┌────▼─────┐                                       │  │
│  │      │   Box    │                                       │  │
│  │      │ Download │ ← Node 2: Download PDF content       │  │
│  │      └────┬─────┘                                       │  │
│  │           │                                             │  │
│  │      ┌────▼─────┐                                       │  │
│  │      │    AI    │                                       │  │
│  │      │ Analysis │ ← Node 3: Analyze contract (Claude)  │  │
│  │      └────┬─────┘                                       │  │
│  │           │                                             │  │
│  │      ┌────▼─────────────────┐                          │  │
│  │      │    Split into 3      │                          │  │
│  │      └─┬─────────┬────────┬─┘                          │  │
│  │        │         │        │                            │  │
│  │  ┌─────▼──┐ ┌────▼───┐ ┌─▼─────┐                      │  │
│  │  │ Linear │ │ Slack  │ │ Gmail │                      │  │
│  │  │  Task  │ │ Notify │ │ Send  │                      │  │
│  │  └───┬────┘ └───┬────┘ └───┬───┘                      │  │
│  │      │          │          │                           │  │
│  │      └──────────┴──────────┴──────► Node 7: Save      │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Node Details:                                                  │
│  • Node 1: box_search_files (query: "contract", type: "pdf")  │
│  • Node 2: box_download_file (file_id from Node 1)            │
│  • Node 3: AI contract analysis (terms, risks, dates)          │
│  • Node 4: composio_linear_create_issue (high priority)        │
│  • Node 5: composio_slack_send_message (#legal-review)         │
│  • Node 6: composio_gmail_send_email (legal@company.com)       │
│  • Node 7: Save audit trail to PA Core database                │
│                                                                 │
│  [Button: Cancel]  [Button: Save Workflow]  [Button: Save & Execute Now]│
└─────────────────────────────────────────────────────────────────┘
```

**WHAT YOU SEE:**
- Visual DAG (Directed Acyclic Graph) showing all 7 nodes
- Each node shows its tool name and key parameters
- Connections between nodes show data flow
- Hover over nodes to see full details
- This is a **newly generated** workflow, not yet saved

**PRESENTER NOTE:**
You have two options here:
- "Save Workflow" - Saves the workflow for future use (doesn't execute now)
- "Save & Execute Now" - Saves AND immediately executes with test data

---

**STEP 6: Click "Save & Execute Now" Button**

**USER ACTION:** Click the green "Save & Execute Now" button

**PA CORE RESPONSE:**
```
✓ Workflow saved successfully!
  Name: "Contract Review & Approval Process"
  ID: workflow_2024_cra_001

Starting execution...
```

---

**STEP 7: Workflow Execution in Progress**

**CHAT DISPLAYS REAL-TIME EXECUTION:**

```
🚀 Workflow Started: "Contract Review & Approval Process"
   Execution ID: exec_2024_001

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[●●●●●●●●●●················] 35% Complete

Node 1: Box - Search Files ✓ Completed (2.3s)
└─ Found 1 contract: "Acme_Corp_Software_License_2024.pdf"
   Created: 2 days ago | Size: 847 KB

Node 2: Box - Download File ✓ Completed (1.8s)
└─ Downloaded 847 KB successfully
   File ID: 9284719284

Node 3: AI Contract Analysis ⟳ Processing... (6s elapsed)
└─ Analyzing contract with Claude Sonnet 4.5...
   Extracting: terms, obligations, risks, dates, parties

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**A few seconds later:**

```
[●●●●●●●●●●●●●●●●●●●···] 85% Complete

Node 3: AI Contract Analysis ✓ Completed (8.2s)
└─ Contract Summary Generated:

   📄 Contract: Acme Corp Software License Agreement
   💰 Value: $50,000 annual license
   📅 Term: 12 months (Jan 1, 2024 - Dec 31, 2024)
   🔄 Renewal: Auto-renewal with 30-day notice

   ⚠️ Key Risks Identified:
   • Unlimited liability clause (Section 8.2)
   • 30-day termination notice required
   • No data export provisions after termination

   ✅ Favorable Terms:
   • 30-day payment terms
   • Quarterly price protection
   • Standard indemnification

Node 4: Linear - Create Issue ✓ Completed (1.1s)
└─ Created Issue: LGL-47 "Review: Acme Corp License"
   Priority: High | Team: Legal
   URL: https://linear.app/company/issue/LGL-47

Node 5: Slack - Send Message ✓ Completed (0.9s)
└─ Posted to #legal-review
   Message: "🔔 New contract for review: Acme Corp Software License
            Priority: High | Linear: LGL-47"

Node 6: Gmail - Send Email ✓ Completed (1.4s)
└─ Sent to: legal@company.com
   Subject: "Contract Review Required: Acme Corp"
   Status: Delivered

Node 7: Save Audit Trail ✓ Completed (0.3s)
└─ Workflow execution saved to conversation history
   Category: contracts | Tags: legal, review, acme

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Workflow Completed Successfully!

Total Execution Time: 16.0 seconds
All systems updated: Box → AI → Linear → Slack → Gmail

[Button: View in Linear] [Button: View in Slack] [Button: Run Again]
```

---

**STEP 8: Show External System Results (Optional)**

**PRESENTER CAN NOW DEMONSTRATE:**

1. **Switch to Slack:**
   - Open Slack workspace
   - Navigate to #legal-review channel
   - Show the message posted by PA Core with contract details

2. **Switch to Linear:**
   - Open Linear workspace
   - Show Issue LGL-47 with full contract summary
   - Demonstrate that priority is set to "High"

3. **Switch to Gmail:**
   - Open Gmail sent folder
   - Show email sent to legal@company.com with contract details

4. **Return to PA Core:**
   - Show the workflow is saved in conversation history
   - Can be re-run with different parameters

---

### Alternative Demo Prompts

If you want to demonstrate different use cases or show flexibility:

#### Variation 1: Employee Onboarding
**USER TYPES:**
```
I want to automate our employee onboarding process. When a new employee starts, can you create a workflow that: creates a dedicated folder for them in Box, sets up an onboarding checklist in Notion, sends a welcome message to our #team-general Slack channel, and emails them a welcome package? For example, if Sarah Johnson starts next Monday.
```

#### Variation 2: Sales Lead Follow-up
**USER TYPES:**
```
Help me create a workflow for following up with new leads. The workflow should check HubSpot for leads created in the past 24 hours, send each one a personalized follow-up email via Gmail, generate a proposal document in Box using our standard template, and notify the sales team in Slack.
```

#### Variation 3: Incident Response
**USER TYPES:**
```
Create an automated incident response workflow that triggers when a production incident is reported. It should: create a high-priority issue in Linear with "incident" label, start a Slack huddle in #engineering, send alert emails to on-call engineers, and create an incident report folder in Box with relevant logs.
```

---

### Handling Questions During Demo

**If customer asks: "What if the file isn't found in Box?"**

**PRESENTER RESPONSE:**
> "Great question! Let me show you error handling..."

**USER TYPES:**
```
Search Box for a contract from Nonexistent Company
```

**PA CORE RESPONDS:**
```
I searched Box for contracts from "Nonexistent Company" but didn't find any matches.

Would you like me to:
• Search with broader criteria
• Check a different folder
• Create a workflow that monitors for future uploads

[Button: Search Again] [Button: Monitor for New Files]
```

---

**If customer asks: "Can we customize the notification messages?"**

**PRESENTER RESPONSE:**
> "Absolutely! Let me edit the workflow..."

**USER ACTION:**
- Navigate to Workflows page
- Click "Edit" on Contract Review workflow
- Show the Slack message template is editable
- Demonstrate variable substitution: `{{contract.name}}`, `{{contract.value}}`

---

**If customer asks: "Can this run automatically when new contracts are uploaded?"**

**PRESENTER RESPONSE:**
> "Yes! That's Phase 4 of our roadmap - scheduled and triggered workflows."

**DEMO IN CONCEPT (not yet implemented):**
- Show mockup of trigger configuration
- Box webhook → PA Core workflow
- Daily/weekly schedule options
- Event-based triggers (new file, form submission, etc.)

---

### Troubleshooting During Demo

**If workflow execution fails:**

1. **Check MCP Server Status:**
   - Navigate to `/mcp` page
   - Click "Test" on both Rube and Box servers
   - Ensure green checkmarks for authenticated status

2. **Verify Credentials:**
   - Check Composio API key is valid
   - Ensure Box access token hasn't expired
   - Refresh OAuth tokens if needed

3. **Fallback to Recorded Demo:**
   - Play pre-recorded video of successful execution
   - Walk through what would have happened
   - Focus on architecture and value proposition

---

### Post-Demo Follow-up Prompts

After the main demo, you can show additional capabilities:

**PROMPT: Execute the saved workflow**
```
Run the Contract Review workflow for the latest contract in Box
```

**PROMPT: Modify workflow**
```
I want to update the Contract Review workflow to also notify the CFO via email when the contract value exceeds $100,000. Can you modify it?
```

**PROMPT: Create related workflow**
```
Can you create a similar workflow for reviewing and approving vendor invoices instead of contracts? Use the same pattern but pull from our "Invoices" folder in Box and notify the finance team.
```

**PROMPT: Show workflow execution history**
```
Show me the execution history for the Contract Review workflow - when was it last run and what were the results?
```

---

### Demo Success Checklist

Before starting the demo, ensure:

- [ ] Both MCP servers show "✓ Authenticated" badges
- [ ] Test contract PDF uploaded to Box (< 1 week old)
- [ ] Slack #legal-review channel exists and bot has access
- [ ] Linear "Legal" team exists with proper permissions
- [ ] Gmail sending permissions granted to Composio app
- [ ] PA Core frontend is running (`pnpm dev`)
- [ ] PA Core backend is running with workflow execution enabled
- [ ] Browser is in clean state (no console errors)
- [ ] Backup video recorded and ready to play if needed

---

## Additional Demo Use Cases

### Use Case 2: Employee Onboarding
```
Workflow:
  1. Box → Create employee folder
  2. Rube/Notion → Create onboarding checklist
  3. Rube/Slack → Welcome message to #team channel
  4. Rube/Gmail → Send welcome email
  5. Rube/Linear → Create IT setup tasks
  6. Rube/Airtable → Add to employee directory
```

### Use Case 3: Sales Pipeline Automation
```
Workflow:
  1. Rube/HubSpot → Get new leads
  2. Rube/Gmail → Send personalized follow-up
  3. Box → Generate proposal from template
  4. Box → Share proposal with prospect
  5. Rube/Slack → Notify sales team
  6. Rube/Salesforce → Update opportunity stage
```

### Use Case 4: Incident Response
```
Workflow:
  1. Rube/PagerDuty → Detect critical incident
  2. Rube/Slack → Create incident channel
  3. Rube/Jira → Create incident ticket
  4. Box → Create incident report folder
  5. Transform → Generate incident summary
  6. Rube/Gmail → Email leadership
  7. Rube/Confluence → Document timeline
```

### Use Case 5: Content Publishing Pipeline
```
Workflow:
  1. Box → Retrieve draft document
  2. Transform → Review and suggest edits
  3. Rube/Notion → Update content calendar
  4. Box → Move to "approved" folder
  5. Rube/WordPress → Schedule publication
  6. Rube/Twitter → Queue social post
  7. Rube/Slack → Notify marketing team
```

## Technical Implementation Requirements

### Backend Requirements

**Already Implemented:**
- ✅ CredentialManager (AES-256 encryption)
- ✅ MCPClient with credential injection
- ✅ MCPRegistry for server management
- ✅ WorkflowManager & WorkflowExecutor
- ✅ API endpoints for MCP CRUD

**Need to Implement:**

1. **`mcp_tool` Node Type** (HIGH PRIORITY)
   ```typescript
   // packages/cloud/src/workflow/types.ts
   interface MCPToolNode extends WorkflowNode {
     type: 'mcp_tool';
     config: {
       serverId: string;      // "rube-123" or "box-456"
       toolName: string;       // "composio_slack_send_message"
       inputs: Record<string, any>;  // Tool parameters
     };
   }
   ```

2. **Enhanced WorkflowExecutor**
   ```typescript
   // packages/cloud/src/workflow/workflow-executor.ts
   async executeMCPToolNode(node: MCPToolNode, context: ExecutionContext) {
     // 1. Get MCP server
     const server = await this.mcpRegistry.getServer(node.config.serverId);

     // 2. Get encrypted credentials
     const credentials = await this.credentialManager.getCredentials(
       context.userId,
       server.id
     );

     // 3. Resolve inputs (template variables)
     const resolvedInputs = this.resolveInputs(node.config.inputs, context);

     // 4. Call MCP tool with credentials
     const client = new MCPClient(server, credentials);
     const result = await client.callTool({
       toolName: node.config.toolName,
       parameters: resolvedInputs
     });

     return result.data;
   }
   ```

3. **Enhanced WorkflowBuilder with Tool Catalog**
   ```typescript
   // packages/cloud/src/workflow/workflow-builder.ts
   async buildToolCatalog(userId: string, category?: string): Promise<ToolInfo[]> {
     const servers = await this.mcpRegistry.listUserServers(userId, { category });
     const toolCatalog = [];

     for (const server of servers) {
       const capabilities = await this.mcpClient.getCapabilities(server.id);
       for (const tool of capabilities.tools) {
         toolCatalog.push({
           id: `${server.id}.${tool.name}`,
           serverId: server.id,
           serverName: server.name,
           toolName: tool.name,
           description: tool.description,
           inputSchema: tool.inputSchema
         });
       }
     }

     return toolCatalog;
   }
   ```

4. **Update MCPClient.callTool()**
   ```typescript
   // packages/cloud/src/mcp/mcp-client.ts
   async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
     const request: MCPRequest = {
       method: 'tools/call',
       params: {
         name: toolCall.toolName,
         arguments: toolCall.parameters
       }
     };

     return await this.httpRequest(request);
   }
   ```

### Frontend Requirements

**Already Implemented:**
- ✅ MCPServersPage with server cards
- ✅ MCPServerModal with credential form
- ✅ useMCPServers hook

**Need to Implement (from main MVP plan):**

1. **WorkflowIntentBanner** (Phase 2)
   - Displays when workflow detected
   - "Create Workflow" button

2. **WorkflowsPage** (Phase 3)
   - List all workflows
   - Execute button
   - View execution history

3. **WorkflowDAGViewer** (Phase 3)
   - Visual DAG with react-flow
   - Node details on hover
   - Execution progress animation

4. **WorkflowExecutionModal** (Phase 3)
   - Real-time execution progress
   - Node-by-node results
   - Error handling

## Demo Environment Setup

### Prerequisites

**Accounts Required:**
- Composio account (https://app.composio.dev/)
- Box Enterprise/Business account
- Slack workspace (with admin access)
- Linear workspace
- Gmail account

**Local Dependencies:**
- Node.js 18+
- Python 3.10+ (for Box MCP server)
- PA Core running (backend + frontend)
- Docker (optional, for containerized deployment)

### Setup Checklist

```bash
# 1. Get Composio API Key
# - Sign up at https://app.composio.dev/
# - Create API key
# - Connect apps: Slack, Gmail, Linear, Notion (OAuth)

# 2. Setup Box App
# - Create Box App at https://app.box.com/developers/console
# - Choose OAuth2.0
# - Get Client ID, Client Secret
# - Generate access token
# - Upload sample contracts to Box

# 3. Start PA Core
cd pacore
docker-compose up -d
# OR
pnpm run dev

# 4. Start Rube MCP Server (Terminal 1)
COMPOSIO_API_KEY=your-key npx @composiohq/mcp-server-composio

# 5. Start Box MCP Server (Terminal 2)
cd mcp-server-box
export BOX_ACCESS_TOKEN=your-token
python -m mcp_server_box --transport http --port 3001

# 6. Register Servers in PA Core UI
# - Navigate to http://localhost:3001/mcp
# - Click "Add Server"
# - Register Rube server (port 3000)
# - Register Box server (port 3001)
# - Test connections

# 7. Verify Setup
# - Check tool lists from both servers
# - Test individual tool (e.g., Slack message)
# - Upload test contract to Box
```

## Implementation Timeline

**Day 1: MCP Server Setup & Integration**
- Get Composio + Box accounts (1 hour)
- Deploy both MCP servers locally (2 hours)
- Connect apps via Composio OAuth (1 hour)
- Register in PA Core UI (30 min)
- Test individual tools (1 hour)

**Day 2-3: Backend Development**
- Implement `mcp_tool` node type (3 hours)
- Update WorkflowExecutor for MCP tools (4 hours)
- Add tool catalog to WorkflowBuilder (3 hours)
- Test workflow execution end-to-end (2 hours)

**Day 4-5: Frontend Development**
- WorkflowIntentBanner component (2 hours)
- WorkflowsPage with execution (4 hours)
- WorkflowDAGViewer with react-flow (4 hours)
- Polish and error handling (2 hours)

**Day 6: Demo Preparation**
- Create demo data (contracts in Box) (1 hour)
- Test complete workflow 3x (1 hour)
- Record backup video (30 min)
- Prepare slides/script (1 hour)
- Dry run presentation (30 min)

**Day 7: Customer Demo**
- Pre-demo checklist (30 min)
- Live demonstration (30 min)
- Q&A and discussion (30 min)
- Follow-up materials (30 min)

**Total: 5-6 days of development + 1 day demo prep**

## Success Metrics

**During Demo:**
- Workflow executes successfully on first try
- All 7 nodes complete without errors
- Results visible in Slack, Linear, Gmail within 20 seconds
- Customer asks "Can we connect to [our internal system]?"

**Post-Demo Indicators:**
- Customer requests POC timeline
- Asks about custom MCP server development
- Questions about enterprise deployment
- Requests pricing/licensing details

## Customer Objections & Responses

**Q: "Can this work with our legacy systems?"**
> A: "Yes! If your system has an API, we can create a custom MCP server for it. Composio's framework makes it straightforward to wrap any REST API into MCP format. We'll help you build it."

**Q: "What about compliance and data sovereignty?"**
> A: "PA Core can be deployed entirely on-premise. Your data never leaves your infrastructure. MCP servers run in your environment. We support air-gapped deployments for highly regulated industries."

**Q: "How long does it take to add a new integration?"**
> A: "If the app is already in Rube's 500+ integrations: immediate. For custom systems: 1-2 weeks to build MCP server, then it's available to all workflows. One-time integration effort, unlimited reuse."

**Q: "What happens if a workflow fails?"**
> A: "PA Core logs every step. You get detailed error messages and can resume from the failed node. We support retries, fallbacks, and error notification workflows. Full audit trail for compliance."

**Q: "Can non-technical users create workflows?"**
> A: "Yes! Just describe what you want in plain English. The AI detects the workflow and generates it. Technical users can refine workflows, but creation requires zero coding."

## Conclusion

This demo showcases PA Core as an **Enterprise AI Orchestration Platform**:

1. **Real Business Systems** - Not toy APIs, actual tools teams use daily
2. **Complete Automation** - End-to-end process, not just individual tasks
3. **Natural Interface** - Conversation → Workflow, no technical expertise
4. **Enterprise Security** - Encrypted credentials, SOC 2, audit logs
5. **Extensible** - 500+ apps today, custom integrations tomorrow

The contract review workflow is just one example. The same pattern applies to:
- **HR**: Onboarding, offboarding, leave requests
- **Sales**: Lead qualification, proposal generation, follow-ups
- **Support**: Ticket routing, escalation, knowledge base
- **Finance**: Invoice processing, expense approval, reporting
- **IT**: Provisioning, incident response, compliance checks

**Next Steps After Demo:**
1. Customer identifies 3-5 high-value workflows
2. We map to existing Rube integrations + identify custom needs
3. 2-week POC with 1-2 workflows
4. Measure time saved, error reduction, team satisfaction
5. Production rollout with change management support

---

## Appendix: Tool Reference

### Box MCP Tools (13 Categories)

**Files:**
- `box_read_file` - Read file content
- `box_upload_file` - Upload new file
- `box_download_file` - Download file content
- `box_delete_file` - Delete file
- `box_copy_file` - Copy file to new location

**Folders:**
- `box_create_folder` - Create new folder
- `box_list_folder_contents` - List files/folders
- `box_delete_folder` - Delete folder
- `box_copy_folder` - Copy folder

**Search:**
- `box_search_files` - Search with query
- `box_ai_search` - AI-powered semantic search

**Collaboration:**
- `box_create_collaboration` - Share with users
- `box_list_collaborations` - View shared users
- `box_update_collaboration` - Change permissions

### Rube MCP Tools (500+ Apps)

**Communication:**
- `composio_slack_send_message`
- `composio_gmail_send_email`
- `composio_teams_post_message`
- `composio_discord_send_message`

**Project Management:**
- `composio_linear_create_issue`
- `composio_jira_create_ticket`
- `composio_asana_create_task`
- `composio_monday_create_item`

**Documentation:**
- `composio_notion_create_page`
- `composio_confluence_create_page`
- `composio_google_docs_create`

**CRM/Sales:**
- `composio_salesforce_create_lead`
- `composio_hubspot_create_contact`
- `composio_pipedrive_create_deal`

**Development:**
- `composio_github_create_issue`
- `composio_gitlab_create_merge_request`
- `composio_bitbucket_create_pr`

[Full list: https://app.composio.dev/apps]

## Sources

- [Rube MCP Server by Composio](https://github.com/ComposioHQ/Rube)
- [Box MCP Server](https://github.com/box-community/mcp-server-box)
- [Composio Platform](https://app.composio.dev/)
- [Box Developer Platform](https://developer.box.com/)
