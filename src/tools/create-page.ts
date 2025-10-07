import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ServerNotification, ServerRequest, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeSessionApiRequest, getPageUrl, getReqHeaders, ReqEx, parseWikiUrl } from '../common/utils.js';
import { tokenManager } from '../common/tokenManager.js';
import { EditContentFormat } from '../common/contentModal.js';

export function createPageTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'create-page',
		'Creates a wiki page with the provided content.',
		{
			server: z.string().url().describe( 'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).' ),
			source: z.string().describe( 'Page content in the format specified by the contentModel parameter. Must be [wikitext] format. Make sure format correct' ),
			title: z.string().describe( 'Wiki page title' ),
			comment: z.string().describe( 'Reason for creating the page' ).optional(),
			contentModel: z.nativeEnum( EditContentFormat ).describe( "Format of the page content to edit. default to 'wikitext', when editing css, use 'sanitized-css'" ).optional().default( EditContentFormat.wikitext )
		},
		{
			title: 'Create page',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async (
			{ server ,source, title, comment, contentModel }, req
		) => handleCreatePageTool(req ,parseWikiUrl(server) ,source, title, comment, contentModel )
	);
}

async function handleCreatePageTool(
	req: ReqEx,
	server: string,
	source: string,
	title: string,
	comment?: string,
	contentModel?: EditContentFormat
): Promise<CallToolResult> {
	let data: any = null;
	try {
		let [cookies] = getReqHeaders(req);
		const token = await tokenManager.getToken(server,cookies)
		if(!token[0]){
			throw new Error(`Cannot fetch token with cookie: ${cookies}`)
		}
		if(token[1]){
			cookies = token[1]
		}

		console.log("Source: ", source);
		//throw new Error(`get token with cookie: ${cookies} result ${token}`)
		// Use session-based API with edit action (which can create pages)
		data = await makeSessionApiRequest( {
			action: 'edit',
			title: title,
			text: source,
			summary: comment || 'Created via MCP',
			createonly: 'true', // This ensures we only create, not update existing
			contentmodel: contentModel || 'wikitext',
			token:token[0],
			format: 'json'
		},server,{"Cookie":cookies});
		
	} catch ( error ) {
		return {
			content: [
				{ type: 'text', text: `Failed to create page: ${ ( error as Error ).message }` } as TextContent
			],
			isError: true
		};
	}

	if ( data === null ) {
		return {
			content: [
				{ type: 'text', text: 'Failed to create page: No data returned from API' } as TextContent
			],
			isError: true
		};
	}

	if ( data.error ) {
		return {
			content: [
				{ type: 'text', text: `Failed to create page: ${ data.error.info }` } as TextContent
			],
			isError: true
		};
	}
	return {
		content: createPageToolResultSession(server, data, title )
	};
}

function createPageToolResultSession( server:string,result: any, title: string ): TextContent[] {
	return [
		{
			type: 'text',
			text: `Page created successfully: ${ getPageUrl(server,title ) }`
		},
		{
			type: 'text',
			text: [
				'Create result:',
				`Result: ${ result.edit?.result || 'Success' }`,
				`Page ID: ${ result.edit?.pageid || 'N/A' }`,
				`Title: ${ title }`,
				`New revision ID: ${ result.edit?.newrevid || 'N/A' }`,
				`Timestamp: ${ result.edit?.newtimestamp || 'N/A' }`
			].join( '\n' )
		}
	];
}
