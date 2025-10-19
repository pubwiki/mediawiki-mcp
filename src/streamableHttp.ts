#!/usr/bin/env node

import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
/* eslint-disable n/no-missing-import */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { createServer } from './server.js';

const app = express();

// Enable CORS for all origins
app.use( ( req, res, next ) => {
	res.header( 'Access-Control-Allow-Origin', '*' );
	res.header( 'Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS' );
	res.header( 'Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, reqcookie' );
	
	// Handle preflight requests
	if ( req.method === 'OPTIONS' ) {
		res.sendStatus( 200 );
		return;
	}
	
	next();
} );

app.use( express.json() );

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.post( '/mcp', async ( req: Request, res: Response ) => {
	const sessionId = req.headers[ 'mcp-session-id' ] as string | undefined;
	let transport: StreamableHTTPServerTransport;
	res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

	if ( sessionId && transports[ sessionId ] ) {
		transport = transports[ sessionId ];
	} else if ( !sessionId && isInitializeRequest( req.body ) ) {
		transport = new StreamableHTTPServerTransport( {
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: ( sessionId ) => {
				transports[ sessionId ] = transport;
			}
		} );

		transport.onclose = () => {
			if ( transport.sessionId ) {
				delete transports[ transport.sessionId ];
			}
		};
		const server = createServer();

		await server.connect( transport );
	} else {
		res.status( 400 ).json( {
			jsonrpc: '2.0',
			error: {
				code: -32000,
				message: 'Bad Request: No valid session ID provided'
			},
			id: null
		} );
		return;
	}

	await transport.handleRequest( req, res, req.body );
} );

const handleSessionRequest = async ( req: Request, res: Response ): Promise<void> => {
	const sessionId = req.headers[ 'mcp-session-id' ] as string | undefined;
	if ( !sessionId || !transports[ sessionId ] ) {
		res.status( 400 ).send( 'Invalid or missing session ID' );
		return;
	}

	const transport = transports[ sessionId ];
	await transport.handleRequest( req, res );
};

app.get( '/mcp', handleSessionRequest );

app.delete( '/mcp', handleSessionRequest );

const PORT = process.env.PORT || 3000;
app.listen( PORT as any,"0.0.0.0", () => {
	console.error( `MCP Streamable HTTP Server listening on port ${ PORT }` );
} );
