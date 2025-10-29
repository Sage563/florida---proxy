# Florida Proxy

## Overview

Florida Proxy is a web-based proxy service that allows users to access blocked websites by routing requests through a server-side proxy. The application consists of a simple frontend interface where users can enter URLs, and an Express.js backend that handles the proxying of HTTP/HTTPS requests. The project also includes a basic ChatGPT-style chat interface (though the implementation appears incomplete).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: Vanilla JavaScript, HTML5, CSS3, Bootstrap 4.6

**Design Pattern**: Multi-page application with static HTML files

The frontend is built with plain HTML/CSS/JavaScript without any framework. The main interface (`index.html`) provides a simple URL input form where users enter websites they want to unblock. Client-side JavaScript (`client.js`) handles form submission and URL formatting, automatically prepending `https://` if no protocol is specified.

**Rationale**: The choice of vanilla JavaScript keeps the application lightweight and simple to deploy without build steps or complex dependencies. This approach is suitable for a small proxy application where interactivity requirements are minimal.

### Backend Architecture

**Technology Stack**: Node.js, Express.js

**Design Pattern**: Request-response proxy pattern with URL rewriting

The backend (`server.js`) uses Express.js to serve static files and handle proxy requests through a `/proxy` endpoint. When a user requests a URL through the proxy:

1. The server receives the target URL as a query parameter
2. Parses and validates the URL
3. Makes an HTTP/HTTPS request to the target server using Node's native `http`/`https` modules
4. Handles redirects by rewriting location headers to keep traffic within the proxy
5. Streams the response back to the client

**Key Features**:
- Automatic protocol detection (HTTP vs HTTPS)
- Redirect handling to maintain proxy routing
- User-Agent spoofing to mimic legitimate browser requests
- Content-type based processing for HTML, CSS, and JavaScript

**Rationale**: Using Express for routing and Node's built-in HTTP modules for proxying provides a balance between simplicity and functionality. The server-side proxy approach allows bypassing client-side restrictions (like CORS) that would prevent a pure client-side solution.

### Alternatives Considered

An alternative `script.js` file exists that implements a standalone HTTP proxy server without Express. This approach creates a lower-level proxy that directly forwards all requests, but was not used in favor of the Express-based solution which provides better control over static file serving and URL rewriting.

**Pros of current approach**:
- Single server handles both static content and proxying
- Better control over response manipulation
- Easier to add middleware and features

**Cons**:
- Less efficient for binary content streaming
- More complex redirect handling required

## External Dependencies

### NPM Packages

**express (^4.19.1)**: Web application framework used for routing, static file serving, and middleware support. Chosen for its simplicity and widespread adoption.

**Node.js Built-in Modules**:
- `http` / `https`: Handle outbound proxy requests to target servers
- `url`: Parse and manipulate URLs for proxy routing

### Frontend Libraries (CDN)

**Bootstrap 4.6.0**: CSS framework for basic styling (used in chat interface)

**Font Awesome 5.0.7**: Icon library (used in chat interface)

**jQuery 3.6.3**: DOM manipulation library (used in chat interface)

**markdown-it 13.0.1**: Markdown parser (intended for chat message formatting)

### Infrastructure

**Port Configuration**: Server runs on port 5000 by default, with environment variable support for deployment platforms

**Static File Serving**: All HTML, CSS, JavaScript, and image assets are served directly from the root directory using Express's static middleware