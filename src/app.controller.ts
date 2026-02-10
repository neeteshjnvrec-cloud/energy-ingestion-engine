import { Controller, Get } from '@nestjs/common';

@Controller() // No path here means it handles the root "/"
export class AppController {
  @Get()
  getWelcome() {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Energy Ingestion Engine</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background-color: #0f172a; color: #f8fafc; }
            .card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); display: inline-block; border: 1px solid #334155; }
            h1 { color: #22c55e; margin-bottom: 10px; }
            .status-pill { background: #064e3b; color: #4ade80; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; font-weight: bold; }
            code { background: #000; padding: 2px 6px; border-radius: 4px; color: #fbbf24; }
            .footer { margin-top: 20px; color: #94a3b8; font-size: 0.8rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>⚡ Energy Ingestion Engine</h1>
            <p><span class="status-pill">● ONLINE</span></p>
            <p>Cloud Database Connected: <code>${process.env.DATABASE_NAME}</code></p>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
            <p>Ready to receive telemetry data.</p>
            <p style="font-size: 0.9rem;">Send POST requests to <code>/telemetry</code></p>
          </div>
          <div class="footer">Environment: ${process.env.NODE_ENV || 'production'}</div>
        </body>
      </html>
    `;
  }
}