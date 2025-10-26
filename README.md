# MediaWiki MCP 服务器

基于 Model Context Protocol (MCP) 的 MediaWiki 服务器，支持用户名/密码认证，提供完整的 MediaWiki 页面管理、文件上传和 AI 图像生成功能。

## 功能特性

- 📝 **页面管理**：创建、更新、查询和搜索 MediaWiki 页面
- 📋 **批量操作**：支持批量创建和更新页面
- 🖼️ **图像处理**：AI 图像生成与上传到 MediaWiki
- 📁 **文件管理**：获取和上传文件到 MediaWiki
- 🔐 **会话认证**：支持基于用户名/密码的会话认证
- 🌐 **HTTP 传输**：通过 HTTP 协议提供 MCP 服务

## 快速开始

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/pubwiki/mediawiki-mcp.git
cd mediawiki-mcp

# 安装依赖
pnpm install

# 编译项目
pnpm run build

# 启动服务
pnpm run start
```

服务将在 `http://localhost:$PORT` 启动（端口由环境变量 PORT 指定）

### 使用 Docker 运行

1. 在工作目录中准备环境变量文件 `.mcp.env`
2. 构建并启动容器：

```bash
docker compose build
docker compose up
```

## 配置说明

### 1. 环境变量配置

创建 `.mcp.env` 文件并配置以下环境变量：

```bash

# 服务端口
PORT=8080

# MCP 传输协议（目前仅支持 'http'）
MCP_TRANSPORT=http
```

您也可以复制 `.mcp.env.example` 文件并重命名为 `.mcp.env`，然后修改其中的配置。

### 2. 身份认证配置

此 MCP 服务支持两种认证方式：

#### 方式 1：Cookie + CSRF Token 认证（传统方式）

调用此 MCP 服务时，需要在请求头中附加 MediaWiki 登录 Cookie。

##### 获取登录 Cookie 的步骤：

1. 调用 MediaWiki 的 `ClientLogin` API 获取 Cookie
2. 在调用 MCP 服务时，在请求头中添加 `reqcookie` 字段

##### 完整示例代码：

```typescript
import https from "https";

// Cookie 处理辅助函数
function getRetCookie(setCookieHeaders: string[] | string | null, cookies: string[]) {
    if (!setCookieHeaders) return cookies;

    const cookiesArray = Array.isArray(setCookieHeaders) 
        ? setCookieHeaders 
        : [setCookieHeaders];

    for (const cookieString of cookiesArray) {
        const cookie = cookieString.split(';')[0]; 
        const [name] = cookie.split('=');

        // 移除同名 cookie，保留最新的
        cookies = cookies.filter(c => !c.startsWith(name + '='));
        cookies.push(cookie);
    }
    return cookies;
}

async function authenticateAndUseMCP() {
    // 第一步：获取登录 Token
    const loginUrl = "https://pub.wiki/api.php?action=query&format=json&meta=tokens&type=login";
    const loginHeaders = {
        "User-Agent": "mediawiki-mcp-server/1.0.1",
        "Content-Type": "application/x-www-form-urlencoded",
    };

    const loginRep = await fetch(loginUrl, {
        method: "POST",
        headers: loginHeaders,
    });

    const loginData = await loginRep.json() as any;
    const loginToken = loginData.query?.tokens?.logintoken;

    console.log("登录 Token:", loginToken);

    let cookies = [] as string[];
    
    // 保存初始 Cookie
    cookies = getRetCookie(loginRep.headers.getSetCookie(), cookies);

    // 第二步：使用用户名和密码登录
    const clientLoginRep = await fetch(`https://pub.wiki/api.php`, {
        method: 'POST',
        headers: {
            ...loginHeaders,
            'Cookie': cookies.join('; ')
        },
        body: new URLSearchParams({
            action: 'clientlogin',
            username: "your_username",        // 替换为您的用户名
            password: "your_password",        // 替换为您的密码
            logintoken: loginToken,
            rememberMe: "true",
            loginpreservestate: "true",
            format: 'json'
        })
    });

    const loginResult = await clientLoginRep.json();
    console.log("登录结果:", loginResult);
    
    // 登录成功返回: { clientlogin: { status: 'PASS' } }
    // 登录失败返回: { clientlogin: { status: 'FAIL', message: '错误信息' } }
    
    // 保存登录后的 Cookie
    cookies = getRetCookie(clientLoginRep.headers.getSetCookie(), cookies);

    // 第三步：使用获取的 Cookie 连接 MCP 服务
    const transport = new HTTPClientTransport({
        url: "http://localhost:3000/mcp",
        headers: {
            "reqcookie": cookies.join('; '),  // 在请求头中附加 Cookie
        },
    });

    const mcp = await createMcpServer({
        transport,
    });

    // 第四步：使用 MCP 服务
    const result = await streamText({
        model: mcp.chatModel("default"),
        messages: [
            { role: "system", content: "你是一个有帮助的助手。" },
            { role: "user", content: "你好，能帮我列出 https://pub.wiki 中的页面吗？" },
        ],
    });
}
```

#### 方式 2：Bearer Token 认证（OAuth/API Token）

如果您的 MediaWiki 实例支持 OAuth 或 API Token 认证，可以直接使用 Bearer token。

##### 使用方式：

在调用 MCP 服务时，在请求头中添加 `Authorization` 字段：

```typescript
const transport = new HTTPClientTransport({
    url: "http://localhost:3000/mcp",
    headers: {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN",  // 使用 Bearer token
    },
});

const mcp = await createMcpServer({
    transport,
});
```

##### Bearer Token 认证的优势：

- ✅ **无需 CSRF Token**：Bearer token 本身已经提供了足够的安全性
- ✅ **更简单**：不需要通过多步骤登录流程获取 Cookie
- ✅ **更适合 API 调用**：特别适合服务端到服务端的通信
- ✅ **更好的权限控制**：可以为不同的应用生成不同权限的 token


## 可用工具

本 MCP 服务器提供以下工具：

- `create-page` - 创建新的 Wiki 页面
- `update-page` - 更新现有页面内容
- `get-page` - 获取页面内容
- `search-page` - 搜索页面
- `list-all-pages-titles` - 列出所有页面标题
- `list-all-pages-with-content` - 列出所有页面及其内容
- `get-page-history` - 获取页面历史记录
- `batch-create-page` - 批量创建页面
- `batch-update-page` - 批量更新页面
- `upload-image` - 上传图像到 MediaWiki
- `get-file` - 获取文件信息

## 开发指南

### 开发模式

```bash
# 使用 TypeScript watch 模式和 MCP Inspector
pnpm run dev

# HTTP 传输模式开发
pnpm run dev:streamableHttp
```

### 项目结构

```
src/
├── index.ts              # 入口文件
├── server.ts             # MCP 服务器核心逻辑
├── stdio.ts              # 标准输入输出传输
├── streamableHttp.ts     # HTTP 传输实现
├── common/               # 公共模块
│   ├── config.ts         # 配置管理
│   ├── contentModal.ts   # 内容模型
│   ├── tokenManager.ts   # Token 管理
│   └── utils.ts          # 工具函数
├── tools/                # MCP 工具实现
│   ├── create-page.ts
│   ├── update-page.ts
│   └── ...
└── types/                # TypeScript 类型定义
    └── mwRestApi.ts
```

## 技术栈

- **TypeScript** - 类型安全的开发体验
- **Model Context Protocol** - AI 应用的标准化接口
- **Express** - HTTP 服务器框架
- **AWS SDK** - S3 兼容存储集成
- **Node-fetch** - HTTP 客户端
- **Docker** - 容器化部署


## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MediaWiki API 文档](https://www.mediawiki.org/wiki/API:Main_page)
- [项目主页](https://github.com/pubwiki/mediawiki-mcp)

