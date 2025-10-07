import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { makeApiRequest, fetchPageHtml, parseWikiUrl } from '../common/utils.js';
import { handleListAllPagesWithContentTool } from './list-all-pages-with-content.js';
import { handleListAllPageTitlesTool } from './list-all-pages-titles.js';

const COMMON_SCRIPT_PATHS = [ '/w', '' ];

// TODO: Move these types to a dedicated file if we end up using Action API types elsewhere
interface MediaWikiActionApiSiteInfoGeneral {
	sitename: string;
	articlepath: string;
	scriptpath: string;
	server: string;
	servername: string;
	// Omitted other fields for now since we don't use them
}

interface MediaWikiActionApiSiteInfoQuery {
	general: MediaWikiActionApiSiteInfoGeneral;
}

interface MediaWikiActionApiResponse {
	query?: MediaWikiActionApiSiteInfoQuery;
}

interface WikiInfo {
	sitename: string;
	articlepath: string;
	scriptpath: string;
	server: string;
	servername: string;
}

export function loadWorldTool( server: McpServer ): RegisteredTool {
	return server.tool(
		'load-world',
		'load the world knowledge from the wiki.Use to init for starting chat;',
		{
			server: z.string().url().describe( 'the host URL of target wiki which you want to use for current session, it belike https://{WIKI_ID}.pub.wiki/ (e.g. https://somewhere.pub.wiki/).' ),
		},
		{
			title: 'Set wiki',
			destructiveHint: true
		} as ToolAnnotations,
		async ( {
			server
		},req ): Promise<CallToolResult> => {
			const contents = (await handleListAllPagesWithContentTool(req,parseWikiUrl(server), 50, undefined)).content as TextContent[];
			const titles = (await handleListAllPageTitlesTool(req,parseWikiUrl(server), 500, undefined)).content as TextContent[];
			return {
				content: [
					...contents,
					{
						type: 'text',
						text: `Wiki content loaded. It contains first 50 pages with content(with first 500 characters) above. `
					},
					{
						type: 'text',
						text: `Wiki titles: ${ titles.map( t => ( t as TextContent ).text ).join( ', ' ) }`
					} as TextContent,
					{
						type: 'text',
						text: `All page titles listed. If you find page tile some such as 'Main_Page', '首页' , you can get it's content by using 'get-page' tool to understand more about this wiki.`
					}
				]
			};
		}
	);
}

async function fetchWikiInfoFromApi(
	wikiServer: string, scriptPath: string
): Promise<WikiInfo | null> {
	const baseUrl = `${ wikiServer }${ scriptPath }/api.php`;
	const params = {
		action: 'query',
		meta: 'siteinfo',
		siprop: 'general',
		format: 'json',
		origin: '*'
	};

	let data: MediaWikiActionApiResponse | null = null;
	try {
		data = await makeApiRequest<MediaWikiActionApiResponse>( baseUrl, params );
	} catch ( error ) {
		console.error( `Error fetching wiki info from ${ baseUrl }:`, error );
		return null;
	}

	if ( data === null || data.query?.general === undefined ) {
		return null;
	}

	const general = data.query.general;

	// We don't need to check for every field, the API should be returning the correct values.
	if ( typeof general.scriptpath !== 'string' ) {
		return null;
	}

	return {
		sitename: general.sitename,
		scriptpath: general.scriptpath,
		articlepath: general.articlepath.replace( '/$1', '' ),
		server: general.server,
		servername: general.servername
	};
}
