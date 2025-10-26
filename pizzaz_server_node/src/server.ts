import crypto from "node:crypto";

import express from "express";
import type { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type PizzazWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

// Inlined HTML templates for each widget
const WIDGET_HTML_TEMPLATES = {
  pizzaz: `<!doctype html>
<html>
<head>
  <script type="module" src="http://localhost:4444/pizzaz-2d2b.js"></script>
  <link rel="stylesheet" href="http://localhost:4444/pizzaz-2d2b.css">
</head>
<body>
  <div id="pizzaz-root"></div>
</body>
</html>`,
  
  "pizzaz-carousel": `<!doctype html>
<html>
<head>
  <script type="module" src="http://localhost:4444/pizzaz-carousel-2d2b.js"></script>
  <link rel="stylesheet" href="http://localhost:4444/pizzaz-carousel-2d2b.css">
</head>
<body>
  <div id="pizzaz-carousel-root"></div>
</body>
</html>`,

  "pizzaz-albums": `<!doctype html>
<html>
<head>
  <script type="module" src="http://localhost:4444/pizzaz-albums-2d2b.js"></script>
  <link rel="stylesheet" href="http://localhost:4444/pizzaz-albums-2d2b.css">
</head>
<body>
  <div id="pizzaz-albums-root"></div>
</body>
</html>`,

  "pizzaz-list": `<!doctype html>
<html>
<head>
  <script type="module" src="http://localhost:4444/pizzaz-list-2d2b.js"></script>
  <link rel="stylesheet" href="http://localhost:4444/pizzaz-list-2d2b.css">
</head>
<body>
  <div id="pizzaz-list-root"></div>
</body>
</html>`
} as const;

function getWidgetHtml(componentName: string): string {
  const html = WIDGET_HTML_TEMPLATES[componentName as keyof typeof WIDGET_HTML_TEMPLATES];
  if (!html) {
    throw new Error(`Widget HTML template for "${componentName}" not found.`);
  }
  return html;
}

function widgetMeta(widget: PizzazWidget) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

const widgets: PizzazWidget[] = [
  {
    id: "pizza-map",
    title: "Show Pizza Map",
    templateUri: "ui://widget/pizza-map.html",
    invoking: "Hand-tossing a map",
    invoked: "Served a fresh map",
    html: getWidgetHtml("pizzaz"),
    responseText: "Rendered a pizza map!",
  },
  {
    id: "pizza-carousel",
    title: "Show Pizza Carousel",
    templateUri: "ui://widget/pizza-carousel.html",
    invoking: "Carousel some spots",
    invoked: "Served a fresh carousel",
    html: getWidgetHtml("pizzaz-carousel"),
    responseText: "Rendered a pizza carousel!",
  },
  {
    id: "pizza-albums",
    title: "Show Pizza Album",
    templateUri: "ui://widget/pizza-albums.html",
    invoking: "Hand-tossing an album",
    invoked: "Served a fresh album",
    html: getWidgetHtml("pizzaz-albums"),
    responseText: "Rendered a pizza album!",
  },
  {
    id: "pizza-list",
    title: "Show Pizza List",
    templateUri: "ui://widget/pizza-list.html",
    invoking: "Hand-tossing a list",
    invoked: "Served a fresh list",
    html: getWidgetHtml("pizzaz-list"),
    responseText: "Rendered a pizza list!",
  },
];

const widgetsById = new Map<string, PizzazWidget>();
const widgetsByUri = new Map<string, PizzazWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const toolInputSchema = {
  type: "object" as const,
  properties: {
    pizzaTopping: {
      type: "string",
      description: "Topping to mention when rendering the widget.",
    },
  },
  required: ["pizzaTopping"],
  additionalProperties: false,
};

const toolInputParser = z.object({
  pizzaTopping: z.string(),
});

const tools: Tool[] = widgets.map((widget) => ({
  name: widget.id,
  description: widget.title,
  inputSchema: toolInputSchema,
  title: widget.title,
  _meta: widgetMeta(widget),
  // To disable the approval prompt for the widgets
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
}));

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

function createPizzazServer(): Server {
  const server = new Server(
    {
      name: "pizzaz-node",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            _meta: widgetMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({
      tools,
    })
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const widget = widgetsById.get(request.params.name);

      if (!widget) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = toolInputParser.parse(request.params.arguments ?? {});

      return {
        content: [
          {
            type: "text",
            text: widget.responseText,
          },
        ],
        structuredContent: {
          pizzaTopping: args.pizzaTopping,
        },
        _meta: widgetMeta(widget),
      };
    }
  );

  return server;
}

async function main() {
  const PORT = process.env.PORT || 3000;
  const app = express();
  const server = createPizzazServer();

  // Enable CORS
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // GET endpoint for /mcp - not allowed
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Method Not Allowed" });
  });

  // POST endpoint for /mcp
  app.post("/mcp", express.json(), async (req: Request, res: Response) => {
    console.error("Received POST to /mcp");

    try {
      // Check if this is an initialization request
      const messages = Array.isArray(req.body) ? req.body : [req.body];
      const isInitRequest = messages.some((msg) => msg?.method === "initialize");

      // Get or generate session ID
      let sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (!sessionId && isInitRequest) {
        // New session - generate ID
        sessionId = crypto.randomUUID();
        console.error(`Generated new session ID: ${sessionId}`);
      } else if (sessionId) {
        console.error(`Reusing session ID: ${sessionId}`);
      }

      // Use stateless mode - no session validation
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      // Manually set the session ID for sticky sessions
      if (sessionId) {
        transport.sessionId = sessionId;
      }

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        console.error("Request closed");
        transport.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.listen(PORT, () => {
    console.error(`MCP Demo Server running on http://localhost:${PORT}`);
    console.error(`StreamableHTTP endpoint: http://localhost:${PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
