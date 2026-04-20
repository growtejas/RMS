import { getRequestId } from "@/lib/http/request-id";

export function logInfo(message: string, fields?: Record<string, unknown>, req?: Request) {
  const reqId = req ? getRequestId(req) : null;
  const line = JSON.stringify({
    level: "info",
    msg: message,
    ts: new Date().toISOString(),
    request_id: reqId,
    ...fields,
  });
  console.log(line);
}
