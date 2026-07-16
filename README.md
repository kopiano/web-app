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

### git add .撤回
```sh
git restore --staged .
```

## Chat
### 获取联系人列表 (所有用户和群聊)
* 内容：联系人名称、头像、最后一条消息、未读消息数等
* 进入chat页面获取，使用RTK
* 接口加载中使用旋转圆形加载动画过渡, 替代加载文字
* 默认渲染mock数据，登录后不渲染mock数据
* 每次刷新都会重复接口请求，不需要用redis缓存
* 切换选中的联系人时，不要重新请求联系人列表
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

### 动态发布
功能
* 发布动态(支持文字、图片、视频)
* 获取所有动态(最新靠上)
* 使用 localStorage 保存当前页面
* 不要一次性获取所有或多个视频hls，一次只发送一个接口，点击视频封面后才发送接口
* 滚动播放，只播放一个视频，而不是一次性请求所有视频文件
* 播放器是一边播放，一边继续请求后面的 TS，而不是一次性请求所有ts文件
* 使用<video preload="metadata">或<video preload="none">而不是auto，否则浏览器可能主动下载大量数据

视频目前最大 300 MB, 采用分块流式写入，后可改为最大支持2GB，已改，上传速度也就十几秒，主要是后端ffmpeg转码速度可能比较慢点。
后端FFmpeg转码为HLS(.m3u8 + .ts)格式并生成封面, (需要brew install ffmpeg)
已支持"断点续传"：视频>200MB,网络不稳定,用户量大可考虑，网络断了可继续之前的上传进度！
300 MB 的理论上传时间：
上行速度      大约时间
━━━━━━━━━━  ━━━━━━━━━━
10 Mbps       4 分钟
──────────  ──────────
20 Mbps       2 分钟
──────────  ──────────
50 Mbps      48 秒
──────────  ──────────
100 Mbps      24 秒
实际通常会再慢 10%～20%，因此进度条是必要的。

视频显示大小：
横屏680 × 382，最大高度：600～700px，object-fit: contain，保证视频完整显示、不变形
后端保存视频的 width、height，前端根据比例渲染，无需等视频加载完成再计算布局
Twitter：宽度固定，高度根据比例计算

视频上传进度ui：
┌───────────────────────────────┐
│  🎬 vacation.mp4              │
│                               │
│ ████████████────────── 72%    │
│ 72 MB / 100 MB                │
│ 2.3 MB/s · 剩余 12 秒          │
└───────────────────────────────┘

浏览器 HTTP 缓存

faq：上传成功后一直显示Processing video？
进度条只统计原始视频上传进度。上传达到 100% 后，后端才开始执行 FFmpeg 转码、生成 HLS 分片和视频封面；
这个后台处理阶段没有向前端上报实时进度，前端只能轮询状态，所以一直显示 Processing video
处理时间主要取决于视频时长、分辨率、编码格式和服务器 CPU 性能，与上传进度无关。
要显示转码进度，需要解析 FFmpeg 的 -progress输出，将进度保存到 Redis 或数据库，并通过 WebSocket或轮询接口返回给前端

不要一次加载所有动态，开始只加载10条动态，向下滚动后继续追加加载10条动态，后面一样。LIMIT 10;
- GET /api/moment?limit=10，后端默认 10，最大限制 50。
- 初始只显示视频封面，不设置视频 src。
- 使用 IntersectionObserver 选择可视比例最高的视频。
- 首屏最多初始化 1 个 HLS 播放器，并静音自动播放。
- 用户开始滚动后预加载下一条视频，最多同时存在 2 个播放器。
- 视频离开激活范围后立即暂停、执行 hls.destroy()、清空 src 并释放缓冲区。
- HLS 缓冲长度从 30 秒降低到 12 秒，减少内存和流量占用。
页面首次加载
不初始化所有 HLS 播放器。
首屏只有第一个可见视频创建播放器（或者全部只显示封面，等进入视口再初始化）。
使用 IntersectionObserver
threshold: 0.6 或 0.7。
当视频超过 60% 可见时，将其设为当前播放视频。
全局维护一个 currentPlayingId
新视频进入可视区域：
暂停上一条视频；
播放当前视频；
更新 currentPlayingId。
保证任意时刻只有一个视频播放。
离开可视区域
调用 video.pause()。
对于距离当前较远的视频，可调用 hls.destroy() 释放缓冲和内存。
这种方案既能获得类似 Twitter 的滚动自动播放体验，又能避免你现在遇到的"进入页面就请求大量 .m3u8 和 .ts 文件"的问题，同时内存和网络占用也会低很多。
根因是当前代码先检测原生 HLS，Safari/WebKit 会直接走原生播放器，从而完全绕过 HLS.js 的 maxMaxBufferLength: 12；
优先使用 HLS.js。只有 HLS.js 不支持时才回退到原生 HLS。
google chrome无法保证同时保持滚动播放和不静音，要开静音video.muted = true

### 动态点赞、评论
  - 前端点赞和评论采用`乐观更新`，失败时自动回滚并提示。
  - 点赞接口支持`幂等`处理，重复点击不会产生重复记录或错误计数。
  - 评论限制为非空且最多 1000 字符。
接口：
  POST   /api/moment/{id}/like
  DELETE /api/moment/{id}/like
  POST   /api/moment/{id}/comment

- 视频真实播放达到 3 秒或 25% 后才调用 POST /moment/{id}/view；暂停、缓冲、提前划走不会继续计时。
- 前端会话内防止重复请求，页面显示后端返回的真实 view_count。
- Redis 使用“动态 + 用户 + 上海日期”去重，并在上海零点过期。

视频动态：播放达到 3 秒或 25% 后计数。
文字和图片动态：在动态超过 60% 可见并持续 1 秒 后调用 /moment/{id}/view，仍使用 Redis 按用户每日去重。

游客支持浏览量计数：
登录用户：按 user_id 去重统计。
游客：使用 visitor_id（UUID Cookie）去重统计。