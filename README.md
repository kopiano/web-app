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
    * 进入chat页面获取
      2. 将返回的会话列表存入全局状态（如Redux）或本地缓存。

    * 进入Chat页面：刷新数据
       - 核心原则是“增量合并”而非“全量覆盖（UI状态管理）
         1. 强刷模式（Hard Refresh）：当Store/缓存中无数据时，显示加载骨架屏或Loading图标，完全等待接口返回后渲染。
         2. 静默模式（Silent Refresh）：当Store/缓存中有数据时，立即展示旧数据（保证秒开），然后在后台调用接口，用新数据无闪
  烁地更新列表
       - 要区分“首次加载（骨架屏旋转圆形加载动画）”和“静默刷新（无感知）”两种UI状态
       - 获取与合并数据需要按 conversationID 进行合并，而不是直接替换整个数组。
    * 如果数据量较大，接口应支持分页
    * Loading状态：在数据加载和刷新期间，需要妥善管理页面的加载状态
    * 触发刷新的多种场景：
      - 进入页面时，除了生命周期钩子
      - 页面生命周期（onShow / useEffect）：从其他页面返回时，必须刷新（因为可能有已读回执或新消息）
    * 未读数归零：在 refresh 接口返回前，不要将本地未读数强制置零，完全以接口返回为准
    * 性能优化：
      - 防抖与节流：对刷新
      - 避免重复解析缓存、阻止并发刷新、限制短时间内重复请求、只在页面真正可见时刷新，并让 Chat 联系人
  数组保持稳定引用，减少无意义重渲染