/** Replaced at build time with the package version. */
declare const __TWFORGE_VERSION__: string;

interface Window {
  /** Set by the game on every game.php page. Extend with the fields the script needs. */
  game_data?: { world: string; screen: string; mode?: string };
  /** Set by the loader (dist/twforge.user.js) before it loads the main script. */
  TWForgeConfig?: { baseUrl: string };
}
