import pino from 'pino';
export const log = pino({
  name: 'hyperlocal',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

