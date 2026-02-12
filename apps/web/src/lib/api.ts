export type CreateJobResponse = {
  job_id: string;
  status: string;
};

export type CreditPack = {
  id: string;
  label: string;
  credits: number;
  price_usd: number;
  blurb: string;
};

export type CreditOperation = {
  idempotency_key: string;
  operation_type: string;
  amount: number;
  job_id: string | null;
  stripe_session_id: string | null;
  created_at: string;
};

export type RecentJob = {
  id: string;
  asin_a: string;
  asin_b: string;
  status: string;
  created_at: string;
};

export type RecentExperiment = {
  id: string;
  asin_a: string;
  asin_b: string;
  created_at: string;
  change_tags: string[] | null;
};

export type AnalyticsEventRow = {
  event_name: string;
  stage_number: number | null;
  properties: Record<string, unknown> | null;
  created_at: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function createJob(params: {
  asinA: string;
  asinB: string;
  accessToken: string;
}): Promise<CreateJobResponse> {
  const resp = await fetch(`${API_BASE_URL}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      asin_a: params.asinA,
      asin_b: params.asinB,
    }),
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as CreateJobResponse;
}

export async function getCreditPacks(accessToken: string): Promise<{
  currency: string;
  version: string;
  packs: CreditPack[];
}> {
  const resp = await fetch(`${API_BASE_URL}/credits/packs`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as {
    currency: string;
    version: string;
    packs: CreditPack[];
  };
}

export async function createCreditCheckout(params: {
  packId: string;
  accessToken: string;
}): Promise<{ checkout_url: string; session_id: string; pack_id: string }> {
  const resp = await fetch(`${API_BASE_URL}/credits/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      pack_id: params.packId,
    }),
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as {
    checkout_url: string;
    session_id: string;
    pack_id: string;
  };
}

export async function getCreditOperations(accessToken: string): Promise<{
  operations: CreditOperation[];
}> {
  const resp = await fetch(`${API_BASE_URL}/credits/operations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as { operations: CreditOperation[] };
}

export async function trackEvent(params: {
  accessToken: string;
  eventName: string;
  jobId?: string;
  stageNumber?: number;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/analytics/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      event_name: params.eventName,
      job_id: params.jobId ?? null,
      stage_number: params.stageNumber ?? null,
      properties: params.properties ?? {},
    }),
  });

  if (!resp.ok) {
    throw new Error(`Analytics event failed (${resp.status})`);
  }
}

export async function getRecentJobs(params: {
  accessToken: string;
  limit?: number;
}): Promise<{ jobs: RecentJob[] }> {
  const query = params.limit ? `?limit=${encodeURIComponent(String(params.limit))}` : "";
  const resp = await fetch(`${API_BASE_URL}/jobs/recent${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as { jobs: RecentJob[] };
}

export async function getRecentExperiments(params: {
  accessToken: string;
  limit?: number;
}): Promise<{ experiments: RecentExperiment[] }> {
  const query = params.limit ? `?limit=${encodeURIComponent(String(params.limit))}` : "";
  const resp = await fetch(`${API_BASE_URL}/experiments/recent${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as { experiments: RecentExperiment[] };
}

export async function getAnalyticsEvents(params: {
  accessToken: string;
  limit?: number;
}): Promise<{ events: AnalyticsEventRow[] }> {
  const query = params.limit ? `?limit=${encodeURIComponent(String(params.limit))}` : "";
  const resp = await fetch(`${API_BASE_URL}/analytics/events${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await resp.json()) as { events: AnalyticsEventRow[] };
}
