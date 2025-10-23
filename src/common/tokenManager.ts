import { USER_AGENT } from "../server.js";
import { createHash } from "crypto";

type TokenRecord = {
  token: string;
  cookie: string;
  fetchedAt: number; // 时间戳（毫秒）
};

interface EditTokenResponse {
	query: {
		tokens: {
			csrftoken: string;
		};
	};
}

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

export class TokenManager {
  private tokens: Map<string, TokenRecord> = new Map();
  private readonly EXPIRATION =  20 * 60 * 1000; // 20 min


  private buildKey(server: string, cookie: string): string {
    const hash = createHash('sha256').update(`${server}::${cookie}`).digest('hex');
    return hash;
  }

  async fetchToken(server: string, cookie: string):Promise<{csrftoken:string|null,cookies:string|null}>{
    try {
		const response0 = await fetch(`${server}api.php`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': USER_AGENT,
				'Cookie': cookie
			},
			body: new URLSearchParams({
				action: 'query',
				meta: 'tokens',
				format: 'json'
			})
		});

		if (!response0.ok) {
			throw new Error(`HTTP error! status: ${response0.status}`);
		}

        const cookies = getRetCookie(response0.headers.getSetCookie(),[]).join("; ")

        const response = await fetch(`${server}api.php`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': USER_AGENT,
				'Cookie': cookies
			},
			body: new URLSearchParams({
				action: 'query',
				meta: 'tokens',
				format: 'json'
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json() as EditTokenResponse;
		return {csrftoken:data.query?.tokens?.csrftoken || null,cookies};
	} catch (error) {
		console.error('Error getting edit token:', error);
		return {csrftoken:null,cookies:null};
	}
  }

  /**
   * 获取 Token
   */
  async getToken(server: string, cookie: string): Promise<{csrftoken:string|null,cookies:string|null}> {
    const key = this.buildKey(server, cookie);
    const record = this.tokens.get(key);

    if (record) {
      const now = Date.now();
      const age = now - record.fetchedAt;
      if (age < this.EXPIRATION) {
        return {csrftoken:record.token,cookies:record.cookie}; // 未过期，直接返回
      }
    }

    // 过期或不存在，重新获取
    const newToken = await this.fetchToken(server, cookie);
    if(newToken.csrftoken&&newToken.cookies){
        this.tokens.set(key, { token: newToken.csrftoken, fetchedAt: Date.now(),cookie:newToken.cookies});
    }
    return {csrftoken:newToken.csrftoken,cookies:newToken.cookies};
  }
}

export const tokenManager = new TokenManager()