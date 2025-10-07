import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getReqHeaders, makeRestGetRequest, parseWikiUrl, ReqEx } from '../common/utils.js';
import type { MwRestApiPageObject } from '../types/mwRestApi.js';

export enum ContentFormat {
	noContent = 'noContent',
	withSource = 'withSource',
	withHtml = 'withHtml'
}

export function getPageTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'get-page',
		'Returns the standard page object for a wiki page, optionally including page source or rendered HTML, and including the license and information about the latest revision.2',
		{
			server: z.string().url().describe( 'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).' ),
			title: z.string().describe( 'Wiki page title' ),
			content: z.nativeEnum( ContentFormat ).describe( 'Format of the page content to retrieve' ).optional().default( ContentFormat.withSource )
		},
		{
			title: 'Get page',
			readOnlyHint: true,
			destructiveHint: false
		} as ToolAnnotations,
		async ( {server ,title, content } , req) => handleGetPageTool( req, parseWikiUrl(server), title, content )
	);
}

async function fetchSections(server: string, title: string): Promise<string[]> {
	const url = `${server}api.php?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch sections: ${res.statusText}`);
	const json = await res.json();
	return (json.parse?.sections ?? []).map((s: any) => s.line);
}

async function handleGetPageTool(req: ReqEx, server: string, title: string, content: ContentFormat): Promise<CallToolResult> {
	let subEndpoint: string;
	switch (content) {
		case ContentFormat.noContent: subEndpoint = '/bare'; break;
		case ContentFormat.withSource: subEndpoint = ''; break;
		case ContentFormat.withHtml: subEndpoint = '/with_html'; break;
	}

	let data: MwRestApiPageObject | null = null;
	try {
		const [cookies,] = getReqHeaders(req);
		data = await makeRestGetRequest<MwRestApiPageObject>(
			`/v1/page/${encodeURIComponent(title)}${subEndpoint}`,
			server,
			{ "Cookie": cookies }
		);
	} catch (error) {
		return {
			content: [{ type: 'text', text: `Failed to retrieve page data: ${(error as Error).message}` }],
			isError: true
		};
	}

	if (!data) {
		return {
			content: [{ type: 'text', text: 'Failed to retrieve page data: No data returned from API' }],
			isError: true
		};
	}

	// 🔑 这里额外调用 action=parse 获取 sections
	let sections: string[] = [];
	try {
		sections = await fetchSections(server, title);
	} catch (err) {
		// 如果失败，不影响主要流程
		sections = [];
	}

	return {
		content: getPageToolResult(data, sections)
	};
}


function getPageToolResult(result: MwRestApiPageObject, sections: string[]): TextContent[] {
	const results: TextContent[] = [
		{
			type: 'text',
			text: [
				`Page ID: ${result.id}`,
				`Title: ${result.title}`,
				`Sections: ${sections.map((s,i)=>`${s}[index:${i}]`).join(', ')}`
			].join('\n')
		}
	];

	if (result.source !== undefined) {
		results.push({ type: 'text', text: `Source:\n${result.source}` });
	}
	if (result.html !== undefined) {
		results.push({ type: 'text', text: `HTML:\n${result.html}` });
	}

	return results;
}