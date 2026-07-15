# Tauri + React + Typescript

### Technology Stack
* 桌面：Tauri2
* 前端：
    * React19 + Vite7 + pnpm
    * Typescript + scss
    * react-router
    * axios
    * i18n
    * redux-toolkit (rtk)


### 功能
* music
* video
* chat

### packages
```sh
pnpm create tauri-app web-app --template react-ts # tarui, react, typescript
pnpm install -D sass                 # scss
pnpm install react-router-dom@latest # react-router
pnpm add @reduxjs/toolkit react-redux
```

### run a tauri app
1. install tauri
```sh
$ pnpm create tauri-app # method one
$ pnpm create tauri-app web-app --template react-ts # method two
```
2. install pnpm packages
```sh
pnpm install
```
3. run tauri
```sh
$ pnpm tauri dev
```


## TODO
### 使用github账号登录
推荐由后端完成 OAuth 流程，前端只负责跳转和接收登录结果。
GitHub Access Token 不应该暴露给前端
从 Cookie 读取 JWT，前端用 Redux Toolkit 保存用户资料
GET    /auth/github/login (window.location.href=url)
POST   /auth/logout
GET    /user/me


* GitHub 登录使用：window.location.href = url, 而不是axios
* 后端登录成功后设置：Set-Cookie: auth_token=...; HttpOnly; Secure; SameSite=Lax
    - Cookie 读取 JWT
* GET /api/users/me
* Redux Toolkit保存用户资料

```md
┌──────────────┐
│ React 登录页 │
└──────┬───────┘
       │
       │ 点击 GitHub 按钮
       ▼
GET /auth/github/login
       │
       ▼
GitHub 授权页面
       │
       │ 用户登录 GitHub
       │ 点击 Authorize
       ▼
GET /auth/github/callback
（后端Axum 处理）
       │
       │ 创建/登录用户
       │ 生成 JWT
       ▼
302 跳转
https://app.xxx.com/oauth/success
       │
       ▼
React
       │
       ▼
GET /users/me
       │
       ▼
Redux Toolkit
       │
       ▼
Header 更新头像
Sidebar 更新用户名
进入首页

```

### chat动态浏览量
```md
React Feed

        │
        │ IntersectionObserver
        ▼
动态进入屏幕（可见 ≥50%，停留 ≥2 秒）
        │
        ▼
POST /api/posts/{postId}/view
        │
        ▼
Axum
        │
        ├── JWT → user_id
        │
        └── 未登录 → visitor_id（Cookie）
        │
        ▼
Redis 判断是否重复浏览
(view:post:{postId}:{viewerId})
        │
   ┌────┴────┐
   │         │
 已存在    不存在
   │         │
 不统计   SET EX 30min
           │
           ▼
INCR post:{postId}:views
           │
           ▼
定时任务（每分钟）
           │
           ▼
PostgreSQL
UPDATE posts
SET view_count = view_count + 增量
WHERE id = {postId}
```


### 回退到指定commit版本
```sh
git log --oneline
git reset --hard 811b980
git push --force-with-lease origin main
```

## Chat
### 获取联系人列表 (所有用户和群聊)
* 内容：联系人名称、头像、最后一条消息、未读消息数等
* 进入chat页面获取，使用RTK
* 接口加载中使用旋转圆形加载动画过渡, 替代加载文字
* 默认渲染mock数据，登录后不渲染mock数据
* 每次刷新都会重复接口请求，不需要用redis缓存
faq：
* 刷新后选中的联系人改变了：使用 localStorage（或 URL）保存当前选中的联系人
* 刷新重复的接口请求：取消重复接口请求
* 每次刷新都去验证头像：现代网站几乎不让浏览器每次刷新读取验证头像，后端头像目录设置Cache-Control: public, max-age=31536000, immutable
性能优化：
    避免重复解析缓存、阻止并发刷新、限制短时间内重复请求、只在页面真正可见时刷新，并让 Chat 联系人数组保持稳定引用，减少无意义重渲染

### 在线状态
Redis 使用 online:{user_id} + TTL（例如 60 秒） 保存在线状态，
WebSocket 每 20~30 秒发送一次心跳，服务器收到后刷新 TTL。

### 发送消息
POST 负责发送消息（可靠写库）+ WebSocket 负责实时推送（即时更新）
流程：
1. 用户点击发送消息按钮，前端先乐观更新ui, 消息旁显示sending发送中的状态
2. 前端发送post /message
3. 后端axum检查请求参数，然后写入postgresql数据库，返回post结果，react更新status从sending改为sent
4. Post成功后WebSocket广播，Receiver收到消息加入聊天框
进入Chat页面建立WebSocket，保持整个聊天期间一个连接

注意：还需要ai来检查一遍问题并修复，有好几个高危风险bug

POST：发送消息、校验权限、写 PostgreSQL，确保消息可靠落库。
WebSocket：服务器主动推送消息和各种实时事件，保证聊天体验流畅。
React：采用乐观更新（optimistic UI），发送时先显示消息为 sending，POST 成功后更新为 sent，失败则显示重试或失败状态。


WebSocket负责哪些事情？
建议只负责实时事件，不负责业务写操作：
收到新消息
消息已送达（delivered）
消息已读（read）
对方正在输入（typing）
在线/离线状态变化
联系人最新消息预览更新
未读数实时变化
撤回消息、编辑消息等事件同步