import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import mcpRouter from './routes/mcp.js';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'BudgetDate MCP', version: '1.0.0' });
});

// Mount MCP routes at root for Puch compatibility
app.use('/', mcpRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info({ port }, 'BudgetDate MCP server listening');
});
