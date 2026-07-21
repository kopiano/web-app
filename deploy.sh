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