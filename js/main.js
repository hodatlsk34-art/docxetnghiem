import { initInstall } from './install.js';
import { start, registerSW, setupDrop } from './app.js';

initInstall();
start();
registerSW();
setupDrop();
