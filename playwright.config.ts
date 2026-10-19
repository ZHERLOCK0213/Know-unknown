import { defineConfig } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const appURL = `${origin}${process.env.APP_BASE_PATH || '/'}`;
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1,
  use: { baseURL: appURL, channel: 'chrome', viewport: {width:390,height:844}, trace:'retain-on-failure' },
  webServer: { command:'npm run preview -- --port 4173 --strictPort', url:appURL, reuseExistingServer:false },
});
