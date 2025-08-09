import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import mcpRouter from './routes/mcp.js';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { budgetDateTool, validateTool } from './services/tools.js';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(cors());
app.use(pinoHttp({ logger }));

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'BudgetDate MCP', version: '1.0.0' });
});

// ------------------ MCP over SSE (for Puch AI) ------------------
// Create MCP server with tool capabilities
const mcServer = new MCPServer(
  { name: 'budget-date-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Register tool list handler
mcServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'validate',
        description: 'Validates bearer token and returns owner phone number',
        inputSchema: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
      {
        name: 'budgetDate',
        description:
          'Given budget, city or coordinates, and preferences, returns a 3–4 step romantic itinerary as JSON',
        inputSchema: {
          type: 'object',
          required: ['budget'],
          properties: {
            budget: { type: 'number' },
            city: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            preferences: { type: 'string' },
            spin: { type: 'boolean' },
          },
        },
      },
    ],
  };
});

// Register tool call handler
mcServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'validate') {
    const phone = await validateTool(args);
    return { content: [{ type: 'text', text: String(phone) }] };
  }
  if (name === 'budgetDate') {
    const result = await budgetDateTool(args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
  throw new Error(`Unknown tool: ${name}`);
});

// Keep track of active SSE sessions
const sessions = new Map(); // sessionId -> transport

// ------------------ REST endpoints (optional/testing) ------------------
app.use(express.json({ limit: '1mb' }));
// Mount existing REST-style MCP routes for simple testing BEFORE SSE routes
app.use('/mcp', mcpRouter);

// HTTP+SSE transport (backwards compatible with Puch AI)
// GET /mcp: establish SSE stream with endpoint event
app.get('/mcp', (req, res, next) => {
  const accept = req.headers['accept'] || '';
  if (String(accept).includes('text/event-stream')) {
    // Set up SSE response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Create MCP SSE transport
    const transport = new SSEServerTransport('/mcp', res);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, transport);
    
    transport.onclose = () => sessions.delete(sessionId);
    transport.onerror = (err) => logger.error({ err, sessionId }, 'SSE transport error');
    
    // Connect MCP server to transport
    mcServer.connect(transport).catch((err) => {
      logger.error({ err }, 'Failed to connect MCP transport');
      try { res.end(); } catch {}
    });
    
    return; // End here for SSE
  }
  // Not an SSE request; let REST router handle it
  return next();
});

// POST /mcp: receive JSON-RPC messages for SSE sessions
app.post('/mcp', express.text({ type: 'application/json', limit: '4mb' }), async (req, res, next) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    // No sessionId means this is probably a REST call, let router handle it
    return next();
  }
  
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).send('Unknown or expired session');
  
  try {
    const payload = JSON.parse(req.body || '{}');
    await transport.handleMessage(payload);
    res.status(202).send('Accepted');
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to handle client message');
    res.status(400).send('Invalid message');
  }
});

// Legacy /mcp/sse endpoints for compatibility
app.get('/mcp/sse', (req, res) => {
  const transport = new SSEServerTransport('/mcp/sse', res);
  const sessionId = transport.sessionId;
  sessions.set(sessionId, transport);
  transport.onclose = () => sessions.delete(sessionId);
  transport.onerror = (err) => logger.error({ err, sessionId }, 'SSE transport error');
  mcServer.connect(transport).catch((err) => {
    logger.error({ err }, 'Failed to connect MCP transport');
    try { res.end(); } catch {}
  });
});

app.post('/mcp/sse', express.text({ type: 'application/json', limit: '4mb' }), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).send('Unknown or expired session');
  try {
    const payload = JSON.parse(req.body || '{}');
    await transport.handleMessage(payload);
    res.status(202).send('Accepted');
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to handle client message');
    res.status(400).send('Invalid message');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info({ port }, 'BudgetDate MCP server listening');
});
