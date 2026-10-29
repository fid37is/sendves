import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  SendEmailCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { serverEnv } from "@/lib/env.server";
import { PermanentSendError, type MailProvider } from "../types";

let client: SESv2Client | null = null;

function ses(): SESv2Client {
  if (!client) {
    const { region, accessKeyId, secretAccessKey } = serverEnv.aws;
    if (!region) throw new Error("AWS_REGION is not set.");
    client = new SESv2Client({
      region,
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }
  return client;
}

const PERMANENT = new Set(["MessageRejected", "BadRequestException", "InvalidParameterValue", "NotFoundException"]);

export const sesProvider: MailProvider = {
  name: "ses",

  async send(email) {
    try {
      const res = await ses().send(
        new SendEmailCommand({
          FromEmailAddress: email.from,
          Destination: { ToAddresses: [email.to] },
          ConfigurationSetName: serverEnv.aws.sesConfigurationSet || undefined,
          EmailTags: Object.entries(email.tags ?? {}).map(([Name, Value]) => ({ Name, Value })),
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: "UTF-8" },
              Body: { Html: { Data: email.html, Charset: "UTF-8" }, Text: { Data: email.text, Charset: "UTF-8" } },
              Headers: Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value })),
            },
          },
        }),
      );
      return { messageId: res.MessageId ?? "" };
    } catch (err) {
      const name = (err as { name?: string }).name ?? "";
      const message = (err as Error).message ?? "SES error";
      if (PERMANENT.has(name)) throw new PermanentSendError(`${name}: ${message}`);
      throw err;
    }
  },

  async ensureDomain(domain) {
    try {
      const res = await ses().send(
        new CreateEmailIdentityCommand({
          EmailIdentity: domain,
          DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
        }),
      );
      return { dkimTokens: res.DkimAttributes?.Tokens ?? [] };
    } catch (err) {
      if ((err as { name?: string }).name === "AlreadyExistsException") {
        const res = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
        return { dkimTokens: res.DkimAttributes?.Tokens ?? [] };
      }
      throw err;
    }
  },

  async getDomainStatus(domain) {
    const res = await ses().send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    const s = (res.DkimAttributes?.Status ?? "").toString().toUpperCase();
    return {
      verifiedForSending: Boolean(res.VerifiedForSendingStatus),
      dkimStatus: s === "SUCCESS" ? "success" : s === "FAILED" ? "failed" : "pending",
    };
  },

  async removeDomain(domain) {
    try {
      await ses().send(new DeleteEmailIdentityCommand({ EmailIdentity: domain }));
    } catch (err) {
      if ((err as { name?: string }).name !== "NotFoundException") throw err;
    }
  },
};
