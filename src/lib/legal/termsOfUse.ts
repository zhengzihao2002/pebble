import type { NoticeSection } from './privacyNotice';

/**
 * Pebble's Terms of Use, English and Chinese. Rendered at /auth/terms and
 * agreed to at sign-up together with the Privacy Notice (one checkbox, one
 * flag - the /api/auth gate refuses sign-up without it).
 *
 * Every disclaimer is qualified "to the maximum extent permitted by applicable
 * law" ON PURPOSE: an unqualified absolute disclaimer is often void and can
 * taint the whole clause. Keep the qualifier when editing.
 *
 * Not reviewed by a lawyer; not legal advice. Governing law, dispute venue and
 * arbitration details are left deliberately generic - see the hand-off notes.
 * If a feature changes what Pebble does, update this text and the date.
 */
export interface TermsOfUse {
  title: string;
  updated: string;
  intro: string;
  sections: NoticeSection[];
  back: string;
  /** The same link for someone who is already signed in. */
  backSignedIn: string;
  /** Link text to the Privacy Notice. */
  privacyLink: string;
}

export const TERMS_OF_USE: Record<'en' | 'zh', TermsOfUse> = {
  en: {
    title: 'Terms of Use',
    updated: 'Last updated: October 25, 2026',
    intro: 'These Terms of Use are an agreement between you and Wen Wen Inc. ("we", "us", "our"), the company that runs Pebble, a personal budgeting app available by invitation only. Please read them carefully. By creating an account or using Pebble, you agree to these Terms and to our Privacy Notice. If you do not agree, do not create an account and do not use Pebble. Some parts of these Terms limit our responsibility to you and affect your legal rights, including the sections on risk, disclaimers, liability, and disputes.',
    sections: [
      {
        heading: 'Who may use Pebble',
        paragraphs: [
          'Pebble is available by invitation only. You may use it only if you were invited, you are at least 16 years old, and you have the legal capacity to enter into this agreement. If you are using Pebble on behalf of anyone else, you confirm you are allowed to do so.',
          'You must give accurate account details and keep them up to date. You may not share your invitation, or pass your account to someone else.',
        ],
      },
      {
        heading: 'What Pebble is, and what it is not',
        paragraphs: [
          'Pebble is a personal record-keeping tool. It helps you write down and look back at your own income, spending, balances, budgets, goals, and scheduled payments.',
          'Pebble is not a bank or a financial institution. It does not hold, send, receive, or move money, and it does not connect to your bank or card accounts. Pebble is not a financial, tax, legal, accounting, or investment adviser, and nothing in Pebble is advice of any kind. Talk to a qualified professional before you make decisions that matter.',
        ],
      },
      {
        heading: 'Your account and security',
        paragraphs: [
          'You are responsible for keeping your password and your devices secure, and for everything that happens under your account, whether or not you authorised it. Choose a strong password that you do not use elsewhere, sign out of devices you no longer use, and tell us promptly if you think someone else has gained access.',
          'We may rely on any activity under your account as being yours.',
        ],
      },
      {
        heading: 'Everything you enter is voluntary, and your responsibility',
        paragraphs: [
          'All information you put into Pebble is entered voluntarily. Nothing requires you to enter any particular information, and you decide what to enter and whether to keep it.',
          'You alone are responsible for the accuracy, completeness, legality, and appropriateness of everything you enter, and for having the right to enter it. Pebble does not check your figures.',
          'Do not enter bank or card logins, full account or card numbers, passwords, government ID numbers, or any other information you would not want stored in a personal record-keeping app. Pebble does not need them. If you enter such information anyway, you do so at your own risk.',
        ],
      },
      {
        heading: 'Figures, charts, and suggestions are estimates',
        paragraphs: [
          'Pebble calculates balances, totals, charts, comparisons (including year-over-year views), projections, savings figures, budget alerts, and suggestions (including suggested recurring payments and quick picks) from what you enter. These are informational estimates only. They may be incomplete, out of date, or wrong, for example because of missing entries, rounding, time zones, currency differences, or software errors.',
          'Do not rely on them for payments, taxes, loans, filings, investments, or any other decision. Always check important figures against your real bank and card statements, which are the only authoritative record of your money.',
        ],
      },
      {
        heading: 'Offline use and data stored on your device',
        paragraphs: [
          'To work without a connection, Pebble keeps copies of pages and any transactions you add while offline on your own device. Data kept on a device can be lost, deleted by your browser or operating system, corrupted, or seen by anyone who can unlock the device.',
          'Uploads can fail or be delayed, and the same record edited on more than one device can conflict, so one version may replace or differ from another. It is your responsibility to review the items you upload and to check that your records are what you expect. We are not responsible for entries that never upload or that are changed by a conflict.',
        ],
      },
      {
        heading: 'Availability, and keeping your own backups',
        paragraphs: [
          'Pebble is provided "as is" and "as available". We do not promise that it will be available at any particular time, uninterrupted, error-free, or secure, or that any data will be kept or recoverable. We may change, pause, or limit Pebble for maintenance or any other reason. Pebble depends on third-party providers such as Neon (database and sign-in) and Vercel (hosting), and their outages or changes are outside our control.',
          'Keep your own records. You are responsible for keeping copies of anything you cannot afford to lose, for example by exporting your data or keeping your statements. Pebble is not a safe place to be the only copy of important records.',
        ],
      },
      {
        heading: 'Acceptable use',
        bullets: [
          'Do not break any law, or use Pebble for anything unlawful, fraudulent, or harmful, including recording or hiding proceeds of crime.',
          'Do not try to access anyone else\'s account or data, or to get around sign-in, invitation, or security measures.',
          'Do not probe, scan, overload, disrupt, or attack Pebble or the systems behind it, or use bots or scrapers on it.',
          'Do not copy, reverse engineer, or resell Pebble, except where the law lets you.',
          'Do not upload malware, or content that is unlawful or that infringes anyone\'s rights.',
        ],
      },
      {
        heading: 'Your content and our rights',
        paragraphs: [
          'You keep ownership of what you enter ("your content"). You give Wen Wen Inc. and its providers a limited, non-exclusive, worldwide, royalty-free licence to host, store, copy, process, transmit, and display your content, only as needed to run, secure, and improve Pebble for you and to comply with the law. This licence ends when your content is deleted, except for backup copies that providers keep for a limited time.',
          'Pebble, including its software, design, name, logo, and text, belongs to Wen Wen Inc. or its licensors and is protected by law. We give you a personal, limited, revocable, non-transferable right to use Pebble for your own personal budgeting while these Terms apply. We keep all rights not expressly given to you.',
        ],
      },
      {
        heading: 'Third-party services',
        paragraphs: ['Pebble relies on services run by others, such as hosting, database, sign-in, and email providers, and on your own browser and device. We do not control them and are not responsible for them, their availability, or what they do. Their own terms and policies apply to your use of them.'],
      },
      {
        heading: 'Disclaimer of warranties',
        paragraphs: [
          'To the maximum extent permitted by applicable law, Pebble and everything in it are provided "as is" and "as available", without warranties of any kind, whether express, implied, or statutory. This includes any warranty of merchantability, fitness for a particular purpose, accuracy, reliability, completeness, availability, security, quiet enjoyment, title, and non-infringement, and any warranty arising from a course of dealing or usage.',
          'We do not warrant that Pebble will meet your needs, that its figures are correct, or that it will be free of errors, bugs, viruses, or unauthorised access.',
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'To the maximum extent permitted by applicable law, neither Wen Wen Inc. nor its owners, directors, officers, employees, contractors, agents, affiliates, licensors, or service providers will be liable to you or anyone claiming through you for any direct, indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of data, profits, savings, income, goodwill, or opportunity, or for any penalties, fees, late charges, overdraft charges, or interest, or for any decision you make or action you take based on Pebble. This applies whether the claim is in contract, tort (including negligence), strict liability, statute, or anything else, and even if we were told such loss was possible.',
          'If, despite the above, liability cannot be excluded under applicable law, then to the maximum extent permitted by applicable law our total liability for all claims together is limited to the amount you paid us to use Pebble in the 12 months before the claim (which is nothing, since Pebble is free) or, if the law does not allow that, to the minimum amount the law allows.',
          'These limits apply even if a remedy fails of its essential purpose. They reflect a fair allocation of risk for a free service, and we would not offer Pebble without them.',
        ],
      },
      {
        heading: 'Assumption of risk',
        paragraphs: ['You understand that using any software, and keeping financial records in it, carries risks, including data loss, errors, outages, and unauthorised access that no one can fully prevent. To the maximum extent permitted by applicable law, you knowingly and voluntarily accept those risks when you use Pebble.'],
      },
      {
        heading: 'Events beyond our control, and other people',
        paragraphs: [
          'To the maximum extent permitted by applicable law, we are not responsible for any failure or delay caused by something beyond our reasonable control, such as natural disasters, war, terrorism, strikes, power or internet failures, government action, attacks on our systems, or failures of third-party providers.',
          'We are also not responsible for the acts or omissions of other users or third parties, or for unauthorised access to your account or data that we could not reasonably have prevented, including when your password or device is compromised.',
        ],
      },
      {
        heading: 'You will cover claims you cause (indemnification)',
        paragraphs: ['To the maximum extent permitted by applicable law, you agree to defend, indemnify, and hold harmless Wen Wen Inc. and its owners, directors, officers, employees, contractors, affiliates, licensors, and providers from any claim, loss, liability, damage, cost, or expense (including reasonable legal fees) arising out of your content, your use of Pebble, your breach of these Terms, or your violation of any law or anyone\'s rights.'],
      },
      {
        heading: 'Release',
        paragraphs: ['To the maximum extent permitted by applicable law, you release Wen Wen Inc. and the people and companies named in the limitation of liability section from all claims, demands, and damages, known or unknown, arising out of or connected with your use of Pebble, except for anything these Terms say cannot be limited. If you live somewhere that limits such releases (for example, one that does not release claims you do not know about), this release applies only as far as that place allows.'],
      },
      {
        heading: 'Ending your use, and suspension',
        paragraphs: [
          'You may stop using Pebble at any time, and you can delete your account in Settings. Deleting it removes your records as described in the Privacy Notice.',
          'We may suspend, restrict, or end your access, or remove content, at any time and for any reason, including if we think you broke these Terms or put Pebble or others at risk, or if we end or change Pebble. We will try to give notice where practical, but we do not have to.',
          'When your access ends, your right to use Pebble stops. Sections that by their nature should continue, including those on your content, disclaimers, liability, indemnification, release, and disputes, continue after that.',
        ],
      },
      {
        heading: 'Changes to Pebble and to these Terms',
        paragraphs: [
          'We may change, add, or remove features of Pebble at any time.',
          'We may update these Terms. When we do, we will change the date above, and for significant changes we will tell you in the app. If you keep using Pebble after a change takes effect, you accept the updated Terms. If you do not agree, stop using Pebble and delete your account.',
        ],
      },
      {
        heading: 'Resolving disputes',
        paragraphs: [
          'Talk to us first. If you have a problem, contact Wen Wen Inc. (see Contact) and give us a chance to put it right. Most concerns can be settled informally, and both sides will try in good faith to do so for at least 30 days before starting any formal proceeding.',
          'Governing law. These Terms are governed by the laws of the jurisdiction where Wen Wen Inc. is organized, without regard to conflict-of-law rules.',
          'Binding individual arbitration. To the maximum extent permitted by applicable law, if a dispute is not settled informally, you and Wen Wen Inc. agree to resolve it only through final and binding arbitration on an individual basis, rather than in court, except that either side may bring an individual claim in small-claims court if it qualifies, and either side may ask a court to stop misuse of intellectual property.',
          'No class actions or jury trials. To the maximum extent permitted by applicable law, you and Wen Wen Inc. each waive the right to a jury trial and the right to take part in a class, collective, consolidated, or representative action. Claims may be brought only in an individual capacity.',
          'If any part of this section cannot be enforced where you live, that part does not apply to you and the rest stays in effect.',
        ],
      },
      {
        heading: 'Your rights that cannot be limited',
        paragraphs: ['Nothing in these Terms limits or excludes any right or liability that cannot be limited or excluded by law, such as liability for fraud or fraudulent misrepresentation, for death or personal injury caused by negligence where applicable, or any consumer rights that the law of your place of residence gives you and does not allow to be waived. In that case, these Terms apply only as far as the law allows.'],
      },
      {
        heading: 'General terms',
        bullets: [
          'Severability: if any part of these Terms is found invalid or unenforceable, it is changed to the smallest extent needed to make it enforceable, and the rest stays in effect.',
          'No waiver: if we do not enforce a right right away, we have not given it up.',
          'Assignment: you may not transfer these Terms or your account. We may transfer them, for example if Pebble or our company is sold or reorganised.',
          'Entire agreement: these Terms and the Privacy Notice are the whole agreement between you and us about Pebble, and replace anything said or agreed earlier about it.',
          'Language: we may offer these Terms in more than one language for your convenience. If a translation differs from the English version, the English version is the one that applies.',
          'No third-party rights: except for the people and companies named in the liability sections, who may rely on them, no one else has rights under these Terms.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about these Terms? Contact Wen Wen Inc. If you do not have a direct way to reach us, ask the person who invited you to Pebble to pass your message on.'],
      },
    ],
    back: '← Back to sign in',
    backSignedIn: '← Back to Pebble',
    privacyLink: 'Read the Privacy Notice',
  },
  zh: {
    title: '使用条款',
    updated: '最后更新：2026年10月25日',
    intro: '本使用条款是你与文文有限公司（以下称“我们”）之间的协议。文文有限公司运营 Pebble，一款仅限受邀用户使用的个人记账应用。请仔细阅读。创建账户或使用 Pebble，即表示你同意本条款和我们的隐私声明。如果你不同意，请不要创建账户，也不要使用 Pebble。本条款中的部分内容会限制我们对你的责任，并影响你的法律权利，包括关于风险、免责声明、责任限制和争议解决的部分。',
    sections: [
      {
        heading: '谁可以使用 Pebble',
        paragraphs: [
          'Pebble 仅限受邀用户使用。只有在你受到邀请、年满 16 周岁、并具有订立本协议所需的法律行为能力时，才可以使用。如果你代表他人使用 Pebble，则表示你已获得相应授权。',
          '你必须提供真实的账户信息并及时更新。不得转让邀请，也不得把账户交给他人使用。',
        ],
      },
      {
        heading: 'Pebble 是什么，不是什么',
        paragraphs: [
          'Pebble 是一款个人记录工具，帮助你记录并回顾自己的收入、支出、余额、预算、目标和定期付款。',
          'Pebble 不是银行或金融机构，不保管、发送、接收或转移资金，也不会连接你的银行或银行卡账户。Pebble 也不是财务、税务、法律、会计或投资顾问，其中的任何内容都不构成任何形式的建议。在做出重要决定之前，请咨询合格的专业人士。',
        ],
      },
      {
        heading: '你的账户与安全',
        paragraphs: [
          '你有责任保管好自己的密码和设备，并对账户下发生的一切活动负责，无论是否经过你的授权。请使用强度高、且不与其他服务重复的密码，及时在不再使用的设备上退出登录；如果你怀疑他人进入了你的账户，请尽快告知我们。',
          '我们有权将你账户下的一切活动视为你本人的行为。',
        ],
      },
      {
        heading: '所有录入内容均出于自愿，并由你负责',
        paragraphs: [
          '你在 Pebble 中录入的所有信息均出于你的自愿。没有任何要求你必须录入特定信息，录入什么、是否保留，都由你自己决定。',
          '你须自行对所录入内容的准确性、完整性、合法性和适当性负责，并保证你有权录入这些内容。Pebble 不会核对你的数字。',
          '请不要录入银行或银行卡的登录信息、完整的账号或卡号、密码、证件号码，或任何你不希望保存在个人记账应用中的信息。Pebble 并不需要这些。如果你仍然录入，风险由你自行承担。',
        ],
      },
      {
        heading: '数字、图表和建议仅为估算',
        paragraphs: [
          'Pebble 会根据你录入的内容计算余额、合计、图表、对比（包括同比）、预测、储蓄数字、预算提醒和各类建议（包括建议的定期付款和快捷选项）。这些都只是供参考的估算，可能不完整、已过时或有误，例如由于漏记、四舍五入、时区、币种差异或软件错误。',
          '请不要依据这些内容进行付款、报税、贷款、申报、投资或做出其他决定。重要数字请务必与你真实的银行和银行卡对账单核对，只有对账单才是你资金的权威记录。',
        ],
      },
      {
        heading: '离线使用与设备上保存的数据',
        paragraphs: [
          '为了在没有网络时也能使用，Pebble 会在你自己的设备上保存页面副本，以及你离线时添加的交易。保存在设备上的数据可能丢失、被浏览器或操作系统清除、损坏，也可能被任何能解锁该设备的人看到。',
          '上传可能失败或延迟；同一条记录在多台设备上修改时可能产生冲突，其中一个版本可能覆盖另一个版本或与之不同。请你自行检查已上传的内容，确认记录与你的预期一致。对于从未上传成功或因冲突而被改动的记录，我们不承担责任。',
        ],
      },
      {
        heading: '服务可用性与自行备份',
        paragraphs: [
          'Pebble 按“现状”和“可用时”提供。我们不保证它在任何时间都可用、不会中断、没有错误或绝对安全，也不保证任何数据会被保留或可恢复。我们可能因维护或其他原因更改、暂停或限制 Pebble。Pebble 依赖 Neon（数据库与登录）、Vercel（托管）等第三方服务商，它们的故障或变更不在我们的控制范围内。',
          '请自行保存你的记录。对于不能丢失的内容，你应自行留存副本，例如导出数据或保存对账单。Pebble 不适合作为重要记录的唯一备份。',
        ],
      },
      {
        heading: '可接受的使用方式',
        bullets: [
          '不得违反任何法律，不得将 Pebble 用于任何违法、欺诈或有害的目的，包括记录或隐藏犯罪所得。',
          '不得试图访问他人的账户或数据，也不得绕过登录、邀请或安全措施。',
          '不得探测、扫描、使过载、干扰或攻击 Pebble 及其背后的系统，也不得使用机器人或爬虫程序。',
          '除非法律允许，不得复制、反向工程或转售 Pebble。',
          '不得上传恶意软件，或违法、侵犯他人权利的内容。',
        ],
      },
      {
        heading: '你的内容与我们的权利',
        paragraphs: [
          '你录入的内容（“你的内容”）仍归你所有。你授予文文有限公司及其服务商一项有限的、非独占的、全球范围的、免费的许可，仅为向你运行、保护和改进 Pebble 以及遵守法律之必要，托管、存储、复制、处理、传输和显示你的内容。内容被删除后，该许可即终止，但服务商在有限时间内保留的备份副本除外。',
          'Pebble，包括其软件、设计、名称、标志和文字，属于文文有限公司或其许可方，并受法律保护。在本条款有效期间，我们授予你一项个人的、有限的、可撤销的、不可转让的权利，供你将 Pebble 用于自己的个人记账。未明确授予你的权利，均由我们保留。',
        ],
      },
      {
        heading: '第三方服务',
        paragraphs: ['Pebble 依赖他人运营的服务，例如托管、数据库、登录和邮件服务商，也依赖你自己的浏览器和设备。我们无法控制这些服务，对它们及其可用性或行为不承担责任。你使用它们时，适用它们各自的条款和政策。'],
      },
      {
        heading: '免责声明',
        paragraphs: [
          '在适用法律允许的最大范围内，Pebble 及其中的一切内容均按“现状”和“可用时”提供，不附带任何明示、默示或法定的保证，包括对适销性、特定用途适用性、准确性、可靠性、完整性、可用性、安全性、不受干扰的享用、权利归属和不侵权的任何保证，以及因交易习惯或惯例而产生的任何保证。',
          '我们不保证 Pebble 能满足你的需求、其中的数字准确无误，也不保证它没有错误、缺陷、病毒或未经授权的访问。',
        ],
      },
      {
        heading: '责任限制',
        paragraphs: [
          '在适用法律允许的最大范围内，文文有限公司及其所有人、董事、高级职员、员工、承包商、代理人、关联方、许可方和服务商，均不对你或任何通过你主张权利的人承担任何直接、间接、附带、特殊、后果性、惩戒性或惩罚性赔偿责任，也不对数据、利润、储蓄、收入、商誉或机会的任何损失，任何罚款、费用、滞纳金、透支费用或利息，或你基于 Pebble 所做的任何决定或行为承担责任。无论该主张基于合同、侵权（包括过失）、严格责任、法律规定或其他任何理由，即使我们已被告知可能发生此类损失，亦同。',
          '如果尽管有上述约定，根据适用法律仍无法排除责任，则在适用法律允许的最大范围内，我们就所有索赔承担的全部责任，以你在索赔前 12 个月内为使用 Pebble 向我们支付的金额为限（由于 Pebble 免费，该金额为零）；若法律不允许这样约定，则以法律允许的最低金额为限。',
          '即使某项救济未能达到其基本目的，这些限制仍然适用。它们是对一项免费服务的风险所作的公平分配，没有这些限制，我们就不会提供 Pebble。',
        ],
      },
      {
        heading: '风险自担',
        paragraphs: ['你理解，使用任何软件并在其中保存财务记录都存在风险，包括数据丢失、错误、服务中断和未经授权的访问，这些风险没有人能完全避免。在适用法律允许的最大范围内，你在使用 Pebble 时即表示明知并自愿承担这些风险。'],
      },
      {
        heading: '不可控事件与其他人的行为',
        paragraphs: [
          '在适用法律允许的最大范围内，对于因我们合理控制范围之外的原因造成的任何故障或延误，我们不承担责任，例如自然灾害、战争、恐怖活动、罢工、断电或网络故障、政府行为、针对我们系统的攻击，或第三方服务商的故障。',
          '对于其他用户或第三方的作为或不作为，以及我们无法合理避免的、对你账户或数据的未经授权的访问（包括因你的密码或设备被入侵而导致的），我们同样不承担责任。',
        ],
      },
      {
        heading: '因你引起的索赔由你承担（赔偿）',
        paragraphs: ['在适用法律允许的最大范围内，对于因你的内容、你对 Pebble 的使用、你违反本条款，或你违反任何法律或侵犯他人权利而引起的任何索赔、损失、责任、损害、成本或费用（包括合理的律师费），你同意为文文有限公司及其所有人、董事、高级职员、员工、承包商、关联方、许可方和服务商进行抗辩、予以赔偿并使其免受损害。'],
      },
      {
        heading: '责任免除',
        paragraphs: ['在适用法律允许的最大范围内，对于因你使用 Pebble 而产生或与之相关的一切已知或未知的索赔、请求和损害，你免除文文有限公司以及“责任限制”一节中列明的个人和公司的责任，但本条款中明确说明不能限制的事项除外。如果你所在地区限制此类免责（例如不允许免除你并不知晓的索赔），则本免责仅在该地区法律允许的范围内适用。'],
      },
      {
        heading: '终止使用与暂停',
        paragraphs: [
          '你可以随时停止使用 Pebble，也可以在“设置”中删除账户。删除账户后，你的记录将按隐私声明所述被移除。',
          '我们可以随时以任何理由暂停、限制或终止你的访问，或删除内容，包括我们认为你违反了本条款、让 Pebble 或他人面临风险，或者我们终止或更改 Pebble 的情况。在可行时我们会尽量提前通知，但这并非我们的义务。',
          '访问终止后，你使用 Pebble 的权利随之终止。依其性质应继续有效的条款，包括关于你的内容、免责声明、责任、赔偿、责任免除和争议解决的条款，在此之后继续有效。',
        ],
      },
      {
        heading: 'Pebble 与本条款的变更',
        paragraphs: [
          '我们可以随时更改、增加或删除 Pebble 的功能。',
          '我们可能会更新本条款。更新时，我们会修改上方的日期；若有重大变化，我们会在应用内通知你。变更生效后你继续使用 Pebble，即表示你接受更新后的条款。如果你不同意，请停止使用 Pebble 并删除账户。',
        ],
      },
      {
        heading: '争议解决',
        paragraphs: [
          '先与我们沟通。如果你遇到问题，请联系文文有限公司（见“联系方式”），给我们一个解决问题的机会。大多数问题都可以通过友好协商解决；在启动任何正式程序之前，双方都会本着诚信原则至少协商 30 天。',
          '适用法律。本条款适用文文有限公司注册成立地的法律，不考虑其法律冲突规则。',
          '具有约束力的个人仲裁。在适用法律允许的最大范围内，如果争议未能通过协商解决，你与文文有限公司同意仅通过以个人名义进行的、终局且有约束力的仲裁来解决，而不是向法院起诉；但任何一方在符合条件时可以向小额法庭提起个人诉讼，任何一方也可以请求法院制止对知识产权的滥用。',
          '放弃集体诉讼和陪审团审判。在适用法律允许的最大范围内，你与文文有限公司各自放弃陪审团审判的权利，也放弃参与集体、联合、合并或代表人诉讼的权利。索赔只能以个人名义提出。',
          '如果本节的任何部分在你所在地无法执行，则该部分对你不适用，其余部分仍然有效。',
        ],
      },
      {
        heading: '不能被限制的权利',
        paragraphs: ['本条款不限制或排除任何依法不能被限制或排除的权利或责任，例如因欺诈或欺诈性不实陈述、因过失造成的死亡或人身伤害（在适用时）所产生的责任，或你居住地法律赋予你且不允许放弃的任何消费者权利。在这种情况下，本条款仅在法律允许的范围内适用。'],
      },
      {
        heading: '一般条款',
        bullets: [
          '可分割性：如果本条款的任何部分被认定为无效或不可执行，则仅在使其可执行所需的最小范围内进行修改，其余部分仍然有效。',
          '不构成弃权：我们没有立即行使某项权利，不代表放弃该权利。',
          '转让：你不得转让本条款或你的账户。我们可以转让本条款，例如在 Pebble 或我们公司被出售或重组时。',
          '完整协议：本条款与隐私声明构成你与我们之间就 Pebble 达成的完整协议，并取代此前就此所作的任何说明或约定。',
          '语言：为方便你，我们可能提供多种语言的本条款。如果译文与英文版本不一致，以英文版本为准。',
          '无第三方权利：除责任相关条款中列明、可依据这些条款主张的个人和公司外，其他任何人均不享有本条款下的权利。',
        ],
      },
      {
        heading: '联系方式',
        paragraphs: ['对本条款有疑问？请联系文文有限公司。如果你没有直接联系我们的方式，可以请邀请你使用 Pebble 的人代为转达。'],
      },
    ],
    back: '← 返回登录',
    backSignedIn: '← 返回 Pebble',
    privacyLink: '查看隐私声明',
  },
};
