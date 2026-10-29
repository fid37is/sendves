import { serverEnv } from "@/lib/env.server";
import { consoleProvider } from "./console";
import { sesProvider } from "./ses";
import type { MailProvider } from "./types";

export function getProvider(): MailProvider {
  return serverEnv.sending.provider === "ses" ? sesProvider : consoleProvider;
}

export type { MailProvider, OutboundEmail } from "./types";
export { PermanentSendError } from "./types";
