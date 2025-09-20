import pino from 'pino';
export const log = pino({
  name: 'hyperlocal',
  level: process.env.LOG_LEVEL || 'info'
});
