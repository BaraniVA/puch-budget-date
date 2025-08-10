import express from 'express';
import { z } from 'zod';
import { budgetDateTool, validateTool } from '../services/tools.js';

const router = express.Router();

// CORS + cache headers for all MCP responses (must be BEFORE routes)
const allow = (_req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'no-store',
  });
};
router.use((req, res, next) => { allow(req, res); next(); });

// Debug: log MCP requests
router.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`[MCP] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${Date.now()-t}ms`));
  next();
});

// MCP: list available tools (refactor to reuse for /tools and /tools/list)
const toolsPayload = {
  tools: [
    {
      name: 'validate',
      description: 'Validates bearer token and returns owner phone number',
      input_schema: {
        type: 'object',
        required: [], // explicit, some clients expect this field
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
};

router.get('/tools/list', (_req, res) => res.json(toolsPayload));

// Alias some clients use: GET /mcp/tools
router.get('/tools', (_req, res) => res.json(toolsPayload));

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
router.head('/', (_req, res) => res.sendStatus(200));

// Direct validate alias some clients try: POST /mcp/tools/validate
router.post('/tools/validate', async (req, res) => {
  try {
    let token = req.body?.token || req.body?.bearer_token;
    if (!token) {
      const auth = req.headers['authorization'] || '';
      const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
      if (m) token = m[1];
    }
    if (!token) return res.status(401).json({ ok: false, error: 'Missing bearer token' });
    const phone = await validateTool({ token });
    res.json({ ok: true, phone: String(phone) });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// New: direct validate alias some clients use: POST /mcp/validate
router.post('/validate', async (req, res) => {
  try {
    let token = req.body?.token || req.body?.bearer_token;
    if (!token) {
      const auth = req.headers['authorization'] || '';
      const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(auth) ? auth[0] : auth);
      if (m) token = m[1];
    }
    if (!token) return res.status(401).json({ ok: false, error: 'Missing bearer token' });
    const phone = await validateTool({ token });
    res.json({ ok: true, phone: String(phone) });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Keep HEAD=200, OPTIONS=204 for all endpoints
router.options('/', (_req, res) => res.sendStatus(204));
router.options('/tools', (_req, res) => res.sendStatus(204));
router.options('/tools/list', (_req, res) => res.sendStatus(204));
router.options('/tools/call', (_req, res) => res.sendStatus(204));
router.options('/tools/validate', (_req, res) => res.sendStatus(204));
router.options('/validate', (_req, res) => res.sendStatus(204));

// Optional: explicit HEAD handlers for tools endpoints
router.head('/tools', (_req, res) => res.sendStatus(200));
router.head('/tools/list', (_req, res) => res.sendStatus(200));
router.head('/tools/call', (_req, res) => res.sendStatus(200));

export default router;
