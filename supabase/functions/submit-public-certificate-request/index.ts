const allowedOrigins = (Deno.env.get("PUBLIC_SITE_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const validIdTypes = [
  "PhilSys ID",
  "Driver License",
  "Passport",
  "UMID",
  "SSS ID",
  "Senior Citizen ID",
  "Postal ID",
  "PRC ID",
  "Other Valid ID",
] as const;

const certificateTypes = [
  "Barangay Clearance",
  "Certificate of Indigency",
  "Certificate of Residency",
  "Certificate of Good Moral Character",
  "Character Reference",
  "Certificate of Late Registration (Civil Registrar)",
  "Certificate of Death",
  "Permit to Solicit / Ask for Donations",
  "Amicable Settlement",
  "Certificate of Recommendation",
  "Affidavit of Undertaking",
  "Affidavit for Solo Parent",
  "Barangay Business Clearance",
  "Certificate of Solo Parent",
] as const;

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

async function hashIp(serviceKey: string, ipAddress: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${serviceKey}:certificate:${ipAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashCertificateEmail(serviceKey: string, email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const bytes = new TextEncoder().encode(`${serviceKey}:certificate-email:${normalizedEmail}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isWithinSubmissionLimit(
  supabaseUrl: string,
  serviceKey: string,
  identifierHash: string,
  rpcName = "consume_public_concern_slot",
): Promise<boolean | null> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: adminHeaders(serviceKey),
      body: JSON.stringify({ p_ip_hash: identifierHash }),
    });
    if (!response.ok) {
      console.error("Certificate request rate limit could not be checked.", response.status);
      return null;
    }
    return await response.json() === true;
  } catch (error) {
    console.error(
      "Certificate request rate limit could not be checked.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}

async function existingSubmission(
  supabaseUrl: string,
  serviceKey: string,
  submissionId: string,
): Promise<boolean | null> {
  const query = new URLSearchParams({
    select: "id",
    submission_id: `eq.${submissionId}`,
    limit: "1",
  });
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/public_certificate_request_inbox?${query.toString()}`,
      { headers: adminHeaders(serviceKey) },
    );
    if (!response.ok) {
      console.error("Certificate request retry could not be confirmed.", response.status);
      return null;
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) {
      return null;
    }
    if (rows.length === 0) {
      return false;
    }
    return Boolean(rows[0]?.id) ? true : null;
  } catch (error) {
    console.error(
      "Certificate request retry could not be confirmed.",
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
    console.error("Certificate request service is missing Supabase configuration.");
    return jsonResponse(origin, { error: "Certificate request submission is not configured." }, 503);
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

  const submissionId = typeof data.submission_id === "string" ? data.submission_id : "";
  const requesterName = typeof data.requester_name === "string" ? data.requester_name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const contactNumber = typeof data.contact_number === "string" ? data.contact_number.trim() : "";
  const validIdType = data.valid_id_type;
  const validIdNumber = typeof data.valid_id_number === "string" ? data.valid_id_number.trim() : "";
  const certificateType = data.certificate_type;
  const purpose = typeof data.purpose === "string" ? data.purpose.trim() : "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(submissionId) ||
    requesterName.length < 1 ||
    requesterName.length > 120 ||
    email.length > 160 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    contactNumber.length > 40 ||
    typeof validIdType !== "string" ||
    !validIdTypes.includes(validIdType as (typeof validIdTypes)[number]) ||
    validIdNumber.length < 1 ||
    validIdNumber.length > 100 ||
    typeof certificateType !== "string" ||
    !certificateTypes.includes(certificateType as (typeof certificateTypes)[number]) ||
    purpose.length < 10 ||
    purpose.length > 1000
  ) {
    return jsonResponse(origin, { error: "Please check the certificate request details." }, 422);
  }

  const priorSubmission = await existingSubmission(supabaseUrl, serviceKey, submissionId);
  if (priorSubmission === null) {
    return jsonResponse(origin, { error: "Certificate request submission is temporarily unavailable." }, 503);
  }
  if (priorSubmission) {
    return jsonResponse(origin, { saved: true });
  }

  const withinLimit = await isWithinSubmissionLimit(
    supabaseUrl,
    serviceKey,
    await hashCertificateEmail(serviceKey, email),
    "consume_public_certificate_request_slot",
  );
  if (withinLimit === null) {
    return jsonResponse(origin, { error: "Certificate request submission is temporarily unavailable." }, 503);
  }
  if (!withinLimit) {
    return jsonResponse(
      origin,
      { error: "Tatlong certificate request na ang naipadala gamit ang email na ito. Pakisubukang muli pagkalipas ng isang oras." },
      429,
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl}/rest/v1/public_certificate_request_inbox?on_conflict=submission_id`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(serviceKey),
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({
          submission_id: submissionId,
          requester_name: requesterName,
          email,
          contact_number: contactNumber || null,
          valid_id_type: validIdType,
          valid_id_number: validIdNumber,
          certificate_type: certificateType,
          purpose,
        }),
      },
    );
  } catch (error) {
    console.error(
      "Certificate request could not be saved.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonResponse(origin, { error: "Certificate request could not be saved." }, 503);
  }

  if (!response.ok) {
    console.error("Certificate request could not be saved.", response.status);
    return jsonResponse(origin, { error: "Certificate request could not be saved." }, 503);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length > 1) {
    console.error("Supabase returned an invalid certificate request result.");
    return jsonResponse(origin, { error: "Certificate request could not be confirmed." }, 503);
  }

  if (rows.length === 0) {
    const duplicate = await existingSubmission(supabaseUrl, serviceKey, submissionId);
    if (duplicate !== true) {
      return jsonResponse(origin, { error: "Certificate request could not be confirmed." }, 503);
    }
  } else if (!rows[0]?.id) {
    return jsonResponse(origin, { error: "Certificate request could not be confirmed." }, 503);
  }

  return jsonResponse(origin, { saved: true });
});
