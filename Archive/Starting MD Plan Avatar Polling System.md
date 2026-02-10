--- project-plan-v2.4-vision-text-weighted.md
+++ project-plan-v3.1-vision-first-hybrid.md
@@ -1,7 +1,7 @@
 PROJECT PLAN
 Avatar-Based Amazon Listing Optimizer
 
-Version 2.4 | Vision-First + Text-Weighted MVP | February 2026
+Version 3.1 | Vision-First Hybrid (Execution + Ops Hardened) | February 2026
 Solo Project | MVP Scope | Build Spec (Single Source of Truth)
 
 CONFIDENTIAL
@@
+## NON-GOALS (MVP — STRICT)
+
+The following are explicitly out of scope for MVP and MUST NOT be built unless required
+to reach the magic moment:
+
+- Multi-marketplace support (Shopify, Walmart, Etsy)
+- Non-US Amazon domains (.co.uk, .de, etc.)
+- Pixel-perfect Amazon UI reproduction
+- Full listing copywriter or “autopilot” optimization
+- Team collaboration, permissions, or shared workspaces
+- Chrome extension or browser injection
+- Bulk analysis or API access
+- Massive raw review scraping (1,000+ reviews per ASIN)
+
+If a feature does not directly improve:
+1) CTR insight accuracy
+2) CVR insight accuracy
+3) Speed to the magic moment
+
+It is deferred.
+
@@
 ## CORE PRINCIPLE
 
 This product evaluates Amazon listings the same way real shoppers decide:
 
 1. **CTR** — “Would I click this in search?”
 2. **CVR** — “Would I buy after clicking?”
 
 **Vision decides reality.**  
 **Text adjusts confidence.**  
 **Avatars explain impact.**
+
+Vision is the single source of truth for all judgments.
+Text and avatars are secondary, bounded signals.
+
@@
+## OPERATIONAL SIMPLICITY CHECKLIST
+
+Before MVP is considered complete, all items below must be true:
+
+- All background jobs are idempotent
+- Duplicate requests return the same job ID
+- Prompt versions are pinned per run
+- Image hashes are stored for every vision call
+- Credit cost is checked BEFORE execution
+- Failed jobs refund credits automatically
+- All LLM outputs are schema-validated
+- No worker stores state in memory
+
@@
 ## 5. EVALUATION PIPELINE
 
 User selects 2 ASINs →  
 Vision CTR evaluation →  
 Vision PDP evaluation →  
 Text alignment evaluation →  
 Avatar interpretation →  
 Final verdict + fixes
+
+This ordering is mandatory. Later stages may not override earlier ones.
+
@@
 ## 5.6 FINAL SCORING MODEL (DETERMINISTIC)
 
 Vision produces a base score:
 

Rules:
- Text can NEVER exceed vision influence
- Text can NEVER overturn a vision winner
- All weights are predefined constants
+
+No LLM is allowed to invent or modify scoring logic.
+
@@
+## PROMPT VERSIONING & QUALITY CONTROL
+
+All prompts (vision, text-alignment, avatar explanation) must:
+
+- Have a semantic version (e.g. vision-ctr-v1.1)
+- Be registered in a `prompt_versions` table
+- Store a content hash for reproducibility
+
+### Golden Test Set
+
+Maintain a fixed set of 5–10 ASIN pairs with known outcomes.
+
+After any prompt or model change:
+- Re-run golden tests
+- Compare winners and score deltas
+- Block deployment if drift exceeds ±1.0 score
+
+Golden tests protect against silent degradation.
+
@@
+## CREDIT SYSTEM (HARD GUARDRAILS)
+
+Credits exist to cap cost, not to meter value.
+
+Rules:
+- Credits are deducted BEFORE execution
+- Failed jobs refund credits automatically
+- No single run may exceed 25 credits
+- Daily caps prevent automation abuse
+
+Vision calls are the primary cost driver.
+Text alignment and avatar explanation must remain secondary in cost.
+
@@
+## EXPERIMENTS & RETENTION LOOP
+
+Every simulation can be saved as a baseline.
+
+Users may:
+- Log what changed (images, title, bullets, price)
+- Re-run simulation
+- See deltas in CTR/CVR confidence
+
+This creates:
+- Switching costs
+- Historical learning
+- Natural re-engagement
+
@@
+## ADDITIONAL RISKS & MITIGATIONS
+
+| Risk | Mitigation |
+|-----|-----------|
+| Vision model regression | Golden tests + image-index enforcement |
+| “Everything looks fine” output | Forced evidence references |
+| User distrust | Show “What the model saw” panel |
+| Runaway API costs | Credit caps + hard monthly budget |
+
@@
+## ADDITIONAL SUCCESS METRICS
+
+- CTR verdict agreement rate (“yes, I’d click that too”)
+- Image-fix adoption rate
+- Second simulation within 24h
+- % of simulations saved as experiments
+- Golden test stability over time
