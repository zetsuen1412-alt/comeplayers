export type LegalSection = {
  title: string;
  body: string[];
  bullets?: string[];
  details?: {
    label: string;
    value: string;
    href?: string;
  }[];
};

export type LegalPage = {
  slug: string;
  title: string;
  eyebrow: string;
  updatedAt: string;
  effectiveAt?: string;
  summary: string;
  status?: string;
  notice?: {
    title: string;
    body: string;
  };
  sections: LegalSection[];
};

export const legalPages: LegalPage[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    eyebrow: "Privacy & Personal Data",
    updatedAt: "24 July 2026",
    effectiveAt: "24 July 2026",
    status: "Effective Policy",
    summary:
      "How ComePlayers collects, uses, discloses, protects, transfers, and retains personal data when you use our marketplace, account, payment, messaging, community, livestream, seller, and support services.",
    notice: {
      title: "Your privacy matters",
      body:
        "This Policy explains the personal data practices that apply across ComePlayers. By using the platform, you acknowledge that your personal data will be processed as described here. Where consent is legally required, ComePlayers will request it separately and you may withdraw it through available controls or by contacting us.",
    },
    sections: [
      {
        title: "Introduction And Scope",
        body: [
          "This Privacy Policy explains how ComePlayers collects and processes personal data when you visit comeplayers.com, use the ComePlayers desktop or mobile applications, create or manage an account, buy or sell digital products, make or receive payments, use messages, groups, matchmaking, voice, video, screen sharing, or livestream features, contact support, participate in promotions, or otherwise interact with ComePlayers.",
          "This Policy applies to users, visitors, buyers, sellers, streamers, community participants, support requesters, and other individuals whose personal data is processed in connection with ComePlayers. It should be read together with the Terms of Service and any feature-specific notice presented when data is collected.",
          "A third-party service may provide its own privacy notice where it independently determines how personal data is processed. In that case, the third party's notice applies to its processing in addition to this Policy.",
        ],
      },
      {
        title: "Who Controls Your Personal Data",
        body: [
          "ComePlayers is operated by PT COME PLAYERS DIGITAL, an Indonesian limited liability company and the controller of personal data for the processing described in this Policy unless another notice expressly identifies a different controller. PT COME PLAYERS DIGITAL determines why and how personal data is processed to operate and secure the ComePlayers platform.",
          "The company details below are based on the official company establishment statement and Business Identification Number issued through the Government of the Republic of Indonesia. Contact details for privacy requests and complaints are provided at the end of this Policy.",
          "Payment processors, banks, identity-verification providers, social sign-in providers, game publishers, and certain other partners may act as independent controllers for the information they receive under their own legal obligations and privacy policies.",
        ],
        details: [
          {
            label: "Registered company",
            value: "PT COME PLAYERS DIGITAL",
          },
          {
            label: "Business Identification Number (NIB)",
            value: "2407260058305",
          },
          {
            label: "NIB issued",
            value: "24 July 2026",
          },
          {
            label: "Investment status and business scale",
            value: "Domestic Investment (PMDN) - Micro Business",
          },
          {
            label: "Primary licensed business field",
            value:
              "KBLI 47901 (2025) - Digital Platform for Retail Trade Intermediation",
          },
          {
            label: "Registered office",
            value:
              "Bumi Parahyangan Kencana, Jl. Beo Blok B3 No. 5, RT 01/RW 14, Nagrak, Cangkuang, Bandung Regency, West Java 40238, Indonesia",
          },
          {
            label: "Registered email",
            value: "thecomeplayers@gmail.com",
            href: "mailto:thecomeplayers@gmail.com",
          },
          {
            label: "Registered telephone",
            value: "+62 857-2143-9321",
            href: "tel:+6285721439321",
          },
        ],
      },
      {
        title: "Key Privacy Definitions",
        body: [
          "Personal data means information relating to an identified or identifiable person. It can identify you directly, such as a name or identity number, or indirectly when combined with other information, such as device, transaction, location, or account-linking data.",
          "Processing includes collecting, recording, organizing, storing, adapting, retrieving, using, sharing, transmitting, restricting, deleting, or otherwise handling personal data. Sensitive or specific personal data may receive additional protection under applicable law.",
          "Platform means the ComePlayers website, applications, marketplace, payment and wallet interfaces, community, communication, livestream, support, security, and related services.",
        ],
      },
      {
        title: "Personal Data We Collect",
        body: [
          "The personal data we collect depends on how you use ComePlayers, whether you are a buyer or seller, the features you enable, the transactions you perform, and the information needed to protect the platform.",
        ],
        bullets: [
          "Account and identity data, including name, username, date of birth or age confirmation where required, email address, telephone number, country, language, profile image, linked sign-in provider, authentication identifiers, and account preferences.",
          "Seller and business data, including store name, business details, identity or eligibility documents, tax information, beneficial-owner or representative details where required, verification results, seller level, and compliance status.",
          "Payment and payout data, including billing name and address, payment method type, transaction identifiers, amounts, currency, wallet entries, fees, refunds, chargebacks, bank or payout destination details, and reconciliation records. Complete card credentials are generally submitted directly to an authorized payment provider rather than stored by ComePlayers.",
          "Marketplace data, including listings, product categories, prices, inventory, purchase and sales history, order status, delivery evidence, buyer confirmation, cancellation, refund and dispute records, ratings, reviews, and promotional participation.",
          "Communications and content, including support tickets, reports, private messages, group or party communications, attachments, comments, reviews, moderation evidence, and audio, video, screen-sharing, or livestream data and metadata where those features are used.",
          "Device, technical, and usage data, including IP address, device and browser type, operating system, app version, language, time zone, approximate location derived from IP, device or advertising identifiers, log-in events, session activity, page interactions, referral URLs, crash reports, and diagnostic logs.",
          "Security, fraud, and risk data, including account-linking indicators, authentication history, failed payment signals, unusual transaction patterns, reported activity, enforcement history, dispute evidence, sanctions or screening results where legally required, and information used to protect users from abuse.",
          "Preference and marketing data, including notification choices, cookie choices, campaign interactions, survey responses, saved items, followed stores or categories, and inferred interests based on your use of ComePlayers where permitted.",
        ],
      },
      {
        title: "Sensitive Or Specific Personal Data",
        body: [
          "ComePlayers seeks to limit the collection of sensitive or specific personal data. We may process identity-document images, facial or liveness verification results, financial information, government identifiers, or other protected information when needed for identity verification, seller eligibility, payout security, legal compliance, fraud prevention, or account recovery.",
          "Do not upload health information, biometric data, religious beliefs, political opinions, passwords, authentication codes, complete payment credentials, or other highly sensitive information to listings, reviews, public profiles, chats, groups, or livestreams unless ComePlayers specifically requests it through an authorized and secure flow.",
          "Where applicable law requires explicit consent or another heightened legal basis for sensitive processing, ComePlayers or the relevant service provider will request it before processing.",
        ],
      },
      {
        title: "How We Collect Personal Data",
        body: [
          "We collect personal data directly from you when you register, update your profile, verify an account, publish a listing, place or fulfil an order, choose a payment or payout method, upload content, communicate with another user, join a group or livestream, contact support, submit a dispute, or change settings.",
          "We collect data automatically from your browser, device, application, cookies, local storage, SDKs, server logs, and security systems when you access or use ComePlayers.",
          "We may receive data from buyers, sellers, payment and payout providers, authentication providers, identity-verification services, fraud-prevention partners, analytics and hosting providers, public or lawful sources, regulators, rights holders, and other parties that report activity or assist with platform operations.",
        ],
      },
      {
        title: "Purposes And Legal Bases For Processing",
        body: [
          "ComePlayers processes personal data only for specified and lawful purposes. Depending on the activity and applicable law, processing may be necessary to perform a contract with you, take steps at your request before entering a contract, comply with legal obligations, protect legitimate interests, establish or defend legal claims, protect vital interests, or act on your consent.",
        ],
        bullets: [
          "Contract performance: creating and maintaining accounts, processing orders, delivering marketplace features, enabling messages and community functions, handling payments, refunds, disputes, wallet activity, and seller payouts.",
          "Legal obligations: maintaining accounting and tax records, responding to lawful requests, applying required identity or payment controls, and meeting electronic-system, consumer-protection, anti-fraud, and other regulatory duties.",
          "Legitimate interests: protecting accounts and transactions, preventing fraud and abuse, improving services, measuring performance, enforcing policies, protecting legal rights, and maintaining a trusted marketplace, provided those interests are not overridden by applicable individual rights.",
          "Consent: optional marketing, certain cookies or device permissions, sensitive-data processing where required, and other activities for which ComePlayers expressly requests permission.",
        ],
      },
      {
        title: "Account, Authentication, And Profile Use",
        body: [
          "ComePlayers uses account and authentication data to register users, verify contact details, maintain login sessions, provide account recovery, manage security settings, display permitted profile information, prevent duplicate or abusive accounts, and communicate important service notices.",
          "Usernames, display names, profile images, store names, badges, ratings, reviews, listing information, and other information intentionally published through the platform may be visible to other users or the public. Search engines may index information made publicly accessible.",
          "Private account details, identity documents, security credentials, payment details, order evidence, and support records are not intended for public display and are restricted according to operational need and applicable access controls.",
        ],
      },
      {
        title: "Marketplace, Orders, Payments, And Payouts",
        body: [
          "We process marketplace and transaction data to publish and rank listings, enable search and checkout, calculate prices and fees, process orders, record digital delivery, apply PlayerGuard or other transaction controls, release or hold funds, support refunds and cancellations, resolve disputes, prevent duplicate payments, and maintain financial records.",
          "Information necessary to complete a transaction may be shared between the buyer and seller, including username, order details, delivery instructions, delivery evidence, and communications. Users must use this information only for the transaction and must not misuse it for unrelated marketing, harassment, or off-platform activity.",
          "Payment and payout providers may collect identity, billing, bank, card, wallet, or transaction information directly. ComePlayers may receive status, risk, tokenized payment references, transaction identifiers, amount, currency, and other information needed for reconciliation, refunds, chargebacks, fraud review, and support.",
        ],
      },
      {
        title: "Identity Verification And Compliance",
        body: [
          "ComePlayers may request identity, age, business, seller, source-of-funds, payout-owner, or other verification information before enabling high-risk features, increasing transaction limits, processing withdrawals, restoring an account, or complying with legal and payment-partner requirements.",
          "Verification may be performed by ComePlayers or an approved provider. The provider may compare identity information, documents, liveness signals, device data, or authoritative sources and return verification outcomes or risk indicators.",
          "We retain verification records only for as long as reasonably required for the relevant purpose, fraud prevention, audit, disputes, and legal obligations. Access is limited to authorized personnel and providers with a legitimate operational need.",
        ],
      },
      {
        title: "Messages, Groups, Matchmaking, And Livestreams",
        body: [
          "ComePlayers processes messages, group activity, invitations, matchmaking preferences, attachments, voice or video session metadata, moderation reports, and livestream information to provide communication and community features, deliver invitations, maintain session quality, enforce rules, investigate reports, and protect participants.",
          "Content shared with another user can be copied, recorded, screenshotted, or redistributed by that user. Do not share information you do not want the recipient to retain. ComePlayers cannot control how another user uses information after receiving it, but policy violations may be reported for investigation.",
          "Automated and human moderation may review content or metadata when content is reported, flagged by safety systems, required for support, or reasonably necessary to detect scams, prohibited transactions, threats, exploitation, harassment, malware, or other policy violations.",
        ],
      },
      {
        title: "Cookies And Similar Technologies",
        body: [
          "ComePlayers uses cookies, local storage, device identifiers, pixels, SDKs, and similar technologies to keep users signed in, protect accounts, remember settings, maintain carts and transaction flows, measure service performance, diagnose errors, understand feature usage, prevent fraud, and support permitted marketing.",
          "Essential technologies are required for core functions such as authentication, security, checkout, preference storage, and load balancing. Optional analytics or advertising technologies will be subject to consent or other controls where required by law.",
          "You can manage available cookie choices through the ComePlayers consent interface and browser or device settings. Blocking essential technologies may prevent login, checkout, account security, livestream, or other features from functioning correctly.",
        ],
      },
      {
        title: "Analytics, Personalization, And Marketing",
        body: [
          "We may analyze usage, search, purchase, listing, engagement, device, and campaign data to understand how ComePlayers is used, improve navigation and reliability, recommend relevant games, categories, listings, sellers, groups, or features, and measure promotions.",
          "We may send transactional and service communications such as authentication codes, security alerts, order updates, payout notices, policy changes, and support messages. These communications are necessary to operate the service and cannot always be disabled while an account remains active.",
          "Where permitted, ComePlayers may send promotional email, push notifications, or in-app messages. You can unsubscribe from non-essential marketing through the message, notification settings, or support. Unsubscribing does not stop necessary service communications.",
        ],
      },
      {
        title: "Automated Decisions, Ranking, And Fraud Prevention",
        body: [
          "ComePlayers may use automated rules, scoring, filters, recommendation systems, ranking models, and fraud-detection tools to identify suspicious behavior, prioritize reviews, rank listings, personalize experiences, moderate content, apply transaction limits, delay a payment or payout, request verification, or restrict risky activity.",
          "These systems may consider account history, device and network signals, transaction patterns, disputes, reports, listing quality, delivery performance, authentication events, and other relevant indicators. ComePlayers does not use automated systems to make decisions based on protected characteristics.",
          "Where applicable law grants a right to human review of a decision that produces significant legal or similarly significant effects, you may contact ComePlayers Support and provide relevant information for review.",
        ],
      },
      {
        title: "When We Disclose Personal Data",
        body: [
          "ComePlayers does not sell personal data as a standalone product. We disclose personal data only when reasonably necessary to operate the platform, complete a transaction, provide a requested feature, protect users, enforce agreements, comply with law, or follow your instructions.",
        ],
        bullets: [
          "Other users, when information is necessary for a transaction, communication, group, livestream, public profile, listing, review, dispute, or other feature you choose to use.",
          "Payment, payout, banking, tax, identity-verification, fraud-prevention, authentication, and compliance providers involved in processing or securing an account or transaction.",
          "Cloud hosting, database, content-delivery, storage, cybersecurity, email, SMS, push notification, analytics, communications, livestream, customer-support, audit, legal, accounting, and other professional service providers acting under appropriate obligations.",
          "Game publishers, rights holders, or business partners where required to provide a product, verify authorization, investigate infringement, operate a campaign, or address platform abuse.",
          "Courts, regulators, law-enforcement bodies, government authorities, payment networks, financial institutions, or other parties when disclosure is required by law or reasonably necessary to protect rights, safety, property, transactions, or platform integrity.",
          "A buyer, investor, lender, adviser, or successor in connection with a merger, financing, restructuring, acquisition, sale of assets, or similar transaction, subject to appropriate confidentiality and data-protection safeguards.",
          "Any other party when you direct us to disclose the data or provide valid consent.",
        ],
      },
      {
        title: "International Data Transfers",
        body: [
          "ComePlayers and its service providers may process or store personal data in Indonesia and other countries where infrastructure, support, security, payment, communications, or other providers operate. Privacy laws and government-access rules may differ between countries.",
          "Where required by applicable law, ComePlayers will assess the transfer and use appropriate contractual, organizational, or technical safeguards designed to protect personal data during cross-border processing.",
          "By using globally operated features, you understand that transaction counterparties or communications recipients may be located in other countries. ComePlayers limits the information shared to what is necessary for the relevant feature or transaction.",
        ],
      },
      {
        title: "Data Security And Incident Response",
        body: [
          "ComePlayers applies reasonable technical and organizational measures designed to protect personal data against unauthorized access, acquisition, disclosure, alteration, misuse, loss, or destruction. Measures may include encryption in transit, access controls, authentication, monitoring, audit logs, secure development practices, backups, provider reviews, least-privilege access, and incident-response procedures.",
          "No online platform can guarantee absolute security. You are responsible for protecting your password, devices, email account, one-time codes, recovery methods, and active sessions. Never send authentication codes or passwords to another user or to anyone claiming to represent ComePlayers.",
          "If a personal-data incident occurs, ComePlayers will investigate, contain, remediate, document, and provide notifications to affected individuals or authorities when required by applicable law.",
        ],
      },
      {
        title: "Data Retention",
        body: [
          "ComePlayers retains personal data only for as long as reasonably necessary for the purposes described in this Policy, including account operation, transaction completion, security, fraud prevention, moderation, customer support, dispute resolution, accounting, tax, audit, compliance, and legal claims.",
          "Retention periods vary by the nature of the data and activity. Financial, order, refund, payout, verification, security, moderation, and dispute records may be retained after account closure where required by law, payment-network rules, fraud-prevention needs, or legitimate legal interests.",
          "When personal data is no longer required, ComePlayers will delete, anonymize, aggregate, or securely isolate it in accordance with applicable requirements and operational limitations such as backup cycles and legal holds.",
        ],
      },
      {
        title: "Your Privacy Rights",
        body: [
          "Subject to applicable law and valid exceptions, you may have the right to obtain information about processing, confirm whether ComePlayers holds your personal data, access a copy, correct inaccurate or incomplete data, request deletion, restrict or object to certain processing, withdraw consent, and receive portable data in a commonly used format.",
          "You may also have the right to complain, request review of certain automated decisions, and seek remedies for unlawful processing. Some requests may be limited where data must be retained for transactions, fraud prevention, legal obligations, claims, public interest, or the rights and safety of another person.",
          "ComePlayers may request information necessary to verify your identity and authority before acting on a privacy request. We may ask for clarification where a request is unclear, excessive, or covers data that cannot be reliably linked to your account.",
        ],
      },
      {
        title: "Privacy Choices And Account Deletion",
        body: [
          "You can update certain account, profile, notification, security, and privacy settings through ComePlayers. You may opt out of non-essential marketing, manage available cookie choices, revoke optional device permissions, and disconnect supported third-party sign-in methods where available.",
          "You may request account deletion through available account controls or ComePlayers Support. Closing an account does not automatically erase records that ComePlayers must retain for completed orders, payments, payouts, taxes, security, fraud prevention, disputes, enforcement, or legal obligations.",
          "Where processing is based on consent, you may withdraw consent at any time. Withdrawal does not affect processing already performed lawfully and may cause an optional or essential feature to become unavailable depending on the data involved.",
        ],
      },
      {
        title: "Children And Age Requirements",
        body: [
          "ComePlayers must not be used in violation of applicable age requirements or the Terms of Service. Seller, payment, payout, identity-verification, and other legally significant features may require the user to be at least 18 years old or the age of legal majority in the relevant jurisdiction.",
          "A parent or lawful guardian must provide any consent required by applicable law for a younger user. ComePlayers may restrict or close an account where age requirements are not met or adequate authorization cannot be verified.",
          "If you believe a child has provided personal data without valid authorization, contact ComePlayers so we can investigate and take appropriate action.",
        ],
      },
      {
        title: "Third-Party Services And External Links",
        body: [
          "ComePlayers may integrate payment providers, social sign-in, analytics, cloud hosting, notifications, communications, livestream infrastructure, game or publisher services, and other third-party tools. Those parties may collect and process information under their own privacy notices and legal responsibilities.",
          "External websites, seller resources, games, publisher pages, advertisements, and services linked from ComePlayers are not controlled by this Policy. Review the relevant third party's privacy practices before providing information or using its service.",
          "ComePlayers is not responsible for a third party's independent privacy practices, but we seek to select and manage providers according to operational, security, and legal requirements appropriate to their role.",
        ],
      },
      {
        title: "Changes To This Privacy Policy",
        body: [
          "ComePlayers may update this Policy when services, technologies, providers, legal requirements, or data practices change. The latest updated and effective dates will be displayed at the top of this page.",
          "Material changes may also be communicated through the platform, by email, or by another appropriate method before they take effect where required. ComePlayers will request new consent when applicable law requires consent for a new processing purpose.",
          "Previous versions may be retained for legal, audit, and transparency purposes. Your continued use of ComePlayers after the effective date is subject to the updated Policy, except where affirmative consent is required.",
        ],
      },
      {
        title: "Contact, Requests, And Complaints",
        body: [
          "For privacy questions, access or correction requests, account-data requests, consent withdrawal, deletion requests, security reports, or complaints, contact ComePlayers at admin@comeplayers.com or through the ComePlayers Support Center.",
          "Data controller and correspondence address: PT COME PLAYERS DIGITAL, Bumi Parahyangan Kencana, Jl. Beo Blok B3 No. 5, RT 01/RW 14, Nagrak, Cangkuang, Bandung Regency, West Java 40238, Indonesia.",
          "Business Identification Number (Nomor Induk Berusaha/NIB): 2407260058305.",
          "Provide enough information to identify your account and explain the request. Do not send passwords, one-time codes, complete payment credentials, or unnecessary identity documents by ordinary email. You may also submit a complaint to a competent personal-data protection or other supervisory authority where applicable law gives you that right.",
        ],
      },
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms Of Service",
    eyebrow: "User Agreement",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Terms",
    summary:
      "The legally binding rules that govern access to ComePlayers, marketplace transactions, digital delivery, payments, messages, groups, livestreams, and other ComePlayers services.",
    notice: {
      title: "Please read these Terms carefully",
      body:
        "By creating an account, accessing ComePlayers, publishing a listing, placing an order, accepting a delivery, using a wallet or payout feature, or otherwise using the service, you agree to these Terms and the policies incorporated into them. If you do not agree, do not use ComePlayers.",
    },
    sections: [
      {
        title: "About These Terms",
        body: [
          "These Terms of Service form an agreement between you and ComePlayers for your use of the ComePlayers website, desktop and mobile applications, marketplace, messages, groups, livestream features, support services, and related products or services.",
          "Additional policies may apply to particular activities, including the Privacy Policy, Product and Offering Policy, Seller Rules, Payment, Fee and Payout Schedule, Refund and Dispute Policy, and other notices displayed through the service. Those policies are incorporated into these Terms by reference.",
          "If a mandatory law gives you rights that cannot be excluded or limited, these Terms do not remove those rights.",
        ],
      },
      {
        title: "Eligibility And Legal Capacity",
        body: [
          "You may use ComePlayers only if you can enter into a legally binding agreement and your use is not prohibited by applicable law, sanctions, platform restrictions, or the rules of a relevant game, publisher, payment provider, or digital service.",
          "Certain seller, payment, payout, verification, or business features may require you to be at least 18 years old or the age of legal majority in your jurisdiction. A parent or lawful guardian is responsible for permitted use by a minor under their supervision.",
        ],
        bullets: [
          "Do not create an account using false age, identity, business, or location information.",
          "Do not use ComePlayers on behalf of a person or organization unless you are authorized to bind them.",
          "ComePlayers may request identity, business, payment, tax, or eligibility verification before allowing access to higher-risk features.",
        ],
      },
      {
        title: "Account Registration And Security",
        body: [
          "You must provide accurate, current, and complete account information and keep it updated. You are responsible for activity performed through your account unless applicable law provides otherwise.",
          "Keep your password, one-time codes, recovery methods, linked sign-in accounts, and devices secure. Notify ComePlayers promptly if you suspect unauthorized access, account takeover, fraud, or disclosure of credentials.",
        ],
        bullets: [
          "One person or business may not operate deceptive duplicate accounts or use multiple accounts to avoid restrictions, limits, fees, reviews, or enforcement.",
          "Accounts may not be sold, rented, transferred, shared commercially, or used to impersonate another person or organization.",
          "ComePlayers may require re-authentication, verification, or security controls before sensitive actions are completed.",
        ],
      },
      {
        title: "The Role Of ComePlayers",
        body: [
          "ComePlayers provides a digital marketplace and communication infrastructure through which users may discover, offer, purchase, sell, deliver, review, and discuss digital products or services. Unless ComePlayers is expressly identified as the seller, ComePlayers is not the owner, creator, publisher, or direct supplier of a third-party listing.",
          "ComePlayers may provide transaction records, payment orchestration, escrow-like release controls, wallet ledgers, risk review, dispute tools, moderation, and support. These services do not guarantee that every user, listing, product, service, or transaction will meet your expectations or remain available.",
          "ComePlayers may act on information available to it, but users remain responsible for evaluating listings and complying with applicable law and third-party rules.",
        ],
      },
      {
        title: "Marketplace Listings",
        body: [
          "A seller must publish listings that are truthful, complete, current, and placed in the correct category. Titles, descriptions, images, variants, regions, quantities, prices, delivery methods, requirements, and estimated delivery times must accurately describe the offer.",
          "A listing must not mislead buyers about ownership, authorization, availability, compatibility, transferability, warranty, risk, or the identity of the seller. Sellers must update or remove unavailable and inaccurate listings promptly.",
        ],
        bullets: [
          "Do not list stolen, compromised, illegally obtained, counterfeit, fraudulent, harmful, or prohibited products or services.",
          "Do not use another party's trademarks, images, descriptions, or copyrighted works without authorization or a valid legal basis.",
          "ComePlayers may review, reject, edit for formatting, re-categorize, limit, suspend, or remove a listing when reasonably necessary to operate or protect the marketplace.",
        ],
      },
      {
        title: "Buying On ComePlayers",
        body: [
          "Before placing an order, buyers must review the listing, region, platform, product type, quantity, delivery method, seller terms, and total price. An order is an offer to purchase under the listing conditions and these Terms.",
          "A buyer must provide the information reasonably needed for delivery and must not intentionally delay, obstruct, or manipulate confirmation, dispute, refund, or evidence processes.",
          "Prices and availability may change before checkout is completed. The order record and checkout pricing snapshot determine the transaction details after payment is accepted, subject to correction of clear technical or pricing errors where permitted by law.",
        ],
      },
      {
        title: "Selling On ComePlayers",
        body: [
          "A seller must have the right and ability to offer and deliver each listed product or service. The seller is responsible for the accuracy, legality, quality, safety, compatibility, and timely fulfilment of the offer.",
          "Sellers must communicate professionally, deliver only through approved methods, retain sufficient evidence, and respond to order or dispute requests within the time shown by the service.",
        ],
        bullets: [
          "Do not mark an order as delivered before the promised product or service has actually been provided.",
          "Do not ask a buyer to confirm delivery early, close a dispute, remove an honest review, or make an external payment as a condition of receiving the order.",
          "Seller balances and payouts remain subject to order completion, fraud review, refunds, chargebacks, reserves, taxes, fees, and other applicable controls.",
        ],
      },
      {
        title: "Orders And Contract Formation",
        body: [
          "An order becomes active when ComePlayers records successful payment or another approved payment status. The contract for the listed product or service is generally between the buyer and the seller, while ComePlayers provides the platform services described in these Terms.",
          "ComePlayers may reject, pause, cancel, or require additional verification for an order when there is suspected fraud, a pricing or technical error, a prohibited product, payment failure, sanctions risk, security concern, or another reasonable marketplace-protection reason.",
          "Order status, timestamps, messages, delivery evidence, payment records, and system logs may be used to administer the transaction and resolve disagreements.",
        ],
      },
      {
        title: "Payments, Wallets, Fees, And Taxes",
        body: [
          "Buyers must pay the total amount shown at checkout using an available payment method. Payment services may be provided by third parties and may be subject to their own terms, verification, limits, exchange rates, and processing rules.",
          "ComePlayers may charge marketplace, payment, service, withdrawal, currency-conversion, or other disclosed fees. Applicable fees, taxes, deductions, and seller earnings are determined by the order or payout record and the current Payment, Fee and Payout Schedule.",
          "Wallet and balance displays are platform ledger records, not bank accounts, deposits, savings products, or stored-value guarantees unless expressly stated otherwise. Balances may be held, adjusted, reversed, or restricted to reflect refunds, chargebacks, disputes, duplicate entries, fraud, technical errors, or legal obligations.",
        ],
      },
      {
        title: "Delivery And Order Completion",
        body: [
          "The seller must deliver using the method and time stated in the listing. The buyer must inspect the delivery promptly and report a material problem through the available order or dispute process before the applicable confirmation period expires.",
          "An order may be completed when the buyer confirms delivery, when an applicable inspection period expires without a valid dispute, or when ComePlayers resolves the order based on available evidence.",
          "Completion may release eligible seller funds, but later adjustments may still occur for fraud, payment reversal, chargeback, legal order, duplicate payment, or another valid reason.",
        ],
      },
      {
        title: "Cancellations, Refunds, And Reversals",
        body: [
          "Cancellation and refund eligibility depends on the order status, product type, delivery evidence, seller performance, buyer conduct, payment status, and the Refund and Dispute Policy. Digital products may become non-refundable after valid delivery or use, except where applicable law requires otherwise.",
          "Refunds are normally returned through the original payment method or another method selected by ComePlayers or the payment provider. Processing times may depend on banks, card networks, payment providers, currency conversion, and verification requirements.",
          "A user must not abuse cancellations, refunds, chargebacks, payment disputes, or duplicate claims. ComePlayers may recover amounts, fees, losses, or negative balances caused by an invalid reversal or a user's breach of these Terms.",
        ],
      },
      {
        title: "Disputes And Evidence",
        body: [
          "Buyers and sellers should first use the order conversation and dispute tools to explain the issue and provide complete, authentic, and relevant evidence. Evidence may include platform messages, delivery records, timestamps, screenshots, recordings, account history, technical logs, and payment information.",
          "ComePlayers may decide a marketplace dispute based on the information reasonably available, the applicable policies, transaction risk, and user conduct. A marketplace decision is an administrative platform decision and does not prevent a party from exercising non-waivable legal rights.",
        ],
        bullets: [
          "Do not fabricate, alter, selectively crop, delete, or conceal material evidence.",
          "Keep transaction communication inside ComePlayers whenever the service provides an appropriate messaging channel.",
          "Failure to respond within a stated deadline may allow ComePlayers to decide using the existing record.",
        ],
      },
      {
        title: "Messages, Groups, And Livestream Features",
        body: [
          "ComePlayers may provide direct messages, group conversations, matchmaking, invitations, voice, video, screen sharing, and livestream features. You are responsible for the content you transmit and for obtaining permission before sharing another person's information, image, voice, gameplay, or private communication.",
          "Do not use communication features for harassment, threats, hate, sexual exploitation, doxxing, spam, scams, malware, unlawful gambling, prohibited sales, or attempts to move protected transactions off the platform.",
          "ComePlayers may use automated and human moderation, safety signals, reports, and technical controls to limit harmful or abusive activity.",
        ],
      },
      {
        title: "User Content, Reviews, And Feedback",
        body: [
          "You retain ownership of content you lawfully create, but you grant ComePlayers a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, format, transmit, moderate, and otherwise use that content as reasonably necessary to operate, secure, promote, and improve the service.",
          "Reviews must reflect a genuine transaction or experience and must not be purchased, traded, coerced, manipulated, or used to reveal sensitive personal information. ComePlayers may remove content that violates these Terms, a policy, law, or the rights of another person.",
          "Suggestions and feedback may be used by ComePlayers without compensation or an obligation to implement them, provided that personal data remains handled under the Privacy Policy.",
        ],
      },
      {
        title: "Prohibited Conduct",
        body: [
          "You must not misuse ComePlayers, interfere with other users, compromise security, manipulate marketplace systems, or use the service for unlawful or deceptive activity.",
        ],
        bullets: [
          "Fraud, scams, account takeover, money laundering, stolen payment methods, false identity documents, chargeback abuse, or attempts to conceal the source or destination of funds.",
          "Bypassing marketplace fees, escrow-like controls, order records, communication safeguards, seller limits, geographic restrictions, verification, moderation, or enforcement.",
          "Scraping, crawling, reverse engineering, automated account creation, denial-of-service activity, vulnerability exploitation, malware, bots, or unauthorized access except with prior written authorization.",
          "Manipulating rankings, reviews, prices, sales records, referrals, promotions, statistics, search results, or transaction evidence.",
          "Harassment, discrimination, threats, impersonation, spam, deceptive advertising, infringement, or publication of another person's confidential or personal data without authority.",
        ],
      },
      {
        title: "Intellectual Property",
        body: [
          "ComePlayers and its licensors own the service, software, interface, design, databases, logos, trademarks, original content, and other protected materials, excluding user content and third-party materials. These Terms grant you a limited, revocable, non-transferable right to use the service for its intended purpose.",
          "You may not copy, sell, sublicense, redistribute, create confusingly similar branding, remove notices, or exploit ComePlayers intellectual property except as permitted by law or written authorization.",
          "Rights holders may report allegedly infringing listings or content through ComePlayers Support. Reports should identify the protected work, the challenged material, the reporter's authority, and accurate contact information.",
        ],
      },
      {
        title: "Third-Party Products And Services",
        body: [
          "ComePlayers may link to or integrate payment providers, identity providers, publishers, games, social platforms, cloud services, analytics, livestream infrastructure, and other third parties. Their products and services are governed by their own terms and privacy practices.",
          "ComePlayers is not responsible for third-party outages, policy changes, account actions, content, security, or performance except to the extent responsibility cannot lawfully be excluded.",
          "A listing involving a third-party game, account, item, gift card, software licence, or service may also be subject to that third party's rules. Users are responsible for evaluating and complying with those rules.",
        ],
      },
      {
        title: "Verification, Risk Controls, And Compliance",
        body: [
          "ComePlayers may request identity, business, tax, address, payment, ownership, source-of-funds, delivery, or other information when reasonably needed for security, fraud prevention, payout, legal compliance, or marketplace trust.",
          "Transactions, listings, messages, devices, accounts, and relationships may be evaluated using automated rules and human review. ComePlayers may delay an order or payout, impose limits, hold a reserve, request additional evidence, or restrict a feature while a review is pending.",
          "You must provide authentic information and cooperate with lawful and reasonable review requests. ComePlayers may retain relevant records as described in the Privacy Policy and applicable law.",
        ],
      },
      {
        title: "Suspension, Restriction, And Termination",
        body: [
          "ComePlayers may warn, limit, suspend, or terminate access; remove content or listings; cancel orders; delay or restrict payouts; disable communication features; or take another proportionate action when it reasonably believes there is a breach, fraud, harm, legal risk, security issue, or threat to marketplace integrity.",
          "Where appropriate, ComePlayers may give notice or an opportunity to respond. Immediate action may be taken when delay could cause harm, evidence loss, legal exposure, payment loss, or continued abuse.",
          "You may stop using ComePlayers and request account deletion, but outstanding orders, disputes, fees, negative balances, investigations, record-retention duties, and provisions intended to survive termination remain effective.",
        ],
      },
      {
        title: "Service Availability And Changes",
        body: [
          "ComePlayers may add, modify, test, suspend, or discontinue features, categories, payment methods, interfaces, limits, or availability. Maintenance, security events, provider outages, network failures, legal restrictions, and other events may interrupt access.",
          "ComePlayers will use reasonable efforts to operate the service reliably but does not guarantee uninterrupted, error-free, or universally available access. Users should maintain their own records and backups where appropriate.",
        ],
      },
      {
        title: "Disclaimers",
        body: [
          "To the maximum extent permitted by law, ComePlayers is provided on an 'as available' and 'as is' basis. ComePlayers does not make warranties about uninterrupted access, absolute security, merchantability, fitness for a particular purpose, non-infringement, or the accuracy, legality, quality, ownership, or availability of third-party listings and user content.",
          "No statement by support, a seller, a buyer, an administrator, or another user creates a warranty beyond an express written commitment made by an authorized ComePlayers representative.",
          "Nothing in these Terms excludes warranties, guarantees, liabilities, or consumer rights that cannot legally be excluded.",
        ],
      },
      {
        title: "Limitation Of Liability",
        body: [
          "To the maximum extent permitted by law, ComePlayers and its directors, personnel, affiliates, and service providers are not liable for indirect, incidental, special, exemplary, punitive, or consequential losses, or for lost profits, revenue, data, business, goodwill, opportunity, or anticipated savings arising from use of the service.",
          "Where liability may lawfully be limited, ComePlayers' aggregate liability relating to a claim will not exceed the greater of the fees paid by you to ComePlayers for the affected transaction or service during the six months before the event giving rise to the claim, or the minimum amount required by applicable law.",
          "These limitations do not apply to fraud, wilful misconduct, death or personal injury caused by negligence, or another liability that cannot legally be limited or excluded.",
        ],
      },
      {
        title: "Indemnity",
        body: [
          "To the extent permitted by law, you agree to defend, indemnify, and hold harmless ComePlayers and its personnel from third-party claims, losses, liabilities, penalties, damages, and reasonable costs arising from your listings, products, services, content, infringement, unlawful conduct, breach of these Terms, or misuse of the service.",
          "ComePlayers will provide reasonable notice of a covered claim where practicable and may control the defence or settlement. You may not settle a claim in a way that imposes liability, admission, or obligation on ComePlayers without written approval.",
        ],
      },
      {
        title: "Governing Law And Dispute Resolution",
        body: [
          "These Terms are governed by the laws of the Republic of Indonesia, without limiting mandatory consumer, privacy, or other protections that apply in your place of residence.",
          "Before starting formal proceedings, you and ComePlayers should first attempt to resolve the issue through ComePlayers Support by providing a clear description, relevant account or order information, requested outcome, and supporting evidence.",
          "If a dispute cannot be resolved informally, it may be submitted to a competent court or dispute-resolution body in Indonesia, unless applicable mandatory law gives you the right to use another forum.",
        ],
      },
      {
        title: "Changes To These Terms",
        body: [
          "ComePlayers may update these Terms to reflect changes in the service, marketplace risks, providers, business practices, or law. The updated date will be shown at the top of this page, and material changes may also be announced through the service or by email.",
          "Updated Terms apply from the stated effective date. Continued use after that date constitutes acceptance where permitted by law. If you do not agree with an update, you must stop using the affected service and may request account closure subject to outstanding obligations.",
        ],
      },
      {
        title: "General Provisions",
        body: [
          "If any provision is found invalid or unenforceable, it will be enforced to the maximum lawful extent and the remaining provisions will continue. A delay in enforcing a right is not a waiver. Headings are for convenience and do not limit interpretation.",
          "You may not assign or transfer your rights or obligations without ComePlayers' written consent. ComePlayers may assign these Terms as part of a merger, reorganization, financing, sale of assets, or transfer of the service, subject to applicable law.",
          "These Terms and incorporated policies constitute the agreement about the service, except for a separate written agreement expressly signed by an authorized ComePlayers representative.",
        ],
      },
      {
        title: "Contact ComePlayers",
        body: [
          "For questions, legal notices, account concerns, order assistance, or reports of policy violations, contact ComePlayers through the Support Center or by email at admin@comeplayers.com.",
          "Correspondence address: PT COME PLAYERS DIGITAL, Bumi Parahyangan Kencana, Jl. Beo Blok B3 No. 5, RT 01/RW 14, Desa/Kelurahan Nagrak, Kecamatan Cangkuang, Kabupaten Bandung, Provinsi Jawa Barat, Kode Pos 40238, Indonesia.",
          "Business Identification Number (Nomor Induk Berusaha/NIB): 2407260058305. Do not send passwords, one-time codes, complete payment credentials, or unnecessary identity documents by ordinary email.",
        ],
      },
    ],
  },
  {
    slug: "product-offering-policy",
    title: "Product & Listing Policy",
    eyebrow: "Marketplace Listings",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "Rules governing products, services, descriptions, images, pricing, delivery, search visibility, intellectual property, and prohibited conduct for every listing published on ComePlayers.",
    notice: {
      title: "All sellers must follow this Policy",
      body:
        "Publishing or maintaining a listing on ComePlayers means that the seller accepts responsibility for the product, service, content, delivery method, and legal compliance of that listing. ComePlayers may review, restrict, hide, remove, or refuse any listing that violates this Policy, creates unacceptable risk, or harms marketplace trust.",
    },
    sections: [
      {
        title: "Purpose And Scope",
        body: [
          "This Product & Listing Policy applies to every offer published or promoted through the ComePlayers marketplace, including game accounts, in-game currency, items, skins, top-ups, gift cards, software, subscriptions, boosting, coaching, digital services, and any future supported category.",
          "The Policy applies to listing titles, descriptions, attributes, prices, images, videos, seller-store content, variants, delivery instructions, search keywords, promotional claims, and communications that form part of an offer.",
          "This Policy must be read together with the Terms of Service, Seller Rules, Intellectual Property Policy, payment and refund policies, category-specific rules, and any instructions shown during listing creation.",
        ],
      },
      {
        title: "Seller Responsibility",
        body: [
          "The seller is solely responsible for ensuring that each listing is lawful, authentic, accurate, deliverable, properly categorized, and supported by sufficient stock or service capacity.",
          "A seller must understand the product, game, publisher, platform, region, account, delivery, and eligibility requirements before publishing an offer. Approval or publication by ComePlayers is not a guarantee that the listing complies with every applicable rule.",
          "Sellers must promptly correct, pause, or remove a listing when information becomes inaccurate, stock is unavailable, delivery is temporarily impossible, authorization expires, or the offer becomes prohibited.",
        ],
      },
      {
        title: "Compliance With Laws And Third-Party Rules",
        body: [
          "Every listed product and service must comply with applicable national, regional, and local law in each jurisdiction where the seller operates, the buyer is located, the product is delivered, and ComePlayers makes the offer available.",
          "Sellers must also comply with applicable publisher, developer, platform, payment-network, gift-card issuer, software-vendor, intellectual-property, consumer-protection, export-control, sanctions, age-restriction, and tax requirements.",
          "A product must not be listed merely because similar products appear elsewhere. Where legality or authorization is uncertain, the seller must obtain appropriate professional or rights-holder guidance before publishing the listing.",
        ],
      },
      {
        title: "Permitted Marketplace Categories",
        body: [
          "ComePlayers may permit offers within supported digital gaming and entertainment categories when the seller satisfies verification, category, delivery, and risk requirements.",
        ],
        bullets: [
          "Game accounts where transfer is lawful, authorized, and accurately disclosed.",
          "In-game currency, coins, items, skins, equipment, and other supported virtual goods.",
          "Publisher-authorized or otherwise lawful top-up and recharge services.",
          "Boosting, rank assistance, coaching, GamePal, and related services that comply with applicable game rules and ComePlayers requirements.",
          "Gift cards, redemption codes, subscriptions, software licenses, and digital vouchers obtained through lawful channels.",
          "Other digital products or services expressly enabled by ComePlayers.",
        ],
      },
      {
        title: "Prohibited Products And Services",
        body: [
          "A seller must not list, advertise, request, facilitate, or deliver an illegal, unsafe, stolen, deceptive, or otherwise prohibited product or service. This prohibition applies even when the product is described indirectly, bundled with an allowed product, offered as a free bonus, or delivered outside the platform.",
        ],
        bullets: [
          "Illicit drugs, controlled substances, weapons, firearms, explosives, or instructions intended to facilitate serious illegal conduct.",
          "Pornographic, sexually exploitative, non-consensual, or otherwise prohibited adult content or services.",
          "Stolen, hacked, phished, compromised, fraudulently obtained, recovered, recalled, revoked, duplicated, or unlawfully accessed accounts, credentials, keys, codes, funds, cards, or digital assets.",
          "Malware, ransomware, spyware, credential-stealing tools, phishing kits, botnets, denial-of-service tools, or software primarily designed to damage, monitor, or access systems without authorization.",
          "Cheats, hacks, exploits, scripts, bots, automation, bypass tools, or services that manipulate gameplay, evade security, defeat anti-cheat systems, or enable unauthorized access.",
          "Unauthorized payment services, cash conversion, money laundering, carding, chargeback schemes, stolen gift cards, fraudulent top-ups, or transactions intended to disguise the source or destination of funds.",
          "Gambling, wagering, loot-box resale schemes, chance-based financial services, or regulated financial products unless expressly approved and legally permitted.",
          "Counterfeit, pirated, cracked, illegally copied, or license-violating software, media, keys, subscriptions, or digital content.",
          "Personal data, identity documents, login databases, confidential information, private communications, or access to another person's device or account.",
          "Any other product or service that ComePlayers determines creates unacceptable legal, security, financial, reputational, or user-safety risk.",
        ],
      },
      {
        title: "Controversial, Hateful, Or Harmful Content",
        body: [
          "Listings must not promote, celebrate, fund, or encourage terrorism, extremist organizations, hate speech, discrimination, harassment, self-harm, human exploitation, violence, cruelty, or illegal activity.",
          "A listing must not target or demean a person or group based on race, ethnicity, nationality, religion, disability, sex, gender, sexual orientation, age, or another protected characteristic.",
          "ComePlayers may restrict content that is technically lawful but reasonably likely to create serious harm, intimidation, fraud, or disruption to the marketplace or community.",
        ],
      },
      {
        title: "Ownership, Authorization, And Authenticity",
        body: [
          "A seller may list only a product or service that the seller owns, controls, is authorized to distribute, or can lawfully provide. The seller must be able to demonstrate the lawful source and authenticity of the offer when requested.",
          "The seller must not conceal account recovery rights, prior ownership, regional restrictions, subscription obligations, outstanding balances, bans, warnings, locks, security risks, or any fact that could materially affect the buyer's use or control of the product.",
          "ComePlayers may request invoices, purchase records, authorization letters, source documentation, screenshots, ownership evidence, identity verification, or other supporting information before or after publication.",
        ],
      },
      {
        title: "Intellectual Property Rights",
        body: [
          "Listings must respect copyrights, trademarks, patents, trade secrets, publicity rights, database rights, and other intellectual-property or proprietary rights.",
          "A seller must not use another party's brand name, logo, artwork, screenshots, product images, description, videos, or other protected material without authorization or a valid legal basis. Brand terms may be used only as reasonably necessary to identify a genuine compatible product and must not imply sponsorship or official affiliation.",
          "ComePlayers may remove or restrict content following a rights-holder report, legal request, automated detection, or internal review. Repeated or serious infringement may result in listing restrictions or account termination.",
        ],
      },
      {
        title: "Accurate And Complete Listing Information",
        body: [
          "A listing must clearly and truthfully describe exactly what the buyer will receive. Material information must not be hidden in images, delivery messages, fine print, or external pages.",
        ],
        bullets: [
          "Use a specific title that identifies the product or service without exaggerated, false, or unrelated claims.",
          "Select the correct game, platform, server, region, category, product type, variant, denomination, level, rank, quantity, and delivery method.",
          "State all requirements, limitations, exclusions, risks, waiting periods, warranty conditions, and actions the buyer must complete.",
          "Disclose whether an account is original-owner, previously used, linked to third-party services, subject to recovery risk, or restricted by region or platform.",
          "Describe the actual delivery time and do not advertise instant delivery unless the order can normally be completed immediately.",
          "Keep stock, capacity, price, attributes, and availability current at all times.",
        ],
      },
      {
        title: "Misleading Claims And Omissions",
        body: [
          "A listing must not use false scarcity, fake discounts, fabricated comparisons, unsupported guarantees, deceptive countdowns, misleading before-and-after claims, or statements such as official, authorized, safest, permanent, risk-free, or guaranteed unless the seller can substantiate them.",
          "Sellers must not advertise a low-priced product and then require the buyer to purchase a different product, pay an undisclosed charge, communicate outside ComePlayers, or accept materially different conditions after ordering.",
          "A listing is misleading when an important fact is omitted, presented ambiguously, contradicted by another part of the listing, or disclosed only after payment.",
        ],
      },
      {
        title: "Images, Video, And Listing Media",
        body: [
          "Images and videos must accurately represent the listed product or service and must not create a false impression about quantity, quality, account status, rarity, delivery, results, or included features.",
          "Media must not contain unauthorized personal data, payment information, passwords, recovery codes, contact details, external links, QR codes, watermarks directing users elsewhere, or content that violates this Policy.",
          "Stock images, publisher artwork, and edited screenshots may be used only when lawful and not misleading. ComePlayers may require original evidence for high-risk products or disputed listings.",
        ],
      },
      {
        title: "Pricing, Fees, And Quantity",
        body: [
          "The displayed listing price must correspond to the advertised quantity, denomination, variant, and minimum order. Sellers must not manipulate units, decimals, bundles, or variants to create a misleading headline price.",
          "Mandatory seller charges must be included or clearly disclosed through the approved pricing fields. A seller may not add an undisclosed fee after an order is placed or require an off-platform payment.",
          "Listings must not be used to evade marketplace fees, taxes, payment controls, transaction limits, or category requirements.",
        ],
      },
      {
        title: "Delivery Method And Delivery Time",
        body: [
          "The listing must specify how delivery will occur, what information is required from the buyer, the expected delivery window, and any conditions that may delay or prevent completion.",
          "The seller must use supported ComePlayers workflows and must not mark an order delivered before the complete product or service has actually been provided. Delivery evidence must match the listing and order.",
          "A seller may not request unnecessary passwords, one-time codes, payment credentials, identity documents, or remote device access. Any sensitive access legitimately required for an approved service must follow the applicable category rules and security instructions.",
        ],
      },
      {
        title: "Game Account Listings",
        body: [
          "Game account listings must accurately disclose the game, platform, server, region, level, rank, notable assets, linked accounts, verification status, login method, recovery method, prior sanctions, and transfer limitations relevant to the buyer.",
          "Sellers must not list accounts obtained through theft, phishing, credential stuffing, account recovery abuse, payment fraud, unauthorized automation, or violation of another person's rights.",
          "The seller must not retain or use a recovery path to reclaim an account after delivery. Any known recovery risk, original-owner limitation, or publisher transfer restriction must be disclosed before purchase.",
        ],
      },
      {
        title: "Currency, Item, Skin, And Top-Up Listings",
        body: [
          "Listings for virtual currency, items, skins, and top-ups must state the exact amount, game, platform, server, region, delivery method, recipient requirements, fees, and expected delivery time.",
          "The source of currency, items, codes, and payment must be lawful. Sellers must not use stolen cards, compromised accounts, refund abuse, exploits, bots, duplicated items, unauthorized reselling, or other fraudulent methods.",
          "A seller must disclose any trade lock, level requirement, market restriction, tax, cooldown, gifting delay, redemption expiry, or other limitation that affects delivery or use.",
        ],
      },
      {
        title: "Boosting, Coaching, And Service Listings",
        body: [
          "A service listing must clearly define the objective, starting requirement, estimated completion time, supported region and platform, delivery method, scheduling expectations, and what happens if the requested result cannot be completed.",
          "Sellers must not promise impossible outcomes, use prohibited cheats or automation, manipulate matches, harass other players, or expose a buyer's account to undisclosed sanctions or security risks.",
          "Where account access is permitted for an approved service, the seller must protect credentials, use access only for the ordered service, avoid changing unrelated settings, and stop access immediately after completion.",
        ],
      },
      {
        title: "Gift Card, Code, Subscription, And Software Listings",
        body: [
          "Listings must state the issuer, product, denomination, currency, region, platform, redemption method, expiry date where applicable, subscription duration, device or account limitations, and whether the code has been activated or previously exposed.",
          "Codes and licenses must be genuine, unused where advertised as new, lawfully sourced, and transferable under applicable terms. Trial abuse, unauthorized account sharing, cracked software, volume-license misuse, and keys acquired through fraud are prohibited.",
          "The seller must not use a brand's name or artwork in a way that suggests ComePlayers or the seller is an official issuer, distributor, or partner unless that relationship is genuine and verifiable.",
        ],
      },
      {
        title: "Duplicate Listings",
        body: [
          "Sellers must not create multiple listings for the same or substantially identical product merely to occupy more search positions, avoid performance history, bypass limits, or overwhelm competing offers.",
          "Separate listings may be permitted when they represent meaningful differences such as game, platform, server, region, product type, denomination, delivery method, or service package and those differences are clearly presented.",
          "ComePlayers may merge, suppress, reject, or remove duplicate listings and may restrict accounts that repeatedly republish removed or duplicate offers.",
        ],
      },
      {
        title: "Search And Ranking Manipulation",
        body: [
          "Sellers must not manipulate search, recommendations, ranking, category pages, or promotional placement through irrelevant keywords, repeated brand names, hidden text, misleading categories, keyword stuffing, fake engagement, coordinated clicks, artificial orders, or other deceptive tactics.",
          "Titles, attributes, tags, and descriptions must relate directly to the listed product. Competitor names or unrelated popular games, brands, platforms, and product terms may not be added solely to attract traffic.",
          "ComePlayers may adjust ranking, remove keywords, limit visibility, or restrict promotional tools where manipulation or low-quality listing behavior is detected.",
        ],
      },
      {
        title: "External Links And Off-Platform Contact",
        body: [
          "Store names, listing titles, descriptions, images, videos, variants, and delivery instructions must not contain website addresses, social-media handles, telephone numbers, email addresses, QR codes, referral codes, or other directions intended to move a transaction or communication outside ComePlayers.",
          "Sellers must not request external payment, direct transfer, cryptocurrency payment, private messaging, remote-support contact, or a separate checkout as a condition of receiving the listed product.",
          "ComePlayers may remove external-link content immediately because it can bypass buyer protection, payment controls, dispute evidence, moderation, and marketplace fees.",
        ],
      },
      {
        title: "Reviews, Sales History, And Promotional Integrity",
        body: [
          "A seller must not buy their own listing, coordinate sham orders, compensate users for misleading reviews, threaten buyers over ratings, copy reviews, or otherwise manipulate sales, feedback, favorites, views, conversion, or seller-performance signals.",
          "Promotions, discounts, bundles, sponsored placements, and vouchers must accurately describe eligibility, duration, quantity, and conditions. A seller may not inflate a reference price to create a fake discount.",
          "ComePlayers may remove manipulated activity and exclude it from ranking, seller level, rewards, or promotional eligibility.",
        ],
      },
      {
        title: "Buyer Protection And Seller Warranties",
        body: [
          "By publishing a listing, the seller warrants that the listing is accurate, the product is lawful and authentic, the seller has authority to provide it, delivery can be completed as described, and the product will not knowingly expose the buyer or ComePlayers to fraud, malware, unauthorized recovery, or undisclosed restrictions.",
          "Eligibility for PlayerGuard, escrow release, seller protection, payout, and dispute consideration depends on compliance with this Policy, the order record, supported delivery methods, and sufficient evidence.",
          "A policy-compliant listing does not guarantee a particular dispute outcome. ComePlayers may review the listing, communications, delivery evidence, transaction signals, category rules, and other relevant circumstances.",
        ],
      },
      {
        title: "Listing Review, Restriction, And Removal",
        body: [
          "ComePlayers may use automated systems, manual moderation, user reports, rights-holder notices, risk signals, and sample reviews to assess listings before or after publication.",
          "ComePlayers may request edits or evidence; delay publication; reduce visibility; remove keywords, images, or variants; pause sales; limit quantity; restrict a region; place funds on hold; or remove a listing when reasonably necessary to enforce policy or protect users.",
          "A listing may be removed even if a specific prohibited example is not stated in this Policy. ComePlayers may act where an offer is deceptive, unsafe, unlawful, unauthorized, technically abusive, or inconsistent with the purpose of the marketplace.",
        ],
      },
      {
        title: "Enforcement Against Sellers",
        body: [
          "Violations may result in education, a warning, required edits, listing rejection, listing removal, reduced visibility, category restrictions, temporary suspension, payout review, balance hold, cancellation or refund of affected orders, loss of seller privileges, or account termination.",
          "ComePlayers may apply stronger action without a prior warning for serious, repeated, intentional, fraudulent, illegal, harmful, or evasive conduct. Creating a new listing or account to bypass enforcement is an additional violation.",
          "ComePlayers may preserve and disclose relevant information to payment providers, rights holders, regulators, law-enforcement authorities, or other authorized parties when required by law or reasonably necessary to investigate abuse and protect rights or safety.",
        ],
      },
      {
        title: "Reporting A Listing And Appeals",
        body: [
          "Users and rights holders may report a listing through the available report or Support Center flow and should identify the listing, explain the concern, and provide relevant evidence. Reports must be made honestly and must not be used to harass competitors or manipulate marketplace availability.",
          "A seller may request review of an enforcement action through ComePlayers Support. The request should explain why the listing complies, identify any correction already made, and provide ownership, authorization, sourcing, or other evidence requested by ComePlayers.",
          "Submission of an appeal does not automatically restore a listing or suspend other protective measures. ComePlayers may uphold, modify, or reverse the action after reviewing available information.",
        ],
      },
      {
        title: "Changes To This Policy",
        body: [
          "ComePlayers may update this Policy when marketplace categories, technologies, risks, providers, industry practices, or legal requirements change. Updated and effective dates will be shown at the top of this page.",
          "Material changes may also be communicated through the platform or seller channels. Sellers are responsible for reviewing current requirements and updating existing listings by the effective date.",
        ],
      },
      {
        title: "Contact ComePlayers",
        body: [
          "For questions about listing eligibility, category requirements, a removed listing, intellectual-property concerns, or suspected prohibited products, contact ComePlayers through the Support Center or at admin@comeplayers.com.",
          "Do not send passwords, one-time codes, complete payment credentials, or unnecessary identity documents through ordinary email. Use only the secure upload or verification process provided by ComePlayers.",
        ],
      },
    ],
  },
  {
    slug: "seller-rules",
    title: "Seller Rules & Regulations",
    eyebrow: "Seller Policy",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "Mandatory operational, delivery, communication, evidence, security, compliance, dispute, and payout rules for every seller offering digital products or services through ComePlayers.",
    notice: {
      title: "Selling on ComePlayers is a responsibility",
      body:
        "By creating or maintaining a seller account, publishing a listing, accepting an order, or receiving a payout through ComePlayers, you agree to follow these Seller Rules together with the Terms of Service, Product & Listing Policy, PlayerGuard Protection rules, and any category-specific requirements. Violations may result in listing removal, order refunds, balance holds, seller restrictions, suspension, or permanent account closure.",
    },
    sections: [
      {
        title: "Scope And Acceptance",
        body: [
          "These Seller Rules apply to every individual, business, store operator, representative, employee, contractor, or other person who lists, supplies, delivers, manages, or supports products and services sold through ComePlayers.",
          "The rules apply to game accounts, in-game currency, items, skins, top-up, gift cards, subscription codes, software or app accounts, boosting, coaching, GamePal services, and every other category approved by ComePlayers.",
          "A seller is responsible for the conduct of all people who access or operate the seller account. Internal arrangements with staff, suppliers, or fulfilment partners do not reduce the seller's responsibility to ComePlayers or the buyer.",
        ],
      },
      {
        title: "Seller Eligibility And Verification",
        body: [
          "A seller must satisfy all age, identity, business, tax, payment, payout, and eligibility requirements applicable to the seller's location and product category. ComePlayers may require identity verification, business documents, proof of address, ownership records, source-of-funds information, or additional checks before or after selling privileges are activated.",
          "Verification information must be accurate, current, and belong to the person or entity operating the seller account. Sellers may not rent, sell, transfer, borrow, or operate a verified seller account for an undisclosed third party.",
          "ComePlayers may limit listings, order volume, payout access, or available categories while verification, risk review, or compliance checks are incomplete.",
        ],
      },
      {
        title: "Legal And Publisher Compliance",
        body: [
          "Sellers must comply with applicable laws, sanctions, consumer-protection rules, tax obligations, intellectual-property rights, payment-network rules, game publisher terms, platform rules, and category-specific ComePlayers policies.",
          "A seller must not offer products or fulfil orders where the transaction, product source, delivery method, destination, or buyer eligibility would be unlawful or unauthorized.",
          "Approval of a listing does not mean ComePlayers confirms that the product is lawful, officially authorized, or permitted by a game publisher. The seller remains responsible for checking those requirements.",
        ],
      },
      {
        title: "Product Ownership And Lawful Source",
        body: [
          "Before publishing a listing, the seller must lawfully own, control, or be expressly authorized to supply the product or service. Products obtained through theft, fraud, account compromise, chargeback abuse, unauthorized automation, exploitation, money laundering, or any other unlawful source are prohibited.",
          "Sellers must keep records that reasonably demonstrate ownership, purchase, authorization, or source. ComePlayers may request invoices, transaction receipts, supplier agreements, account history, screenshots, video, or other evidence during listing review, order review, dispute handling, or investigation.",
          "A seller may not conceal, falsify, or misrepresent the true source, ownership status, region, restrictions, recovery rights, or prior usage of a product.",
        ],
      },
      {
        title: "Accurate Listings",
        body: [
          "Every listing must be truthful, clear, complete, current, and placed in the correct game, server, platform, region, category, and delivery type. Titles, descriptions, images, variations, quantity, rank, level, balance, rarity, included content, exclusions, restrictions, warranty, and delivery time must match what the buyer will receive.",
          "A seller must promptly update or pause a listing when stock, price, delivery capability, product condition, region support, or another material detail changes.",
          "Sellers may not use misleading thumbnails, hidden conditions, keyword stuffing, unrelated game names, fake scarcity, false official-partner claims, or descriptions designed to make one product appear to be another.",
        ],
      },
      {
        title: "Stock And Availability",
        body: [
          "A seller must have the listed stock, capacity, access, personnel, or fulfilment capability before accepting an order. Dropshipping, supplier dependency, or manual sourcing must not cause the seller to advertise stock that is not reasonably available.",
          "Inventory counts and service availability must be maintained accurately. A seller should pause or close listings before becoming unavailable, going offline for an extended period, reaching capacity, or losing access to the product.",
          "Repeated stock failures, unavailable listings, or acceptance of orders that cannot be fulfilled may affect seller ranking, order limits, refund liability, seller level, or account status.",
        ],
      },
      {
        title: "Pricing And Fees",
        body: [
          "The displayed price must represent the actual amount required for the listed product or service, excluding only fees that ComePlayers clearly calculates during checkout. Sellers may not add undisclosed surcharges, require an additional payment after purchase, or change the agreed price outside the official order flow.",
          "Sellers are responsible for understanding marketplace fees, payment adjustments, taxes, currency conversion, refund deductions, chargeback exposure, and payout-provider charges that may apply.",
          "Artificial price manipulation, coordinated pricing intended to deceive users, or pricing used to redirect buyers to another listing or external transaction is prohibited.",
        ],
      },
      {
        title: "Order Acceptance And Seller Availability",
        body: [
          "Sellers should sign in regularly, maintain accurate online and offline status, review new orders promptly, and respond through ComePlayers within the delivery and response expectations shown on the listing or seller dashboard.",
          "Accepting or allowing an order to proceed confirms that the seller can fulfil it according to the listing, buyer-selected variation, delivery method, quantity, region, and advertised time.",
          "A seller must not ignore an active order, deliberately delay communication, or keep an order open to avoid cancellation, refund, service-level consequences, or negative performance metrics.",
        ],
      },
      {
        title: "Delivery Compliance",
        body: [
          "The seller must deliver the exact product, quantity, region, platform, server, account characteristics, code, service outcome, or other specification purchased by the buyer. Delivery must use the method selected or approved in the ComePlayers order flow.",
          "Delivery must be completed within the time advertised on the listing or otherwise shown in the order. A seller must notify the buyer through ComePlayers as soon as a genuine issue may cause delay and must not mark an order as delivered before fulfilment is complete.",
          "Failure to meet the delivery method, delivery time, or purchased specifications may make the seller responsible for replacement, cancellation, refund, compensation, handling costs, dispute losses, or enforcement action.",
        ],
      },
      {
        title: "Proof Of Delivery",
        body: [
          "Sellers must create and retain clear evidence of the entire fulfilment process appropriate to the product category. Evidence may include timestamped screenshots, continuous video, system records, redemption confirmation, in-game trade history, buyer acknowledgement, or other verifiable information.",
          "Evidence should show the relevant order identifier, buyer or destination details where safe, product and quantity before delivery, delivery steps, and the completed result. The evidence must correspond to the actual order and must not be edited in a misleading way.",
          "Delivery proof must be uploaded to the order details page or designated secure evidence field when requested or required. Evidence sent only through an external channel may not be considered during PlayerGuard or dispute review.",
        ],
      },
      {
        title: "Category-Specific Delivery Rules",
        body: [
          "Sellers must follow every additional instruction shown for the relevant category. This may include secure credential transfer for accounts, redemption-region disclosure for gift cards, buyer identifier validation for top-up, trade-window evidence for items or currency, and milestone evidence for boosting or coaching.",
          "The seller must verify that the buyer-selected game, server, platform, region, character, user ID, or other destination information is compatible before irreversible delivery whenever the verification can reasonably be performed.",
          "A seller must not substitute another product, denomination, region, account, delivery method, or service scope without the buyer's express agreement recorded inside ComePlayers and any required platform approval.",
        ],
      },
      {
        title: "Game Account Sales",
        body: [
          "A game account listing must disclose all material facts, including region, platform, linked services, recovery methods, original-owner status, prior penalties, restrictions, security status, transferable details, and any material risk that could affect continued access.",
          "Sellers may not offer accounts that are banned, limited to offline use, compromised, stolen, shared with undisclosed users, subject to unresolved recovery claims, or expected to be reclaimed after delivery.",
          "After a completed transfer, the seller must not access, recover, resell, interfere with, or assist another person in taking control of the account unless required through an authorized dispute or recovery process managed by ComePlayers.",
        ],
      },
      {
        title: "Top-Up And Buyer Account Access",
        body: [
          "Sellers must use direct user-ID, server-ID, official redemption, or another low-risk delivery method whenever available. Logging into a buyer's game, publisher, email, social, payment, or platform account is prohibited unless the applicable ComePlayers category expressly permits account-login fulfilment for a specific manual top-up or service.",
          "Where account access is expressly permitted, the seller may access only what is necessary to complete the purchased service, must not change unrelated settings, inspect unrelated data, make additional purchases, retain credentials, or reuse the session after fulfilment.",
          "Sellers must never ask for one-time passwords, payment PINs, email recovery codes, device approval codes, or other credentials that are not strictly required by an authorized delivery flow.",
        ],
      },
      {
        title: "Gift Cards, Codes, Software, And Subscriptions",
        body: [
          "Codes and digital keys must be valid, unused, lawfully sourced, compatible with the advertised product, and redeemable in the listed region, currency, platform, account type, and activation period.",
          "A product advertised as global must work without requiring the buyer to use a VPN, location spoofing, proxy, remote-access tool, modified client, unauthorized software, or other method that changes the advertised redemption conditions.",
          "Sellers must not instruct buyers to install unknown software, disable device security, share screen control, provide remote access, or follow unsafe steps to activate a product. Any required official application or publisher process must be disclosed accurately in the listing.",
        ],
      },
      {
        title: "Boosting, Coaching, And Service Orders",
        body: [
          "Service sellers must clearly define the target, starting requirements, estimated time, permitted methods, scheduling expectations, buyer participation, cancellation conditions, and evidence used to confirm completion.",
          "Sellers must not use prohibited cheats, exploits, bots, account-sharing methods, unauthorized software, harassment, win trading, or conduct that violates the applicable game or publisher rules unless the listing is expressly lawful and approved—which ComePlayers may decline at its discretion.",
          "Service providers must protect the buyer's account, data, rank, inventory, reputation, and other assets. Any material setback, penalty, loss, unauthorized purchase, or security event must be reported immediately through the order and support channels.",
        ],
      },
      {
        title: "Order Cancellation And Seller Fault",
        body: [
          "Sellers must not request cancellation merely because market prices changed, a more profitable buyer appeared, stock was never secured, or the seller no longer wants to honour the advertised terms.",
          "Where an order cannot be fulfilled, the seller must disclose the issue promptly through the order and use the available cancellation or support process. A seller may not pressure the buyer to select a false cancellation reason or confirm delivery for an undelivered order.",
          "If cancellation, refund, replacement, or compensation is required because of seller fault, ComePlayers may charge or deduct applicable fees, buyer losses, refund amounts, promotional adjustments, provider costs, or other liabilities permitted by the Terms of Service and applicable law.",
        ],
      },
      {
        title: "Communication Inside ComePlayers",
        body: [
          "All order-related communication must take place through ComePlayers messages, order chat, secure delivery fields, dispute tools, or another channel expressly provided by ComePlayers. Sellers should avoid using in-game chat as the sole record for important delivery or dispute information.",
          "Sellers must communicate clearly, professionally, and in good faith. They must answer reasonable buyer questions, provide necessary delivery instructions, and avoid deceptive urgency, intimidation, spam, harassment, discrimination, threats, abusive language, or retaliation.",
          "A seller must report suspected abuse, fraud, threats, account compromise, or unsafe requests through ComePlayers rather than attempting to punish, expose, or publicly shame the buyer.",
        ],
      },
      {
        title: "Off-Platform Trading Is Prohibited",
        body: [
          "Sellers must not ask, encourage, or permit a buyer to communicate, pay, trade, settle, refund, reorder, or complete delivery outside ComePlayers for the purpose of avoiding marketplace controls, fees, evidence requirements, or PlayerGuard protection.",
          "Prohibited conduct includes sharing private contact details, social-media handles, messaging-app usernames, phone numbers, email addresses, payment links, bank details, wallet addresses, QR codes, external storefronts, shortened links, or coded instructions intended to move a transaction off the platform.",
          "ComePlayers does not provide PlayerGuard coverage for off-platform transactions. Directing users off-platform may result in immediate listing removal, account restrictions, permanent suspension, cancellation of seller privileges, and a lawful hold or deduction against available balances for unresolved liabilities.",
        ],
      },
      {
        title: "Secure Handling Of Credentials And Sensitive Data",
        body: [
          "Activation codes, account credentials, recovery information, identity documents, payout details, and other sensitive information must be submitted only through the secure field or workflow designated by ComePlayers. Sellers must not place sensitive data in public listings, reviews, profile fields, ordinary chat, or livestream content.",
          "Sellers may use buyer personal data only to fulfil the specific order, comply with law, prevent fraud, or resolve an authorized dispute. They must not copy, sell, disclose, profile, contact, or retain buyer data for unrelated marketing or business purposes.",
          "Sensitive information must be deleted or securely protected when no longer required. Any suspected leak, unauthorized access, credential exposure, or security incident must be reported to ComePlayers immediately.",
        ],
      },
      {
        title: "Fraud, Self-Dealing, And Account Manipulation",
        body: [
          "Sellers may not create or control undisclosed duplicate accounts, buy from their own listings, arrange fake orders, manufacture delivery records, coordinate false disputes, manipulate reviews, launder funds, cycle payments, abuse promotions, or use another person to conceal related activity.",
          "Sellers must not interfere with competitor listings, submit false intellectual-property complaints, impersonate buyers or support staff, create artificial demand, or manipulate ranking, seller level, conversion, fulfilment, cancellation, or response metrics.",
          "ComePlayers may link accounts using identity, payment, payout, device, network, behavioural, transaction, communication, or other risk signals and may review related accounts together where fraud or policy evasion is suspected.",
        ],
      },
      {
        title: "Reviews And Buyer Feedback",
        body: [
          "Sellers may invite buyers to leave honest feedback but may not require a positive review, offer undisclosed compensation for a particular rating, threaten buyers over feedback, or condition support, replacement, refund, or delivery on review removal.",
          "A seller may report a review believed to be fraudulent, abusive, irrelevant, or policy-violating through the designated process. The seller must not retaliate against the buyer or disclose private order information publicly.",
          "ComePlayers may remove manipulated reviews, reverse related benefits, recalculate seller metrics, and take action against accounts involved in review abuse.",
        ],
      },
      {
        title: "Disputes And Seller Cooperation",
        body: [
          "When a buyer opens a dispute or ComePlayers reviews an order, the seller must respond within the stated deadline and provide complete, relevant, authentic, and readable evidence. Failure to respond may allow ComePlayers to decide the matter using available information.",
          "The seller is responsible for disputes caused by late delivery, missing delivery, incorrect quantity, wrong product, undisclosed restrictions, invalid codes, reclaimed accounts, unsafe fulfilment, inadequate evidence, or another seller-controlled issue.",
          "ComePlayers may request additional explanation, original files, transaction records, proof of source, system logs, or identity verification. Falsifying, deleting, withholding, or altering evidence may result in the dispute being resolved against the seller and may trigger further enforcement.",
        ],
      },
      {
        title: "Refunds, Chargebacks, And Financial Liability",
        body: [
          "Seller proceeds remain subject to PlayerGuard, refund, dispute, reversal, chargeback, fraud, payment-provider, reserve, tax, and compliance rules until the relevant risk period has ended.",
          "ComePlayers may cancel pending release, debit a seller balance, offset future earnings, hold a payout, establish a reserve, or recover amounts connected to refunds, chargebacks, duplicate payments, buyer compensation, provider fees, penalties, or losses caused by seller activity, where permitted by the Terms of Service and law.",
          "A seller must not contact or pressure a buyer to withdraw a legitimate dispute or chargeback through threats, incentives, or off-platform arrangements. The seller should provide evidence and cooperate through the official process.",
        ],
      },
      {
        title: "Payout Readiness And Account Information",
        body: [
          "Payout profile information, bank or wallet destination, tax details, beneficiary identity, and seller verification must be accurate and current. The seller must have lawful authority to use the selected payout account.",
          "ComePlayers may delay, reject, split, reverse, or review a payout where verification is incomplete, account information conflicts, fraud risk is elevated, disputes remain open, legal restrictions apply, or a payment or payout provider requires additional checks.",
          "Sellers are responsible for reviewing payout confirmations and promptly reporting an incorrect or unauthorized payout destination. ComePlayers may require enhanced authentication or a cooling-off period after sensitive payout changes.",
        ],
      },
      {
        title: "Seller Account Security",
        body: [
          "Sellers must protect passwords, authentication devices, recovery methods, API keys, email accounts, payout credentials, and active sessions. Two-factor authentication and other available security controls should be enabled, particularly for accounts with active listings or balances.",
          "A seller must not share account access with an unauthorized person. Team access, where supported, must use designated roles and individual credentials rather than shared passwords.",
          "Any suspected compromise, unauthorized listing, suspicious order, changed payout destination, or lost authentication device must be reported immediately. The seller may remain responsible for preventable losses or violations occurring before the issue is reported and secured.",
        ],
      },
      {
        title: "Audits, Monitoring, And Information Requests",
        body: [
          "ComePlayers may monitor seller performance, listings, messages, delivery evidence, disputes, refunds, device and account signals, payment events, payout activity, reports, and other relevant data to protect users and enforce platform rules.",
          "Sellers must provide accurate information within the requested time when ComePlayers conducts a compliance review, category audit, security investigation, intellectual-property review, payment inquiry, tax review, or legal response.",
          "Refusal to cooperate, repeated incomplete responses, unverifiable sourcing, inconsistent records, or material misrepresentation may result in precautionary restrictions while the review continues.",
        ],
      },
      {
        title: "Performance Standards",
        body: [
          "ComePlayers may evaluate sellers using fulfilment rate, delivery speed, response time, cancellation rate, dispute rate, refund rate, evidence quality, buyer feedback, account security, policy history, and other quality or risk indicators.",
          "Poor or declining performance may lead to warnings, lower visibility, reduced order limits, category restrictions, longer payout review, required training, temporary suspension, or loss of seller status even where no single order amounts to serious misconduct.",
          "Seller badges, rankings, levels, or performance labels are conditional and may be recalculated, removed, or changed when underlying information changes.",
        ],
      },
      {
        title: "Enforcement Measures",
        body: [
          "ComePlayers may remove or edit listings, pause orders, cancel transactions, issue refunds, request replacement, hide seller content, restrict features, lower limits, withhold payout, place funds in reserve, suspend selling, suspend the entire account, or permanently close related accounts when reasonably necessary to protect users, investigate activity, comply with law, or enforce platform rules.",
          "The seriousness of an action may depend on intent, harm, amount involved, repetition, cooperation, evidence, prior history, evasion, buyer impact, and legal or payment risk. Serious fraud, stolen products, account compromise, threats, identity abuse, or deliberate off-platform trading may justify immediate permanent action.",
          "Account closure does not cancel unresolved orders, refunds, disputes, chargebacks, taxes, evidence duties, indemnities, or other liabilities. ComePlayers may retain records and maintain lawful balance holds for as long as reasonably necessary to resolve those matters.",
        ],
      },
      {
        title: "Appeals And Policy Questions",
        body: [
          "A seller may appeal an eligible enforcement decision through ComePlayers Support by identifying the decision, explaining the relevant facts, and providing new or previously unavailable evidence. Repeated submissions without new information may be closed without further review.",
          "An appeal does not automatically pause a buyer refund, security restriction, legal hold, payment-provider requirement, or other protective measure. ComePlayers will review appeals in accordance with available records, applicable policy, and legal obligations.",
          "Sellers should contact ComePlayers Support before listing or delivering a product when they are uncertain about category eligibility, delivery evidence, credential handling, regional restrictions, or another policy requirement.",
        ],
      },
      {
        title: "Changes To These Seller Rules",
        body: [
          "ComePlayers may update these Seller Rules to reflect new products, platform features, fraud patterns, payment requirements, legal obligations, or marketplace standards. The updated and effective dates will be shown at the top of this page.",
          "Material changes may be communicated through the seller dashboard, email, platform notifications, or another appropriate channel. Continued selling after the effective date constitutes acceptance of the updated rules unless applicable law requires another form of consent.",
        ],
      },
    ],
  },
  {
    slug: "payment-fee-schedule",
    title: "Payment, Fee, And Payout Schedule",
    eyebrow: "Payments, Fees & Withdrawals",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "How buyer payment fees, seller marketplace fees, seller deductions, balance release, withdrawal limits, payout timing, currency conversion, and payment-provider charges work on ComePlayers.",
    notice: {
      title: "Review the final quote before confirming",
      body:
        "Rates, limits, taxes, exchange rates, and payment-provider availability can differ by method, country, currency, account status, or approved platform configuration. The itemized amount shown at checkout, on the order pricing snapshot, or in the withdrawal quote before confirmation is the controlling amount for that transaction.",
    },
    sections: [
      {
        title: "Overview And Scope",
        body: [
          "This Payment, Fee, And Payout Schedule explains how ComePlayers calculates amounts paid by buyers, deductions from seller proceeds, credits seller balances, and processes withdrawal requests. It applies to marketplace orders, ComePlayers Wallet payments, PayPal checkout, seller earnings, withdrawal accounts, foreign-exchange conversion, refunds, disputes, chargebacks, and related financial records.",
          "This Schedule should be read together with the Terms of Service, Seller Rules, Refund and Cancellation Policy, PlayerGuard Protection terms, and any payment-provider terms presented during a transaction.",
          "ComePlayers may use licensed payment, banking, payout, identity, fraud-prevention, or currency-conversion providers. A provider may impose additional requirements under its own terms and applicable law.",
        ],
      },
      {
        title: "How ComePlayers Shows Fees",
        body: [
          "ComePlayers aims to display transaction amounts before a user commits to payment or withdrawal. Depending on the transaction, the quote may show item subtotal, discount, buyer payment fee, buyer total, seller gross amount, marketplace fee, seller deduction or withholding, currency-conversion rate, withdrawal deduction, and seller net amount.",
          "A fee or deduction is not hidden merely because it is deducted from seller proceeds rather than added to the buyer total. Sellers should review the settlement breakdown shown for each order and payout request.",
          "Amounts may be rounded to the smallest supported currency unit. Minor rounding differences can occur when percentages, discounts, taxes, or currency conversions are calculated across several line items.",
        ],
      },
      {
        title: "Immutable Order Pricing Snapshot",
        body: [
          "When an order is created, ComePlayers records a pricing snapshot for that order. The snapshot preserves the rates and amounts used for the buyer total and seller settlement so later changes to platform rates do not retroactively change the completed transaction.",
          "The snapshot may include the seller gross amount, marketplace fee rate and amount, seller deduction rate and amount, buyer payment fee, currency, and seller net amount. Refunds, reversals, or dispute decisions may create additional records without rewriting the original transaction history.",
          "If the checkout screen, invoice, and account statement appear inconsistent, users should contact ComePlayers Support and provide the order number. ComePlayers will use the stored transaction records to investigate.",
        ],
      },
      {
        title: "Current Baseline Fee Schedule",
        body: [
          "The following baseline applies to the current ComePlayers marketplace configuration unless a different approved rate is clearly shown before the transaction is confirmed.",
        ],
        bullets: [
          "ComePlayers Wallet checkout fee: 0% of the item amount.",
          "PayPal checkout processing fee: 5% of the item amount after applicable discounts, unless a different fee is displayed at checkout.",
          "Seller marketplace fee: 5% of the seller gross amount.",
          "Seller sales-tax or platform withholding deduction: 5% of the seller gross amount under the current ComePlayers settlement configuration.",
          "Minimum withdrawal request: IDR 50,000.",
          "Maximum withdrawal request: IDR 100,000,000 per request, subject to account, KYC, risk, daily, method, and provider limits.",
          "Standard payout security hold: 24 hours after a withdrawal request, unless reduced, extended, overridden, or supplemented by a security or compliance review.",
        ],
      },
      {
        title: "Buyer Payment Fees",
        body: [
          "The buyer pays the product or service amount after any valid discount, plus any payment-method fee displayed before confirmation. Buyer payment fees compensate for payment processing, fraud controls, settlement costs, or provider charges associated with the selected method.",
          "ComePlayers Wallet orders currently do not add a buyer payment fee. PayPal orders currently use a 5% checkout processing fee as the baseline configuration. The checkout page will display the actual fee and total before the buyer authorizes payment.",
          "A payment method can be unavailable, limited, or priced differently because of country, currency, provider, transaction size, account status, or risk controls. Selecting another payment method may change the buyer total.",
        ],
      },
      {
        title: "Seller Marketplace Fee",
        body: [
          "ComePlayers deducts a marketplace fee from the seller gross amount for operating the marketplace, transaction infrastructure, PlayerGuard controls, support, moderation, order records, dispute tooling, security, and platform development.",
          "The current baseline marketplace fee is 5% of the seller gross amount. The seller gross amount is normally the item subtotal after valid discounts and does not include a buyer-only payment fee.",
          "The applicable marketplace fee is locked into the order pricing snapshot. If ComePlayers introduces category, seller-level, promotional, or negotiated fee rates, the applicable rate will be shown in the seller interface or transaction breakdown before it takes effect.",
        ],
      },
      {
        title: "Seller Sales-Tax Or Withholding Deduction",
        body: [
          "The current ComePlayers settlement configuration applies a 5% seller-borne sales-tax or platform withholding deduction to the seller gross amount. This deduction is calculated separately from the marketplace fee.",
          "The label, legal treatment, reporting obligation, and applicable rate may depend on the seller's country, tax residency, business status, transaction type, and future regulatory guidance. ComePlayers may request tax residency or taxpayer information before allowing sales or payouts.",
          "This platform deduction is not tax advice and does not replace a seller's responsibility to register, report, invoice, collect, or pay taxes required by law. Sellers should obtain advice from a qualified tax professional for their circumstances.",
        ],
      },
      {
        title: "Seller Settlement Formula",
        body: [
          "For a standard order, ComePlayers calculates the seller settlement using the seller gross amount after valid discounts. The buyer payment fee, if any, is not included in seller earnings.",
        ],
        bullets: [
          "Seller gross amount = item subtotal minus valid seller-funded or order discount.",
          "Marketplace fee = seller gross amount multiplied by the marketplace fee rate.",
          "Seller deduction = seller gross amount multiplied by the active seller deduction rate.",
          "Seller net amount = seller gross amount minus marketplace fee minus seller deduction.",
          "Buyer total = seller gross amount plus the buyer payment fee shown at checkout.",
        ],
      },
      {
        title: "Settlement Example",
        body: [
          "For an IDR 100,000 order with no discount, a 5% marketplace fee, and a 5% seller deduction, the seller gross amount is IDR 100,000, the marketplace fee is IDR 5,000, the seller deduction is IDR 5,000, and the seller net credit is IDR 90,000.",
          "If the buyer pays with ComePlayers Wallet and no payment fee is displayed, the buyer total is IDR 100,000. If the buyer uses PayPal with a 5% checkout fee, the buyer payment fee is IDR 5,000 and the buyer total is IDR 105,000. The buyer-only payment fee does not increase the seller gross amount.",
          "This example is illustrative. The actual itemized transaction quote controls and may differ because of discounts, approved rate changes, currency conversion, category rules, taxes, or payment-provider requirements.",
        ],
      },
      {
        title: "Discounts, Coupons, And Promotions",
        body: [
          "A discount may be funded by the seller, ComePlayers, a partner, or a combination of parties. The checkout or promotion terms determine whether a discount reduces the seller gross amount or is reimbursed separately by ComePlayers.",
          "Where a discount reduces the seller gross amount, percentage-based marketplace fees and seller deductions are calculated from the reduced amount. Buyer payment fees may also be calculated from the post-discount amount unless the checkout states otherwise.",
          "Promotional fee waivers, rebates, credits, or reduced rates can be subject to eligibility rules, usage limits, expiration dates, clawback conditions, and abuse prevention. They do not create a permanent fee entitlement.",
        ],
      },
      {
        title: "When An Order Is Completed",
        body: [
          "A paid order becomes eligible for completion after the seller has delivered the full product or service through the required order workflow and the buyer confirms receipt. ComePlayers or an authorized administrator may also finalize an order after reviewing delivery evidence, a dispute, an abandoned confirmation, or another platform process.",
          "A seller must not mark an order delivered before full delivery. Buyer confirmation should only be given after the buyer has received and reasonably checked the promised product or service.",
          "For products with an insurance, warranty, recovery, inspection, or account-security period, ComePlayers may keep funds pending until the applicable period or review is completed if this is disclosed on the order or product page.",
        ],
      },
      {
        title: "Seller Balance Release",
        body: [
          "When an eligible order is completed and PlayerGuard escrow is released, the seller net amount from the order pricing snapshot is credited to the seller's available ComePlayers balance.",
          "Orders that are unpaid, only reserved, awaiting delivery, under review, disputed, refunded, cancelled, reversed, or subject to a payment failure are not available for withdrawal. ComePlayers may move, reverse, or hold ledger entries when necessary to correct an error or implement a valid refund, dispute, chargeback, or enforcement decision.",
          "A visible balance is not an unconditional promise of immediate external payout. Withdrawal eligibility remains subject to verification, security, risk, legal, account, method, and minimum-amount requirements.",
        ],
      },
      {
        title: "Withdrawal Eligibility",
        body: [
          "Only an approved seller with an active account and sufficient available balance may request a withdrawal. ComePlayers may require verified email, telephone number, identity, seller status, tax residency, payout account, withdrawal PIN, multi-factor authentication, or a trusted device.",
          "The payout account should belong to the seller or an authorized business represented by the seller. The account holder name, country, currency, and method must be accurate and may need to match verified ComePlayers information.",
          "ComePlayers may reject or pause a request where the seller has unresolved orders, disputes, chargebacks, negative balance, incomplete verification, inconsistent account details, sanctions or legal risk, suspicious activity, or another policy violation.",
        ],
      },
      {
        title: "Withdrawal Minimums, Maximums, And Daily Limits",
        body: [
          "The current platform-level minimum withdrawal is IDR 50,000 and the current platform-level maximum is IDR 100,000,000 per request. The seller must also have enough available balance to reserve the full requested source amount.",
          "A lower maximum or additional daily limit may apply based on KYC level, account age, seller performance, risk profile, payout method, destination country, currency, provider requirements, or temporary security controls.",
          "The payout interface will display the available balance and relevant limits. Splitting transactions to evade a limit, verification requirement, review, or reporting threshold is prohibited and may trigger additional restrictions.",
        ],
      },
      {
        title: "Payout Methods And Accounts",
        body: [
          "Available payout methods may include supported bank transfer, PayPal, Wise, another approved wallet, or other providers enabled by ComePlayers. Method availability depends on country, currency, provider integration, verification status, and compliance requirements.",
          "Sellers are responsible for entering accurate payout details. Incorrect names, numbers, bank codes, wallet identifiers, currencies, networks, or country information may cause delay, failure, return, conversion loss, or third-party charges.",
          "Adding or changing a payout account may trigger a cooling-off period, identity check, device check, withdrawal PIN confirmation, multi-factor authentication, or manual review. ComePlayers may mask payout details in the interface for security.",
        ],
      },
      {
        title: "Payout Request Schedule",
        body: [
          "A seller may submit a withdrawal request whenever the payout interface is available and the account satisfies the displayed eligibility requirements. Submission does not mean that funds have already been sent to the external provider.",
          "The current standard security hold is 24 hours from submission. During this period, a request may remain pending and cannot be processed unless an authorized workflow permits an override. The hold may be longer for new payout accounts, recent security changes, higher-risk activity, weekends, holidays, provider outages, or compliance review.",
          "After the hold and required review are completed, ComePlayers may approve and submit the payout during its operating schedule. Exact processing batches, cut-off times, and supported business days may be shown in the seller payout interface or support notices.",
        ],
      },
      {
        title: "Estimated Processing Time",
        body: [
          "ComePlayers processing time and payment-provider settlement time are separate. A request may move through pending, approved, processing, submitted, paid, failed, rejected, or cancelled states.",
          "ComePlayers does not guarantee that every payout will arrive by a specific date. Bank holidays, weekends, time zones, intermediary banks, provider maintenance, incorrect details, compliance screening, currency conversion, network conditions, or recipient-bank procedures can affect arrival time.",
          "The status and reference displayed in the payout center are the primary tracking record. A provider may take additional time after ComePlayers marks a payout submitted or paid.",
        ],
      },
      {
        title: "Withdrawal Deductions And Taxes",
        body: [
          "Before a withdrawal is confirmed, ComePlayers calculates a quote using the payout account country, method, currency, active withdrawal rule, and requested source amount. The quote may include a percentage deduction, a fixed deduction, or both.",
          "Withdrawal rules can differ from the deduction already applied when the underlying sale was settled. A seller may therefore see a sales-related deduction on the order and a separate country- or method-based deduction on the withdrawal quote.",
          "The withdrawal quote records the applicable rate, fixed amount, source reference, gross payout amount, and net payout amount. The seller should not confirm the request if the destination, currency, or quoted amount is incorrect.",
        ],
      },
      {
        title: "Currency Conversion",
        body: [
          "The ComePlayers wallet currently uses IDR as its base currency. If a payout account uses another supported currency, ComePlayers may convert the requested source amount using an active exchange rate configured for the currency pair.",
          "The withdrawal quote will show the source currency, payout currency, exchange rate, converted gross amount, and net amount where conversion applies. The quoted rate may include a provider spread or may differ from rates displayed by search engines, banks, card networks, or currency websites.",
          "ComePlayers stores a currency-conversion snapshot for the withdrawal request. A later market-rate change does not ordinarily change the accepted quote unless the request fails, expires, is cancelled, or must be created again.",
        ],
      },
      {
        title: "Bank, Network, And Provider Charges",
        body: [
          "A receiving bank, intermediary bank, wallet, card network, blockchain network, currency provider, or payout partner may impose a fee outside ComePlayers' control. Such a charge can reduce the amount ultimately received even where the ComePlayers quote shows no separate provider fee.",
          "Where ComePlayers knows and passes a provider charge to the seller, it will be itemized before confirmation. Under some payout configurations, provider processing costs may be absorbed by ComePlayers and will not reduce the locked seller payout quote.",
          "Sellers should confirm fees, minimums, supported currencies, and account requirements with their bank or provider before requesting a payout. ComePlayers is not responsible for losses caused by incorrect recipient details or undisclosed third-party charges that it could not reasonably control.",
        ],
      },
      {
        title: "Security, Verification, And Risk Review",
        body: [
          "ComePlayers may evaluate withdrawal requests using account verification, device history, login assurance level, withdrawal PIN status, recent password or payout-account changes, seller performance, transaction patterns, dispute history, fraud signals, and legal or sanctions checks.",
          "A request may be held for human review, reduced, rejected, or require additional evidence. ComePlayers may require the seller to verify identity, source of products, source of funds, tax residency, beneficial ownership, or control of the payout destination.",
          "Users must never disclose passwords, one-time codes, withdrawal PINs, recovery codes, or complete payment credentials to another user. ComePlayers Support will not ask a user to send these secrets through ordinary chat or email.",
        ],
      },
      {
        title: "Failed, Rejected, Or Cancelled Withdrawals",
        body: [
          "A pending withdrawal may be cancelled through the available interface where permitted. A valid cancellation returns the reserved source amount to the seller's available balance, subject to any separate lawful hold or negative balance.",
          "If ComePlayers rejects a request or a payout fails before final settlement, the reserved amount will normally be returned after reconciliation. A return may be delayed while ComePlayers confirms provider status, duplicate-payment risk, chargeback exposure, or the correct currency amount.",
          "A payout that has already been submitted to an external provider may not be cancellable or editable. The seller may need to contact the provider or receiving institution, and recovery is not guaranteed.",
        ],
      },
      {
        title: "Refunds, Disputes, Chargebacks, And Negative Balances",
        body: [
          "ComePlayers may delay seller balance release or withdrawal where an order is disputed, refunded, reversed, subject to chargeback, suspected of fraud, or otherwise under investigation.",
          "If funds were credited or paid out before a valid refund, chargeback, duplicate payment, or correction, ComePlayers may create a negative balance, offset future earnings, reserve available funds, cancel pending withdrawals, request repayment, or take other lawful recovery action.",
          "Submitting delivery evidence does not guarantee payout where the product was unauthorized, materially different, revoked, unsafe, or delivered in violation of ComePlayers policies.",
        ],
      },
      {
        title: "Reserves And Extended Holds",
        body: [
          "ComePlayers may place part or all of a seller balance in reserve when reasonably necessary to cover expected refunds, chargebacks, account-recovery claims, fraud loss, legal obligations, abnormal sales spikes, high-risk categories, repeated disputes, or other marketplace exposure.",
          "The amount and duration of a reserve depend on the risk and available evidence. ComePlayers may release reserves in stages, extend them where risk remains, or apply them to valid liabilities.",
          "A reserve is not a penalty by itself. It is a financial-risk control and may coexist with a separate warning, listing removal, seller restriction, suspension, or other enforcement action.",
        ],
      },
      {
        title: "Statements, Invoices, And Records",
        body: [
          "ComePlayers may provide order invoices, wallet transactions, withdrawal histories, tax statements, fee breakdowns, and payout references through the account interface. Sellers should download and retain records needed for bookkeeping and legal compliance.",
          "ComePlayers records may distinguish buyer payment fees, marketplace fees, seller deductions, withdrawal deductions, currency conversion, provider references, refunds, and balance adjustments. A payout statement does not replace a government tax return, commercial invoice, or independent accounting record where one is legally required.",
          "Users should promptly report an apparent error. Failure to report an error does not waive rights that cannot legally be waived, but delayed reporting may make provider tracing or evidence recovery more difficult.",
        ],
      },
      {
        title: "Changes To Rates, Limits, And Methods",
        body: [
          "ComePlayers may add, remove, or change payment methods, payout methods, processing schedules, minimums, maximums, fees, deductions, exchange-rate sources, verification requirements, or risk controls to reflect provider terms, operating costs, fraud risk, legal requirements, and marketplace needs.",
          "Approved rate changes apply prospectively from their effective time. Existing order pricing snapshots and accepted withdrawal quotes remain governed by their stored transaction records unless correction is required for fraud, obvious error, legal compliance, or a failed transaction that must be recreated.",
          "Material changes may be communicated through this page, checkout, the seller dashboard, email, or platform notifications. Continuing to create new transactions after the effective date constitutes acceptance of the updated Schedule where permitted by law.",
        ],
      },
      {
        title: "Contact And Payment Questions",
        body: [
          "For a payment, fee, wallet, seller credit, or withdrawal question, contact ComePlayers Support and provide the relevant order or withdrawal number, date, amount, currency, status, and a concise description of the issue.",
          "Do not send passwords, one-time codes, withdrawal PINs, complete card numbers, complete bank credentials, private keys, seed phrases, or unnecessary identity documents through ordinary email or marketplace messages.",
          "ComePlayers may ask for additional evidence through an approved secure workflow before discussing sensitive financial information or changing a payout destination.",
        ],
      },
    ],
  },
  {
    slug: "refund-cancellation-policy",
    title: "Refund, Return, And Cancellation Process",
    eyebrow: "Buyer Protection",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "How refunds, returns, order cancellations, delivery complaints, disputes, chargebacks, and reversals are handled for digital products and services purchased through ComePlayers.",
    notice: {
      title: "Check the order before confirming receipt",
      body:
        "Digital products and services are generally final after valid delivery, use, redemption, transfer, or buyer confirmation. Do not confirm receipt until you have checked that the product or service matches the listing and works as promised. Nothing in this Policy limits rights that cannot lawfully be excluded under applicable consumer-protection law.",
    },
    sections: [
      {
        title: "Purpose And Scope",
        body: [
          "This Policy explains when a ComePlayers marketplace order may be cancelled, refunded, returned, replaced, reversed, or disputed. It applies to buyers and sellers using ComePlayers checkout, order tracking, PlayerGuard, wallet, delivery, messaging, support, and dispute workflows.",
          "This Policy should be read together with the Terms of Service, Seller Rules, Product & Listing Policy, Payment, Fee & Payout Schedule, PlayerGuard Protection terms, category-specific requirements, and the information displayed on the relevant listing and order.",
          "Where applicable law gives a buyer a mandatory remedy that is more favorable than this Policy, the mandatory legal right prevails to the extent required by law.",
        ],
      },
      {
        title: "General Rule: Digital Sales Are Final",
        body: [
          "Marketplace orders for digital products and services are generally final once valid delivery has occurred, the product has been viewed, copied, redeemed, transferred, consumed, used, or the service has been completed.",
          "A refund is not automatically available because a buyer changes their mind, no longer wants the product, finds a different price, dislikes an accurately described product, or fails to use it after valid delivery.",
          "ComePlayers may nevertheless approve a refund, replacement, partial refund, cancellation, credit, or other remedy where this Policy, the listing, PlayerGuard, an agreement between the parties, a payment-provider requirement, or applicable law permits it.",
        ],
      },
      {
        title: "Eligible Refund Grounds",
        body: [
          "A buyer may be eligible for review when the order was not delivered, only partially delivered, materially different from the listing, invalid at the time of delivery, duplicated because of a confirmed technical or payment error, or cancelled before irreversible delivery.",
          "A refund may also be considered when the seller cannot fulfil the order within the promised time, the seller confirms that stock is unavailable, the delivered product is proven stolen, unauthorized, revoked before acceptance, or unsafe, or ComePlayers cancels the order for a marketplace, fraud, security, legal, or payment-verification reason.",
          "Eligibility does not guarantee approval. ComePlayers reviews the order status, listing terms, delivery method, evidence, user conduct, payment status, category risks, and any non-waivable legal rights before deciding the appropriate remedy.",
        ],
      },
      {
        title: "Refund Exclusions",
        body: [
          "Unless required by law or expressly approved by ComePlayers, refunds are not provided for buyer remorse, preference changes, accidental purchases caused by the buyer, failure to read the listing, incompatibility that was accurately disclosed, or incorrect delivery information supplied by the buyer.",
          "Refund protection does not cover transactions, payments, delivery, replacement, or side agreements completed outside ComePlayers; losses caused by sharing credentials or codes outside the authorized workflow; or products altered, transferred, consumed, resold, or returned contrary to this Policy.",
          "A claim may be denied where the buyer confirmed receipt after a reasonable opportunity to inspect, allowed the claim window to expire without reporting a discoverable issue, refused to provide relevant evidence, interfered with delivery, violated platform rules, or filed a false, duplicate, abusive, or misleading claim.",
        ],
      },
      {
        title: "Buyer Inspection And Confirmation",
        body: [
          "A buyer must review the listing before payment and verify the delivered product or service before selecting Confirm Receipt, Complete Order, or any equivalent confirmation action.",
          "The buyer should check the product type, quantity, region, server, platform, account details, code validity, access level, specifications, service result, and other material features promised by the seller.",
          "Buyer confirmation records acceptance of the delivered order and may release eligible funds to the seller. Confirmation does not eliminate rights that cannot lawfully be waived, but it may limit claims about issues that were or should reasonably have been visible before confirmation.",
        ],
      },
      {
        title: "Standard Claim Window",
        body: [
          "A buyer should report a delivery issue immediately and, unless the listing or applicable law provides a longer period, no later than seventy-two (72) hours after the order is marked Delivered or otherwise made available for inspection.",
          "If no report is submitted within the applicable claim window, ComePlayers may treat the order as accepted and complete it, allowing seller funds to be released under PlayerGuard and payout rules.",
          "A late claim may still be reviewed where the issue could not reasonably have been discovered earlier, there is credible evidence of fraud or unauthorized revocation, a longer protection period was expressly included, or applicable law requires review.",
        ],
      },
      {
        title: "Extended Protection For Eligible Accounts",
        body: [
          "Certain game-account, subscription-account, or other higher-risk account listings may display an extended PlayerGuard protection period. Where the order expressly shows such protection, the buyer may report covered ownership, recovery, access, or revocation issues during that stated period.",
          "Unless a different period is displayed on the order, an eligible extended account-protection period is limited to fourteen (14) calendar days from buyer confirmation or administrative completion.",
          "Extended protection does not cover a ban, suspension, recovery, credential loss, or other issue caused by the buyer's conduct, violation of a publisher's rules, failure to secure the account, unauthorized sharing, changes made after delivery, or another excluded event stated on the listing or order.",
        ],
      },
      {
        title: "Evidence Required For A Claim",
        body: [
          "A refund or cancellation request must identify the order, explain the issue clearly, state the requested remedy, and include evidence reasonably available to the requester.",
          "Useful evidence may include uncropped screenshots or recordings, delivery logs, code-validation results, publisher or provider messages, account-access history, chat records, timestamps, transaction references, and a clear comparison between the listing and what was received.",
          "Evidence must be authentic, relevant, and obtained lawfully. Editing evidence to mislead, hiding material context, impersonating another party, fabricating provider messages, or submitting evidence from an unrelated order may result in denial and enforcement action.",
        ],
      },
      {
        title: "Response Deadline During A Dispute",
        body: [
          "When ComePlayers requests information during a dispute, the buyer or seller should respond within forty-eight (48) hours unless the request states another deadline.",
          "If a party does not respond within the stated period, ComePlayers may decide the case using the available record, close the claim, release or refund funds, or take another proportionate action.",
          "ComePlayers may extend a deadline when additional time is reasonably necessary to obtain provider records, recover access, translate evidence, address a technical outage, or protect a party's mandatory legal rights.",
        ],
      },
      {
        title: "Seller Duties In Refund And Cancellation Cases",
        body: [
          "A seller must keep stock accurate, deliver only what was purchased, use supported delivery methods, preserve delivery proof, respond promptly, and cooperate with ComePlayers investigations.",
          "A seller must not mark an order Delivered before full delivery, pressure the buyer to confirm early, condition delivery or support on a positive review, demand that a legitimate complaint be withdrawn, or move resolution outside ComePlayers.",
          "When a valid issue can be corrected safely, ComePlayers may permit the seller to complete missing delivery, replace an invalid product, restore access, repeat a service, or offer another remedy accepted by the buyer before issuing a refund.",
        ],
      },
      {
        title: "How To Request Cancellation Or Report A Problem",
        body: [
          "Use the Cancel Order, Report, Get Help, or dispute control available on the order page. Select the most accurate reason, describe the issue, upload relevant evidence, and choose an available refund preference where offered.",
          "Do not rely only on private messages to cancel an order. A cancellation or dispute is not formally opened until it is submitted through the applicable ComePlayers workflow or recorded by authorized support staff.",
          "The available action depends on the current order status, payment status, category, delivery progress, seller response, and whether irreversible delivery has already occurred.",
        ],
      },
      {
        title: "Unpaid Or Pending Orders",
        body: [
          "An unpaid or pending order may normally be cancelled by the buyer through the order interface before payment is confirmed. An unpaid order may also expire automatically after the displayed payment period.",
          "If the buyer has already sent payment but the order still appears unpaid or pending, the buyer should not create duplicate payments. Report the payment reference so ComePlayers or the payment provider can reconcile it.",
          "Cancellation of an unpaid authorization does not always produce a separate refund because funds may only be reserved by the bank or provider. Release of an authorization hold depends on the provider or issuing institution.",
        ],
      },
      {
        title: "Payment Verification Status",
        body: [
          "While payment is being verified, the buyer may request cancellation through the available order controls. ComePlayers may need to complete fraud, identity, payment, or duplicate-transaction checks before approving a refund.",
          "A cancellation caused by failed or incomplete payment verification is normally returned to the original payment method where money was actually captured.",
          "Processing time depends on the payment provider, bank, card network, currency, authorization status, and any legally required verification.",
        ],
      },
      {
        title: "Preparing Status",
        body: [
          "When an order is being prepared but irreversible delivery has not occurred, the buyer may request cancellation through the order page. The seller may be asked to confirm whether preparation or delivery has begun.",
          "Seller approval may be required where the seller has already incurred a disclosed and reasonable non-recoverable cost or begun a custom service. ComePlayers may review evidence before deciding whether a full refund, partial refund, cancellation, or continued fulfilment is appropriate.",
          "If the seller does not respond within forty-eight (48) hours, ComePlayers may cancel or escalate the order using the available evidence. Non-response does not automatically guarantee a refund where irreversible delivery is independently proven.",
        ],
      },
      {
        title: "Delivering Or Partially Delivered Orders",
        body: [
          "A buyer may report a problem while delivery is in progress. Where no portion has been delivered and cancellation is feasible, ComePlayers may cancel the order and issue the applicable refund.",
          "If partial delivery has occurred, the seller should stop further delivery while the request is reviewed unless ComePlayers instructs otherwise. The parties should identify the delivered and undelivered portions clearly.",
          "ComePlayers may order completion, replacement, a proportional refund, a full refund with a permitted reversal of delivery, or another fair remedy based on divisibility, use, value, evidence, category rules, and applicable law.",
        ],
      },
      {
        title: "Delivered Orders",
        body: [
          "A delivered order cannot normally be cancelled as though delivery never occurred. The buyer must instead report the specific non-delivery, mismatch, invalidity, access, or quality issue through the order dispute workflow.",
          "The seller may be asked to approve a remedy or provide evidence. If the seller does not respond within forty-eight (48) hours, the buyer may escalate the case and ComePlayers may decide it using the available record.",
          "A Delivered status is not conclusive by itself. ComePlayers may review whether complete and valid delivery actually occurred and whether the proof matches the listing and order.",
        ],
      },
      {
        title: "Completed Orders",
        body: [
          "After an order is completed, returns and refunds are generally unavailable except for a covered claim submitted within an applicable protection period, a proven hidden defect or unauthorized revocation, payment error, fraud, mandatory legal remedy, or another exception approved by ComePlayers.",
          "Completion may release seller funds, but ComePlayers may still hold, reverse, offset, or recover amounts where a later valid refund, chargeback, duplicate payment, fraud finding, legal order, or technical correction requires it.",
          "Account closure, deletion of messages, removal of a listing, or withdrawal of seller funds does not prevent ComePlayers from reviewing records or enforcing unresolved financial obligations.",
        ],
      },
      {
        title: "Gift Cards, Game Codes, Software, And Digital Keys",
        body: [
          "A gift card, game code, software license, subscription code, or digital key becomes non-refundable after the code or credential is revealed, copied, downloaded, redeemed, activated, transferred, or otherwise made irreversibly available to the buyer, unless it was invalid, previously used, materially misdescribed, unauthorized, or subject to a mandatory legal remedy.",
          "A buyer should verify the correct product, region, platform, edition, language, denomination, device requirements, and account eligibility before purchase.",
          "ComePlayers may require provider validation showing whether, when, where, and by which account a code was redeemed. A seller must cooperate and may not issue the same unique code to more than one buyer.",
        ],
      },
      {
        title: "Game Accounts And Subscription Accounts",
        body: [
          "A buyer must review the account description and change permitted recovery, password, and security details promptly after delivery. The seller must transfer all access and recovery information promised by the listing and must not retain, reclaim, resell, or interfere with the account.",
          "A claim may be eligible where the delivered account is inaccessible at delivery, materially different, already restricted contrary to the listing, or recovered by the seller or a prior owner during an applicable protection period.",
          "Refunds are generally not available for publisher action caused by the buyer after delivery, buyer security failures, sharing or resale, unauthorized modifications, or risks accurately disclosed in the listing, subject to applicable law and any express PlayerGuard coverage.",
        ],
      },
      {
        title: "Game Items, Currency, Coins, And Points",
        body: [
          "In-game items, currency, coins, points, and similar assets are normally non-returnable after valid transfer because reversal may be impossible, may create duplication risk, or may expose the parties to scams and publisher enforcement.",
          "A buyer should never return an in-game asset merely because another user claims it was sent by mistake or requests a reverse trade. Use the ComePlayers order dispute process and follow instructions from authorized support.",
          "ComePlayers is not responsible for publisher or developer action arising solely from the rules of an external game, but may review whether the seller misrepresented the method, source, risk, or validity of delivery.",
        ],
      },
      {
        title: "Direct Top-Up And Account-Credit Orders",
        body: [
          "Before paying for a direct top-up, the buyer must verify the game or service, region, server, player or account ID, character name, denomination, quantity, and any required login or recipient information.",
          "A correctly completed top-up sent to the information supplied by the buyer is generally non-refundable, even when the buyer selected the wrong account, server, region, or amount.",
          "A refund or correction may be considered where the seller delivered to information different from the order, the top-up failed, the amount was incomplete, the credit was reversed for reasons attributable to the seller, or a mandatory legal right applies.",
        ],
      },
      {
        title: "Boosting, Coaching, GamePal, And Other Services",
        body: [
          "Service cancellation depends on whether work has started, what milestones were completed, whether scheduling capacity was reserved, and whether the service can be divided fairly.",
          "Before work begins, an eligible service may normally be cancelled for a full refund unless a clearly disclosed and lawful non-recoverable cost applies. After work begins, ComePlayers may approve completion, rescheduling, replacement, or a proportional refund for the unperformed portion.",
          "No refund is normally due where the seller completed the accurately described service and the buyer simply dislikes the outcome, unless a guaranteed result was expressly promised and not achieved or applicable law requires another remedy.",
        ],
      },
      {
        title: "Returns And Reversal Of Digital Delivery",
        body: [
          "Physical-style returns generally do not apply to digital goods. A buyer must not send, trade, transfer, delete, deactivate, or otherwise attempt to reverse a digital product unless ComePlayers gives clear instructions through the dispute workflow.",
          "Unauthorized return attempts can create fraud, duplication, access, and evidence risks. Returning an item or credential to the seller outside the approved process does not guarantee a refund and may remove PlayerGuard protection.",
          "Where a safe reversal is possible and required as part of an approved remedy, both parties must follow the recorded instructions and preserve evidence of each step.",
        ],
      },
      {
        title: "Refund Amounts And Partial Refunds",
        body: [
          "An approved refund may be full or partial. ComePlayers may calculate a partial refund based on the undelivered quantity, unfinished service, unusable portion, disclosed milestone value, benefit already received, or another reasonable allocation supported by the order.",
          "Promotional discounts, coupons, store credits, wallet credits, taxes, currency conversion, payment fees, handling fees, and provider deductions may be treated according to the original transaction record, provider rules, applicable law, and the reason for refund.",
          "A refund does not entitle a user to keep both the refunded money and a usable product or completed service unless ComePlayers or applicable law expressly permits that result.",
        ],
      },
      {
        title: "Refund Methods",
        body: [
          "Where available, an approved refund may be returned to the original payment method, ComePlayers Wallet or platform credit, or another lawful method selected by ComePlayers or the payment provider.",
          "Refunds caused by payment-verification failure, unauthorized capture, duplicate payment, or provider reversal are normally returned through the original payment channel where feasible.",
          "The available method may depend on currency, country, payment provider, bank capability, wallet eligibility, anti-fraud requirements, account status, and law. A refund method may not be editable after processing begins.",
        ],
      },
      {
        title: "Refund Processing Time",
        body: [
          "ComePlayers normally initiates an approved refund after the dispute decision, required reversal steps, and payment reconciliation are complete. The platform may show the refund status and reference where available.",
          "The receiving bank, card network, payment provider, or wallet may take one (1) to fourteen (14) business days, and sometimes longer, to post or release the funds. Authorization holds may disappear rather than appear as a separate refund transaction.",
          "ComePlayers cannot control external settlement times. The buyer should contact the relevant payment provider with the refund reference if the expected posting period has passed.",
        ],
      },
      {
        title: "Fees, Taxes, And Currency Conversion",
        body: [
          "Whether a fee, tax, or currency-conversion amount is refundable depends on the type of charge, transaction state, provider rules, applicable law, and the cause of cancellation or refund.",
          "A non-refundable provider, verification, network, handling, or currency-conversion cost may be deducted where it was properly disclosed and lawfully charged. ComePlayers will not retain a charge that applicable law requires to be returned.",
          "Exchange-rate movements may cause the amount received in a different currency to vary from the original local-currency amount. The transaction and refund records determine the applied values and dates.",
        ],
      },
      {
        title: "Payment Disputes And Chargebacks",
        body: [
          "A buyer should use the ComePlayers dispute process before initiating a payment dispute or chargeback, unless immediate action is reasonably necessary for an unauthorized payment or another legally protected reason.",
          "When a chargeback or external payment dispute is opened, ComePlayers may pause its internal refund process, restrict the relevant balance or account, provide transaction evidence to the provider, and wait for the provider's decision to avoid duplicate recovery.",
          "A user must not obtain both an internal refund and a chargeback for the same amount. ComePlayers may reverse duplicate credits, recover resulting fees or losses, create a negative balance, or take enforcement action against abusive chargebacks.",
        ],
      },
      {
        title: "Fraudulent Or Abusive Claims",
        body: [
          "False non-delivery claims, fabricated evidence, deliberate damage or misuse, hidden receipt, duplicate claims, collusion, return scams, chargeback abuse, and attempts to keep both the product and refunded funds are prohibited.",
          "ComePlayers may deny the claim, reverse credits, restrict refund privileges, hold balances, suspend or terminate accounts, preserve evidence, notify payment providers, and take lawful recovery or legal action where fraud or abuse is reasonably established.",
          "A rejected claim is not automatically fraudulent. Enforcement for fraud is based on the available evidence, pattern of activity, intent where relevant, and applicable law.",
        ],
      },
      {
        title: "ComePlayers Role And Decision Authority",
        body: [
          "The sale contract is generally between the buyer and seller. ComePlayers provides marketplace infrastructure, order records, payment and PlayerGuard controls, support, and dispute-resolution assistance, but does not become the seller of a third-party listing merely by hosting or facilitating it.",
          "ComePlayers may decide whether to cancel an order, release or hold funds, issue a refund or credit, require replacement or completion, impose a proportional remedy, or close a case using the platform record and applicable policies.",
          "Nothing in an internal decision prevents a user from exercising rights available under applicable law, a payment-provider process, or a competent authority, subject to rules against duplicate recovery and fraudulent claims.",
        ],
      },
      {
        title: "One-Time And Recurring Payments",
        body: [
          "A marketplace order is a one-time purchase unless the checkout clearly identifies an authorized recurring product or subscription and obtains the required agreement.",
          "For one-time orders, the buyer must verify the final product, quantity, recipient information, currency, price, fees, and taxes before payment.",
          "Where ComePlayers later offers a recurring service, the specific subscription terms, renewal schedule, cancellation method, and refund rules shown during purchase apply in addition to this Policy.",
        ],
      },
      {
        title: "Policy Changes And Existing Orders",
        body: [
          "ComePlayers may update this Policy to reflect new products, payment methods, marketplace workflows, fraud risks, provider requirements, legal obligations, or service improvements.",
          "A material change applies prospectively from its effective date. An existing order is normally assessed using the policy, listing terms, and protection information recorded when the order was placed, except where a later rule is required by law or provides a remedy ComePlayers chooses to apply more favorably.",
          "The updated date and effective date appear at the top of this page. Continued use of ComePlayers for new transactions after the effective date constitutes acceptance where permitted by law.",
        ],
      },
      {
        title: "Contact And Appeals",
        body: [
          "For a refund, cancellation, or delivery issue, use the controls on the relevant order first so the request is linked to the transaction record. Include the order number, issue summary, requested remedy, and supporting evidence.",
          "A user who believes a decision overlooked material evidence may submit an appeal through the available support channel within the period stated in the decision. The appeal should identify the specific error and provide any new evidence.",
          "Do not send passwords, one-time codes, complete payment credentials, private keys, seed phrases, or unrelated identity documents through ordinary marketplace messages or email. Use only an authorized secure verification flow when requested.",
        ],
      },
    ],
  },
  {
    slug: "advertising-policy",
    title: "Advertising Policy",
    eyebrow: "Advertising & Promotions",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "Rules for advertisements, sponsored placements, promoted listings, affiliate promotions, influencer content, banners, and other commercial messages displayed through or connected with ComePlayers.",
    notice: {
      title: "Advertising must be clear, accurate, and safe",
      body:
        "This Policy applies whenever a person or business pays for, publishes, distributes, targets, or benefits from advertising through ComePlayers. Approval, delivery, or payment for an advertisement does not mean ComePlayers endorses the advertiser, product, claim, seller, publisher, or external destination.",
    },
    sections: [
      {
        title: "Purpose And Scope",
        body: [
          "This Advertising Policy governs paid and unpaid commercial content displayed, distributed, or promoted through ComePlayers, including sponsored placements, promoted listings, display banners, search placements, store promotions, livestream sponsorships, affiliate links, creator campaigns, referral promotions, notifications, and other advertising formats that ComePlayers may offer.",
          "The Policy applies to advertisers, sellers, agencies, creators, affiliates, sponsors, campaign managers, and any person who submits, funds, controls, distributes, or materially benefits from an advertisement connected with ComePlayers.",
          "This Policy should be read together with the Terms of Service, Privacy Policy, Product & Listing Policy, Seller Rules, Refund & Cancellation Policy, Payment, Fee & Payout Schedule, intellectual-property requirements, and any campaign-specific terms shown when advertising services are purchased.",
        ],
      },
      {
        title: "Key Definitions",
        body: [
          "Advertisement or ad means any paid, sponsored, incentivized, promotional, or commercial message intended to increase awareness, traffic, engagement, sales, sign-ups, downloads, or another business outcome.",
          "Advertiser means the person or organization responsible for the advertisement, including the party paying for it, the beneficiary of it, and any agency, seller, creator, or affiliate acting on that party's behalf.",
          "Promoted listing means a marketplace listing that receives paid or sponsored visibility beyond its ordinary organic placement. Sponsored content includes creator, livestream, community, or editorial-style content provided in exchange for money, products, credits, discounts, commissions, or another material benefit.",
        ],
      },
      {
        title: "Advertiser Responsibility",
        body: [
          "The advertiser is responsible for every element of an advertisement, including its text, images, video, audio, targeting, offer, pricing, claims, disclosures, destination, tracking technology, fulfilment, and compliance with law.",
          "An advertiser must have the authority to advertise the relevant product, service, brand, account, store, event, or promotion and must be able to provide supporting documents when requested.",
          "Using an agency, creator, affiliate, automated tool, or third-party service does not transfer responsibility away from the advertiser. The advertiser remains responsible for actions taken on its behalf.",
        ],
      },
      {
        title: "Eligibility And Account Standing",
        body: [
          "Advertising services may be limited to verified users, approved sellers, eligible businesses, or accounts in good standing. ComePlayers may require identity, business, payment, tax, beneficial-owner, brand-authorization, or other verification before or during a campaign.",
          "An advertiser may not use a suspended, restricted, duplicate, borrowed, purchased, impersonated, or misleading account to submit or pay for advertisements.",
          "ComePlayers may refuse advertising access where an account has unresolved disputes, unpaid amounts, excessive refunds or chargebacks, repeated policy violations, suspicious activity, or another material trust or safety concern.",
        ],
      },
      {
        title: "Review And Approval",
        body: [
          "Advertisements may be reviewed automatically, manually, before publication, after publication, or both. Review may consider the ad, advertiser, product, destination, account history, targeting, payment risk, user reports, and other relevant context.",
          "Approval is not a permanent guarantee. ComePlayers may re-review, limit, pause, reject, remove, or require changes to an advertisement at any time when new information, user reports, legal requirements, technical issues, or policy risks arise.",
          "ComePlayers is not required to provide confidential security signals, fraud indicators, internal ranking factors, or detailed enforcement methods when explaining an advertising decision.",
        ],
      },
      {
        title: "Truthful And Substantiated Claims",
        body: [
          "Advertisements must be accurate, current, understandable, and supported by evidence. An advertiser must not omit material information or present a claim in a way that is likely to mislead a reasonable user.",
          "Objective claims about price, performance, delivery speed, stock, rarity, ownership, compatibility, safety, official status, approval, win rate, earnings, availability, or other measurable facts must be supported before the ad is submitted and for as long as it remains active.",
          "Testimonials, comparisons, demonstrations, before-and-after examples, statistics, rankings, and user results must reflect genuine experiences and must not imply that an exceptional outcome is typical when it is not.",
        ],
      },
      {
        title: "Clear Advertising Disclosure",
        body: [
          "Commercial content must be identifiable as advertising. ComePlayers may apply labels such as Sponsored, Promoted, Advertisement, Paid Partnership, or another clear disclosure.",
          "Advertisers, creators, streamers, affiliates, and reviewers must clearly disclose any material relationship, including payment, free products, commissions, referral rewards, sponsorships, ownership, or employment, in a prominent and understandable manner.",
          "A disclosure must not be hidden in hashtags, placed only after an expansion control, obscured by graphics, made in an unfamiliar language, or contradicted by the surrounding content.",
        ],
      },
      {
        title: "Ad And Destination Consistency",
        body: [
          "The destination reached after a user clicks or interacts with an advertisement must match the product, seller, offer, price, region, and material terms shown in the advertisement.",
          "An advertisement may not use bait-and-switch tactics, unrelated landing pages, hidden redirects, cloaking, misleading shortened links, automatic downloads, forced subscriptions, or a destination that changes materially after approval.",
          "A landing page or marketplace listing must be functional, secure, mobile-accessible where relevant, and contain the information reasonably needed to understand the offer before a user pays or provides personal data.",
        ],
      },
      {
        title: "Pricing, Discounts, And Promotional Terms",
        body: [
          "Advertisements that display a price, discount, coupon, cashback, bonus, free trial, giveaway, limited-time offer, or bundle must clearly state the material conditions and must match the amount and availability shown at checkout or on the listing.",
          "A reference price, crossed-out price, percentage discount, scarcity statement, countdown, or urgency claim must be genuine and must not be fabricated to pressure users.",
          "Mandatory fees, taxes, renewal terms, eligibility requirements, geographic restrictions, redemption limits, stock limits, and expiry dates must be disclosed where they could materially affect a user's decision.",
        ],
      },
      {
        title: "Prohibited Products And Services",
        body: [
          "Advertisements may not promote products, services, conduct, or transactions prohibited by law, the Product & Listing Policy, Seller Rules, or another ComePlayers policy.",
        ],
        bullets: [
          "Stolen, hacked, fraudulently obtained, unauthorized, counterfeit, duplicated, recalled, revoked, or otherwise unlawfully sourced accounts, codes, currency, items, software, credentials, or digital assets.",
          "Malware, spyware, credential theft, phishing, account takeover, carding, chargeback abuse, fake identity documents, fraud tools, illicit access, or services designed to bypass security or verification.",
          "Cheats, exploits, bots, automation, scripts, boosting methods, or other tools whose primary purpose is to violate a game, platform, publisher, or service provider's rules or harm other users.",
          "Illegal gambling, unlicensed betting, prohibited lotteries, pyramid schemes, deceptive investment schemes, guaranteed-profit programs, money laundering, or other unlawful financial activity.",
          "Weapons, explosives, illegal drugs, controlled substances, harmful chemicals, sexual services, exploitative adult content, human trafficking, hate products, extremist content, or other dangerous or unlawful material.",
          "Personal data, authentication codes, payment credentials, private keys, seed phrases, government identifiers, medical records, or other sensitive information offered for sale or unauthorized use.",
        ],
      },
      {
        title: "Restricted Categories",
        body: [
          "ComePlayers may permit advertising for certain higher-risk categories only when additional requirements are satisfied. Restricted categories may include game accounts, boosting, coaching, gift cards, software, subscriptions, financial or payment-related services, age-restricted products, competitions, and promotions involving third-party intellectual property.",
          "ComePlayers may require category approval, seller verification, proof of authorization, geographic restrictions, age controls, special disclosures, delivery safeguards, deposit or reserve requirements, or limits on targeting and claims.",
          "Permission to list or sell a product does not automatically mean the product is eligible for advertising. Advertising eligibility may be narrower than marketplace eligibility.",
        ],
      },
      {
        title: "Game Accounts, Items, Currency, And Services",
        body: [
          "Advertisements for game accounts, in-game items, currency, top-ups, boosting, coaching, GamePal, or related services must accurately state the game, platform, region, server, quantity, level, delivery method, delivery time, material risks, and any eligibility requirements.",
          "An ad must not claim that an account or product is permanently safe, immune from publisher action, officially approved, risk-free, unrecoverable, or guaranteed for life unless the advertiser has verifiable authority and can lawfully substantiate that exact claim.",
          "Advertising must not encourage users to violate publisher rules, conceal prohibited conduct, share credentials unsafely, communicate outside ComePlayers, or bypass PlayerGuard and supported payment flows.",
        ],
      },
      {
        title: "Prohibited Claims And Representations",
        body: [
          "Advertisements must not falsely claim or imply official partnership, publisher approval, platform endorsement, exclusivity, certification, legal authority, guaranteed results, guaranteed profits, guaranteed rank, guaranteed account safety, or immunity from enforcement.",
          "An advertiser may not imitate a system notification, support message, verification badge, security warning, checkout control, download button, unread indicator, or other interface element in a way that deceives users.",
          "Fear, humiliation, harassment, threats, manipulated emergencies, fake warnings, or unsupported claims that a user is at immediate risk may not be used to pressure a purchase or disclosure of information.",
        ],
      },
      {
        title: "Intellectual Property And Brand Rights",
        body: [
          "An advertiser must own or have valid permission to use every trademark, logo, game asset, character, image, video, audio track, font, design, likeness, clip, screenshot, and other protected material included in an advertisement.",
          "Advertisements must not sell or promote counterfeit products, impersonate a rights holder, confuse users about source or affiliation, or use another person's brand in a misleading or unfair manner.",
          "ComePlayers may request licenses, invoices, authorization letters, source files, model releases, or other evidence and may remove content in response to a credible rights complaint or legal notice.",
        ],
      },
      {
        title: "Use Of ComePlayers Names And Marks",
        body: [
          "The ComePlayers name, logo, PlayerGuard name, Alexia mascot, badges, interface, screenshots, and other brand assets may be used only as expressly permitted by ComePlayers brand guidelines or written authorization.",
          "An advertiser may truthfully state that a product is listed on ComePlayers where accurate, but may not imply sponsorship, certification, partnership, priority support, safety guarantees, or official approval that ComePlayers has not granted.",
          "ComePlayers may require removal or correction of any use that is outdated, distorted, low quality, misleading, offensive, or inconsistent with the platform's reputation and brand standards.",
        ],
      },
      {
        title: "Reviews, Testimonials, And Endorsements",
        body: [
          "Reviews, ratings, testimonials, endorsements, and creator opinions used in advertising must be genuine, relevant, and not materially edited in a misleading way.",
          "Advertisers may not create fake reviews, purchase undisclosed positive reviews, suppress valid negative feedback, offer compensation conditioned on a positive rating, or present employees, owners, family members, or paid promoters as independent customers without disclosure.",
          "A quoted review should preserve its material context. ComePlayers may require proof that the reviewer consented to the use and that the underlying experience occurred.",
        ],
      },
      {
        title: "Targeting And Audience Selection",
        body: [
          "Advertising targeting must be used responsibly and only through controls made available by ComePlayers. Advertisers must not attempt to infer, obtain, upload, or target users based on unlawfully collected or highly sensitive personal data.",
          "Targeting may not be used to discriminate unlawfully, exploit a person's vulnerability, exclude protected groups from legally protected opportunities, or pressure users believed to be experiencing financial, emotional, medical, or other hardship.",
          "ComePlayers may limit audience size, frequency, geographic reach, age range, category targeting, custom audiences, or optimization methods to protect privacy, safety, fairness, and platform quality.",
        ],
      },
      {
        title: "Children And Younger Audiences",
        body: [
          "Advertisements directed to or likely to reach children or younger users must comply with applicable age, consumer, privacy, and advertising laws and must avoid exploiting inexperience, loyalty, fear, social pressure, or difficulty understanding commercial intent.",
          "Ads must not encourage minors to conceal purchases, pressure parents or guardians, disclose personal information, meet unknown adults, use unauthorized payment methods, or participate in age-inappropriate products or services.",
          "ComePlayers may prohibit or restrict targeting below a specified age even where local law would otherwise permit the advertisement.",
        ],
      },
      {
        title: "Privacy, Tracking, And Personal Data",
        body: [
          "Advertisers must collect, use, disclose, and protect personal data in accordance with applicable law, the ComePlayers Privacy Policy, and any campaign-specific data terms.",
          "Cookies, pixels, SDKs, fingerprinting, conversion tags, custom audiences, contact lists, and similar technology may be used only when authorized by ComePlayers and supported by a valid legal basis, required notices, and consent where applicable.",
          "An advertiser must not collect passwords, one-time codes, complete payment credentials, private keys, seed phrases, government identifiers, or other unnecessary sensitive data through an advertisement or landing page.",
        ],
      },
      {
        title: "Security And External Destinations",
        body: [
          "Advertisements and destinations must not contain malicious code, deceptive scripts, unwanted software, forced downloads, browser hijacking, phishing, credential capture, cryptojacking, or attempts to bypass device or account security.",
          "External websites must use reasonable security controls and must not imitate ComePlayers login, checkout, support, wallet, verification, or dispute pages.",
          "ComePlayers may scan, block, warn about, or refuse external domains and may require advertisers to use on-platform listings or approved destinations where this reduces fraud and user harm.",
        ],
      },
      {
        title: "Ad Format And Creative Quality",
        body: [
          "Advertising creative must be legible, technically functional, professionally presented, and suitable for the placement. Images and video must not be excessively pixelated, cropped, flashing, obstructive, or designed to cause accidental interaction.",
          "Audio must not play unexpectedly where prohibited by the placement. Animation, flashing, vibration, repeated notifications, and other attention mechanisms may be restricted for accessibility and user experience.",
          "Ads may not contain broken layouts, invisible text, excessive capitalization, meaningless symbols, misleading buttons, inaccurate screenshots, or content that obscures required disclosures.",
        ],
      },
      {
        title: "Community, Messaging, And Livestream Advertising",
        body: [
          "Commercial messages in chats, groups, comments, livestreams, profiles, or community spaces must comply with feature rules and must not become spam, harassment, repetitive solicitation, or unauthorized mass messaging.",
          "Livestream hosts and creators must disclose sponsorships and must not display prohibited products, unsafe payment instructions, hidden affiliate relationships, fabricated live activity, or misleading demonstrations.",
          "ComePlayers may limit promotional posting frequency, remove commercial content from non-commercial spaces, or require use of designated advertising tools.",
        ],
      },
      {
        title: "Affiliate, Referral, And Influencer Promotions",
        body: [
          "Affiliates, referral partners, creators, and influencers must comply with this Policy even when content is published outside ComePlayers but promotes a ComePlayers listing, campaign, referral code, or commercial relationship.",
          "Material benefits must be disclosed clearly. Affiliate traffic must be genuine and must not involve bots, click farms, cookie stuffing, forced redirects, fake accounts, self-referrals, misleading domains, spam, trademark abuse, or unauthorized paid search bidding.",
          "ComePlayers may withhold, reverse, or recover rewards and commissions generated through invalid, deceptive, duplicated, fraudulent, or policy-violating activity.",
        ],
      },
      {
        title: "Giveaways, Contests, And Competitions",
        body: [
          "An advertiser running a giveaway, contest, tournament, prize draw, or competition must comply with applicable law and clearly state eligibility, entry method, duration, geographic limits, prize details, selection method, claim process, and material restrictions.",
          "A promotion must not imply that ComePlayers sponsors, administers, guarantees, or endorses it unless ComePlayers has agreed in writing.",
          "Promotions may not require unlawful consideration, manipulate reviews or engagement, conceal odds, substitute materially inferior prizes, or collect more personal data than reasonably necessary.",
        ],
      },
      {
        title: "Political, Social-Issue, And Public-Interest Advertising",
        body: [
          "ComePlayers may prohibit or restrict political, electoral, social-issue, lobbying, advocacy, or public-interest advertising, including content funded by or on behalf of candidates, parties, public officials, governments, or issue campaigns.",
          "Where such advertising is permitted, enhanced identity, funding, authorization, disclosure, targeting, recordkeeping, and geographic requirements may apply.",
          "ComePlayers may reject public-interest advertising that creates material safety, misinformation, manipulation, legal, or platform-integrity risks even when the underlying viewpoint is lawful.",
        ],
      },
      {
        title: "Sponsored Placement And Organic Ranking",
        body: [
          "Paid placement may affect where an eligible advertisement or listing appears, but payment does not guarantee a specific position, number of impressions, click rate, sale, conversion, or business result unless the campaign terms expressly state otherwise.",
          "Sponsored placements should be distinguishable from organic recommendations. ComePlayers may consider relevance, quality, user experience, seller performance, safety, budget, bid, pacing, and other factors when delivering ads.",
          "An advertiser may not manipulate organic ranking or ad delivery through fake clicks, fake orders, coordinated accounts, keyword stuffing, duplicate listings, deceptive metadata, automated engagement, or other artificial activity.",
        ],
      },
      {
        title: "Campaign Delivery And Measurement",
        body: [
          "Estimated reach, impressions, clicks, conversions, audience size, delivery dates, and performance projections are estimates unless expressly guaranteed in writing. Actual results may vary because of competition, user behavior, inventory, targeting, review, budget, technical conditions, and fraud filtering.",
          "ComePlayers may exclude invalid, automated, duplicated, suspicious, accidental, or policy-violating activity from reports, billing, rewards, or optimization.",
          "ComePlayers records are the primary source for campaign delivery and billing unless a clear technical or accounting error is demonstrated. Third-party analytics may use different attribution windows, definitions, and filtering methods.",
        ],
      },
      {
        title: "Advertising Charges And Budget",
        body: [
          "Advertising prices, billing models, taxes, minimum budgets, currency, bid rules, spending limits, and payment timing are displayed when a campaign is created or purchased and may vary by format, market, audience, and availability.",
          "The advertiser is responsible for monitoring active campaigns, authorized users, budgets, payment methods, invoices, and spending. A campaign may stop or be limited when the budget is exhausted, a payment fails, verification is required, or risk controls are triggered.",
          "ComePlayers may correct billing errors, issue credits, reverse invalid delivery, recover underpayments, or offset amounts against eligible balances in accordance with applicable terms and law.",
        ],
      },
      {
        title: "Cancellation, Credits, And Refunds",
        body: [
          "An advertiser may cancel or pause a campaign using available controls, but cancellation may not reverse advertising already delivered, committed inventory, non-recoverable production costs, taxes, or third-party charges.",
          "Refunds or advertising credits may be considered for confirmed duplicate billing, material non-delivery caused solely by ComePlayers, or another circumstance expressly stated in campaign terms or required by law.",
          "No refund is normally due for dissatisfaction with business results, low conversion, ordinary performance variation, rejected creative caused by the advertiser, inaccurate targeting selected by the advertiser, or suspension arising from a policy violation.",
        ],
      },
      {
        title: "Records, Audit, And Cooperation",
        body: [
          "Advertisers must retain records reasonably needed to substantiate claims, authorization, pricing, consent, targeting data, promotions, rights ownership, fulfilment, and legal compliance for an appropriate period.",
          "ComePlayers may request documents, test purchases, inspect destinations, review campaign settings, preserve evidence, or require written explanations during an audit or investigation.",
          "Failure to provide accurate and timely information may result in rejection, removal, loss of advertising access, withholding of credits or rewards, account restrictions, or other enforcement.",
        ],
      },
      {
        title: "Enforcement",
        body: [
          "ComePlayers may reject, edit where authorized, limit, pause, disable, remove, or stop delivering an advertisement that violates this Policy, another platform rule, campaign terms, law, or trust and safety requirements.",
          "ComePlayers may also restrict targeting, disable links, remove promoted status, suspend advertising access, limit marketplace features, place funds on hold, reverse credits, recover losses, suspend or close accounts, notify affected users, cooperate with rights holders, or report unlawful activity to relevant authorities.",
          "Enforcement may consider severity, intent, repetition, user harm, advertiser history, cooperation, remediation, legal obligations, and the need to protect the platform. Serious conduct may result in immediate action without prior warning.",
        ],
      },
      {
        title: "Appeals",
        body: [
          "An advertiser who believes an advertising decision was incorrect may use the available support or appeal channel and should identify the affected advertisement, campaign, account, decision, and specific reason the decision should be reconsidered.",
          "An appeal should include relevant authorization, substantiation, corrected creative, technical evidence, or other new information. Repeated submissions without new information may be closed without further review.",
          "An appeal does not automatically restore delivery or delay action needed for safety, legal compliance, payment risk, rights protection, or platform integrity.",
        ],
      },
      {
        title: "Changes To This Policy",
        body: [
          "ComePlayers may update this Policy when advertising products, marketplace features, laws, industry standards, security risks, or business practices change. The latest updated and effective dates will appear at the top of this page.",
          "Material changes may be communicated through the platform, campaign interface, email, or another appropriate method. New or continuing campaigns may be required to comply with updated requirements from the stated effective date.",
          "Where a campaign-specific written agreement conflicts with this Policy, the more specific term controls only for that campaign and only to the extent the agreement expressly addresses the conflict and applicable law permits it.",
        ],
      },
      {
        title: "Contact",
        body: [
          "Use ComePlayers Support for advertising reviews, billing questions, rights concerns, policy reports, or appeals. Include the relevant campaign or advertisement identifier, account information, issue description, and supporting evidence.",
          "To report an advertisement, use the report control where available so the report is linked to the correct creative, placement, advertiser, and delivery context.",
          "Do not send passwords, one-time codes, complete payment credentials, private keys, seed phrases, or unrelated identity documents through ordinary messages or email. Use only an authorized secure verification flow when requested.",
        ],
      },
    ],
  },
  {
    slug: "playerguard-protection",
    title: "PlayerGuard Protection",
    eyebrow: "Transaction Safety & Dispute Protection",
    updatedAt: "13 July 2026",
    effectiveAt: "13 July 2026",
    status: "Effective Policy",
    summary:
      "How PlayerGuard holds eligible payments, verifies digital delivery, protects buyers and qualifying sellers, reviews evidence, and resolves marketplace transaction disputes.",
    notice: {
      title: "PlayerGuard is transaction protection, not a product warranty",
      body:
        "PlayerGuard helps keep eligible ComePlayers transactions safe and fair through protected checkout, controlled fund release, evidence records, risk checks, and dispute review. It does not guarantee the quality, future condition, publisher support, legality, performance, value, or continued availability of a product or service. Buyers and sellers remain responsible for the transaction and for complying with all applicable policies.",
    },
    sections: [
      {
        title: "About PlayerGuard",
        body: [
          "PlayerGuard is ComePlayers' transaction-protection framework for eligible marketplace orders. It combines protected payment handling, order-status controls, delivery records, identity and risk checks, dispute tools, and seller payout rules.",
          "PlayerGuard is designed to reduce non-delivery, item-not-as-described, unauthorized-payment, evidence-manipulation, and off-platform fraud risks. Coverage is conditional and depends on the order, product category, payment method, user conduct, available evidence, and compliance with ComePlayers policies.",
          "The protection displayed on the relevant listing, checkout, and order page controls for that transaction. A feature, protection period, or remedy is not available merely because it is described generally in this Policy.",
        ],
      },
      {
        title: "Sale Contract And ComePlayers' Role",
        body: [
          "Unless ComePlayers expressly identifies itself as the seller, the sale contract is directly between the buyer and the seller. The seller is responsible for the accuracy, authorization, legality, availability, quality, and delivery of the listed product or service.",
          "ComePlayers provides the marketplace, order records, payment and wallet interfaces, PlayerGuard controls, communication tools, support, moderation, and dispute assistance. Facilitating a transaction does not make ComePlayers the manufacturer, publisher, owner, guarantor, or seller of a third-party listing.",
          "ComePlayers may review evidence, mediate, hold or release funds, cancel an order, issue a permitted remedy, restrict an account, or take other action under its policies. These actions do not transfer the underlying seller obligations to ComePlayers.",
        ],
      },
      {
        title: "How PlayerGuard Works",
        body: [
          "When an eligible buyer pays through supported ComePlayers checkout, the transaction is recorded and the seller proceeds are not immediately available for unrestricted payout. The order remains subject to delivery, acceptance, dispute, fraud, and settlement controls.",
          "The seller must deliver exactly what was offered using the supported method and preserve valid evidence. The buyer must inspect the delivery before confirming completion or allowing the claim window to expire.",
          "If the order is completed without a valid dispute, the seller net proceeds may move to the seller balance, subject to payout holds, reserves, payment settlement, chargeback risk, and other requirements. If a dispute is opened, ComePlayers may keep the relevant funds unavailable until review is complete.",
        ],
      },
      {
        title: "Protected Checkout And Escrow Controls",
        body: [
          "PlayerGuard applies only to payments successfully processed through a supported ComePlayers checkout or wallet flow and linked to the correct order. Cash payments, direct transfers, cryptocurrency transfers, private invoices, external links, or any payment outside ComePlayers are not protected.",
          "Funds may be authorized, captured, held by a payment provider, reflected in a safeguarded settlement flow, or restricted in an internal ledger depending on the payment method and applicable regulation. The word escrow describes the transaction-control function and does not necessarily mean that ComePlayers operates a regulated escrow account in every jurisdiction.",
          "ComePlayers may delay capture, delivery, completion, fund release, wallet availability, or payout while identity, payment, sanctions, fraud, security, technical, or compliance checks are pending.",
        ],
      },
      {
        title: "Buyer Protection Coverage",
        body: [
          "An eligible buyer may receive PlayerGuard review when the paid order was not delivered, the delivered quantity was materially short, the product or service materially differed from the listing or agreed order details, or a supported digital credential or code was invalid at the time of delivery.",
          "Coverage may also apply when the seller cannot complete the order within the promised delivery window, the seller admits non-performance, or ComePlayers verifies a delivery or listing violation that materially affects the purchase.",
          "Available remedies may include order cancellation, replacement, redelivery, correction, full refund, partial refund, wallet credit, or another proportionate outcome permitted by the Refund and Cancellation Policy and applicable law.",
        ],
      },
      {
        title: "Buyer Protection Exclusions",
        body: [
          "PlayerGuard generally does not cover buyer's remorse, accidental purchases caused by the buyer, price changes after purchase, dissatisfaction with a characteristic accurately disclosed in the listing, or a preference change after valid delivery.",
          "Coverage does not normally apply to transactions completed or paid outside ComePlayers, communications or evidence intentionally moved off-platform, losses caused by sharing credentials or authentication codes, unauthorized resale, buyer modification or misuse, or failure to follow reasonable delivery instructions.",
          "PlayerGuard does not cover a later game-publisher or developer action, patch, balance change, ban, reset, account-policy enforcement, service shutdown, region restriction, market-value change, or third-party decision after valid delivery unless the seller caused the issue, concealed a material risk, or the order displayed express extended coverage.",
          "Fraudulent, duplicated, fabricated, abusive, or materially late claims may be denied and may result in account enforcement.",
        ],
      },
      {
        title: "Buyer Responsibilities",
        body: [
          "The buyer must review the listing, seller information, delivery method, region, platform, edition, quantity, prerequisites, warnings, and applicable protection period before ordering.",
          "The buyer must provide accurate delivery information, remain reasonably available during the delivery window, follow lawful and safe instructions, protect their account and device, and communicate through ComePlayers order messages.",
          "After delivery, the buyer must promptly inspect the product or service. The buyer should verify access, quantity, functionality, account details, recovery information, region, and any other material listing promise before selecting Order Complete.",
          "The buyer must not confirm completion merely because the seller requests it, and must not threaten a false dispute, chargeback, negative review, or report to obtain an unwarranted refund or additional product.",
        ],
      },
      {
        title: "Order Confirmation And Acceptance",
        body: [
          "Selecting Order Complete confirms that the buyer has received and accepted the delivered product or service and authorizes the transaction to proceed toward seller fund release. A buyer should not confirm until the delivery has been fully checked.",
          "Unless the order displays a different claim window, an order may be treated as accepted if the buyer submits no eligible issue within 72 hours after recorded delivery. Automatic completion does not override non-waivable consumer rights or an express extended PlayerGuard period.",
          "A confirmed or automatically completed order may still be reviewed for verified fraud, unauthorized payment, a covered extended-protection event, a legal requirement, or another exceptional circumstance stated in ComePlayers policies. Completion does not guarantee a refund or prevent all later payment-provider action.",
        ],
      },
      {
        title: "Seller Protection Coverage",
        body: [
          "A qualifying seller may receive PlayerGuard assistance against certain unauthorized-payment chargebacks, fraudulent buyer claims, and delivery disputes when the seller fully complies with the Terms of Service, Seller Rules, Product and Listing Policy, supported delivery procedures, and evidence requirements.",
          "Seller protection is not automatic. ComePlayers may consider identity verification, account standing, product category, order value, payment method, delivery method, evidence quality, dispute history, fraud signals, and timely cooperation.",
          "Where a seller qualifies, ComePlayers may defend a payment dispute, absorb or reverse an eligible chargeback liability, maintain the seller proceeds, or provide another outcome described in the applicable seller-protection rules. Eligibility may differ by country, payment provider, or transaction.",
        ],
      },
      {
        title: "Chargeback Protection For Sellers",
        body: [
          "Chargeback protection concerns a buyer's unauthorized-payment or similar dispute filed with a bank, card network, wallet provider, or other payment service. It is separate from a product complaint submitted through ComePlayers.",
          "To qualify, the seller must have delivered the exact order through a supported method, retained complete and authentic evidence, complied with all verification requests, avoided off-platform conduct, and not contributed to the unauthorized use or payment risk.",
          "ComePlayers may require the seller to provide additional evidence within a strict payment-provider deadline. Failure to respond on time, incomplete proof, prohibited delivery, inconsistent records, or policy violations may make the seller responsible for the chargeback, fees, negative balance, and related losses.",
        ],
      },
      {
        title: "Seller Protection Exclusions",
        body: [
          "Seller protection does not cover non-delivery, materially late delivery without approval, products or services not as described, invalid or previously used codes, unauthorized or illegally sourced products, fake or altered evidence, intentional fraud, account recovery by the seller, or a seller-caused access loss.",
          "It does not normally cover orders delivered outside the supported workflow, orders for which required evidence was not uploaded, transactions redirected off-platform, prohibited products, collusive orders, self-purchases, manipulated reviews, or conduct that violates publisher, platform, or legal requirements.",
          "A seller with excessive complaints, refund rates, chargebacks, evidence failures, policy violations, or suspicious activity may lose protection eligibility and may be subject to reserves, delayed payouts, order refunds, selling restrictions, or suspension.",
        ],
      },
      {
        title: "Seller Responsibilities",
        body: [
          "The seller must maintain accurate listings and stock, deliver within the displayed timeframe, use only authorized and lawful inventory, follow category-specific instructions, protect buyer information, and communicate through ComePlayers.",
          "The seller must deliver the complete product or service exactly as described, including the correct game, region, platform, edition, server, quantity, level, rank, attributes, access information, and any included recovery or ownership details.",
          "The seller must immediately report delivery problems, duplicate orders, suspected fraud, buyer misconduct, publisher restrictions, technical failures, or any inability to fulfil the order. A seller must not mark an order delivered before actual delivery.",
        ],
      },
      {
        title: "Proof Of Delivery",
        body: [
          "A seller must upload valid proof of delivery to the relevant ComePlayers order or designated secure evidence field whenever required. Evidence sent only by email, external messenger, social media, or another unlinked channel may be disregarded.",
          "Proof must show what was delivered, when it was delivered, how it was linked to the buyer and order, and that the promised quantity or service was completed. The evidence must be legible, complete, authentic, and capable of verification.",
          "ComePlayers may decide a dispute against a seller who does not provide sufficient evidence within the required time. Marking an order delivered, receiving buyer confirmation, or uploading a file does not by itself prove valid delivery.",
        ],
      },
      {
        title: "Evidence Requirements",
        body: [
          "Evidence may include order messages, platform logs, timestamps, transaction records, screenshots, screen recordings, video, game or publisher notifications, character or account identifiers, before-and-after balances, delivery receipts, redemption results, and other relevant records.",
          "Evidence should display the relevant order context without unnecessary personal data. Sellers must redact unrelated secrets while preserving the information required to verify delivery. Passwords, one-time codes, private keys, seed phrases, and complete payment credentials must not be exposed in ordinary evidence uploads.",
          "ComePlayers may require continuous video for high-value or higher-risk orders, account transfers, certain games, or categories vulnerable to manipulation. The order or category instructions may specify additional evidence requirements.",
          "Edited, recycled, staged, misleading, incomplete, or fabricated evidence is prohibited. ComePlayers may compare metadata, platform logs, prior submissions, device information, messages, and third-party records to assess authenticity.",
        ],
      },
      {
        title: "Game Account Transactions",
        body: [
          "For a permitted game-account transaction, the seller must transfer all access, recovery, ownership, and security information promised in the listing and must not retain or later use a recovery path to reclaim the account.",
          "The buyer must promptly secure the account by changing supported credentials, recovery information, and authentication settings. The buyer must preserve the original delivery evidence and follow any order-specific security steps.",
          "Standard protection concerns the condition at delivery. A listing may display an extended PlayerGuard period for covered recovery, revocation, or ownership events. Unless expressly stated, PlayerGuard does not guarantee perpetual account access or protection against independent publisher enforcement.",
        ],
      },
      {
        title: "Items, Currency, Skins, And Top-Ups",
        body: [
          "Evidence for items, currency, skins, top-ups, and similar deliveries should identify the buyer's character, account, server, region, or recipient and show the promised quantity or entitlement before and after delivery where practicable.",
          "The seller is responsible for using the correct recipient details supplied in the order. The buyer is responsible for checking those details before submission. A delivery to incorrect details caused solely by accurate seller reliance on buyer-provided information may not qualify for refund.",
          "A seller must not reverse, reclaim, duplicate, or fraudulently source delivered value. Publisher reversals linked to the seller's payment failure, unauthorized source, or misconduct may remain covered even after initial completion, subject to evidence and applicable claim limits.",
        ],
      },
      {
        title: "Codes, Gift Cards, Software, And Subscriptions",
        body: [
          "A code, key, gift card, subscription, or software entitlement must be valid, unused, authorized, compatible with the listed region and platform, and delivered through the supported order channel.",
          "The buyer should test or redeem the code promptly and preserve the complete error message, redemption time, region, platform, and relevant account status if an issue occurs.",
          "A code that was valid and successfully redeemed is generally not returnable. A seller may be required to replace or refund a code shown to have been invalid, previously used, region-locked contrary to the listing, revoked because of the seller's source, or otherwise materially non-compliant at delivery.",
        ],
      },
      {
        title: "Boosting, Coaching, And Other Services",
        body: [
          "Service sellers must clearly describe the scope, target, prerequisites, expected duration, scheduling, permitted methods, buyer participation, and any material publisher or account risks.",
          "PlayerGuard may cover verified non-performance, materially incomplete service, or a result that materially differs from the agreed target. It does not guarantee competitive outcomes, skill improvement, matchmaking results, ranking permanence, or events outside the seller's control unless expressly promised.",
          "For account-access services, both parties must follow ComePlayers security instructions. Sellers must not retain credentials, access the account after completion, remove buyer assets, communicate as the buyer, or perform activity beyond the authorized service.",
        ],
      },
      {
        title: "Off-Platform Transactions Are Not Protected",
        body: [
          "PlayerGuard does not cover private deals, direct payments, external invoices, trades arranged outside ComePlayers, or any portion of an order intentionally moved to another platform.",
          "Users must not share external payment details, QR codes, wallet addresses, social-media accounts, phone numbers, or links for the purpose of avoiding ComePlayers checkout, fees, records, moderation, or protection controls.",
          "A request to move off-platform should be declined and reported. Participating in off-platform activity may cause loss of protection, refund denial, payout holds, recovery of losses, selling restrictions, suspension, or permanent closure.",
        ],
      },
      {
        title: "Security And Identity Verification",
        body: [
          "ComePlayers may require email, phone, device, payment, identity, business, liveness, bank-account, or beneficial-owner verification before or during protected transactions, wallet use, selling, dispute review, or payout.",
          "Verification helps reduce impersonation, account takeover, unauthorized payments, duplicate accounts, money laundering, fraud, and seller evasion. Completing verification does not guarantee that a user or transaction is risk-free.",
          "Users must provide accurate information and use only authorized verification flows. Identity documents, facial checks, bank details, and other sensitive data are processed under the Privacy Policy and applicable provider terms.",
        ],
      },
      {
        title: "Automated Risk Checks And Manual Review",
        body: [
          "PlayerGuard may analyze payment behavior, device and network signals, account age, authentication events, order patterns, listing history, delivery behavior, linked accounts, disputes, reports, and other indicators to detect suspicious activity.",
          "ComePlayers may require additional verification, limit an order, reject a payment, pause delivery, delay completion, hold funds, restrict a payout, or refer a case for manual review when risk indicators are present.",
          "Risk controls are confidential and may change. ComePlayers is not required to disclose detection thresholds, internal models, investigation methods, or information that could enable circumvention or compromise another user or investigation.",
        ],
      },
      {
        title: "Opening A Dispute",
        body: [
          "A buyer or seller should first use the order conversation to describe the issue and attempt a safe resolution. If the issue remains unresolved, the eligible party may open a dispute through the order page within the applicable claim period.",
          "The dispute must identify the specific issue, requested remedy, relevant listing promise, delivery event, and supporting evidence. General dissatisfaction, unsupported accusations, or evidence unrelated to the order may be insufficient.",
          "Opening a dispute may pause order completion, seller fund release, withdrawal, or other transaction actions. ComePlayers may also consolidate related cases or investigate linked accounts and transactions.",
        ],
      },
      {
        title: "Dispute Response And Cooperation",
        body: [
          "Unless ComePlayers states a different deadline, a party asked to respond to a dispute should provide the requested information within 48 hours. Payment-provider, fraud, safety, or legal cases may require a shorter response.",
          "Both parties must preserve relevant records, answer questions honestly, avoid deleting messages or evidence, and follow reasonable instructions. Failure to respond may result in a decision based on the available record.",
          "Harassment, threats, bribery, retaliation, evidence tampering, false reports, account transfers during review, or attempts to pressure support are prohibited and may affect the decision and account standing.",
        ],
      },
      {
        title: "How Disputes Are Decided",
        body: [
          "ComePlayers reviews the listing, order details, payment and delivery records, platform messages, submitted evidence, user history, technical logs, category rules, and other reliable information reasonably available.",
          "The decision may consider which party had control of the relevant risk, whether instructions were followed, whether the listing was clear, whether delivery was timely and complete, evidence credibility, policy compliance, and applicable consumer law.",
          "ComePlayers may request additional evidence, contact a payment provider or relevant third party, test information where appropriate, or refer suspected unlawful conduct to an authority. ComePlayers may decline evidence that is unsafe, unverifiable, illegally obtained, or unrelated.",
        ],
      },
      {
        title: "Available Resolutions",
        body: [
          "Depending on the facts, ComePlayers may allow delivery to continue, require redelivery or correction, extend a deadline, cancel the order, approve a replacement, issue a full or partial refund, release all or part of the seller proceeds, apply wallet credit, or take another proportionate action.",
          "ComePlayers may also place a reserve, reverse an internal credit, recover a negative balance, charge an applicable fee, restrict an account, remove a listing, or preserve funds while a payment dispute or legal process remains open.",
          "A resolution under PlayerGuard is based on the available evidence and platform policies. It does not prevent a user from exercising non-waivable statutory rights or a payment provider from making an independent decision under its rules.",
        ],
      },
      {
        title: "Extended Protection For Eligible Accounts",
        body: [
          "Certain higher-risk game-account or subscription-account listings may display an extended PlayerGuard protection period, such as up to 14 days, for specified ownership, recovery, revocation, or access events.",
          "Extended protection applies only when expressly shown on the listing or order and only to the stated events and period. The buyer must secure the account promptly, avoid prohibited activity, preserve evidence, and report a covered event without unreasonable delay.",
          "Extended protection does not cover buyer-caused security loss, credential sharing, resale, publisher enforcement caused by the buyer, undisclosed modifications, or a risk clearly excluded in the listing or order terms, subject to applicable law.",
        ],
      },
      {
        title: "Refunds And Partial Refunds",
        body: [
          "Approved refunds are handled under the Refund and Cancellation Policy and may be returned to the original payment method, ComePlayers Wallet, or another legally permitted method. Processing time may depend on the payment provider and financial institution.",
          "A partial refund may be used when part of the order was validly delivered, the shortfall can be reasonably valued, the buyer retained a measurable benefit, or the parties agree to a supported partial resolution.",
          "Fees, exchange-rate differences, third-party charges, used value, taxes, bonuses, rewards, or non-recoverable costs may be treated according to the order pricing snapshot, payment-provider rules, applicable policy, and law.",
        ],
      },
      {
        title: "Payment Disputes And Chargebacks",
        body: [
          "A user should contact ComePlayers and use the platform dispute process before filing a bank or payment-provider dispute, except where law or urgent payment security requires otherwise.",
          "A chargeback may cause the related PlayerGuard investigation or refund request to be paused or closed because the payment provider controls the funds. ComePlayers may submit order and account evidence to the provider and apply holds, reserves, reversals, or account restrictions while the case is pending.",
          "A successful chargeback does not automatically establish seller misconduct, and a rejected chargeback does not automatically establish valid delivery. ComePlayers may separately enforce its policies based on platform evidence.",
        ],
      },
      {
        title: "Fraudulent Claims And Abuse",
        body: [
          "Users must not submit false non-delivery claims, fabricated screenshots, edited video, recycled evidence, coordinated disputes, duplicate refunds, unauthorized chargebacks, collusive orders, account takeovers, or misleading statements.",
          "ComePlayers may deny protection, reverse credits, recover losses, hold balances, restrict payments or payouts, suspend features, permanently close accounts, preserve evidence, and report suspected fraud or unlawful activity.",
          "Good-faith reports are not penalized merely because a claim is unsuccessful. Enforcement focuses on intentional deception, reckless misuse, repeated abuse, evidence manipulation, or material policy violations.",
        ],
      },
      {
        title: "Seller Fund Release, Holds, And Reserves",
        body: [
          "Order completion may allow the seller net proceeds to enter the seller balance, but it does not guarantee immediate withdrawal. Funds remain subject to payment settlement, security holds, payout schedules, reserves, disputes, refunds, chargebacks, negative balances, taxes, and compliance checks.",
          "ComePlayers may delay or reverse an internal release when new evidence indicates fraud, non-delivery, unauthorized payment, a seller-caused revocation, a legal obligation, a payment-provider reversal, or another covered risk.",
          "The Payment, Fee and Payout Schedule explains standard fees, minimums, maximums, payout timing, and related controls. A transaction-specific quote or order snapshot may contain additional terms.",
        ],
      },
      {
        title: "Account Restrictions And Enforcement",
        body: [
          "ComePlayers may warn a user, request remediation, remove a listing, cancel an order, limit buying or selling, require verification, apply a reserve, delay payout, suspend a feature, temporarily suspend an account, or permanently close an account for PlayerGuard-related violations.",
          "Enforcement may consider severity, intent, repetition, financial risk, user harm, evidence integrity, cooperation, prior history, legal requirements, and the need to protect the marketplace.",
          "Serious fraud, scams, fake evidence, unauthorized product sourcing, account recovery after sale, chargeback abuse, or attempts to bypass PlayerGuard may result in immediate action without prior warning and recovery of amounts lawfully owed.",
        ],
      },
      {
        title: "No Product Or Outcome Guarantee",
        body: [
          "PlayerGuard is not insurance, a warranty, a guarantee of every transaction, or a promise that a product will retain value, remain supported, avoid publisher action, satisfy personal expectations, or function indefinitely.",
          "Digital products and game services may involve publisher rules, account restrictions, market volatility, technical dependencies, and risks outside ComePlayers' control. Users should review listings and publisher rules and make independent purchasing and selling decisions.",
          "Nothing in this Policy excludes liability or consumer rights that cannot lawfully be excluded or limited.",
        ],
      },
      {
        title: "Appeals",
        body: [
          "A user who believes a PlayerGuard decision was materially incorrect may submit an appeal through ComePlayers Support within the period stated in the decision notice, or within seven days when no period is stated.",
          "The appeal should identify the order and decision, explain the specific error, and include new or previously unavailable evidence. Repeating the same claims without new information may not result in another review.",
          "An appeal does not automatically pause a safety restriction, payment-provider deadline, legal hold, fraud investigation, refund already processed, or action needed to prevent further harm.",
        ],
      },
      {
        title: "Changes To PlayerGuard",
        body: [
          "ComePlayers may update PlayerGuard eligibility, claim windows, evidence standards, category coverage, payout controls, risk processes, and remedies as the marketplace, laws, payment methods, fraud patterns, or provider requirements change.",
          "The policy version and protection terms presented at the time of order generally apply to that transaction, except where a later change is required by law, improves a user's non-waivable rights, addresses urgent fraud or safety risks, or the order expressly states otherwise.",
          "Material changes may be communicated through the platform, order interface, seller dashboard, email, or another appropriate method.",
        ],
      },
      {
        title: "Contact And Reporting",
        body: [
          "Use the relevant order page to report delivery problems or open a dispute so the request is linked to the correct transaction. Use ComePlayers Support for appeals, payment-security reports, or issues that cannot be submitted through the order.",
          "Include the order identifier, clear description, requested resolution, relevant timestamps, and supporting evidence. Do not send passwords, one-time codes, private keys, seed phrases, complete payment credentials, or unrelated identity documents through ordinary messages.",
          "Report requests to move a transaction off-platform, suspicious seller recovery attempts, fake evidence, phishing, unauthorized payments, or account takeover as soon as possible so ComePlayers can take appropriate protective action.",
        ],
      },
    ],
  },
];

export function getLegalPage(slug: string) {
  return legalPages.find((page) => page.slug === slug) || null;
}

export function legalSectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
