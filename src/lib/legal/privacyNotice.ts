/**
 * Pebble's Privacy Notice, English and Chinese. Rendered at /auth/privacy and
 * agreed to at sign-up (the /api/auth gate refuses sign-up without it).
 *
 * Written to match what Pebble ACTUALLY does - if a feature changes what is
 * collected or who processes it, update this text and the date. Not reviewed
 * by a lawyer.
 */
export interface NoticeSection {
  heading: string;
  bullets?: string[];
  paragraphs?: string[];
}

export interface PrivacyNotice {
  title: string;
  updated: string;
  intro: string;
  sections: NoticeSection[];
  back: string;
}

export const PRIVACY_NOTICE: Record<'en' | 'zh', PrivacyNotice> = {
  en: {
    title: 'Privacy Notice',
    updated: 'Last updated: September 27, 2026',
    intro: 'Pebble is a personal budgeting app, available by invitation only. This notice explains what information Pebble collects, why, who helps process it, and the choices you have. By creating an account, you agree to this notice.',
    sections: [
      {
        heading: 'Who runs Pebble',
        paragraphs: ['Pebble is run privately by the person who invited you. It is not a bank, a financial institution, or a financial adviser. It does not move money and does not connect to your bank.'],
      },
      {
        heading: 'Information you give us',
        bullets: [
          'Account details: your name, email address, and password. Your password is stored only as a secure one-way hash by our sign-in provider; nobody can read it.',
          'Financial records you choose to enter: transactions, transfers, balance adjustments, accounts (a name and, for bank accounts, the last 4 digits of the account number), budgets, goals, categories, and scheduled payments.',
        ],
        paragraphs: ['Pebble never asks for your bank login, full account or card numbers, or government ID numbers. Please do not enter them in any field.'],
      },
      {
        heading: 'Information collected automatically',
        bullets: [
          'Sign-in and security information: your IP address, browser and device type, the approximate city, region, and country associated with your IP address at sign-in, and when each session started and was last active. You can see this under Settings → Security.',
          'Settings saved on your device: preferences such as language, theme, text size, and filters are stored in your browser, separately for each person who signs in on it.',
          'Cookies: essential cookies keep you signed in and remember your language and time zone. Pebble does not use advertising or third-party tracking cookies.',
        ],
      },
      {
        heading: 'How we use information',
        bullets: [
          'To provide Pebble: storing your records and showing your balances, reports, and charts.',
          'To keep your account secure: verifying your email, resetting passwords, and showing where and on which devices you are signed in.',
          'To send account emails, such as verification and password reset codes.',
          'To find and fix problems.',
        ],
        paragraphs: ['Pebble does not sell your information, does not show ads, and does not use your information for advertising or profiling.'],
      },
      {
        heading: 'Who processes your information',
        bullets: [
          'Neon: database hosting and sign-in services, including sending verification and password reset emails.',
          'Vercel: application hosting. It also provides the approximate location associated with your IP address.',
        ],
        paragraphs: [
          'These providers process information on Pebble\'s behalf under their own terms and security practices, and may store it in the United States or other countries.',
          'We may also disclose information if required by law, or where necessary to protect the rights and safety of Pebble\'s users.',
        ],
      },
      {
        heading: 'Security',
        paragraphs: ['Information travels over encrypted connections, passwords are hashed, and each person can reach only their own records. No system is perfectly secure, so please use a strong, unique password and sign out of devices you no longer use.'],
      },
      {
        heading: 'How long we keep it',
        paragraphs: ['Your information is kept while your account exists. When you delete your Pebble account in Settings, your account and all of its records are deleted from Pebble\'s database immediately. Copies may remain in our providers\' backups for a limited time under their retention policies. Location records for ended sessions are removed the next time you sign in.'],
      },
      {
        heading: 'Your choices and rights',
        paragraphs: [
          'You can view, edit, and delete your records at any time in the app, and you can delete your entire account in Settings.',
          'Depending on where you live, such as certain US states, the European Union, or the United Kingdom, you may have additional rights, including to access, correct, delete, or receive a copy of your information, and to object to or restrict certain processing. To make a request, contact the person who invited you to Pebble.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: ['Pebble is not intended for anyone under 16, and we do not knowingly collect information from them.'],
      },
      {
        heading: 'Changes to this notice',
        paragraphs: ['If this notice changes, the date above will be updated. For significant changes, we will let you know in the app.'],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions or requests about your information? Contact the person who invited you to Pebble.'],
      },
    ],
    back: '← Back to sign in',
  },
  zh: {
    title: '隐私声明',
    updated: '最后更新：2026年9月27日',
    intro: 'Pebble 是一款仅限受邀使用的个人记账应用。本声明说明 Pebble 收集哪些信息、为何收集、由谁协助处理，以及你拥有的选择。创建账户即表示你同意本声明。',
    sections: [
      {
        heading: 'Pebble 的运营者',
        paragraphs: ['Pebble 由邀请你的人私人运营。它不是银行、金融机构或理财顾问，不会转移资金，也不会连接你的银行。'],
      },
      {
        heading: '你提供的信息',
        bullets: [
          '账户信息：你的名字、邮箱地址和密码。密码仅以安全的单向哈希形式由我们的登录服务商保存，任何人都无法读取。',
          '你选择记录的财务数据：交易、转账、余额调整、账户（名称，以及银行账户号码的后 4 位）、预算、目标、分类和定期付款。',
        ],
        paragraphs: ['Pebble 从不要求你提供银行登录信息、完整的账户或卡号，或身份证件号码。请不要在任何字段中填写这些信息。'],
      },
      {
        heading: '自动收集的信息',
        bullets: [
          '登录与安全信息：你的 IP 地址、浏览器和设备类型、登录时根据 IP 地址推断的大致城市、地区和国家，以及每个会话的开始时间和最后活动时间。你可以在“设置 → 安全”中查看。',
          '保存在你设备上的设置：语言、主题、文字大小和筛选条件等偏好保存在你的浏览器中，并按每位在该设备上登录的用户分别保存。',
          'Cookie：必要的 Cookie 用于保持你的登录状态，并记住你的语言和时区。Pebble 不使用广告或第三方追踪 Cookie。',
        ],
      },
      {
        heading: '我们如何使用信息',
        bullets: [
          '提供 Pebble 服务：保存你的记录，显示余额、报表和图表。',
          '保护账户安全：验证邮箱、重置密码，并显示你在哪些地点和设备上登录。',
          '发送账户邮件，例如验证码和密码重置验证码。',
          '发现并修复问题。',
        ],
        paragraphs: ['Pebble 不出售你的信息，不展示广告，也不会将你的信息用于广告或用户画像。'],
      },
      {
        heading: '谁会处理你的信息',
        bullets: [
          'Neon：数据库托管和登录服务，包括发送验证码和密码重置邮件。',
          'Vercel：应用托管，同时提供与你的 IP 地址对应的大致位置。',
        ],
        paragraphs: [
          '这些服务商依据其各自的条款和安全措施代表 Pebble 处理信息，并可能将信息存储在美国或其他国家。',
          '在法律要求时，或为保护 Pebble 用户的权利与安全所必需时，我们也可能披露信息。',
        ],
      },
      {
        heading: '安全',
        paragraphs: ['信息通过加密连接传输，密码经过哈希处理，每个人只能访问自己的记录。没有任何系统是绝对安全的，请使用强度高且独一无二的密码，并退出不再使用的设备。'],
      },
      {
        heading: '保存期限',
        paragraphs: ['你的信息会在账户存在期间保存。当你在“设置”中删除 Pebble 账户时，你的账户及其所有记录会立即从 Pebble 的数据库中删除。根据服务商的保留政策，其备份中可能在有限时间内仍保留副本。已结束会话的位置记录会在你下次登录时删除。'],
      },
      {
        heading: '你的选择与权利',
        paragraphs: [
          '你可以随时在应用中查看、编辑和删除你的记录，也可以在“设置”中删除整个账户。',
          '视你所在地区而定（例如美国部分州、欧盟或英国），你可能享有更多权利，包括访问、更正、删除或获取你的信息副本，以及反对或限制某些处理。如需提出请求，请联系邀请你使用 Pebble 的人。',
        ],
      },
      {
        heading: '儿童',
        paragraphs: ['Pebble 不面向 16 岁以下人士，我们不会在知情的情况下收集其信息。'],
      },
      {
        heading: '本声明的变更',
        paragraphs: ['如本声明有变更，上方日期会随之更新。如有重大变更，我们会在应用内通知你。'],
      },
      {
        heading: '联系方式',
        paragraphs: ['对你的信息有疑问或请求？请联系邀请你使用 Pebble 的人。'],
      },
    ],
    back: '← 返回登录',
  },
};
