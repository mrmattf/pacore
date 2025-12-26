# MCP Demo: Brave Search + Exa Integration - Customer Demo Plan

## Executive Summary

Build a compelling customer demonstration showcasing PA Core's workflow automation capabilities by integrating two powerful search MCP servers: **Brave Search** (web/news/local search) and **Exa** (AI-powered semantic search). This demo will illustrate how PA Core enables users to create intelligent, multi-source research workflows through natural conversation.

## Demo Use Case: Competitive Intelligence Research Assistant

### Scenario Overview

**Customer Profile:** Marketing/Product team at a tech company
**Problem:** Need to track competitor activities, gather market intelligence, and compile research reports
**Solution:** Automated workflow that combines web search (Brave) with semantic AI search (Exa) to create comprehensive intelligence reports

### User Story

> "As a product marketing manager, I want to automatically gather and synthesize competitive intelligence from multiple sources so that I can make informed strategic decisions without spending hours on manual research."

## MCP Servers Overview

### Brave Search MCP Server
- **Purpose**: Traditional web search with news, local business, and general queries
- **Capabilities**:
  - Web search with ranking
  - News search with date filtering
  - Local business search
  - Advanced filtering (region, language, safe search)
- **API**: Brave Search API
- **Installation**: `npx -y @modelcontextprotocol/server-brave-search`
- **Credentials**: Brave Search API key (free tier available)

### Exa MCP Server
- **Purpose**: AI-powered semantic search and content extraction
- **Capabilities**:
  - Semantic web search (understands intent, not just keywords)
  - Real-time content scraping
  - Configurable result counts
  - Returns full content from relevant pages
- **API**: Exa AI Search API
- **Installation**: `npx -y @theishangoswami/exa-mcp-server`
- **Credentials**: Exa API key

## Demo Workflow Architecture

```
User Conversation:
"Track competitor X's latest product launches and compare them to our offerings"
                    ↓
    Workflow Intent Detection (Orchestrator)
                    ↓
    ┌──────────────────────────────────────────────┐
    │          Workflow DAG Generated               │
    ├──────────────────────────────────────────────┤
    │ Node 1: [mcp_tool] Brave News Search         │
    │   - Search: "Competitor X product launch"    │
    │   - Filter: Last 30 days                     │
    │   - Output: Recent news articles             │
    ├──────────────────────────────────────────────┤
    │ Node 2: [mcp_tool] Exa Semantic Search       │
    │   - Query: "Competitor X product features"   │
    │   - Extract: Full content from top 5 results │
    │   - Output: Detailed product information     │
    ├──────────────────────────────────────────────┤
    │ Node 3: [mcp_tool] Brave Web Search          │
    │   - Search: "Our product vs Competitor X"    │
    │   - Output: Comparison articles              │
    ├──────────────────────────────────────────────┤
    │ Node 4: [transform] AI Synthesis             │
    │   - Input: Results from nodes 1, 2, 3        │
    │   - LLM: Anthropic Claude                    │
    │   - Prompt: "Synthesize competitive analysis"│
    │   - Output: Structured report                │
    ├──────────────────────────────────────────────┤
    │ Node 5: [action] Save & Notify               │
    │   - Save report to category: "competitive"   │
    │   - Notify: Email summary                    │
    └──────────────────────────────────────────────┘
```

## Demo Implementation Steps

### Step 1: Local MCP Server Deployment

**Deploy Brave Search Server:**
```bash
# Install and run Brave Search MCP server
npx -y @modelcontextprotocol/server-brave-search

# Server exposes HTTP endpoint: http://localhost:3100
# Tools:
# - brave_web_search
# - brave_local_search
```

**Deploy Exa Server:**
```bash
# Install and run Exa MCP server
npx -y @theishangoswami/exa-mcp-server

# Server exposes HTTP endpoint: http://localhost:3101
# Tools:
# - exa_search
# - exa_find_similar
# - exa_get_contents
```

### Step 2: Register MCP Servers in PA Core UI

**Via MCPServersPage:**

1. **Register Brave Search Server**
   - Name: "Brave Search API"
   - Endpoint URL: http://localhost:3100
   - Protocol: HTTP
   - Category: "research"
   - Credentials:
     - API Key: [Brave API Key]
   - Test Connection ✓

2. **Register Exa Search Server**
   - Name: "Exa AI Search"
   - Endpoint URL: http://localhost:3101
   - Protocol: HTTP
   - Category: "research"
   - Credentials:
     - API Key: [Exa API Key]
   - Test Connection ✓

### Step 3: Create Demo Workflow via Conversation

**Demo Script:**

```
User: "I need to track what Microsoft is doing with their AI products.
      Can you search recent news, get detailed information about their
      latest AI features, and create a competitive analysis report?"

PA Core: [Detects workflow intent, confidence: 0.95]
         [Shows WorkflowIntentBanner]
         "This looks like a workflow! Would you like me to automate it?"

User: [Clicks "Create Workflow"]

PA Core: [Generates workflow DAG using available MCP tools]
         [Shows WorkflowPreviewModal with DAG visualization]

Workflow Name: "Microsoft AI Competitive Intelligence"
Nodes:
  1. Brave News Search → "Microsoft AI product launch"
  2. Exa Semantic Search → "Microsoft AI features capabilities"
  3. Brave Web Search → "Microsoft AI vs competitors"
  4. Transform → Synthesize with Claude
  5. Action → Save to "competitive" category

User: [Clicks "Execute Workflow"]

PA Core: [Executes workflow]
         [Shows real-time execution progress]
         [Returns comprehensive report]
```

### Step 4: Show Workflow Execution

**Execution Visualization:**
- DAG viewer shows each node lighting up as it executes
- Live results from each MCP tool displayed
- Final synthesized report appears
- Saved to conversations with "competitive" category

## Demo Features Highlighted

### 1. Multi-Source Intelligence
- **Brave Search**: Recent news and articles (breadth)
- **Exa Search**: Deep semantic understanding (depth)
- **Combined**: Comprehensive view

### 2. Natural Language to Workflow
- User describes intent in conversation
- AI detects workflow opportunity
- Workflow automatically generated from available tools

### 3. Secure Credential Management
- API keys encrypted (AES-256)
- Stored once, used automatically
- No manual credential handling in workflows

### 4. Intelligent Synthesis
- Raw data from multiple sources
- AI transforms into actionable insights
- Structured output for decision-making

### 5. Reusable Workflows
- Save workflow for future use
- Execute on-demand or scheduled (future)
- Customize parameters per execution

## Additional Demo Use Cases

### Use Case 2: Market Research Report
```
Workflow:
  1. Brave Web Search → "Industry trends [topic]"
  2. Exa Semantic Search → "Latest innovations in [topic]"
  3. Brave News Search → "[topic] market analysis"
  4. Transform → Create market research report
  5. Action → Email PDF to team
```

### Use Case 3: Content Aggregation
```
Workflow:
  1. Exa Search → "Best practices for [technology]"
  2. Brave Web Search → "[technology] tutorials"
  3. Filter → Top 10 by relevance
  4. Transform → Summarize each article
  5. Action → Save as learning resource
```

### Use Case 4: Due Diligence
```
Workflow:
  1. Brave Web Search → "Company X news"
  2. Brave Local Search → "Company X locations"
  3. Exa Semantic Search → "Company X leadership team"
  4. Exa Get Contents → Extract details from company site
  5. Transform → Compile due diligence report
```

## Technical Implementation Requirements

### Backend Changes (Already Complete)

✅ **Existing:**
- CredentialManager for secure API keys
- MCPClient with credential injection
- WorkflowExecutor with node execution
- API endpoints for MCP management

⏳ **New Requirements:**

1. **Update WorkflowExecutor for MCP Tool Nodes**
   - Replace `mcp_fetch` with `mcp_tool` node type
   - Call specific tools: `brave_web_search`, `exa_search`, etc.
   - Pass parameters to tools
   - Handle tool-specific responses

2. **Enhanced WorkflowBuilder**
   - Query MCPRegistry for available servers
   - Get tool lists from each server
   - Build tool catalog for LLM prompt
   - Generate workflows using specific MCP tools

### Frontend (Already Complete)

✅ **Existing:**
- MCPServersPage for server management
- MCPServerModal with credential form
- useMCPServers hook

⏳ **Needed for Demo:**
- Workflow execution visualization (Phase 3 of main plan)
- WorkflowIntentBanner (Phase 2 of main plan)

## Demo Environment Setup

### Prerequisites

**API Keys Required:**
- Brave Search API Key → https://brave.com/search/api/
- Exa API Key → https://exa.ai/

**Local Dependencies:**
- Node.js 18+
- PA Core running (backend + frontend)
- Docker (for containerized MCP servers - optional)

### Setup Script

```bash
# 1. Get API keys
echo "Get Brave API key from https://brave.com/search/api/"
echo "Get Exa API key from https://exa.ai/"

# 2. Start PA Core
cd pacore
docker-compose up -d

# 3. Start MCP servers (Terminal 1)
BRAVE_API_KEY=your-key npx -y @modelcontextprotocol/server-brave-search

# 4. Start Exa server (Terminal 2)
EXA_API_KEY=your-key npx -y @theishangoswami/exa-mcp-server

# 5. Open PA Core UI
open http://localhost:3001

# 6. Register both MCP servers via UI
# 7. Test connections
# 8. Ready for demo!
```

## Demo Script (5 Minutes)

**Minute 1: Introduction**
> "PA Core is an AI orchestration platform that turns conversations into automated workflows. Today I'll show you how it integrates with external data sources using MCP servers."

**Minute 2: Show MCP Servers**
> "We have two search servers registered: Brave for web search and Exa for AI-powered semantic search. Credentials are encrypted and stored securely."

**Minute 3: Create Workflow via Conversation**
> "Watch what happens when I ask PA Core to research a competitor..."
> [Type competitive intelligence query]
> [Show workflow intent detection]
> [Display generated workflow DAG]

**Minute 4: Execute & Watch**
> "The workflow executes automatically, calling both search APIs and synthesizing results..."
> [Show real-time execution]
> [Display node-by-node progress]

**Minute 5: Results & Reusability**
> "Here's the comprehensive report. The workflow is saved and can be reused with different companies or topics. This same pattern works for market research, content aggregation, or any multi-source intelligence gathering."

## Success Metrics

**Demo Impact Indicators:**
- Customer sees value in 60 seconds
- "Can we do this with our internal data sources?" (next MCP servers)
- "How quickly can we deploy this?"
- Asks about pricing/licensing

**Technical Success:**
- Both MCP servers connect successfully
- Workflow generates without errors
- Execution completes in < 30 seconds
- Report is comprehensive and useful

## Future Enhancements (Post-Demo Discussion)

1. **Custom MCP Servers**
   - "You can connect PA Core to your internal databases, CRMs, or any API"
   - "We help deploy custom MCP servers for your data sources"

2. **Scheduled Execution**
   - "Run this workflow daily and get morning briefings"
   - "Set up alerts when competitors make moves"

3. **Team Collaboration**
   - "Share workflows with your team"
   - "Create workflow templates for common research tasks"

4. **Enterprise Integration**
   - "SSO for authentication"
   - "Audit logs for compliance"
   - "Role-based access control"

## Implementation Timeline

**Day 1: MCP Server Setup**
- Get API keys (15 min)
- Deploy servers locally (30 min)
- Register in PA Core UI (15 min)

**Day 2: Backend Enhancements**
- Implement `mcp_tool` node type (2 hours)
- Update WorkflowExecutor (2 hours)
- Test tool invocation (1 hour)

**Day 3: Frontend Polish**
- WorkflowIntentBanner (2 hours)
- Workflow execution visualization (3 hours)
- DAG viewer enhancements (1 hour)

**Day 4: Demo Preparation**
- Test complete workflow (1 hour)
- Refine demo script (1 hour)
- Prepare backup scenarios (1 hour)

**Day 5: Customer Demo**
- Pre-demo system check (30 min)
- Run demo (30 min)
- Q&A and discussion (30 min)

**Total: 3-4 days of development + 1 day demo prep**

## Risk Mitigation

**Risk 1: API Rate Limits**
- **Mitigation**: Use free tier sparingly during demo
- **Backup**: Pre-cache some results if needed

**Risk 2: MCP Server Downtime**
- **Mitigation**: Run servers locally, not cloud
- **Backup**: Record video of working demo

**Risk 3: Slow Execution**
- **Mitigation**: Optimize workflow (fewer results)
- **Backup**: Show pre-recorded execution video

**Risk 4: Network Issues**
- **Mitigation**: Test with VPN beforehand
- **Backup**: Complete offline demo environment

## Customer Objections & Responses

**Q: "Is this secure? Where are our API keys stored?"**
> A: "All credentials are encrypted with AES-256 and stored in your database. Keys never leave your infrastructure. You control all data."

**Q: "Can we use this with our internal data?"**
> A: "Absolutely! That's the power of MCP. We can create custom MCP servers for your databases, SharePoint, Salesforce, or any API."

**Q: "How much technical expertise is needed?"**
> A: "End users just have conversations. Admins register MCP servers once. Developers can create custom servers using our templates."

**Q: "What about compliance and data residency?"**
> A: "PA Core supports on-premise deployment. All data stays in your environment. We have SOC 2 and GDPR compliance paths."

## Conclusion

This demo showcases PA Core's core value proposition:
1. **Conversational Interface** → No coding required
2. **Intelligent Automation** → AI detects and builds workflows
3. **Extensible Architecture** → Connect any data source via MCP
4. **Secure by Design** → Encrypted credentials, audit logs
5. **Enterprise Ready** → Scalable, compliant, supportable

The Brave + Exa integration demonstrates multi-source intelligence gathering, but the same pattern applies to any industry:
- **Legal**: Case law research + contract analysis
- **Finance**: Market data + news sentiment
- **Healthcare**: Research papers + clinical trials
- **Sales**: Lead enrichment + company intelligence

**Next Steps:**
1. Customer provides use case details
2. We identify relevant MCP servers or build custom ones
3. 2-week proof of concept
4. Production deployment

---

## Appendix: MCP Tool Specifications

### Brave Search Tools

```typescript
// brave_web_search
{
  name: "brave_web_search",
  description: "Search the web using Brave Search API",
  inputSchema: {
    query: string,           // Search query
    count?: number,          // Results (1-20, default 10)
    offset?: number,         // Pagination offset
    country?: string,        // Country code (e.g., 'US')
    search_lang?: string,    // Language (e.g., 'en')
    safesearch?: string,     // 'off', 'moderate', 'strict'
    freshness?: string       // 'pd' (past day), 'pw' (week), etc.
  }
}

// brave_local_search
{
  name: "brave_local_search",
  description: "Search for local businesses and services",
  inputSchema: {
    query: string,
    count?: number
  }
}
```

### Exa Tools

```typescript
// exa_search
{
  name: "exa_search",
  description: "Semantic web search using AI understanding",
  inputSchema: {
    query: string,           // Natural language query
    num_results?: number,    // Number of results (default 10)
    include_domains?: string[],  // Whitelist domains
    exclude_domains?: string[],  // Blacklist domains
    start_published_date?: string,
    end_published_date?: string,
    use_autoprompt?: boolean // AI query enhancement
  }
}

// exa_find_similar
{
  name: "exa_find_similar",
  description: "Find pages similar to a given URL",
  inputSchema: {
    url: string,
    num_results?: number
  }
}

// exa_get_contents
{
  name: "exa_get_contents",
  description: "Extract full content from URLs",
  inputSchema: {
    ids: string[],           // Exa result IDs or URLs
    text?: boolean           // Include text content
  }
}
```

## Sources

- [Brave Search MCP Server - Official](https://www.pulsemcp.com/servers/brave-search)
- [Exa MCP Server Documentation](https://mcpservers.org/servers/theishangoswami/exa-mcp-server)
- [MCP Omnisearch (Multi-Provider)](https://github.com/spences10/mcp-omnisearch)
- [Model Context Protocol Introduction](https://glama.ai/blog/2024-11-25-model-context-protocol-quickstart)
