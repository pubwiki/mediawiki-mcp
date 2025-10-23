import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */

export function setTargetWikiTool(server: McpServer): RegisteredTool {
  return server.tool(
    "set-target-wiki",
    "Set the active target wiki for this editing session. This tool should be called once at the beginning. ",
    {
      server: z
        .string()
        .url()
        .describe(
          "The host URL of the target wiki to be used for this session. Example: https://{WIKI_ID}.pub.wiki/ (e.g., https://somewhere.pub.wiki/)."
        ),
    },
    {
      title: "Set Target Wiki",
      destructiveHint: true,
    } as ToolAnnotations,
    async (args: { server: string }): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text:
              `The editing session has been switched to: ${args.server}.\n` 
          } as TextContent,
        ],
      };
    }
  );
}
