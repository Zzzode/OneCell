// Channel self-registration barrel file.
// Each import triggers the channel module's registerChannel() call.
//
// NOTE: config must be initialized (via initConfig()) before this module is
// imported. This is guaranteed because index.ts uses a dynamic import for
// channels that runs after initConfig().

import { getAppConfig } from '../config.js';

const config = getAppConfig();

if (config.profile === 'terminal') {
  await import('./terminal.js');
} else if (config.profile === 'claw') {
  // Load remote channels (WhatsApp, Telegram, Discord etc.)
  // Currently only terminal is implemented, so this is a placeholder
  // In the future: await import('./whatsapp.js'); etc.
}
