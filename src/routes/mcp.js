import express from 'express';
import { z } from 'zod';
import { budgetDateTool, validateTool } from '../services/tools.js';

const router = express.Router();

// Debug: log MCP requests
router.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    console.log(`[MCP] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${ms}ms`);
  });
  next();
});

// MCP: list available tools
router.get('/tools/list', (_req, res) => {
  res.json({
    tools: [
      {
        name: 'validate',
        description: 'Validates bearer token and returns owner phone number',
        input_schema: {
          type: 'object',
          // token can be provided either in arguments or via Authorization: Bearer <token>
          properties: { token: { type: 'string' } },
        },
      },
      {
        name: 'budgetDate',
        description:
          'Given budget, city or coordinates, and preferences, returns a 3–4 step romantic itinerary as JSON',
        input_schema: {
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
  });
});

const CallSchema = z.object({
  name: z.enum(['validate', 'budgetDate']),
  arguments: z.record(z.any()).default({}),
});

// lightweight health for MCP
router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mcp', time: new Date().toISOString() });
});

// MCP: call tool
router.post('/tools/call', async (req, res) => {
  const parse = CallSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
  }
  const { name, arguments: args } = parse.data;
  try {
    if (name === 'validate') {
      // accept token from args, Authorization, or bearer_token alias
      let token = args?.token || args?.bearer_token;
      if (!token) {
        const auth = req.headers['authorization'] || '';
        const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
        if (m) token = m[1];
      }
      if (!token) {
        return res.status(401).json({ error: 'Missing bearer token' });
      }
      const phone = await validateTool({ token });
      return res.json({ content: [{ type: 'text', text: String(phone) }] });
    }
    if (name === 'budgetDate') {
      const result = await budgetDateTool(args);
      return res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    }
    return res.status(404).json({ error: 'Tool not found' });
  } catch (err) {
    req.log?.error({ err }, 'Tool execution failed');
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal error' });
  }
});

// POST /mcp — Puch connect handshake: validate bearer token and return phone
router.post('/', async (req, res) => {
  try {
    let token = req.body?.token || req.body?.bearer_token;
    if (!token) {
      const auth = req.headers['authorization'] || '';
      const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
      if (m) token = m[1];
    }
    if (!token) return res.status(401).json({ ok: false, error: 'Missing bearer token' });

    const phone = await validateTool({ token });
    return res.json({
      ok: true,
      phone: String(phone),
      // optional extras so clients don’t need another round-trip
      endpoints: { toolsList: '/mcp/tools/list', toolsCall: '/mcp/tools/call' },
      server: { name: 'BudgetDate MCP', version: '1.0.0' },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Simple index for Puch probes: GET /mcp
router.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'mcp',
    time: new Date().toISOString(),
    endpoints: {
      health: '/mcp/health',
      toolsList: '/mcp/tools/list',
      toolsCall: '/mcp/tools/call',
    },
  });
});

// Optional: fast HEAD for load balancers
router.head('/', (_req, res) => res.sendStatus(204));

export default router;
