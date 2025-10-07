import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeSessionApiRequest, getPageUrl, ReqEx, getReqHeaders, parseWikiUrl } from '../common/utils.js';
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

export function updatePageTool(server: McpServer): RegisteredTool {
	return server.tool(
		'update-page',
		'Updates a wiki page (or a specific section) using the MediaWiki Action API (action=edit). ' +
		'IMPORTANT: Always CALL [get-page] first to fetch the latest version before editing. ' +
		'Whenever possible, prefer using the [section] parameter to perform incremental edits instead of overwriting the whole page. ' +
		'You can determine the correct section index from the section list returned by [get-page]. ' +
		'Only fall back to full-page edits when section-based editing is not feasible.',
		{
		server: z.string().url().describe(
			'The host URL of target wiki for this session, e.g. https://{WIKI_ID}.pub.wiki/.'
		),
		title: z.string().describe('Wiki page title'),
		source: z.string().describe('New content (either full page or specific section content).'),
		comment: z.string().describe('Summary of the edit').optional(),
		section: z.union([z.string(), z.number()])
			.describe(
			'Section identifier for incremental edits: "new" to add a new section, "0" for the lead section, or a section index. ' +
			'If input "all", the entire page will be replaced. Prefer section edits whenever possible.'
			).optional(),
		contentModel: z.nativeEnum( EditContentFormat ).describe( "Format of the page content to edit. default to 'wikitext', when editing css, use 'sanitized-css'" ).optional().default( EditContentFormat.wikitext )
		},
		
		{
			title: 'Update page',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async ({ server, title, source, comment, section, contentModel }, req) =>
			handleUpdatePageTool(req, parseWikiUrl(server), title, source, comment, section==="all"?undefined:section, contentModel)
	);
}

async function handleUpdatePageTool(
	req: ReqEx,
	server: string,
	title: string,
	source: string,
	comment?: string,
	section?: string | number,
	contentModel?: EditContentFormat
): Promise<CallToolResult> {
	let data: MwActionEditResponse | null = null;
	try {
		const params: Record<string, string> = {
			action: 'edit',
			title,
			text: source,
			summary: comment || 'Updated via MCP',
			format: 'json',
			contentmodel: contentModel || EditContentFormat.wikitext
		};
		if (section !== undefined) {
			params.section = String(section);
		}

		let [cookies] = getReqHeaders(req);
		let token = await tokenManager.getToken(server,cookies)
		if(!token[0]){
			throw new Error(`Cannot fetch token with cookie: ${cookies}`)
		}
		if(token[1]){
			cookies = token[1]
		}
		params.token = token[0];
		data = await makeSessionApiRequest(params, server, {"Cookie":cookies});
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to update page: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	if (!data) {
		return {
			content: [
				{
					type: 'text',
					text: 'Failed to update page: No data returned from API'
				} as TextContent
			],
			isError: true
		};
	}

	if (data.error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to update page: ${data.error.info}`
				} as TextContent
			],
			isError: true
		};
	}

	return {
		content: updatePageToolResult(data, parseWikiUrl(server), title)
	};
}

function updatePageToolResult(
	result: MwActionEditResponse,
	server: string,
	title: string
): TextContent[] {
	return [
		{
			type: 'text',
			text: `Page updated successfully: ${getPageUrl(server, title)}`
		},
		{
			type: 'text',
			text: [
				'Update result:',
				`Result: ${result.edit?.result || 'Success'}`,
				`Page ID: ${result.edit?.pageid || 'N/A'}`,
				`Title: ${title}`,
				`Old revision ID: ${result.edit?.oldrevid || 'N/A'}`,
				`New revision ID: ${result.edit?.newrevid || 'N/A'}`,
				`Timestamp: ${result.edit?.newtimestamp || 'N/A'}`
			].join('\n')
		}
	];
}
