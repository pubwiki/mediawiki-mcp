import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { getReqHeaders, ReqEx, makeRestPostRequest, parseWikiUrl } from '../common/utils.js';


/**
 * 提取 URL 中的顶级域名（保留协议）
 * @param url - 完整的 URL 字符串
 * @returns 只包含协议和顶级域名的 URL
 * @example
 * extractTopLevelDomain('https://aaa.pub.wiki') // 'https://pub.wiki'
 * extractTopLevelDomain('http://pub.wiki') // 'http://pub.wiki'
 * extractTopLevelDomain('https://123.yuri.rs') // 'https://yuri.rs'
 */
export function extractTopLevelDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // 分割主机名
    const parts = hostname.split('.');
    
    // 如果只有两个部分或更少，直接返回
    if (parts.length <= 2) {
      return `${urlObj.protocol}//${hostname}`;
    }
    
    // 提取最后两个部分作为顶级域名
    const topLevelDomain = parts.slice(-2).join('.');
    
    return `${urlObj.protocol}//${topLevelDomain}`;
  } catch (error) {
    // 如果 URL 解析失败，返回原始 URL
    console.error('Invalid URL:', url, error);
    return url;
  }
}

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
			server: z.string().url().describe("The BASE-URL of the Wikifarm MediaWiki server. E.g. https://pub.wiki/ https://somefarm.org/")
        },
        {
            title: 'Create wiki',
            readOnlyHint: false,
            destructiveHint: true
        } as ToolAnnotations,
        async ({ name, slug, language, server }, req) =>
            handleCreateWikiTool(req,  name, slug, language, server)
    );
}

async function handleCreateWikiTool(
    req: ReqEx,
    name: string,
    slug: string,
    language: string,
    server: string
): Promise<CallToolResult> {
    let data: any = null;
    try {
        let [cookies] = getReqHeaders(req);
        
        // TODO: 获取 userId
        const userId = ''; // 待实现

		const serverUrl = parseWikiUrl(server);
        
        data = await makeRestPostRequest(
            `api/v1/users/${userId}/wikis`,
            extractTopLevelDomain(serverUrl),
            { 
                Cookie: cookies,
                'Content-Type': 'application/json'
            },
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