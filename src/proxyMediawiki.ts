import express, { Express } from "express";
import fetch from "node-fetch";

interface ProxyOptions {
  mediawikiBase: string;
  issuer: string;
  resource: string;
}

export function proxyMediawikiOauth(app: Express, opts: ProxyOptions) {
  const { mediawikiBase, issuer, resource } = opts;

  /** ----- Metadata ----- */
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      scopes_supported: ["mwoauth-authonly", "mwoauth-authonlyprivate"],
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      authorization_servers: [`${issuer}/.well-known/oauth-authorization-server`],
      scopes_supported: ["mwoauth-authonly", "mwoauth-authonlyprivate"],
    });
  });

  /** ----- Authorize ----- */
  app.get("/authorize", (req, res) => {
    const query = new URLSearchParams(req.query as any).toString();
    const target = `${mediawikiBase}/oauth2/authorize?${query}`;
    res.redirect(302, target);
  });

  /** ----- Token ----- */
  app.post("/token", express.urlencoded({ extended: true }), async (req, res) => {
    const params = new URLSearchParams(req.body as any);
    if (!params.has("resource")) params.set("resource", resource);
    try {
      const resp = await fetch(`${mediawikiBase}/oauth2/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const headersObj = Object.fromEntries([...resp.headers]);
      let body = await resp.text();
      try { body = JSON.stringify({ ...JSON.parse(body), resource }); } catch {}
      res.status(resp.status).set(headersObj).send(body);
    } catch (err) {
      res.status(500).json({ error: "proxy_error", error_description: String(err) });
    }
  });

  console.log(`[proxyMediawikiOauth] Ready: Issuer=${issuer}, MediaWiki=${mediawikiBase}`);
}
