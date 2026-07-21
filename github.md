# github page

step1: 阿里云：配置5个主机记录
主机记录    记录类型    记录值
@             A      185.199.108.153
@             A      185.199.109.153
@             A      185.199.110.153
@             A      185.199.111.153
www         CNAME    kopiano.github.io

step2: vite.config.ts
```ts
export default defineConfig({
  base: '/',
})
```
或者不写base

step3: github page: setting -> github pages -> custom domain
kopiano.cc

step4: deploy.sh
```sh
set -e

# 生成静态文件
pnpm run build

# 进入生成的文件夹
cd dist

# 复制 index.html 做 404.html（解决 SPA 路由刷新白屏）
# cp index.html 404.html

# 如果是发布到自定义域名
echo 'kopiano.cc' > CNAME

git init
git add .
git commit -m 'deploy'

git push -f https://github.com/kopiano/web-app.git HEAD:gh-pages

cd -
```

finaly: success
https://kopiano.cc