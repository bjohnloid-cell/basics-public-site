const allowedOrigins = (Deno.env.get("PUBLIC_SITE_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const categories = [
  "Certificate or service",
  "Resident record",
  "Community concern",
  "Other",
] as const;

type Category = (typeof categories)[number];

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  origin: string | null,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function adminHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: serviceKey,
    "Content-Type": "application/json",
  };
  if (!serviceKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  return headers;
}

async function isWithinSubmissionLimit(
  supabaseUrl: string,
  serviceKey: string,
  request: Request,
): Promise<boolean | null> {
  const ipAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (!ipAddress) {
    console.error("Concern submission did not include a source IP address.");
    return null;
  }

  const bytes = new TextEncoder().encode(`${serviceKey}:${ipAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const ipHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_public_concern_slot`, {
      method: "POST",
      headers: adminHeaders(serviceKey),
      body: JSON.stringify({ p_ip_hash: ipHash }),
    });
    if (!response.ok) {
      console.error("Concern submission rate limit could not be checked.", response.status);
      return null;
    }
    return await response.json() === true;
  } catch (error) {
    console.error(
      "Concern submission rate limit could not be checked.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigins.includes(origin)) {
      return jsonResponse(origin, { error: "Origin is not allowed." }, 403);
    }
    return new Response("ok", { headers: responseHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse(origin, { error: "Method not allowed." }, 405);
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    return jsonResponse(origin, { error: "Origin is not allowed." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Concern submission service is missing Supabase configuration.");
    return jsonResponse(origin, { error: "Concern submission is not configured." }, 503);
  }

  let data: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(origin, { error: "Invalid request body." }, 400);
    }
    data = body as Record<string, unknown>;
  } catch {
    return jsonResponse(origin, { error: "Invalid request body." }, 400);
  }

  const submissionId = typeof data.submission_id === "string"
    ? data.submission_id
    : "";
  const senderName = typeof data.sender_name === "string"
    ? data.sender_name.trim()
    : "";
  const contact = typeof data.contact === "string" ? data.contact.trim() : "";
  const email = contact;
  const category = data.category;
  const message = typeof data.message === "string" ? data.message.trim() : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(submissionId) ||
    typeof category !== "string" ||
    !categories.includes(category as Category) ||
    message.length < 10 ||
    message.length > 2000 ||
    senderName.length > 120 ||
    email.length > 160 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return jsonResponse(origin, { error: "A valid email address is required. Please check the concern details." }, 422);
  }

  const withinLimit = await isWithinSubmissionLimit(supabaseUrl, serviceKey, request);
  if (withinLimit === null) {
    return jsonResponse(origin, { error: "Concern submission is temporarily unavailable." }, 503);
  }
  if (!withinLimit) {
    return jsonResponse(
      origin,
      { error: "Too many concerns have been submitted from this connection. Please try again in an hour." },
      429,
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl}/rest/v1/public_concerns?on_conflict=submission_id`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(serviceKey),
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({
          submission_id: submissionId,
          sender_name: senderName || null,
          contact: contact || null,
          category: category as Category,
          message,
          status: "new",
        }),
      },
    );
  } catch (error) {
    console.error(
      "Concern could not be saved.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonResponse(origin, { error: "Concern could not be saved." }, 503);
  }

  if (!response.ok) {
    console.error("Concern could not be saved.", response.status);
    return jsonResponse(origin, { error: "Concern could not be saved." }, 503);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) {
    console.error("Supabase returned an invalid concern submission result.");
    return jsonResponse(origin, { error: "Concern could not be confirmed." }, 503);
  }

  if (rows.length === 0) {
    const query = new URLSearchParams({
      select: "id",
      submission_id: `eq.${submissionId}`,
      limit: "1",
    });
    let existingResponse: Response;
    try {
      existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/public_concerns?${query.toString()}`,
        { headers: adminHeaders(serviceKey) },
      );
    } catch (error) {
      console.error(
        "Existing concern submission could not be confirmed.",
        error instanceof Error ? error.message : "Unknown error",
      );
      return jsonResponse(origin, { error: "Concern could not be confirmed." }, 503);
    }
    if (!existingResponse.ok) {
      console.error("Existing concern submission could not be confirmed.", existingResponse.status);
      return jsonResponse(origin, { error: "Concern could not be confirmed." }, 503);
    }
    const existingRows: unknown = await existingResponse.json();
    if (!Array.isArray(existingRows) || existingRows.length !== 1) {
      return jsonResponse(origin, { error: "Concern could not be confirmed." }, 503);
    }
  } else if (!rows[0]?.id) {
    return jsonResponse(origin, { error: "Concern could not be confirmed." }, 503);
  }

  return jsonResponse(origin, { saved: true });
});
