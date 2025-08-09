import express from 'express';
import { z } from 'zod';
import { budgetDateTool, validateTool } from '../services/tools.js';

const router = express.Router();

// MCP: list available tools - mounted at /mcp/tools/list
router.get('/mcp/tools/list', (_req, res) => {
  res.json({
    tools: [
      {
        name: 'validate',
        description: 'Validates bearer token and returns owner phone number',
        input_schema: {
          type: 'object',
          required: ['token'],
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

// MCP: call tool - mounted at /mcp/tools/call
router.post('/mcp/tools/call', async (req, res) => {
  const parse = CallSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
  }
  const { name, arguments: args } = parse.data;
  try {
    if (name === 'validate') {
      const phone = await validateTool(args);
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

export default router;
