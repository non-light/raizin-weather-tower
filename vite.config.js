import { defineConfig } from 'vite'

// GitHub Pages のプロジェクトページは https://<user>.github.io/<repo>/ に置かれるので、
// アセットのパスにリポジトリ名を付ける必要がある。ローカルの dev では '/' のまま。
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/raizin-weather-tower/' : '/',
})
