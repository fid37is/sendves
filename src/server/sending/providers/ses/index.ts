import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  SendEmailCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import MailComposer from "nodemailer/lib/mail-composer";
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

/** SES's simple format can't carry attachments, so those emails are sent as a complete MIME message. */
function buildRaw(email: Parameters<MailProvider["send"]>[0]): Promise<Uint8Array> {
  const mail = new MailComposer({
    from: email.from,
    to: [email.to, ...(email.alsoTo ?? [])],
    cc: email.cc?.length ? email.cc : undefined,
    bcc: email.bcc?.length ? email.bcc : undefined,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: email.headers,
    attachments: (email.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, contentDisposition: "attachment" as const })),
  });
  return new Promise((resolve, reject) => mail.compile().build((err, message) => (err ? reject(err) : resolve(new Uint8Array(message)))));
}

const PERMANENT = new Set(["MessageRejected", "BadRequestException", "InvalidParameterValue", "NotFoundException"]);

export const sesProvider: MailProvider = {
  name: "ses",

  async send(email) {
    try {
      const withFiles = (email.attachments?.length ?? 0) > 0;
      const res = await ses().send(
        new SendEmailCommand({
          FromEmailAddress: email.from,
          Destination: { ToAddresses: [email.to, ...(email.alsoTo ?? [])], CcAddresses: email.cc?.length ? email.cc : undefined, BccAddresses: email.bcc?.length ? email.bcc : undefined },
          ReplyToAddresses: !withFiles && email.replyTo ? [email.replyTo] : undefined,
          ConfigurationSetName: serverEnv.aws.sesConfigurationSet || undefined,
          EmailTags: Object.entries(email.tags ?? {}).map(([Name, Value]) => ({ Name, Value })),
          Content: withFiles ? { Raw: { Data: await buildRaw(email) } } : {
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
