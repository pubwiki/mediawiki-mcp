# MediaWiki MCP Server
 MediaWiki MCP Server.


## Quick Start

### Run in locl

```bash
git clone
pnpm install
pnpm run dev
```
will serve at http://localhost:$PORT

### Run with docker
put environment file (.mcp.env) in work dir

```shell
docker compose build
docker compose up
```



### Configuration

1. **Set Environment Variables**:
```
MODELSCOPE_API_KEY = # use for create image
DO_SPACE_ENDPOINT= # s3 bucket to upload an image then get public url
DO_SPACE_KEY=
DO_SPACE_BUCKET=
DO_SPACE_SECRET=
PORT= # e.g 8080
MCP_TRANSPORT= #now only support 'http'
```
or edit '.mcp.env.example',then rename to '.mcp.env'

2.**Append Cookie in Request Header**

call ``ClientLogin`` API to catch cookie, then append a header ``reqcookie=LOGIN_RET_COOKIE`` when you call this mcp.

```typescript
import https from "https";

function getRetCookie(setCookieHeaders: string[] | string | null,cookies:string[]){
	if (!setCookieHeaders) return cookies;

	const cookiesArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

	for (const cookieString of cookiesArray) {
		const cookie = cookieString.split(';')[0]; 
		const [name] = cookie.split('=');

		cookies = cookies.filter(c => !c.startsWith(name + '='));
		cookies.push(cookie);
	}
    return cookies
}

async function test() {
    const loginUrl = "https://pub.wiki/api.php?action=query&format=json&meta=tokens&type=login";
    const loginHeaders = {
        "User-Agent": "mediawiki-mcp-server/1.0.1",
        "Content-Type": "application/x-www-form-urlencoded",
    };

    const loginRep = await fetch(loginUrl, {
        method: "POST",
        headers:loginHeaders,
    });

    const loginData = await loginRep.json() as any;
    const loginToken = loginData.query?.tokens?.logintoken;

    console.log(loginToken)

    let cookies = [] as string[]
    
    cookies = getRetCookie(loginRep.headers.getSetCookie(),cookies)

    const clientLoginRep = await fetch(`https://pub.wiki/api.php`, {
        method: 'POST',
        headers: {
            ...loginHeaders,
            'Cookie': cookies.join('; ')
        },
        body: new URLSearchParams({
            action: 'clientlogin',
            username: "username",
            password: "password",
            logintoken: loginToken,
            rememberMe: "true",
            loginpreservestate: "true",
            format: 'json'
        })
    });

    console.log(await clientLoginRep.json()) // { clientlogin: { status: 'PASS' } } or { clientlogin: { status: 'FAIL', message:'errmsg' } } 
    cookies = getRetCookie(clientLoginRep.headers.getSetCookie(),cookies)

    const transport = new HTTPClientTransport({
      url: "http://localhost:3000/mcp", //
      headers: {
        "reqcookie": cookies,
      },
    });

    const mcp = await createMcpServer({
      transport,
    });

    const result = await streamText({
      model: mcp.chatModel("default"),
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello, Can u help me to list page in `https://pub.wiki`?" },
      ],
    });
}
```

### Usage
```bash
pnpm run start
```

