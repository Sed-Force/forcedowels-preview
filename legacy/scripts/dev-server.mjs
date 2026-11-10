import { spawn } from 'node:child_process';

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vercel', 'dev', '--listen', '4173'],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
