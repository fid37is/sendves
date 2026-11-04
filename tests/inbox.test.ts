import assert from "node:assert/strict";
import { test } from "node:test";

process.env.APP_SECRET = "test-secret-test-secret-123456";
process.env.INBOUND_DOMAIN = "reply.sendves.test";

const ID = "3f2a9c1d-0b7e-4c55-9a10-6d8e2f4b7a01";

test("reply addresses: made by Sendves, read back, and not forgeable", async () => {
  const { replyAddress, parseReplyRecipient, parseReplyLocalPart, replyLocalPart } = await import("../src/server/inbox/address");
  const addr = replyAddress("c", ID, "Jon Doe")!;
  assert.match(addr, /^"Jon Doe" <c[0-9a-f]{32}\.[0-9a-f]{16}@reply\.sendves\.test>$/);
  assert.ok(replyLocalPart("s", ID).length <= 64, "a local part may not exceed 64 characters");

  const bare = addr.replace(/^.*</, "").replace(/>$/, "");
  assert.deepEqual(parseReplyRecipient([bare]), { kind: "c", id: ID });
  assert.deepEqual(parseReplyRecipient(["someone@else.test", addr]), { kind: "c", id: ID }); // finds it among other recipients
  assert.equal(parseReplyRecipient([bare.toUpperCase()])?.id, ID, "a mail system may change the case of an address");

  const [local] = bare.split("@");
  assert.equal(parseReplyLocalPart(local.replace(/.$/, (c) => (c === "0" ? "1" : "0"))), null, "a changed signature is refused");
  assert.equal(parseReplyLocalPart(local.replace(/^c/, "s")), null, "the kind is part of what is signed");
  assert.equal(parseReplyRecipient([`${local}@other.test`]), null, "only the inbound domain counts");
  assert.equal(parseReplyLocalPart("hello"), null);
  assert.throws(() => replyLocalPart("c", "not-an-id"));
});

test("splitQuoted keeps the new words and folds away the history", async () => {
  const { splitQuoted } = await import("../src/server/inbox/text");
  const gmail = "Yes, Tuesday works.\n\nOn Mon, Nov 2, 2026 at 3:04 PM Jon <jon@x.test> wrote:\n> Can we meet?\n> Jon";
  assert.deepEqual(splitQuoted(gmail), { body: "Yes, Tuesday works.", quoted: "On Mon, Nov 2, 2026 at 3:04 PM Jon <jon@x.test> wrote:\n> Can we meet?\n> Jon" });

  const wrapped = "Thanks!\n\nOn Mon, Nov 2, 2026 at 3:04 PM Jon Doe <jon.doe@example.test>\nwrote:\n> hi";
  assert.equal(splitQuoted(wrapped).body, "Thanks!");

  const outlook = "Sounds good.\n\nFrom: Jon <jon@x.test>\nSent: Monday, November 2, 2026 3:04 PM\nTo: Ada\nSubject: Hello\n\nCan we meet?";
  assert.equal(splitQuoted(outlook).body, "Sounds good.");
  assert.match(splitQuoted(outlook).quoted, /^From: Jon/);

  const original = "Reply\n\n-----Original Message-----\nFrom: a\nSent: b";
  assert.equal(splitQuoted(original).body, "Reply");

  assert.deepEqual(splitQuoted("Just one message."), { body: "Just one message.", quoted: "" });
  // A message that is ONLY quoted text still shows something.
  assert.equal(splitQuoted("> quoted only").body, "> quoted only");
  assert.equal(splitQuoted("On Monday we shipped it. Nice work.").quoted, "", "an ordinary sentence starting with On is not history");
});

test("textToHtml: paragraphs, line breaks, links; nothing typed becomes markup", async () => {
  const { textToHtml } = await import("../src/server/inbox/text");
  const html = textToHtml("Hi <b>Ada</b>,\nsecond line\n\nSee https://example.test/a?x=1&y=2.");
  assert.ok(!html.includes("<b>"), "tags are escaped");
  assert.ok(html.includes("&lt;b&gt;Ada&lt;/b&gt;,<br>second line"));
  assert.ok(html.includes('<a href="https://example.test/a?x=1&amp;y=2"'), "the link stops before the full stop");
  assert.equal((html.match(/<p /g) ?? []).length, 2);
  assert.ok(!textToHtml("javascript:alert(1)").includes("<a "));
});

test("replySubject does not pile up Re:", async () => {
  const { replySubject } = await import("../src/server/inbox/text");
  assert.equal(replySubject("Hello"), "Re: Hello");
  assert.equal(replySubject("RE: re: Hello"), "Re: Hello");
  assert.equal(replySubject(""), "Re: (no subject)");
});

test("automatic replies are recognised, people are not mistaken for robots", async () => {
  const { isAutoReply } = await import("../src/server/inbox/text");
  assert.equal(isAutoReply({ "auto-submitted": "auto-replied" }, "a@b.test", "Re: Hi"), true);
  assert.equal(isAutoReply({ "auto-submitted": "no" }, "a@b.test", "Re: Hi"), false);
  assert.equal(isAutoReply({ precedence: "bulk" }, "a@b.test", "Hi"), true);
  assert.equal(isAutoReply({ "x-autoreply": "yes" }, "a@b.test", "Hi"), true);
  assert.equal(isAutoReply({}, "mailer-daemon@b.test", "Hi"), true);
  assert.equal(isAutoReply({}, "ada@b.test", "Out of office: back Monday"), true);
  assert.equal(isAutoReply({}, "ada@b.test", "Re: Offices for rent"), false);
});

test("who may open a conversation", async () => {
  const { buildAccess } = await import("../src/lib/access");
  const { canSeeConversation } = await import("../src/lib/inbox");
  const sales = buildAccess("sales", null, []);
  const owner = buildAccess("owner", null, []);
  const conv = { ownerId: "u1", assignedTo: null as string | null };
  assert.equal(canSeeConversation(sales, "u1", conv), true, "the person who owns the address");
  assert.equal(canSeeConversation(sales, "u2", conv), false, "a colleague");
  assert.equal(canSeeConversation(sales, "u2", { ...conv, assignedTo: "u2" }), true, "whoever it is assigned to");
  assert.equal(canSeeConversation(owner, "u9", conv), true, "the owner sees everything");
  assert.equal(canSeeConversation(null, "u1", conv), false);
  const noInbox = buildAccess("sales", ["campaigns.view"], []);
  assert.equal(canSeeConversation(noInbox, "u1", conv), false, "no inbox permission, no conversations");
});

test("inbox permissions: roles can use their own inbox; seeing everything is a choice", async () => {
  const { buildAccess, can, sanitizePermissions } = await import("../src/lib/access");
  const m = buildAccess("marketing", null, []);
  assert.ok(can(m, "inbox.view") && can(m, "inbox.reply"));
  assert.ok(!can(m, "inbox.all"));
  assert.ok(sanitizePermissions(["inbox.reply"], "sales").includes("inbox.view"), "replying implies reading");
  assert.ok(sanitizePermissions(["inbox.all"], "sales").includes("inbox.view"));
});

test("campaign emails carry a Reply-To into the inbox; test emails don't", async () => {
  const { buildEmail } = await import("../src/server/sending/render");
  const { parseReplyRecipient } = await import("../src/server/inbox/address");
  const ws = { name: "Acme", business_address: "1 Main St", track_opens: false, timezone: "UTC" };
  const campaign = { id: "c1", subject: "Hi", from_name: "Acme Team", from_email: "hello@acme.test", html: "<html><body><p>x</p></body></html>", variables: [] };
  const contact = { first_name: "Ada", last_name: null, email: "ada@x.test" };
  const sendId = "123e4567-e89b-12d3-a456-426614174000";

  const real = buildEmail({ campaign, workspace: ws, contact, sendId });
  assert.ok(real.replyTo, "a real send has a Reply-To");
  assert.deepEqual(parseReplyRecipient([real.replyTo!]), { kind: "s", id: sendId }, "and it leads back to this send");
  assert.match(real.replyTo!, /^"Acme Team" </);

  const test = buildEmail({ campaign, workspace: ws, contact, sendId: null });
  assert.equal(test.replyTo, undefined);
});

test("a short reply that asks to unsubscribe is recognised; a long one that mentions it is not", async () => {
  const { looksLikeUnsubscribe } = await import("../src/server/inbox/text");
  for (const t of ["Unsubscribe", "Please unsubscribe me.", "remove me from this list", "STOP", "Stop emailing me!", "I want to opt out",
    "Please unsubscribe me\n\nOn Mon, Nov 2, 2026 at 3:04 PM Jon <j@x.test> wrote:\n> Our long newsletter text..."]) {
    assert.equal(looksLikeUnsubscribe(t), true, t);
  }
  for (const t of ["Thanks, count me in!", "Can you unsubscribe my colleague Ada from the Lagos list and also send the invoice for the March order we discussed on the phone?", "Stop by our stand tomorrow", ""]) {
    assert.equal(looksLikeUnsubscribe(t), false, t);
  }
});

test("saved replies fill in the contact's and the sender's names", async () => {
  const { fillSavedReply } = await import("../src/lib/inbox");
  assert.equal(fillSavedReply("Hi {{first_name}}, {{ my_name }} here.", { firstName: "Ada", myName: "Jon" }), "Hi Ada, Jon here.");
  assert.equal(fillSavedReply("Hi {{first_name}}", { name: "Ada Obi" }), "Hi Ada");
  assert.equal(fillSavedReply("Hi {{first_name}}", {}), "Hi there");
  assert.equal(fillSavedReply("Dear {{name}}", { name: "Ada Obi" }), "Dear Ada Obi");
  assert.equal(fillSavedReply("Code {{promo}}", { name: "A" }), "Code {{promo}}");
});

test("attachment rules: count, size, and files that run programs", async () => {
  const { checkAttachmentSet, isBlockedFileName } = await import("../src/lib/inbox");
  const MB = 1024 * 1024;
  assert.equal(checkAttachmentSet([{ name: "a.pdf", size: 2 * MB }, { name: "b.png", size: 3 * MB }]), null);
  assert.match(checkAttachmentSet([{ name: "a.pdf", size: 6 * MB }])!, /larger than 5 MB/);
  assert.match(checkAttachmentSet([{ name: "a.pdf", size: 4 * MB }, { name: "b.pdf", size: 4 * MB }])!, /7 MB/);
  assert.match(checkAttachmentSet(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, size: 10 })))!, /at most 5/);
  assert.match(checkAttachmentSet([{ name: "invoice.exe", size: 10 }])!, /blocked/);
  assert.match(checkAttachmentSet([{ name: "empty.txt", size: 0 }])!, /empty/);
  assert.ok(isBlockedFileName("run.SCR") && isBlockedFileName("x.js") && !isBlockedFileName("report.pdf") && !isBlockedFileName("notes.json"));
});

test("unread is per person", async () => {
  const { isUnreadFor } = await import("../src/lib/inbox");
  const c = { status: "open", lastDirection: "inbound", lastInboundAt: "2026-11-02T10:00:00Z" };
  assert.equal(isUnreadFor(c, null), true, "never opened");
  assert.equal(isUnreadFor(c, "2026-11-02T09:00:00Z"), true, "opened before the reply came");
  assert.equal(isUnreadFor(c, "2026-11-02T10:00:01Z"), false, "opened since");
  assert.equal(isUnreadFor({ ...c, lastDirection: "outbound" }, null), false, "someone already answered");
  assert.equal(isUnreadFor({ ...c, status: "closed" }, null), false);
  assert.equal(isUnreadFor({ ...c, lastInboundAt: null }, null), false);
});
