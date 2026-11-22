import { createApiClient } from './api/client.ts';

function main(): void {
  const game = window.game_data;
  if (!game) throw new Error('game_data is missing: not a Tribal Wars game page?');

  const api = createApiClient(window.TWForgeConfig?.baseUrl, () => window.localStorage.getItem('twforge.apiKey'));
  void api; // TODO: hand the client to the features once there are any.

  console.info(`[twforge] v${__TWFORGE_VERSION__} loaded on world ${game.world}, screen=${game.screen}`);
}

try {
  main();
} catch (error) {
  // A failure in the script must never break the game page; report it and stop.
  console.error('[twforge] stopped:', error);
}
