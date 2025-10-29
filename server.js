const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(express.static('.'));

// Simple GET /proxy?url=<target>
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing URL parameter');

  try {
    const parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    console.log(`[PROXY] ${parsedUrl.href}`);

    const proxyOptions = {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        Host: parsedUrl.host,
        Origin: parsedUrl.origin,
        Referer: parsedUrl.origin
      },
    };

    const proxyReq = protocol.request(parsedUrl, proxyOptions, (proxyRes) => {
      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const statusCode = proxyRes.statusCode || 200;

      // Handle redirects: rewrite to /proxy?url=...
      if (statusCode >= 300 && statusCode < 400 && proxyRes.headers.location) {
        const location = proxyRes.headers.location;
        const redirectUrl = new URL(location, parsedUrl.href).href;
        const proxyRedirect = `/proxy?url=${encodeURIComponent(redirectUrl)}`;
        res.redirect(statusCode, proxyRedirect);
        return;
      }

      const isHtml = contentType.includes('text/html');
      const isCss = contentType.includes('text/css');
      const isJs = contentType.includes('javascript') || contentType.includes('application/json');
      const isText = isHtml || isCss || isJs || contentType.startsWith('text/');

      if (isText) {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let text = Buffer.concat(chunks).toString('utf-8');

          try {
            if (isHtml) text = rewriteHtml(text, parsedUrl.href);
            else if (isCss) text = rewriteCss(text, parsedUrl.href);
            else if (isJs) text = rewriteJs(text, parsedUrl.href);
          } catch (e) {
            console.error('Rewrite error:', e);
          }

          // Build headers for response
          const headers = {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          };

          // Remove headers that can break embedding / compression when we've rewritten body
          delete headers['content-security-policy'];
          delete headers['x-frame-options'];
          delete headers['content-encoding'];
          delete headers['transfer-encoding'];
          delete headers['content-length'];
          delete headers['set-cookie'];
          delete headers['set-cookie2'];

          const buf = Buffer.from(text, 'utf8');
          headers['content-length'] = Buffer.byteLength(buf).toString();

          res.writeHead(statusCode, headers);
          res.end(buf);
        });
      } else {
        // Binary or other streamable response: pipe through but strip problematic headers
        const headers = { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        // Do not delete content-encoding for binary passthrough
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) res.status(502).send(`Error loading page: ${err.message}`);
      else res.end();
    });

    proxyReq.end();
  } catch (err) {
    console.error('Request error:', err.message);
    res.status(400).send(`Invalid URL: ${err.message}`);
  }
});

function rewriteHtml(html, baseUrl) {
  // Helper: compute origin + repo-root-preserving base root
  const u = new URL(baseUrl);
  const pathParts = u.pathname.split('/').filter(Boolean);
  const repoBase = pathParts.length ? `/${pathParts[0]}` : '';
  const baseRoot = u.origin + (repoBase ? repoBase + '/' : '/');

  // meta refresh -> rewrite target url
  html = html.replace(
    /<meta\s+http-equiv=["']refresh["']\s+content=["'](\d+);\s*url=([^"']+)["']\s*\/?>/gi,
    (match, delay, url) => {
      try {
        // if url is root-relative, preserve repo base
        let absoluteUrl;
        if (url.startsWith('/')) absoluteUrl = u.origin + (repoBase ? repoBase + url : url);
        else absoluteUrl = new URL(url, baseUrl).href;
        return `<meta http-equiv="refresh" content="${delay}; url=/proxy?url=${encodeURIComponent(absoluteUrl)}">`;
      } catch (e) {
        return match;
      }
    }
  );

  // Rewrite href/src/action attributes to route through proxy (skip data:, #, javascript:, mailto:)
  html = html.replace(
    /(href|src|action)=["'](?!data:|#|javascript:|mailto:)([^"']+)["']/gi,
    (match, attr, url) => {
      try {
        let absoluteUrl;
        if (url.startsWith('/')) {
          // preserve repo when converting root-relative paths
          absoluteUrl = u.origin + (repoBase ? repoBase + url : url);
        } else {
          absoluteUrl = new URL(url, baseUrl).href;
        }
        return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
      } catch (e) {
        return match;
      }
    }
  );

  // Rewrite CSS url(...) within HTML
  html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    if (url.startsWith('data:')) return match;
    try {
      let absoluteUrl;
      if (url.startsWith('/')) absoluteUrl = u.origin + (repoBase ? repoBase + url : url);
      else absoluteUrl = new URL(url, baseUrl).href;
      return `url("/proxy?url=${encodeURIComponent(absoluteUrl)}")`;
    } catch (e) {
      return match;
    }
  });

  // Insert a base tag pointing to proxied origin+repo only if none exists
  if (!/<base[\s>]/i.test(html)) {
    const baseTag = `<base href="/proxy?url=${encodeURIComponent(baseRoot)}">`;
    html = html.replace(/<head[^>]*>/i, (match) => match + baseTag);
  }

  return html;
}

function rewriteCss(css, baseUrl) {
  const u = new URL(baseUrl);
  const pathParts = u.pathname.split('/').filter(Boolean);
  const repoBase = pathParts.length ? `/${pathParts[0]}` : '';

  css = css.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    if (url.startsWith('data:')) return match;
    try {
      let absoluteUrl;
      if (url.startsWith('/')) absoluteUrl = u.origin + (repoBase ? repoBase + url : url);
      else absoluteUrl = new URL(url, baseUrl).href;
      return `url("/proxy?url=${encodeURIComponent(absoluteUrl)}")`;
    } catch (e) {
      return match;
    }
  });

  css = css.replace(/@import\s+["']([^"']+)["']/gi, (match, url) => {
    try {
      let absoluteUrl;
      if (url.startsWith('/')) absoluteUrl = u.origin + (repoBase ? repoBase + url : url);
      else absoluteUrl = new URL(url, baseUrl).href;
      return `@import "/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
    } catch (e) {
      return match;
    }
  });

  return css;
}

function rewriteJs(js, baseUrl) {
  const u = new URL(baseUrl);
  const baseOrigin = u.origin;
  const pathParts = u.pathname.split('/').filter(Boolean);
  const repoBase = pathParts.length ? `/${pathParts[0]}` : '';
  const baseDomain = baseOrigin.replace(/^https?:\/\//, '');

  // Replace absolute http(s) string literals that point to the same origin to go through the proxy
  js = js.replace(/(["'])(https?:\/\/[^"']+)(\1)/g, (match, quote, url) => {
    try {
      if (url.includes(baseDomain)) {
        return `${quote}/proxy?url=${encodeURIComponent(url)}${quote}`;
      }
      return match;
    } catch (e) {
      return match;
    }
  });

  // Replace root-relative string literals "/path/..." to include repo base when present
  js = js.replace(/(["'])(\/[^"']+)(\1)/g, (match, quote, url) => {
    try {
      // only rewrite if it looks like a resource path (avoid rewriting every occurrence)
      if (url.startsWith('/')) {
        const absolute = baseOrigin + (repoBase ? repoBase + url : url);
        return `${quote}/proxy?url=${encodeURIComponent(absolute)}${quote}`;
      }
      return match;
    } catch (e) {
      return match;
    }
  });

  return js;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Florida Proxy running on port ${PORT}`);
  console.log(`   Access at: http://localhost:${PORT}`);
});
