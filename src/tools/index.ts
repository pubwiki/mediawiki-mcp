/* eslint-disable n/no-missing-import */
import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
/* eslint-enable n/no-missing-import */

import { getPageTool } from './get-page.js';
import { getPageHistoryTool } from './get-page-history.js';
import { updatePageTool } from './update-page.js';
import { getFileTool } from './get-file.js';
import { createPageTool } from './create-page.js';
import { loadWorldTool } from './load-world.js';
import { setTargetWikiTool } from './set-target-wiki.js';
import { listAllPageTitlesTool } from './list-all-pages-titles.js';
import { uploadImageTool } from './upload-image.js';
import { batchUpdatePageTool } from './batch-update-page.js';
import { batchCreatePageTool } from './batch-create-page.js';

const toolRegistrars = [
	getPageTool,
	getPageHistoryTool,
	//searchPageTool,
	//createImageToWikiTool,
	//createImageAndUploadToDO,
	loadWorldTool,
	listAllPageTitlesTool,
	//setWikiTool,
	updatePageTool,
	batchUpdatePageTool,
	getFileTool,
	createPageTool,
	batchCreatePageTool,
	uploadImageTool,
	setTargetWikiTool,
	
];

export function registerAllTools( server: McpServer ): RegisteredTool[] {
	const registeredTools: RegisteredTool[] = [];
	for ( const registrar of toolRegistrars ) {
		try {
			registeredTools.push( registrar( server ) );
		} catch ( error ) {}
	}
	return registeredTools;
}
