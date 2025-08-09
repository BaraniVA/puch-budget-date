# BudgetDate MCP

A free, hyper-local, budget-aware date planner that integrates with Puch AI via MCP.

## Quick Start

1. Copy `.env.example` to `.env` and fill values
2. Install deps
   - Windows PowerShell:
     - `npm install`
3. Run locally
   - `npm run dev`
4. Verify endpoints
   - `GET http://localhost:3000/` -> `{ ok: true }`
   - `GET http://localhost:3000/mcp/tools/list`
   - `POST http://localhost:3000/mcp/tools/call` body `{ "name":"validate", "arguments": { "token": "abc" } }`
   - `POST http://localhost:3000/mcp/tools/call` body `{ "name":"budgetDate", "arguments": { "budget": 25, "city": "Berlin", "preferences": "coffee, art" } }`

## Deploy

- Use any free HTTPS host (Vercel, Render, Fly, Railway)
- Ensure `BASE_URL` env is the public URL

## Connect from Puch AI (WhatsApp)

### 🔌 Connect Your Server
```
/mcp connect https://your-domain.railway.app/mcp demo
```

### 💬 How to Use (Natural Language)
Once connected, just chat naturally with Puch AI:

**Examples:**
- *"Plan a $50 date in Berlin for someone who likes coffee and art"*
- *"I have $30 for a romantic evening in New York, we love outdoor activities"*  
- *"Find me a budget date for $25 in my location, we enjoy museums and food"*
- *"Create a $40 date itinerary in London with cozy cafes and parks"*

**Available Tokens:** `demo`, `user1`, `user2`, `test`

Puch AI will automatically use the BudgetDate tool to create personalized, budget-aware itineraries!

## Notes

- Respects Nominatim 1 rps (simple delay)
- No paid services except Gemini API key
