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

### 更改提交代码用户名
```sh
GIT_ASKPASS= GIT_TERMINAL_PROMPT=1 \
git -c credential.helper= push origin main
Username for 'https://github.com': kopiano
Password for 'https://kopiano@github.com': <token>
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

### 切换联系人获取消息记录
| 场景               | 是否请求接口              |
| ---------------- | ------------------- |
| 第一次打开联系人         | ✅ 请求最近 30~50 条消息    |
| 再次切换回该联系人（缓存未过期） | ❌ 不请求，直接使用缓存        |
| 收到新消息            | ❌ WebSocket 直接追加到缓存 |
| 上滑查看更多历史         | ✅ 请求下一页历史           |
| 用户手动刷新           | ✅ 重新同步              |

React 内存缓存（最常用)
* Redux Store（默认）
* RTK Query（默认内存缓存）
切换联系人不会重新请求（因为缓存还在）
刷新整个网页后，会重新请求聊天记录
这是正常行为，也是微信网页版、Discord 网页版等常见做法

localStorage
特点：
✅ 刷新页面不会丢失
✅ 关闭浏览器再打开也还在
❌ 不适合缓存大量聊天记录
❌ 容易占用浏览器存储空间（一般约 5～10MB）
sessionStorage
特点：
✅ 刷新页面不会丢失
❌ 关闭标签页后清空

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
游客可以浏览所有动态，可以统计浏览量，点赞和评论按钮不可点击，点击会提示需要登录后才能使用

## music
### 转码
上传阶段：使用 FFmpeg 将各种音频统一转换为 AAC（.m4a） 或 MP3（320 kbps。现在使用AAc格式更好，以前多使用mp3兼容老设备。
存储阶段：保存原音频文件到对象存储（如 S3、OSS、R2）或本地存储，同时把元数据写入 PostgreSQL。我使用本地存储在src/assets/music。

AAC音质更好，文件更小，浏览器可以直接支持播放，减少带宽和存储。
原数据
```
song.mp3
      │
      ▼
FFmpeg / TagLib
      │
      ├── 标题
      ├── 歌手
      ├── 专辑
      ├── 时长
      ├── 比特率
      ├── 封面
      └── 采样率
```
存入数据库，前端进入播放页时只需获取这些信息即可。
```
music
-------
id
title
artist
album
duration
bitrate
cover_url
audio_url
format
size
created_at
```

音乐格式
✓ mp3
✓ m4a
✓ aac
✓ flac
✓ wav
✓ ogg
✓ opus

网易云音乐的ncm格式需要解密再用ffmpeg转码才行，大多数正规音乐平台都不会接受.ncm 上传，涉及音乐版权。
前端页面上传音乐后后`异步ffmpeg解码`，这个很费时间好几秒延迟

上传音乐流程：
React
    │
multipart/form-data
    │
Axum
    │
保存原始文件（或 OSS）
    │
INSERT music(status='processing')
    │
tokio::spawn(FFmpeg 转码)
    │
立即返回 { id, status: "processing" }
         │
         ├─ 前端轮询或 WebSocket
         ▼
FFmpeg 完成
    │
UPDATE music
SET
    status='ready',
    url='...',
    duration=...,
    format='aac'
    │
通知前端显示可播放
这种方式可以将用户感知的等待时间从 约 5 秒降低到不到 1 秒，而转码仍在后台完成，是生产环境中处理音视频上传最常见、体验最好的方案。

获取音乐流程：
* 进入Music页面，GET /music，显示所有音乐卡片（封面、标题、作者）
* 用户点击某首歌，GET /api/music/{id}，返回播放地址、歌词等
* audio 开始缓冲并播放，后台可预加载下一首歌曲

接口推荐：
获取音乐列表 GET  /music
获取歌曲详情（播放地址、歌词等）GET /api/music/:id
<!-- 返回音频流（或重定向到 CDN/OSS） GET /music/:id/stream -->暂时不用

上传音乐；
POST /music/upload
* 前端直接更新列表，上传成功，把新歌曲插入到 musicList 最前面
* 后端FFmpeg后台异步转码
* 通知前端WebSocket：FFmpeg完成WebSocket返回id,status: "ready",audio_url:"...".React更新该歌曲，整个列表不用刷新。

什么时候重新获取整个列表？
* 用户第一次进入 Music 页面
* 用户点击"刷新"

不要每次上传后重新获取整个音乐列表。 最佳实践是：
* 首次进入页面：获取一次音乐列表。
* 上传成功：将返回的新音乐直接插入前端列表。
* 转码完成：仅更新这首音乐的状态和播放地址。
* 只有在刷新、搜索、分页或排序变化时，才重新获取整个列表
这种方式网络请求更少，页面不会闪烁，用户体验也更接近 Spotify、Apple Music 等主流音乐平台。

歌词：AI 自动生成
上传 MP3，Whisper生成带时间轴字幕，转换成 LRC，保存 song.lrc


游客权限：
可以支持获取音乐列表、播放音乐等 （后续考虑添加查看歌词、播放量权限）
但不可以上传、收藏、删除音乐,设置按钮禁用并提示

重复音乐上传：
通常采用两层校验：
文件去重（Hash）：完全相同的文件只保存一份，直接提示已存在或复用已有资源。
歌曲去重（元数据）：根据 title + artist + duration（必要时再加 album、音频指纹）识别可能是同一首歌，但允许不同版本（如 Live、Remaster、无损版）共存。
因此，对于你的音乐网站，我建议采用以下策略：
Hash 相同 → 返回 409 Conflict，提示“该音乐已上传”，不覆盖。
Hash 不同，但元数据高度一致 → 提示“检测到可能重复，是否继续上传？”，由用户决定。

获取音乐需要使用分页查询，表格和卡片使用不同的page_size

### 音乐列表
可参考"Spotify"音乐网站
* 表格(每页10行)或小卡片展示(每页8个)
* 表格显示"1, logo 歌曲歌手, 专辑, 添加日期, 可添加图标,  时长, 三个横向圆点图标
* 分页图标为圆形毛玻璃风格箭头图标
* hover id如1时可显示播放图标，点击播放后一直显示4条长短不一的绿色竖线变化动画，hover竖线显示暂停图标，暂停后竖线变为id数字。
* 添加图标为十字圆形小图标，点击平滑变为绿色背景打勾图标

表格分页：
问题：切换分页时直接请求翻页，有加载比较慢
方案：RTK Query 缓存和下一页预取
命中缓存时立即更新当前页并取消 loading 态；未命中缓存时才显示加载态，后台请求完成后再更新。

### music Library

用户套餐付费计划：
首页：Library 卡片正常展示，并带一个小型 PRO 徽章和锁图标。
点击卡片：免费用户弹出毛玻璃风格的升级弹窗，介绍 Pro 功能与权益，并提供醒目的 Upgrade to Pro 按钮。
升级后：按钮直接跳转到支付/订阅流程，订阅成功后刷新用户信息，plan 从 free 更新为 pro，Library 即可正常访问。
后端：所有 Library 相关接口统一检查 plan，确保权限安全

plan                 VARCHAR(20) NOT NULL DEFAULT 'free', -- free/pro
subscription_status  VARCHAR(20) NOT NULL DEFAULT 'active', -- active/expired
subscription_start_at TIMESTAMPTZ,
subscription_end_at   TIMESTAMPTZ,


## video
播放器ui：Vidstack + HLS.js自定义播放器
使用ffmpeg解码成hls格式(.m3u8+ts)，播放hsl
视频保存在后端本地src/assets/video中
初始只显示视频封面，不设置视频src，封面图片懒加载<img loading="lazy">，不要第一页下载所有封面
页面只初始化一个hls播放器
播放进度保存，使用localStorage本地持久化
减少重渲染，hls生命周期一定要destroy()
网络不好要重连，监听error，恢复recoverMediaError()，否则播放器直接黑屏
视频不要提前加载，应该preload="metadata"，而不是auto，播放器配置：preload="metadata"、playsInline、muted 自动播放静音
视频封面FFmpeg：第2秒截图，第一帧容易黑屏，还是要智能选帧去黑屏等
页面切后台自动暂停，回来继续播放
移动端适配需要playsInline，否则直接全屏体验差
React Query管理分页、缓存和预取，Redux Toolkit（仅管理全局播放状态）
性能：离开可视区域立即暂停并销毁 HLS 实例，避免多个视频同时缓冲
采用分块流式写入,最大支持6GB，视频封面最大支持10MB

封面黑屏问题：
ffmpeg智能选帧而不是选2s的，因为有的可能还是黑屏，要过滤黑屏（blackdetect 或平均亮度）