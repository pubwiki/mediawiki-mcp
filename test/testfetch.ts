import https from "https";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
function getRetCookie(setCookieHeaders: string[] | string | null,cookies:string[]){
	if (!setCookieHeaders) return cookies;

	const cookiesArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

	for (const cookieString of cookiesArray) {
		const cookie = cookieString.split(';')[0]; 
		const [name] = cookie.split('=');

		cookies = cookies.filter(c => !c.startsWith(name + '='));
		cookies.push(cookie);
	}
    return cookies
}

async function testLogin() {
    const loginUrl = "https://yuri.rs/api.php?action=query&format=json&meta=tokens&type=login";
    const loginHeaders = {
        "User-Agent": "mediawiki-mcp-server/1.0.1",
        "Content-Type": "application/x-www-form-urlencoded",
    };

    const loginRep = await fetch(loginUrl, {
        method: "POST",
        headers:loginHeaders,
    });

    const loginData = await loginRep.json() as any;
    const loginToken = loginData.query?.tokens?.logintoken;

    console.log(loginToken)

    let cookies = [] as string[]
    
    cookies = getRetCookie(loginRep.headers.getSetCookie(),cookies)

    const clientLoginRep = await fetch(`https://yuri.rs/api.php`, {
        method: 'POST',
        headers: {
            ...loginHeaders,
            'Cookie': cookies.join('; ')
        },
        body: new URLSearchParams({
            action: 'clientlogin',
            username: "m4tsuri",
            password: "64d5ddd6-94ad-11f0-9f5c-4c034f4e17cc",
            logintoken: loginToken,
            //rememberMe: "true",
            loginpreservestate: "true",
            loginreturnurl: "https://yuri.rs/",
            format: 'json'
        })
    });

    console.log(await clientLoginRep.json()) // { clientlogin: { status: 'PASS' } } or { clientlogin: { status: 'FAIL', message:'errmsg' } } 

    cookies = getRetCookie(clientLoginRep.headers.getSetCookie(),cookies)

    const actionRep = await fetch(`https://yuri.rs/provisioner/v1/wikis`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
			'Cookie': cookies.join('; ')
		},
        body:JSON.stringify({
            "name":"Never Winter",
            "slug":"neverwinter1"
        }),
    });

    console.log(await actionRep.text())

}

testLogin().catch(console.error);