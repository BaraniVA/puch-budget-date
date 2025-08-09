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

// SSE GET: establish stream and send the endpoint event
// Shared handler to bootstrap an SSE transport and connect the MCP server
function handleSSE(req, res) {
  const transport = new SSEServerTransport('/mcp/sse', res);
  const id = transport.sessionId;
  sessions.set(id, transport);
  transport.onclose = () => sessions.delete(id);
  transport.onerror = (err) => logger.error({ err, sessionId: id }, 'SSE transport error');
  mcServer.connect(transport).catch((err) => {
    logger.error({ err }, 'Failed to connect MCP transport');
    try { res.end(); } catch {}
  });
}

app.get('/mcp/sse', (req, res) => {
  handleSSE(req, res);
});

// Alias: some clients expect SSE at the base /mcp path; serve SSE when Accept is text/event-stream
app.get('/mcp', (req, res, next) => {
  const accept = req.headers['accept'] || '';
  if (String(accept).includes('text/event-stream')) {
    return handleSSE(req, res);
  }
  // Not an SSE request; continue to router (e.g., /mcp/tools/*)
  return next();
});

// SSE POST: receive client JSON-RPC messages for a session
// Use route-level raw parser to avoid global JSON body parser
app.post('/mcp/sse', express.text({ type: 'application/json', limit: '4mb' }), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sessions.get(sessionId);
  if (!transport) return res.status(404).send('Unknown or expired session');
  try {
    // Directly handle message to avoid double-reading the stream
    const payload = JSON.parse(req.body || '{}');
    await transport.handleMessage(payload);
    res.status(202).send('Accepted');
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to handle client message');
    res.status(400).send('Invalid message');
  }
});

// ------------------ REST endpoints (optional/testing) ------------------
app.use(express.json({ limit: '1mb' }));
// Mount existing REST-style MCP routes for simple testing
app.use('/mcp', mcpRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info({ port }, 'BudgetDate MCP server listening');
});
