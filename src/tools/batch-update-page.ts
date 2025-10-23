import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeSessionApiRequest, getPageUrl, ReqEx, getAuthHeadersWithToken, parseWikiUrl } from '../common/utils.js';
import { tokenManager } from '../common/tokenManager.js';
import { EditContentFormat } from '../common/contentModal.js';

interface MwActionEditResponse {
	edit?: {
		result?: string;
		pageid?: number;
		title?: string;
		oldrevid?: number;
		newrevid?: number;
		newtimestamp?: string;
	};
	error?: {
		code: string;
		info: string;
	};
}

interface PageUpdateInput {
	title: string;
	source: string;
	comment?: string;
	section?: string | number;
	contentModel?: EditContentFormat;
}

interface UpdateResult {
	title: string;
	success: boolean;
	message: string;
	data?: MwActionEditResponse;
}

export function batchUpdatePageTool(server: McpServer): RegisteredTool {
	return server.tool(
		'batch-update-page',
		'Batch updates multiple wiki pages (or specific sections) using the MediaWiki Action API (action=edit). ' +
		'IMPORTANT: Always CALL [get-page] first to fetch the latest version before editing. ' +
		'Whenever possible, prefer using the [section] parameter to perform incremental edits instead of overwriting the whole page.',
		{
			server: z.string().url().describe(
				'The host URL of target wiki for this session, e.g. https://{WIKI_ID}.pub.wiki/.'
			),
			pages: z.array(z.object({
				title: z.string().describe('Wiki page title'),
				source: z.string().describe('New content (either full page or specific section content).'),
				comment: z.string().describe('Summary of the edit').optional(),
				section: z.union([z.string(), z.number()])
					.describe(
						'Section identifier for incremental edits: "new" to add a new section, "0" for the lead section, or a section index. ' +
						'If input "all", the entire page will be replaced. Prefer section edits whenever possible.'
					).optional(),
				contentModel: z.nativeEnum(EditContentFormat).describe(
					"Format of the page content to edit. default to 'wikitext', when editing css, use 'sanitized-css'"
				).optional()
			})).describe('Array of pages to update')
		},
		{
			title: 'Batch update pages',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async ({ server, pages }, req) =>
			handleBatchUpdatePageTool(req, parseWikiUrl(server), pages)
	);
}

async function handleBatchUpdatePageTool(
	req: ReqEx,
	server: string,
	pages: PageUpdateInput[]
): Promise<CallToolResult> {
	const results: UpdateResult[] = [];
	
	try {
		const { headers, token } = await getAuthHeadersWithToken(req, server, tokenManager);
		
		// Process each page sequentially to avoid rate limiting
		for (const page of pages) {
			try {
				const section = page.section === "all" ? undefined : page.section;
				const params: Record<string, string> = {
					action: 'edit',
					title: page.title,
					text: page.source,
					summary: page.comment || 'Updated via MCP (batch)',
					format: 'json',
					contentmodel: page.contentModel || EditContentFormat.wikitext,
					token: token
				};
				
				if (section !== undefined) {
					params.section = String(section);
				}

				const data: MwActionEditResponse = await makeSessionApiRequest(
					params,
					server,
					headers
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
						message: 'Updated successfully',
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
					text: `Failed to batch update pages: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	return {
		content: batchUpdatePageToolResult(results, server)
	};
}

function batchUpdatePageToolResult(
	results: UpdateResult[],
	server: string
): TextContent[] {
	const successCount = results.filter(r => r.success).length;
	const failCount = results.length - successCount;

	const summary = [
		`Batch update completed: ${successCount} succeeded, ${failCount} failed`,
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
			lines.push(`  Old revision: ${result.data.edit.oldrevid || 'N/A'}`);
			lines.push(`  New revision: ${result.data.edit.newrevid || 'N/A'}`);
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
