import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getAuthHeaders, makeSessionApiRequest, parseWikiUrl, ReqEx } from '../common/utils.js';

interface MwActionAllPagesResponse {
	query?: {
		allpages?: {
			pageid: number;
			ns: number;
			title: string;
		}[];
	};
	continue?: {
		apcontinue?: string;
		continue?: string;
	};
}

/**
 * MCP tool: list all wiki page titles (paginated).
 */
export function listAllPageTitlesTool(server: McpServer): RegisteredTool {
	return server.tool(
		'list-all-page-titles',
		'List wiki page titles (uses list=allpages). Supports limit, continuation, and namespace.',
		{
			server: z.string().url().describe(
				'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).'
			),
			limit: z.number().min(1).max(500).optional()
				.describe('Maximum number of pages to return (1–500, default=50).'),
			apcontinue: z.string().optional()
				.describe('Pagination token (apcontinue) to continue listing pages.'),
			namespace: z.number().optional().describe(
				`Restrict results to a specific namespace (default=0 for main/articles).
				Common namespaces:
				- 0: Main (articles)
				- 1: Talk
				- 2: User
				- 3: User talk
				- 4: Project (e.g. Wikipedia:)
				- 6: File
				- 8: MediaWiki (system messages)
				- 10: Template
				- 12: Help
				- 14: Category
				- -1: Special (not editable)`
			)
		},
		{
			title: 'List all page titles',
			readOnlyHint: true,
			destructiveHint: false
		} as ToolAnnotations,
		async ({ server, limit, apcontinue, namespace }, req) =>
			handleListAllPageTitlesTool(req, parseWikiUrl(server), limit, apcontinue, namespace)
	);
}

export async function handleListAllPageTitlesTool(
	req: ReqEx,
	server: string,
	limit?: number,
	apcontinue?: string,
	namespace?: number
): Promise<CallToolResult> {
	let data: MwActionAllPagesResponse | null = null;
	try {
		const headers = getAuthHeaders(req);
		data = await makeSessionApiRequest(
			{
				action: 'query',
				list: 'allpages',
				aplimit: limit ? limit.toString() : '10',
				...(apcontinue ? { apcontinue } : {}),
				...(namespace !== undefined ? { apnamespace: namespace.toString() } : {}),
				format: 'json'
			},
			server,
			headers
		);
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to retrieve page titles: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	const pages = data?.query?.allpages || [];
	if (pages.length === 0) {
		return {
			content: [
				{
					type: 'text',
					text: 'No pages found.'
				} as TextContent
			]
		};
	}

	const results: TextContent[] = pages.map((p) => ({
		type: 'text',
		text: `Title: ${p.title} (PageID: ${p.pageid}, NS: ${p.ns})`
	}));

	if (data?.continue?.apcontinue) {
		results.push({
			type: 'text',
			text: `More results available, use apcontinue=${data.continue.apcontinue} to continue.`
		});
	}

	return { content: results };
}
