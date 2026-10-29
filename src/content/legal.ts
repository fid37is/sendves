import type { LegalDoc } from "@/components/marketing/legal-page";

const updated = "October 22, 2026";

export const terms: LegalDoc = {
  title: "Terms of service",
  intro: "The rules for using Sendves. Please read them before you create an account.",
  updated,
  sections: [
    { heading: "Acceptance of these terms", body: ["By creating an account or using Sendves you agree to these terms. If you use Sendves on behalf of a business, you confirm you are allowed to accept them for that business."] },
    { heading: "Your account", body: ["You must provide accurate information, keep your password secure and tell us quickly if you suspect unauthorised access. You are responsible for activity in your workspace, including activity by people you invite."] },
    { heading: "Permitted use", body: ["Sendves is for sending permission-based email campaigns. You must follow our Acceptable Use Policy and Anti-Spam Policy and every law that applies to your emails and your recipients."] },
    { heading: "Your content and contacts", body: ["You own your content and contact data. You give Sendves permission to process it only to run the service for you. You confirm that you have the right to email every contact you import."] },
    { heading: "Sending limits and enforcement", body: ["New accounts have sending and list limits that may rise over time. We may hold, pause or reject a campaign and suspend an account that creates deliverability, legal or abuse risk, with or without notice where necessary to protect other customers."] },
    { heading: "Plans, billing and cancellation", body: ["Paid plans renew until you cancel. You can change or cancel your plan from your dashboard. Fees already paid are non-refundable unless the law or a written offer says otherwise."] },
    { heading: "Availability and liability", body: ["We work to keep Sendves reliable but do not promise uninterrupted service or that every email will be delivered, as delivery also depends on mailbox providers. To the extent the law allows, our liability is limited to the fees you paid in the previous twelve months."] },
    { heading: "Changes and contact", body: ["We may update these terms and will notify you of material changes. Continuing to use Sendves after a change means you accept it."] },
  ],
};

export const privacy: LegalDoc = {
  title: "Privacy policy",
  intro: "What personal data Sendves collects, why we collect it and the choices you have.",
  updated,
  sections: [
    { heading: "Data we collect", body: ["Account data such as your name, email address and password credentials. Workspace data such as your sender details and billing information. Usage and technical data such as log-in times, IP addresses and device information."] },
    { heading: "Your contacts’ data", body: ["When you upload contacts, you are the controller of that data and Sendves acts as your processor. We process it only to send your campaigns, record delivery events and keep suppression lists accurate."] },
    { heading: "How we use data", body: ["To provide and secure the service, send account and recovery emails, process payments, prevent abuse, meet legal obligations and improve the product."] },
    { heading: "Email tracking", body: ["Campaigns can include open and click tracking. Open tracking is unreliable because of mail-client privacy features, and you can turn it off in your settings."] },
    { heading: "Sharing", body: ["We share data with service providers that help us operate Sendves, such as hosting, email delivery, payment and support tools, under contracts that protect your data. We do not sell personal data."] },
    { heading: "Retention and deletion", body: ["We keep data while your account is active and for a limited period afterwards for legal and security reasons. You can export or delete your data on request."] },
    { heading: "Your rights", body: ["Depending on where you live, you may have the right to access, correct, delete, restrict or move your data, and to object to certain processing. Contact us to exercise these rights."] },
    { heading: "Security", body: ["We use encrypted connections, hashed passwords and access controls. No system is perfectly secure, and we will notify you of a breach as the law requires."] },
  ],
};

export const antiSpam: LegalDoc = {
  title: "Anti-spam policy",
  intro: "Sendves has zero tolerance for spam. This is what that means in practice.",
  updated,
  sections: [
    { heading: "Permission is required", body: ["You may email only people who have given you permission to contact them, or where the law allows it. You must be able to show when and how permission was given."] },
    { heading: "No purchased or scraped lists", body: ["Lists that were bought, rented, harvested or scraped are not allowed, and neither are lists of unknown origin."] },
    { heading: "Clear identification", body: ["Every email must clearly identify you as the sender, include a truthful subject line and include your physical address."] },
    { heading: "Easy unsubscribing", body: ["Every campaign includes an unsubscribe link and one-click unsubscribe headers. Unsubscribe requests are honoured immediately, and you may not re-add unsubscribed contacts."] },
    { heading: "How we enforce", body: ["We monitor bounce and complaint rates, review new accounts, and may pause campaigns or suspend accounts that exceed our thresholds or break this policy."] },
    { heading: "Reporting spam", body: ["If you received spam sent through Sendves, contact us with the full message headers and we will investigate promptly."] },
  ],
};

export const acceptableUse: LegalDoc = {
  title: "Acceptable use policy",
  intro: "What you may and may not send or do with Sendves.",
  updated,
  sections: [
    { heading: "Prohibited content", body: ["Phishing, malware, scams, deceptive or misleading messages, impersonation, illegal goods or services, adult content, hate speech, harassment and anything that is unlawful where it is sent or received."] },
    { heading: "Prohibited conduct", body: ["Evading sending limits, creating multiple accounts to avoid enforcement, probing or attacking Sendves, reselling the service without permission, or using Sendves to send transactional or automated messages outside its intended use."] },
    { heading: "Sender identity", body: ["You must send from a domain you own or control and must not forge headers or disguise the origin of a message."] },
    { heading: "Regulated industries", body: ["Content related to finance, health, gambling, cryptocurrency and similar areas may need extra review and may be restricted."] },
    { heading: "Consequences", body: ["Breaking this policy can lead to held or cancelled campaigns, suspended accounts and, where required, reports to authorities or mailbox providers."] },
  ],
};

export const dataProtection: LegalDoc = {
  title: "Data protection",
  intro: "How Sendves approaches GDPR, the Nigeria Data Protection Act (NDPA) and similar laws.",
  updated,
  sections: [
    { heading: "Roles", body: ["For your contacts’ data you are the controller and Sendves is the processor. For account and billing data Sendves is the controller."] },
    { heading: "Lawful basis and consent", body: ["You are responsible for having a lawful basis for emailing your contacts. Sendves helps by recording consent source and time, supporting double opt-in and honouring unsubscribes."] },
    { heading: "Data processing agreement", body: ["A data processing agreement is available to customers and covers the subject matter, duration, security measures and sub-processors."] },
    { heading: "Data subject requests", body: ["We help you respond to access, correction, deletion and portability requests. Contacts can unsubscribe at any time from any campaign."] },
    { heading: "International transfers", body: ["Where data is moved across borders, we use appropriate safeguards required by the laws that apply."] },
    { heading: "Registration and oversight", body: ["Sendves will complete any registration or compliance filing required under the NDPA and other applicable data protection laws before launch."] },
  ],
};
