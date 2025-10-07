import fetch, { Response } from 'node-fetch';
import { USER_AGENT } from '../server.js';
import FormData from 'form-data';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
export type ReqEx = RequestHandlerExtra<ServerRequest, ServerNotification>
async function fetchCore(
	baseUrl: string,
	options?: {
		params?: Record<string, string>;
		headers?: Record<string, string>;
		body?: Record<string, unknown>;
		method?: string;
	}
): Promise<Response> {
	let url = baseUrl;

	if ( url.startsWith( '//' ) ) {
		url = 'https:' + url;
	}

	if ( options?.params ) {
		const queryString = new URLSearchParams( options.params ).toString();
		if ( queryString ) {
			url = `${ url }?${ queryString }`;
		}
	}

	const requestHeaders: Record<string, string> = {
		'User-Agent': USER_AGENT
	};

	if ( options?.headers ) {
		Object.assign( requestHeaders, options.headers );
	}

	const fetchOptions: { headers: Record<string, string>; method?: string; body?: string } = {
		headers: requestHeaders,
		method: options?.method || 'GET'
	};
	if ( options?.body ) {
		fetchOptions.body = JSON.stringify( options.body );
	}
	const response = await fetch( url, fetchOptions );
	if ( !response.ok ) {
		const errorBody = await response.text().catch( () => 'Could not read error response body' );
		throw new Error(
			`HTTP error! status: ${ response.status } for URL: ${ response.url }. Response: ${ errorBody }`
		);
	}
	return response;
}

export async function makeApiRequest<T>(
	url: string,
	params?: Record<string, string>
): Promise<T | null> {
	const response = await fetchCore( url, {
		params,
		headers: { Accept: 'application/json' }
	} );
	return ( await response.json() ) as T;
}

export async function makeRestGetRequest<T>(
	path: string,
	wikiServer:string,
	appendHeaders:Record<string,string>,
	params?: Record<string, string>
): Promise<T | null> {
	try {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			...appendHeaders
		};
		
		const response = await fetchCore( `${ wikiServer }rest.php${ path }`, {
			params: params,
			headers: headers
		} );
		return ( await response.json() ) as T;
	} catch ( error ) {
		// console.error('Error making API request:', error);
		return null;
	}
}

export async function makeRestPutRequest<T>(
	path: string,
	body: Record<string, unknown>,
	wikiServer:string,
	appendHeaders:Record<string,string>
): Promise<T | null> {
	try {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...appendHeaders
		};
		
		
		const response = await fetchCore( `${ wikiServer }rest.php${ path }`, {
			headers: headers,
			method: 'PUT',
			body: body
		} );
		return ( await response.json() ) as T;
	} catch ( error ) {
		// console.error('Error making API request:', error);
		return null;
	}
}

export async function makeRestPostRequest<T>(
	path: string,
	wikiServer:string,
	appendHeaders:Record<string,string>,
	body?: Record<string, unknown>
): Promise<T | null> {
	try {
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...appendHeaders
		};
		
		
		const response = await fetchCore( `${ wikiServer }${ path }`, {
			headers: headers,
			method: 'POST',
			body: body
		} );
		return ( await response.json() ) as T;
	} catch ( error ) {
		// console.error('Error making API request:', error);
		return null;
	}
}

/**
 * New session-based API request function for MediaWiki API endpoints
 * Uses session cookies and CSRF tokens for authentication
 */
export async function makeSessionApiRequest(
	params: Record<string, string>,
	wikiServer:string,
	appendHeaders:Record<string,string>,
): Promise<any> {
	const headers: Record<string, string> = {
		'User-Agent': USER_AGENT,
		'Content-Type': 'application/x-www-form-urlencoded',
		...appendHeaders
	};

	const body = new URLSearchParams( params ).toString();

	const response = await fetch( `${ wikiServer }api.php`, {
		method: 'POST',
		headers: headers,
		body: body
	} );

	//throw new Error(`headers ${JSON.stringify(headers)} body ${JSON.stringify(body)}`)

	if ( !response.ok ) {
		const errorBody = await response.text().catch( () => 'Could not read error response body' );
		throw new Error( `HTTP error! status: ${ response.status } for URL: ${ response.url }. Response: ${ errorBody }` );
	}

	return await response.json();
}

/**
 * 专门用于 MediaWiki 文件上传的请求函数
 */
export async function makeSessionUploadRequest(
	params: Record<string, any>,
	wikiServer:string,
	appendHeaders:Record<string,string>,
): Promise<any> {

	// 构造 multipart/form-data
	const form = new FormData();
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === 'object' && value?.value && value?.options) {
			form.append(key, value.value, value.options); // 处理文件
		} else {
			form.append(key, value);
		}
	}

	const response = await fetch(`${wikiServer}api.php`, {
		method: 'POST',
		headers: {
			...form.getHeaders(),
			'User-Agent': USER_AGENT,
			...appendHeaders
		},
		body: form
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => 'Could not read error response body');
		throw new Error(
			`HTTP error! status: ${response.status} for URL: ${response.url}. Response: ${errorBody}`
		);
	}

	return await response.json();
}

export async function fetchPageHtml( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		return await response.text();
	} catch ( error ) {
		// console.error(`Error fetching HTML page from ${url}:`, error);
		return null;
	}
}

export async function fetchImageAsBase64( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from( arrayBuffer );
		return buffer.toString( 'base64' );
	} catch ( error ) {
		// console.error(`Error fetching image from ${url}:`, error);
		return null;
	}
}

export function getPageUrl(wikiServer:string, title: string ): string {
	return `${wikiServer}wiki/${ encodeURIComponent( title ) }`;
}

export function getReqHeaders(req:ReqEx):[string]{
	let cookies = req.requestInfo?.headers["reqcookie"] ?? "";
	if (Array.isArray(cookies)) {
		cookies = cookies[0];
	}
	return [cookies]
}

export function parseWikiUrl( wikiUrl: string ): string {
	const url = new URL( wikiUrl );
	return `${ url.protocol }//${ url.host }/`;
}
