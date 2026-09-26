import { DurableObject } from "cloudflare:workers";
import worker from "./worker.js";
import { askPublicJev, expirePublicJev, initializePublicJev } from "./jev-public-quota.js";

// Beta-only entry point: production has no public quota class or namespace.
export default worker;
export class JevPublicQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    initializePublicJev(this.ctx.storage);
  }
  async ask(question) { return askPublicJev(this.ctx.storage, this.env, question); }
  async alarm() { await expirePublicJev(this.ctx.storage); }
}
