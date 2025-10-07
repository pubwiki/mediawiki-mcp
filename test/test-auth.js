#!/usr/bin/env node

import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    if (process.env.CONFIG) {
        config = JSON.parse(readFileSync(process.env.CONFIG, 'utf-8'));
    } else {
        // Try to load from parent directory
        config = JSON.parse(readFileSync(join(__dirname, '../config.json'), 'utf-8'));
    }
} catch (error) {
    console.error('❌ Could not load config file. Using environment variables.');
    config = {
        defaultWiki: 'env',
        wikis: {
            'env': {
                sitename: 'Environment Config',
                server: process.env.MEDIAWIKI_API_URL?.replace('/api.php', '') || 'http://localhost',
                articlepath: '/wiki',
                scriptpath: '/w',
                username: process.env.MEDIAWIKI_USERNAME,
                password: process.env.MEDIAWIKI_PASSWORD
            }
        }
    };
}

const wikiConfig = config.wikis[config.defaultWiki];
if (!wikiConfig) {
    console.error('❌ No wiki configuration found');
    process.exit(1);
}

const userAgent = 'MediaWiki-MCP-Auth-Test/1.0';

async function testAuthentication() {
    console.log('🧪 Testing MediaWiki MCP Server Authentication');
    console.log('=' .repeat(50));
    
    console.log(`📡 Wiki: ${wikiConfig.sitename}`);
    console.log(`🌐 Server: ${wikiConfig.server}`);
    console.log(`👤 Username: ${wikiConfig.username}`);
    console.log(`🔐 Password: ${'*'.repeat(wikiConfig.password?.length || 0)}`);
    console.log('');
    
    if (!wikiConfig.username || !wikiConfig.password) {
        console.error('❌ Missing username or password in configuration');
        return false;
    }
    
    let sessionCookies = '';
    
    try {
        // Step 1: Test API availability
        console.log('🔍 Step 1: Testing API availability...');
        const apiUrl = `${wikiConfig.server}${wikiConfig.scriptpath}/api.php`;
        const apiTest = await fetch(apiUrl + '?action=query&meta=siteinfo&format=json');
        
        if (!apiTest.ok) {
            throw new Error(`API not accessible: ${apiTest.status} ${apiTest.statusText}`);
        }
        
        const siteInfo = await apiTest.json();
        console.log(`✅ API accessible - MediaWiki ${siteInfo.query?.general?.generator || 'Unknown version'}`);
        
        // Step 2: Get login token
        console.log('🎫 Step 2: Getting login token...');
        const loginTokenResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'action=query&meta=tokens&type=login&format=json'
        });

        const loginTokenData = await loginTokenResponse.json();
        const loginToken = loginTokenData?.query?.tokens?.logintoken;
        
        if (!loginToken) {
            throw new Error('Failed to get login token');
        }
        
        console.log('✅ Login token obtained');

        // Extract cookies from login token request
        const setCookieHeader = loginTokenResponse.headers.raw()['set-cookie'];
        if (setCookieHeader) {
            sessionCookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
        }

        // Step 3: Client login
        console.log('🔑 Step 3: Attempting client login...');
        const clientLoginParams = new URLSearchParams({
            action: 'clientlogin',
            username: wikiConfig.username,
            password: wikiConfig.password,
            logintoken: loginToken,
            loginreturnurl: wikiConfig.server,
            format: 'json'
        });
        
        const clientLoginResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': sessionCookies
            },
            body: clientLoginParams.toString()
        });

        const clientLoginData = await clientLoginResponse.json();
        
        if (clientLoginData?.clientlogin?.status !== 'PASS') {
            throw new Error(`Client login failed: ${clientLoginData?.clientlogin?.message || 'Unknown error'}`);
        }
        
        console.log(`✅ Login successful as: ${clientLoginData.clientlogin.username}`);

        // Update cookies from clientlogin response
        const clientLoginSetCookieHeader = clientLoginResponse.headers.raw()['set-cookie'];
        if (clientLoginSetCookieHeader) {
            const newCookies = clientLoginSetCookieHeader.map(cookie => cookie.split(';')[0]);
            const existingCookies = sessionCookies.split('; ').filter(c => c);
            const allCookies = [...existingCookies];
            
            newCookies.forEach(newCookie => {
                const [name] = newCookie.split('=');
                const existingIndex = allCookies.findIndex(c => c.startsWith(name + '='));
                if (existingIndex >= 0) {
                    allCookies[existingIndex] = newCookie;
                } else {
                    allCookies.push(newCookie);
                }
            });
            
            sessionCookies = allCookies.join('; ');
        }

        // Wait for session to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Step 4: Get edit token
        console.log('🎟️  Step 4: Getting edit token...');
        const editTokenResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': sessionCookies
            },
            body: 'action=query&meta=tokens&format=json'
        });

        const editTokenData = await editTokenResponse.json();
        const editToken = editTokenData?.query?.tokens?.csrftoken;

        if (!editToken || editToken === '+\\') {
            throw new Error('Failed to get valid edit token');
        }
        
        console.log('✅ Edit token obtained');

        // Step 5: Test user info
        console.log('👤 Step 5: Verifying user info...');
        const userInfoResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': sessionCookies
            },
            body: 'action=query&meta=userinfo&uiprop=rights|groups&format=json'
        });

        const userInfoData = await userInfoResponse.json();
        const userInfo = userInfoData.query.userinfo;
        
        if (userInfo.anon) {
            throw new Error('User appears as anonymous - session not properly established');
        }
        
        console.log(`✅ Authenticated as: ${userInfo.name} (ID: ${userInfo.id})`);
        console.log(`📋 Groups: ${userInfo.groups.join(', ')}`);
        console.log(`🔐 Key rights: ${userInfo.rights.filter(r => ['edit', 'createpage', 'upload'].includes(r)).join(', ')}`);

        // Step 6: Test write capability (create test page)
        console.log('✏️  Step 6: Testing write capability...');
        const testPageTitle = 'MCP_Auth_Test_' + Date.now();
        const testContent = `= Authentication Test =

This page was created by the MediaWiki MCP Server Authentication test.

* '''Test Time''': ${new Date().toISOString()}
* '''User''': ${userInfo.name}
* '''Server''': ${wikiConfig.server}

This page can be safely deleted.

[[Category:Test_Pages]]`;

        const editParams = new URLSearchParams({
            action: 'edit',
            title: testPageTitle,
            text: testContent,
            summary: 'MCP Server authentication test page',
            token: editToken,
            format: 'json'
        });
        
        const editResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': sessionCookies
            },
            body: editParams.toString()
        });

        const editData = await editResponse.json();
        
        if (editData.edit && editData.edit.result === 'Success') {
            console.log(`✅ Test page created successfully: ${testPageTitle}`);
            console.log(`🔗 URL: ${wikiConfig.server}${wikiConfig.articlepath}/${testPageTitle}`);
        } else {
            console.warn('⚠️  Could not create test page (may lack permissions)');
            console.log('   Error:', editData.error?.info || 'Unknown error');
        }

        console.log('');
        console.log('🎉 All authentication tests passed!');
        console.log('✅ MCP Server is ready for use with Claude Code');
        
        return true;

    } catch (error) {
        console.error('');
        console.error('❌ Authentication test failed:', error.message);
        console.error('');
        console.error('🔧 Troubleshooting tips:');
        console.error('   • Verify MediaWiki URL is accessible');
        console.error('   • Check username and password are correct');
        console.error('   • Ensure user has required permissions');
        console.error('   • Confirm MediaWiki API is enabled');
        console.error('');
        
        return false;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    testAuthentication().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testAuthentication };