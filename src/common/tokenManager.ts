import { USER_AGENT } from "../server.js";
import { createHash } from "crypto";

type TokenRecord = {
	token: string;
	cookie?: string;
	fetchedAt: number; // 时间戳（毫秒）
};

type TokenFetchResult = {
	csrftoken: string | null;
	cookies: string | null;
};

type TokenAuth = {
	cookies?: string;
	bearer?: string;
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

	private parseCookieHeader(cookie?: string): string[] {
		if (!cookie) {
			return [];
		}
		return cookie
			.split(';')
			.map((part) => part.trim())
			.filter((part) => part.length > 0);
	}

	private hasSessionCookie(setCookieHeaders: string[] | string | null): boolean {
		if (!setCookieHeaders) {
			return false;
		}
		const cookiesArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
		return cookiesArray.some((cookieString) => {
			const name = cookieString.split(';')[0] ?? '';
			const [cookieName] = name.split('=');
			return cookieName?.toLowerCase().includes('session');
		});
	}

	private buildKey(server: string, auth: TokenAuth): string {
		const identifier = auth.bearer
			? `bearer::${auth.bearer}`
			: `cookie::${auth.cookies ?? ''}`;
		return createHash('sha256').update(`${server}::${identifier}`).digest('hex');
	}

	private async fetchTokenWithBearer(server: string, bearer: string): Promise<TokenFetchResult> {
		try {
			const response = await fetch(`${server}api.php`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent': USER_AGENT,
					'Authorization': bearer
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
			return {
				csrftoken: data.query?.tokens?.csrftoken ?? null,
				cookies: null
			};
		} catch (error) {
			console.error('Error getting edit token with bearer:', error);
			return { csrftoken: null, cookies: null };
		}
	}

	private async fetchTokenWithCookies(server: string, cookie?: string): Promise<TokenFetchResult> {
		try {
			const initialCookieList = this.parseCookieHeader(cookie);
			const initialCookieHeader = initialCookieList.join('; ');

			const response0 = await fetch(`${server}api.php`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent': USER_AGENT,
					'Cookie': initialCookieHeader
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

			let cookieList = getRetCookie(response0.headers.getSetCookie(), [...initialCookieList]);
			let tokenResponse = response0;
			let tokenData = await response0.json() as EditTokenResponse;

			if (this.hasSessionCookie(response0.headers.getSetCookie())) {
				const updatedCookieHeader = cookieList.join('; ');

				tokenResponse = await fetch(`${server}api.php`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': USER_AGENT,
						'Cookie': updatedCookieHeader
					},
					body: new URLSearchParams({
						action: 'query',
						meta: 'tokens',
						format: 'json'
					})
				});

				if (!tokenResponse.ok) {
					throw new Error(`HTTP error! status: ${tokenResponse.status}`);
				}

				tokenData = await tokenResponse.json() as EditTokenResponse;
				cookieList = getRetCookie(tokenResponse.headers.getSetCookie(), cookieList);
			}

			const finalCookieHeader = cookieList.length > 0
				? cookieList.join('; ')
				: (cookie && cookie.length > 0 ? cookie : null);

			return {
				csrftoken: tokenData.query?.tokens?.csrftoken ?? null,
				cookies: finalCookieHeader
			};
		} catch (error) {
			console.error('Error getting edit token with cookies:', error);
			return { csrftoken: null, cookies: null };
		}
	}

	private async fetchToken(server: string, auth: TokenAuth): Promise<TokenFetchResult> {
		if (auth.bearer) {
			return this.fetchTokenWithBearer(server, auth.bearer);
		}
		return this.fetchTokenWithCookies(server, auth.cookies);
	}

	/**
	 * 获取 Token
	 */
	async getToken(server: string, auth: TokenAuth): Promise<TokenFetchResult> {
		if (!auth.bearer && !auth.cookies) {
			throw new Error('No authentication method provided');
		}

		const key = this.buildKey(server, auth);
		const record = this.tokens.get(key);

		if (record) {
			const now = Date.now();
			const age = now - record.fetchedAt;
			if (age < this.EXPIRATION) {
				return {
					csrftoken: record.token,
					cookies: record.cookie ?? null
				};
			}
		}

		// 过期或不存在，重新获取
		const newToken = await this.fetchToken(server, auth);

		if (newToken.csrftoken) {
			this.tokens.set(key, {
				token: newToken.csrftoken,
				fetchedAt: Date.now(),
				cookie: newToken.cookies ?? auth.cookies
			});
		}

		return {
			csrftoken: newToken.csrftoken,
			cookies: newToken.cookies ?? auth.cookies ?? null
		};
	}
}

export const tokenManager = new TokenManager()