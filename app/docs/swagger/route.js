export async function GET() {
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SSO Core · Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.1/swagger-ui.css">
  <style>
    body { margin:0; background:#fafafa; }
    .docsbar { background:#09090b; color:#eee; padding:16px 24px; font:13px system-ui; }
    .docsbar a { color:#c4b5fd; margin-right:24px; text-decoration: none; }
    .docsbar a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav class="docsbar">
    <a href="/docs">← คู่มือ SSO Core</a>
    <a href="/docs/scalar">Scalar</a>
    <a href="/openapi.json">OpenAPI JSON</a>
  </nav>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.1/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: false,
      validatorUrl: null,
      displayRequestDuration: true
    });
  </script>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
