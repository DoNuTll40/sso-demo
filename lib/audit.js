import prisma from "./prisma";

/**
 * ดึงข้อมูล IP Address และ User-Agent จาก Request Headers
 */
export function getRequestContext(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ipAddress = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : realIp || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const url = new URL(request.url);

  return {
    ipAddress,
    userAgent,
    requestMethod: request.method,
    requestPath: url.pathname,
  };
}

/**
 * บันทึก Audit Log และ Session Access Log พร้อมกันแบบละเอียด
 */
export async function recordAuditAndSessionLog({
  request,
  userId = null,
  clientId = null,
  authSessionId = null,
  userSessionId = null,
  deviceId = null,
  action,
  eventType = null,
  category = "OAUTH",
  status = "SUCCESS",
  severity = "INFO",
  statusCode = 200,
  responseTimeMs = null,
  reason = null,
  metadata = {},
}) {
  const ctx = request ? getRequestContext(request) : {};

  try {
    const tasks = [
      prisma.auditLog.create({
        data: {
          userId,
          clientId,
          authSessionId,
          deviceId,
          action,
          category,
          status,
          severity,
          ipAddress: ctx.ipAddress || null,
          userAgent: ctx.userAgent || null,
          requestMethod: ctx.requestMethod || null,
          requestPath: ctx.requestPath || null,
          statusCode,
          reason,
          metadata,
        },
      }),
    ];

    if (eventType || authSessionId || userSessionId) {
      tasks.push(
        prisma.sessionAccessLog.create({
          data: {
            userSessionId,
            authSessionId,
            userId,
            clientId,
            eventType: eventType || action,
            status: status === "FAILURE" ? "FAILED" : status,
            ipAddress: ctx.ipAddress || null,
            userAgent: ctx.userAgent || null,
            endpoint: ctx.requestPath || null,
            httpMethod: ctx.requestMethod || null,
            statusCode,
            responseTimeMs,
            details: {
              reason,
              ...metadata,
            },
          },
        })
      );
    }

    await Promise.all(tasks);
  } catch (err) {
    console.error("[AuditLog Error] Failed to write audit/session log:", err);
  }
}

