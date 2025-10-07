import { z } from 'zod';
/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, TextContent, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */

export function submitUpdatePageTool(server: McpServer): RegisteredTool {
  return server.tool(
    "submit-update-page",
    "Submit an update to an existing page. The modification is added to the pending change pool instead of being applied immediately.",
    {
      targetModify: z
        .string()
        .describe("The identifier of the page or section to be updated (e.g., full page ID or a section ID)."),
      originalContent: z
        .string()
        .describe("The current content before modification, provided for context and comparison."),
      newContent: z
        .string()
        .describe("The updated content that should replace the original."),
      targetSection: z
        .string()
        .optional()
        .describe("Optional: If only a specific section is being updated, provide its section identifier here."),
    },
    {
      title: "Submit Update: Existing Page",
      destructiveHint: false,
    } as ToolAnnotations,
    async ({ targetModify, originalContent, newContent, targetSection }): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text: `The proposed update has been submitted to the change pool.\nTarget: ${targetModify}${
              targetSection ? ` (section: ${targetSection})` : ""
            }`,
          } as TextContent,
        ],
      };
    }
  );
}

/**
 * Tool 2: Submit Creation of a New Page
 */
export function submitCreatePageTool(server: McpServer): RegisteredTool {
  return server.tool(
    "submit-create-page",
    "Submit the creation of a new page. The new page will be added to the pending change pool.",
    {
      title: z.string().describe("The title of the new page to be created."),
      content: z.string().describe("The full content of the new page."),
    },
    {
      title: "Submit Creation: New Page",
      destructiveHint: false,
    } as ToolAnnotations,
    async ({ title, content }): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text: `The new page titled “${title}” has been submitted to the change pool.`,
          } as TextContent,
        ],
      };
    }
  );
}

/**
 * Tool 3: Ask for User Confirmation to Submit Changes
 */
export function confirmSubmitChangesTool(server: McpServer): RegisteredTool {
  return server.tool(
    "confirm-submit-changes",
    "Ask the user to confirm whether the pending changes in the change pool should be submitted.",
    {},
    {
      title: "Confirm Submission of Changes",
      readOnlyHint: true,
    } as ToolAnnotations,
    async (): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text: "Stop generating responses and wait for the user to confirm whether to submit the pending changes.",
          } as TextContent,
        ],
      };
    }
  );
}

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
