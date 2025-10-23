import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeSessionApiRequest, getPageUrl, getReqHeaders, ReqEx, parseWikiUrl } from '../common/utils.js';
import { tokenManager } from '../common/tokenManager.js';
import { EditContentFormat } from '../common/contentModal.js';

interface MwActionEditResponse {
	edit?: {
		result?: string;
		pageid?: number;
		title?: string;
		newrevid?: number;
		newtimestamp?: string;
	};
	error?: {
		code: string;
		info: string;
	};
}

interface PageCreateInput {
	title: string;
	source: string;
	comment?: string;
	contentModel?: EditContentFormat;
}

interface CreateResult {
	title: string;
	success: boolean;
	message: string;
	data?: MwActionEditResponse;
}

export function batchCreatePageTool(server: McpServer): RegisteredTool {
	return server.tool(
		'batch-create-page',
		'Batch creates multiple wiki pages with the provided content.',
		{
			server: z.string().url().describe(
				'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).'
			),
			pages: z.array(z.object({
				title: z.string().describe('Wiki page title'),
				source: z.string().describe('Page content in the format specified by the contentModel parameter. Must be [wikitext] format. Make sure format correct'),
				comment: z.string().describe('Reason for creating the page').optional(),
				contentModel: z.nativeEnum(EditContentFormat).describe(
					"Format of the page content to edit. default to 'wikitext', when editing css, use 'sanitized-css'"
				).optional()
			})).describe('Array of pages to create')
		},
		{
			title: 'Batch create pages',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async ({ server, pages }, req) =>
			handleBatchCreatePageTool(req, parseWikiUrl(server), pages)
	);
}

async function handleBatchCreatePageTool(
	req: ReqEx,
	server: string,
	pages: PageCreateInput[]
): Promise<CallToolResult> {
	const results: CreateResult[] = [];

	try {
		let [cookies] = getReqHeaders(req);
		let {csrftoken,cookies:newCookies } = await tokenManager.getToken(server,cookies)
		if(!csrftoken){
			throw new Error(`Cannot fetch token with cookie: ${cookies}`)
		}
		if(newCookies){
			cookies = newCookies;
		}

		for (const page of pages) {
			try {
				const data: MwActionEditResponse = await makeSessionApiRequest(
					{
						action: 'edit',
						title: page.title,
						text: page.source,
						summary: page.comment || 'Created via MCP (batch)',
						contentmodel: page.contentModel || EditContentFormat.wikitext,
						token: csrftoken,
						format: 'json'
					},
					server,
					{ "Cookie": cookies }
				);

				if (data.error) {
					results.push({
						title: page.title,
						success: false,
						message: data.error.info,
						data
					});
				} else {
					results.push({
						title: page.title,
						success: true,
						message: 'Created successfully',
						data
					});
				}
			} catch (error) {
				results.push({
					title: page.title,
					success: false,
					message: (error as Error).message
				});
			}
		}
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to batch create pages: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	return {
		content: batchCreatePageToolResult(results, server)
	};
}

function batchCreatePageToolResult(
	results: CreateResult[],
	server: string
): TextContent[] {
	const successCount = results.filter(r => r.success).length;
	const failCount = results.length - successCount;

	const summary = [
		`Batch create completed: ${successCount} succeeded, ${failCount} failed`,
		'',
		'Results:'
	];

	const details = results.map(result => {
		const status = result.success ? '✓' : '✗';
		const lines = [
			`${status} ${result.title}`,
			`  Status: ${result.success ? 'Success' : 'Failed'}`,
			`  Message: ${result.message}`
		];

		if (result.success && result.data?.edit) {
			lines.push(`  URL: ${getPageUrl(server, result.title)}`);
			lines.push(`  Page ID: ${result.data.edit.pageid || 'N/A'}`);
			lines.push(`  New revision: ${result.data.edit.newrevid || 'N/A'}`);
			lines.push(`  Timestamp: ${result.data.edit.newtimestamp || 'N/A'}`);
		}

		return lines.join('\n');
	});

	return [
		{
			type: 'text',
			text: [...summary, ...details].join('\n')
		}
	];
}
