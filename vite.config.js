import { defineConfig } from 'vite'

/**
 * 公開先は https://play.lightspirits.jp/raizin-tower/ 。
 * サイトのルート（play.lightspirits.jp）は site/index.html が受け持ち、
 * ゲーム本体はその下の raizin-tower/ に入る。
 * ローカルの dev はルートのままなので、これまで通り npm run dev で動く。
 */
const BASE = '/raizin-tower/'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? BASE : '/',
  build: {
    outDir: process.env.GITHUB_ACTIONS ? 'dist/raizin-tower' : 'dist',
    emptyOutDir: true,
  },
})
