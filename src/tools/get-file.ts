import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getReqHeaders, makeRestGetRequest, parseWikiUrl, ReqEx } from '../common/utils.js';
import type { MwRestApiFileObject } from '../types/mwRestApi.js';

export function getFileTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'get-file',
		'Returns information about a file, including links to download the file in thumbnail, preview, and original formats.',
		{
			server: z.string().url().describe( 'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).' ),
			title: z.string().describe( 'File title' )
		},
		{
			title: 'Get file',
			readOnlyHint: true,
			destructiveHint: false
		} as ToolAnnotations,
		async ( { server,title } ,req) => handleGetFileTool( req, parseWikiUrl(server), title )
	);
}

async function handleGetFileTool( req:ReqEx, server:string, title: string ): Promise< CallToolResult > {
	let data: MwRestApiFileObject | null = null;
	try {
		const [cookies, ] = getReqHeaders(req);
		data = await makeRestGetRequest<MwRestApiFileObject>( `/v1/file/${ encodeURIComponent( title ) }`, server , {"Cookie":cookies} );
	} catch ( error ) {
		return {
			content: [
				{ type: 'text', text: `Failed to retrieve file data: ${ ( error as Error ).message }` } as TextContent
			],
			isError: true
		};
	}

	if ( data === null ) {
		return {
			content: [
				{ type: 'text', text: 'Failed to retrieve file data: No data returned from API' } as TextContent
			],
			isError: true
		};
	}

	return {
		content: getFileToolResult( data )
	};
}

function getFileToolResult( result: MwRestApiFileObject ): TextContent[] {
	return [
		{
			type: 'text',
			text: [
				`File title: ${ result.title }`,
				`File description URL: ${ result.file_description_url }`,
				`Latest revision timestamp: ${ result.latest.timestamp }`,
				`Latest revision user: ${ result.latest.user.name }`,
				`Preferred URL: ${ result.preferred.url }`,
				`Original URL: ${ result.original.url }`,
				`Thumbnail URL: ${ result.thumbnail?.url }`
			].join( '\n' )
		}
	];
}
