import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getReqHeaders, makeSessionApiRequest, parseWikiUrl, ReqEx } from '../common/utils.js';

interface MwActionAllPagesWithContentResponse {
	query?: {
		pages?: {
			[id: string]: {
				pageid: number;
				ns: number;
				title: string;
				revisions?: {
					slots?: {
						main?: {
							'*'?: string; // legacy
							content?: string; // newer API (formatversion=2)
						};
					};
				}[];
			};
		};
	};
	continue?: {
		gapcontinue?: string;
		continue?: string;
	};
}

/**
 * MCP tool: list all wiki page titles and content (paginated).
 */
export function listAllPagesWithContentTool(server: McpServer): RegisteredTool {
	return server.tool(
		'list-all-pages-with-content',
		'List wiki page titles and their wikitext content (uses generator=allpages). Supports limit and continuation.',
		{
			server: z.string().url().describe( 'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).' ),
			limit: z.number().min(1).max(50).optional()
				.describe('Maximum number of pages to return (1–50, default=10).'),
			gapcontinue: z.string().optional()
				.describe('Pagination token (gapcontinue) to continue listing pages.')
		},
		{
			title: 'List all pages with content',
			readOnlyHint: true,
			destructiveHint: false
		} as ToolAnnotations,
		async ({ server,limit, gapcontinue },req) => handleListAllPagesWithContentTool(req,parseWikiUrl(server), limit, gapcontinue)
	);
}

export async function handleListAllPagesWithContentTool(
	req: ReqEx,
	server: string,
	limit?: number,
	gapcontinue?: string
): Promise<CallToolResult> {
	let data: MwActionAllPagesWithContentResponse | null = null;
	try {
		const [cookies,] = getReqHeaders(req)
		data = await makeSessionApiRequest(
			{
				action: 'query',
				generator: 'allpages',
				gaplimit: limit ? limit.toString() : '10',
				...(gapcontinue ? { gapcontinue } : {}),
				prop: 'revisions',
				rvslots: '*',
				rvprop: 'content',
				format: 'json'
			},
			server,
			{"Cookie":cookies}
		);
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to retrieve pages with content: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	const pages = data?.query?.pages || {};
	if (Object.keys(pages).length === 0) {
		return {
			content: [
				{
					type: 'text',
					text: 'No pages found.'
				} as TextContent
			]
		};
	}

	const results: TextContent[] = Object.values(pages).map((p) => {
		const content = p.revisions?.[0]?.slots?.main?.['*']
			|| p.revisions?.[0]?.slots?.main?.content
			|| '[No content]';
		return {
			type: 'text',
			text: [
				`Title: ${p.title}`,
				`PageID: ${p.pageid}, NS: ${p.ns}`,
				`Content:\n${content.substring(0, 500)}${content.length > 500 ? '... [truncated]' : ''}`
			].join('\n')
		};
	});

	if (data?.continue?.gapcontinue) {
		results.push({
			type: 'text',
			text: `More results available, use gapcontinue=${data.continue.gapcontinue} to continue.`
		});
	}

	return { content: results };
}

