const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = 5000;

app.use(express.static('.'));

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).send('Missing URL parameter');
  }

  try {
    const parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    console.log(`[PROXY] ${parsedUrl.href}`);

    const proxyOptions = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
    };

    const proxyReq = protocol.request(parsedUrl, proxyOptions, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      const statusCode = proxyRes.statusCode;
      
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
      const isText = isHtml || isCss || isJs || contentType.includes('text/');

      if (isText) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        
        proxyRes.on('end', () => {
          let text = Buffer.concat(chunks).toString('utf-8');
          
          if (isHtml) {
            text = rewriteHtml(text, parsedUrl.href);
          } else if (isCss) {
            text = rewriteCss(text, parsedUrl.href);
          } else if (isJs) {
            text = rewriteJs(text, parsedUrl.href);
          }
          
          const headers = {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          };
          
          delete headers['content-security-policy'];
          delete headers['x-frame-options'];
          delete headers['content-encoding'];
          delete headers['content-length'];
          delete headers['transfer-encoding'];
          
          res.writeHead(statusCode, headers);
          res.end(text);
        });
      } else {
        const headers = {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
        };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.status(502).send(`Error loading page: ${err.message}`);
    });

    proxyReq.end();

  } catch (err) {
    console.error('Request error:', err.message);
    res.status(400).send(`Invalid URL: ${err.message}`);
  }
});

function rewriteHtml(html, baseUrl) {
  html = html.replace(
    /<meta\s+http-equiv=["']refresh["']\s+content=["'](\d+);\s*url=([^"']+)["']/gi,
    (match, delay, url) => {
      const absoluteUrl = new URL(url, baseUrl).href;
      return `<meta http-equiv="refresh" content="${delay}; url=/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
    }
  );

  html = html.replace(
    /(href|src|action)=["'](?!data:|#|javascript:|mailto:)([^"']+)["']/gi,
    (match, attr, url) => {
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
      } catch (e) {
        return match;
      }
    }
  );

  html = html.replace(
    /url\(["']?([^"')]+)["']?\)/gi,
    (match, url) => {
      if (url.startsWith('data:')) return match;
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        return `url("/proxy?url=${encodeURIComponent(absoluteUrl)}")`;
      } catch (e) {
        return match;
      }
    }
  );

  const baseOrigin = new URL(baseUrl).origin;
  const baseTag = `<base href="/proxy?url=${encodeURIComponent(baseOrigin + '/')}">`;
  html = html.replace(/<head[^>]*>/i, (match) => match + baseTag);

  return html;
}

function rewriteCss(css, baseUrl) {
  css = css.replace(
    /url\(["']?([^"')]+)["']?\)/gi,
    (match, url) => {
      if (url.startsWith('data:')) return match;
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        return `url("/proxy?url=${encodeURIComponent(absoluteUrl)}")`;
      } catch (e) {
        return match;
      }
    }
  );

  css = css.replace(
    /@import\s+["']([^"']+)["']/gi,
    (match, url) => {
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        return `@import "/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
      } catch (e) {
        return match;
      }
    }
  );

  return css;
}

function rewriteJs(js, baseUrl) {
  const baseOrigin = new URL(baseUrl).origin;
  const baseDomain = baseOrigin.replace('https://', '').replace('http://', '');
  
  js = js.replace(
    /(["'])(https?:\/\/[^"']+)(\1)/g,
    (match, quote, url) => {
      if (url.includes(baseDomain)) {
        return `${quote}/proxy?url=${encodeURIComponent(url)}${quote}`;
      }
      return match;
    }
  );

  return js;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Florida Proxy running on port ${PORT}`);
  console.log(`   Access at: http://localhost:${PORT}`);
});
