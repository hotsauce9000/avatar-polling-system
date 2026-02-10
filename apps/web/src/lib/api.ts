export type CreateJobResponse = {
  job_id: string;
  status: string;
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

