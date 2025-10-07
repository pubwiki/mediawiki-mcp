import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getReqHeaders, ReqEx, makeRestPostRequest } from '../common/utils.js';
import { API_ENDPOINT } from '../common/config.js';

export function newWikiTool(server: McpServer): RegisteredTool {
	return server.tool(
		'new-wiki',
		'Submit a request to create a new wiki (sub-site) in the wiki farm. ' +
		'This process may take several minutes. The tool will return a task_id, ' +
		'which can be used later to check the creation status. ' +
		'Note: This does not immediately create the wiki, it only starts the creation task.',
		{
			name: z.string().describe('The display name of the new wiki.'),
			slug: z.string().describe('The unique slug identifier for the wiki (used in subdomain).'),
			language: z.string().describe('Language code, e.g. zh-hans, en.'),
			//template: z.string().describe('Optional: template wiki slug to base the new wiki on.').optional(),
			//visibility: z.enum(['public', 'private', 'unlisted']).describe(
			//	'Optional: visibility of the wiki. Default is public.'
			//).optional()
		},
		{
			title: 'Create wiki',
			readOnlyHint: false,
			destructiveHint: true
		} as ToolAnnotations,
		async ({ name, slug, language }, req) =>
			handleCreateWikiTool(req,  name, slug, language)
	);
}

async function handleCreateWikiTool(
	req: ReqEx,
	name: string,
	slug: string,
	language: string,
): Promise<CallToolResult> {
	let data: any = null;
	try {
		let [cookies] = getReqHeaders(req);
		data = await makeRestPostRequest(
            `provisioner/v1/wikis`,
            API_ENDPOINT,
            { Cookie: cookies },
			{
				name,
				slug,
				language
			}
		);
	} catch (error) {
		return {
			content: [
				{
					type: 'text',
					text: `Failed to create wiki: ${(error as Error).message}`
				} as TextContent
			],
			isError: true
		};
	}

	if ((!data)||(!data.task_id)) {
		return {
			content: [
				{ type: 'text', text: 'Failed to create wiki: No data returned from API' } as TextContent
			],
			isError: true
		};
	}

	if (data.error) {
		return {
			content: [
				{ type: 'text', text: `Failed to create wiki: ${data.error.info}` } as TextContent
			],
			isError: true
		};
	}
	return {
		content: createWikiToolResultSession(data, slug)
	};
}

function createWikiToolResultSession(result: any, slug: string): TextContent[] {
	return [
		{
			type: 'text',
			text: [
				`Wiki creation request submitted successfully.`,
				`Task ID: ${result.task_id || 'N/A'}`,
				`Slug: ${slug}`,
				`Status: The wiki is being created in the background. This may take several minutes.`,
                `Note for assistant: The task is in progress, you may end the conversation for now.`
			].join('\n')
		}
	];
}
