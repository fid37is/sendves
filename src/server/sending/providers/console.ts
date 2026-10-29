import { randomBytes, randomUUID } from "crypto";
import type { MailProvider } from "./types";

/** Development provider: prints emails instead of sending them. */
export const consoleProvider: MailProvider = {
  name: "console",
  async send(email) {
    const id = `console-${randomUUID()}`;
    console.log(`\n[console provider] to=${email.to} subject="${email.subject}" id=${id}`);
    console.log(`[console provider] headers=${JSON.stringify(email.headers)}`);
    return { messageId: id };
  },
  async ensureDomain() {
    return { dkimTokens: [randomBytes(8).toString("hex"), randomBytes(8).toString("hex"), randomBytes(8).toString("hex")] };
  },
  async getDomainStatus() {
    return { verifiedForSending: true, dkimStatus: "success" };
  },
  async removeDomain() {},
};
