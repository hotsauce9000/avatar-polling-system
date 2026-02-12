import { chromium } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const BREAKPOINTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

const SESSION_USER = {
  id: "00000000-0000-0000-0000-000000000123",
  email: "qa@example.com",
  aud: "authenticated",
  role: "authenticated",
};

const SESSION = {
  access_token: "qa-access-token",
  refresh_token: "qa-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: SESSION_USER,
};

const STAGES = [
  {
    id: "stage-0",
    job_id: "test-job",
    stage_number: 0,
    status: "completed",
    output: {
      provider: "mock",
      asin_a: { asin: "ASINA", title: "Mock Product A", main_image_url: "" },
      asin_b: { asin: "ASINB", title: "Mock Product B", main_image_url: "" },
    },
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:05Z",
  },
  {
    id: "stage-1",
    job_id: "test-job",
    stage_number: 1,
    status: "completed",
    output: { evidence: [{ asin: "ASINA", factor: "image", detail: "Good contrast." }] },
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:10Z",
  },
  {
    id: "stage-2",
    job_id: "test-job",
    stage_number: 2,
    status: "completed",
    output: { evidence: [{ asin: "ASINB", factor: "gallery", detail: "Clear lifestyle angle." }] },
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:15Z",
  },
  {
    id: "stage-3",
    job_id: "test-job",
    stage_number: 3,
    status: "completed",
    output: {},
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:20Z",
  },
  {
    id: "stage-4",
    job_id: "test-job",
    stage_number: 4,
    status: "completed",
    output: {
      avatars: [
        { name: "Price-sensitive buyer", leans_to: "ASINA", cares_about: ["price", "value"] },
      ],
    },
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:25Z",
  },
  {
    id: "stage-5",
    job_id: "test-job",
    stage_number: 5,
    status: "completed",
    output: {
      winner: "ASINA",
      confidence: 0.81,
      scores: {
        asin_a: { total: 0.8123 },
        asin_b: { total: 0.7011 },
      },
      prioritized_fixes: [
        { title: "Improve title clarity", reason: "Reduce cognitive load." },
      ],
    },
    created_at: "2026-02-11T00:00:00Z",
    completed_at: "2026-02-11T00:00:30Z",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureNoHorizontalOverflow(page, routeLabel, viewport) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body?.scrollWidth ?? 0,
      bodyClientWidth: body?.clientWidth ?? 0,
    };
  });

  const docOverflow = metrics.docScrollWidth - metrics.docClientWidth;
  const bodyOverflow = metrics.bodyScrollWidth - metrics.bodyClientWidth;
  const overflow = Math.max(docOverflow, bodyOverflow);

  assert(
    overflow <= 1,
    `[${routeLabel} @ ${viewport.name}] horizontal overflow detected: doc ${docOverflow}px, body ${bodyOverflow}px`,
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: "aps_session",
      value: "1",
      url: BASE_URL,
    },
    {
      name: "aps_session",
      value: "1",
      url: "http://127.0.0.1:3000",
    },
  ]);

  await context.addInitScript(
    ({ session, user, stages }) => {
      window.__qa = {
        wsMessages: [],
        stripeAssignedUrl: null,
        fetchHits: [],
      };

      try {
        const key = "sb-rytimbmptheorfqqibel-auth-token";
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem(`${key}-user`, JSON.stringify({ user }));
      } catch {
        // Ignore storage errors.
      }

      try {
        const originalAssign = window.location.assign.bind(window.location);
        Object.defineProperty(window.location, "assign", {
          configurable: true,
          value: (url) => {
            window.__qa.stripeAssignedUrl = String(url);
            try {
              originalAssign(url);
            } catch {
              // Ignore navigation errors in QA harness.
            }
          },
        });
      } catch {
        // Ignore location monkey-patch failures.
      }

      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        constructor(url) {
          this.url = url;
          this.readyState = MockWebSocket.CONNECTING;
          this._listeners = { open: [], close: [], error: [], message: [] };
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this._emit("open", { type: "open" });
          }, 0);
        }

        addEventListener(type, cb) {
          if (!this._listeners[type]) this._listeners[type] = [];
          this._listeners[type].push(cb);
        }

        removeEventListener(type, cb) {
          if (!this._listeners[type]) return;
          this._listeners[type] = this._listeners[type].filter((entry) => entry !== cb);
        }

        send(data) {
          let payload = "";
          if (typeof data === "string") {
            payload = data;
          } else {
            try {
              payload = JSON.stringify(data);
            } catch {
              payload = String(data);
            }
          }
          window.__qa.wsMessages.push(payload);
        }

        close() {
          this.readyState = MockWebSocket.CLOSED;
          this._emit("close", { type: "close" });
        }

        _emit(type, event) {
          const handler = this[`on${type}`];
          if (typeof handler === "function") {
            handler(event);
          }
          const list = this._listeners[type] ?? [];
          for (const cb of list) cb(event);
        }
      }

      window.WebSocket = MockWebSocket;

      const originalFetch = window.fetch.bind(window);

      function jsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        window.__qa.fetchHits.push(url);

        if (url.includes("/auth/v1/user")) {
          return jsonResponse(user);
        }

        if (url.includes("/auth/v1/token")) {
          return jsonResponse(session);
        }

        if (url.includes("/auth/v1/logout")) {
          return jsonResponse({});
        }

        if (url.includes("/rest/v1/user_profiles")) {
          return jsonResponse([
            {
              credit_balance: 120,
              daily_credit_used: 2,
              daily_credit_reset_date: "2026-02-12",
            },
          ]);
        }

        if (url.includes("/rest/v1/jobs")) {
          if (url.includes("id=eq.test-job")) {
            return jsonResponse([
              {
                id: "test-job",
                asin_a: "ASINA",
                asin_b: "ASINB",
                status: "completed",
                created_at: "2026-02-11T00:00:00Z",
              },
            ]);
          }
          return jsonResponse([
            {
              id: "recent-job-1",
              asin_a: "ASINA",
              asin_b: "ASINB",
              status: "completed",
              created_at: "2026-02-11T00:00:00Z",
            },
          ]);
        }

        if (url.includes("/rest/v1/job_stages")) {
          return jsonResponse(stages);
        }

        if (url.includes("/rest/v1/experiments")) {
          return jsonResponse([
            {
              id: "exp-1",
              asin_a: "ASINA",
              asin_b: "ASINB",
              created_at: "2026-02-11T00:00:00Z",
              change_tags: ["hero-image"],
            },
          ]);
        }

        if (url.includes("/rest/v1/analytics_events")) {
          return jsonResponse([
            {
              event_name: "stage_completed",
              stage_number: 1,
              properties: { duration_ms: 600 },
              created_at: "2026-02-11T00:00:00Z",
            },
            {
              event_name: "stage_completed",
              stage_number: 1,
              properties: { duration_ms: 850 },
              created_at: "2026-02-11T00:01:00Z",
            },
          ]);
        }

        if (url.includes("localhost:8000/credits/packs")) {
          return jsonResponse({
            currency: "USD",
            version: "v1",
            packs: [
              {
                id: "starter",
                label: "Starter",
                credits: 100,
                price_usd: 19,
                blurb: "Good for weekly testing.",
              },
            ],
          });
        }

        if (url.includes("localhost:8000/credits/operations")) {
          return jsonResponse({
            operations: [
              {
                idempotency_key: "op-1",
                operation_type: "purchase",
                amount: 100,
                job_id: null,
                stripe_session_id: "cs_test_123",
                created_at: "2026-02-11T00:00:00Z",
              },
            ],
          });
        }

        if (url.includes("localhost:8000/jobs/recent")) {
          return jsonResponse({
            jobs: [
              {
                id: "recent-job-1",
                asin_a: "ASINA",
                asin_b: "ASINB",
                status: "completed",
                created_at: "2026-02-11T00:00:00Z",
              },
            ],
          });
        }

        if (url.includes("localhost:8000/experiments/recent")) {
          return jsonResponse({
            experiments: [
              {
                id: "exp-1",
                asin_a: "ASINA",
                asin_b: "ASINB",
                created_at: "2026-02-11T00:00:00Z",
                change_tags: ["hero-image"],
              },
            ],
          });
        }

        if (url.includes("localhost:8000/analytics/events")) {
          if ((init?.method ?? "GET").toUpperCase() === "POST") {
            return new Response(null, { status: 204 });
          }
          return jsonResponse({
            events: [
              {
                event_name: "stage_completed",
                stage_number: 1,
                properties: { duration_ms: 650 },
                created_at: "2026-02-11T00:00:00Z",
              },
            ],
          });
        }

        if (url.includes("localhost:8000/credits/checkout")) {
          return jsonResponse({
            checkout_url: "https://checkout.stripe.com/pay/cs_test_mock",
            session_id: "cs_test_mock",
            pack_id: "starter",
          });
        }

        return originalFetch(input, init);
      };
    },
    { session: SESSION, user: SESSION_USER, stages: STAGES },
  );

  const overflowRoutes = [
    { route: "/", label: "landing", waitFor: "text=Avatar-Based Amazon Listing Optimizer" },
    { route: "/dashboard?checkout=success", label: "dashboard", waitFor: "text=Dashboard" },
    { route: "/experiments", label: "experiments", waitFor: "text=Experiments" },
    { route: "/jobs/test-job", label: "job-detail", waitFor: "text=Stage Progress" },
  ];

  for (const viewport of BREAKPOINTS) {
    for (const entry of overflowRoutes) {
      const page = await context.newPage();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${BASE_URL}${entry.route}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector(entry.waitFor, { timeout: 10_000 });
      } catch (error) {
        const currentUrl = page.url();
        const bodyText = await page.locator("body").innerText().catch(() => "");
        const qaState = await page
          .evaluate(() => ({
            fetchHits: window.__qa?.fetchHits ?? [],
            hasSessionStorage: Boolean(localStorage.getItem("sb-rytimbmptheorfqqibel-auth-token")),
          }))
          .catch(() => ({ fetchHits: [], hasSessionStorage: false }));
        throw new Error(
          `Failed waiting for selector ${entry.waitFor} on ${entry.label} @ ${viewport.name}. URL=${currentUrl}. hasSessionStorage=${qaState.hasSessionStorage}. fetchHits=${qaState.fetchHits.slice(0, 12).join(" | ")}. Body starts: ${bodyText.slice(0, 240)}. Original: ${error}`,
        );
      }
      await ensureNoHorizontalOverflow(page, entry.label, viewport);
      await page.close();
    }
  }

  const stripePage = await context.newPage({ viewport: { width: 1440, height: 1000 } });
  let stripeRequestObserved = false;
  await stripePage.route("https://checkout.stripe.com/**", async (route) => {
    stripeRequestObserved = true;
    await route.abort();
  });
  await stripePage.goto(`${BASE_URL}/dashboard?checkout=success`, { waitUntil: "domcontentloaded" });
  await stripePage.waitForSelector("text=Purchase confirmed. Credits may take a few seconds to appear.");
  await stripePage.getByRole("button", { name: "Buy with Stripe" }).click();
  let navigatedToStripe = false;
  try {
    await stripePage.waitForURL("https://checkout.stripe.com/**", { timeout: 5_000 });
    navigatedToStripe = true;
  } catch {
    navigatedToStripe = false;
  }
  let stripeAssignedUrl = null;
  if (!navigatedToStripe) {
    stripeAssignedUrl = await stripePage
      .evaluate(() => window.__qa?.stripeAssignedUrl ?? null)
      .catch(() => null);
  }
  assert(
    navigatedToStripe ||
      (typeof stripeAssignedUrl === "string" && stripeAssignedUrl.includes("checkout.stripe.com")) ||
      stripeRequestObserved,
    `Stripe redirect was not attempted. navigated=${String(navigatedToStripe)} assigned=${String(stripeAssignedUrl)} requestObserved=${String(stripeRequestObserved)}`,
  );
  await stripePage.close();

  const realtimePage = await context.newPage({ viewport: { width: 1024, height: 900 } });
  await realtimePage.goto(`${BASE_URL}/jobs/test-job`, { waitUntil: "domcontentloaded" });
  await realtimePage.waitForSelector("text=Stage Progress", { timeout: 10_000 });
  await realtimePage.waitForSelector("text=Progressive stages (Realtime)", { timeout: 10_000 });
  const fetchHits = await realtimePage.evaluate(() => window.__qa?.fetchHits ?? []);
  const fetchedJob = fetchHits.some((entry) => entry.includes("/rest/v1/jobs") && entry.includes("id=eq.test-job"));
  const fetchedStages = fetchHits.some((entry) => entry.includes("/rest/v1/job_stages"));
  assert(
    fetchedJob && fetchedStages,
    `Job detail realtime smoke check failed. fetchedJob=${String(fetchedJob)} fetchedStages=${String(fetchedStages)} fetchHits=${fetchHits.slice(0, 12).join(" | ")}`,
  );
  await realtimePage.close();

  await context.close();
  await browser.close();

  console.log("QA checks passed:");
  console.log("- Responsive overflow checks: 375 / 768 / 1024 / 1440 across landing/dashboard/experiments/job detail");
  console.log("- Stripe redirect behavior: success banner + redirect attempt to checkout.stripe.com");
  console.log("- Job detail realtime smoke: job + stage data fetched and realtime UI state rendered");
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
