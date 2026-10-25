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
  /** The same link for someone who is already signed in. */
  backSignedIn: string;
  /** Link text to the Terms of Use. */
  termsLink: string;
}

export const PRIVACY_NOTICE: Record<'en' | 'zh', PrivacyNotice> = {
  en: {
    title: 'Privacy Notice',
    updated: 'Last updated: October 25, 2026',
    intro: 'Pebble is a personal budgeting app run by Wen Wen Inc., available by invitation only. This notice explains what information Pebble collects, why it is collected, who helps process it, and the choices you have. By creating an account, you agree to this notice and to our Terms of Use.',
    sections: [
      {
        heading: 'Who runs Pebble',
        paragraphs: ['Pebble is run by Wen Wen Inc., the company behind it. Pebble is not a bank, a financial institution, or a financial adviser. It does not move money and does not connect to your bank accounts.'],
      },
      {
        heading: 'Information you give us',
        bullets: [
          'Account details: your name, email address, and password. Your password is stored only as a secure one-way hash by our sign-in provider, so nobody can read it.',
          'Financial records you choose to enter: transactions, transfers, balance adjustments, accounts (a name and, for bank accounts, the last 4 digits of the account number), budgets, goals, categories, and scheduled payments.',
        ],
        paragraphs: ['Pebble never asks for your bank login, your full account or card numbers, or any government ID number. Please do not type them into any field.'],
      },
      {
        heading: 'Information collected automatically',
        bullets: [
          'Sign-in and security details: your IP address, your browser and device type, the approximate city, region, and country linked to your IP address when you sign in, and when each session started and was last active. You can see these under Settings → Security.',
          'Cookies: essential cookies keep you signed in and remember your language and time zone. Pebble does not use advertising or third-party tracking cookies.',
        ],
      },
      {
        heading: 'Information kept on your device',
        bullets: [
          'Preferences such as language, theme, text size, and filters are saved in your browser, separately for each person who signs in on that device.',
          'To let Pebble open without a connection, your device keeps saved copies of the pages you have visited. These copies include your balances and transactions. It also keeps the list of categories you use most, so Add transaction can suggest them.',
          'Transactions you add while offline wait on your device until you upload them. They stay there if you sign out, so you do not lose them, unless you choose to discard them.',
        ],
        paragraphs: ['Saved page copies are deleted from your device when you sign out. Anyone who can unlock your device can see what is stored on it, so please protect it with a passcode.'],
      },
      {
        heading: 'How we use information',
        bullets: [
          'To run Pebble: store your records and show your balances, reports, and charts.',
          'To keep your account secure: verify your email, reset passwords, and show where and on which devices you are signed in.',
          'To send account emails, such as verification and password reset codes.',
          'To find and fix problems.',
        ],
        paragraphs: ['Pebble does not sell your information, does not show ads, and does not use your information for advertising or profiling.'],
      },
      {
        heading: 'Who helps process your information',
        bullets: [
          'Neon: database hosting and sign-in services, including sending verification and password reset emails.',
          'Vercel: application hosting. It also provides the approximate location linked to your IP address.',
        ],
        paragraphs: [
          'These providers process information on Pebble\'s behalf under their own terms and security practices, and may store it in the United States or other countries.',
          'We may also share information if the law requires it, or when it is necessary to protect the rights and safety of Pebble\'s users.',
        ],
      },
      {
        heading: 'Information you enter is your choice',
        paragraphs: [
          'Everything you enter into Pebble is entered voluntarily, and you decide what to enter. Nothing requires you to enter any particular information, and you are solely responsible for the accuracy, legality, and appropriateness of what you enter. Please do not enter anything you would not want stored in a personal record-keeping app.',
          'Pebble is provided "as is", without warranties of any kind. To the maximum extent permitted by law, Wen Wen Inc. and Pebble (and their owners, officers, employees, contractors, and providers) accept no liability at any time for any loss, damage, or consequence connected with information you enter or with your use of Pebble, including inaccurate figures, lost, delayed, or unavailable data, or decisions you make based on what Pebble shows. Pebble is not financial, tax, or legal advice.',
          'Nothing here limits any right or liability that the law does not allow to be limited.',
        ],
      },
      {
        heading: 'Terms of Use',
        paragraphs: ['Your use of Pebble is also governed by our Terms of Use, which you agree to when you create an account, together with this notice. The Terms of Use cover your responsibilities, disclaimers, limits on our liability, and how disputes are resolved. You can read them using the link at the bottom of this page.'],
      },
      {
        heading: 'Security',
        paragraphs: ['Your information travels over encrypted connections, passwords are hashed, and each person can reach only their own records. No system is perfectly secure, and we cannot guarantee that your information will never be accessed, lost, or disclosed without authorisation. To the maximum extent permitted by law, Wen Wen Inc. does not promise otherwise, and is not responsible for unauthorised access, loss, or disclosure beyond what the law requires of us. Please use a strong password that you do not use elsewhere, and sign out of devices you no longer use.'],
      },
      {
        heading: 'How long we keep it',
        paragraphs: ['We keep your information for as long as your account exists. When you delete your Pebble account in Settings, your account and all of its records are removed from Pebble\'s database right away. Our providers may keep backup copies for a limited time under their own retention policies. Location details for finished sessions are removed the next time you sign in.'],
      },
      {
        heading: 'Your choices and rights',
        paragraphs: [
          'You can view, edit, and delete your records at any time in the app, and you can delete your whole account in Settings.',
          'Depending on where you live, such as certain US states, the European Union, or the United Kingdom, you may also have the right to access, correct, delete, or receive a copy of your information, and to object to or restrict some uses of it. To make a request, contact Wen Wen Inc. using the details below.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: ['Pebble is not meant for anyone under 16, and we do not knowingly collect information from them.'],
      },
      {
        heading: 'Changes to this notice',
        paragraphs: ['If this notice changes, we will update the date above. For significant changes, we will tell you in the app.'],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions or requests about your information? Contact Wen Wen Inc. If you do not have a direct way to reach us, ask the person who invited you to Pebble to pass your message on.'],
      },
    ],
    back: '← Back to sign in',
    backSignedIn: '← Back to Pebble',
    termsLink: 'Read the Terms of Use',
  },
  zh: {
    title: '隐私声明',
    updated: '最后更新：2026年10月25日',
    intro: 'Pebble 是由文文有限公司运营的个人记账应用，仅限受邀用户使用。本声明说明 Pebble 会收集哪些信息、为什么收集、由谁协助处理，以及你有哪些选择。创建账户即表示你同意本声明和我们的使用条款。',
    sections: [
      {
        heading: 'Pebble 由谁运营',
        paragraphs: ['Pebble 由文文有限公司运营。Pebble 不是银行、金融机构或理财顾问，不会转移资金，也不会连接你的银行账户。'],
      },
      {
        heading: '你提供的信息',
        bullets: [
          '账户信息：你的姓名、电子邮箱和密码。密码只会以安全的单向哈希形式保存在我们的登录服务商处，任何人都无法读取。',
          '你自己录入的财务记录：交易、转账、余额调整、账户（名称，以及银行账户号码的后 4 位）、预算、目标、分类和定期付款。',
        ],
        paragraphs: ['Pebble 绝不会要求你提供银行登录信息、完整的账户号或卡号，也不会要求提供任何证件号码。请不要在任何输入框中填写这些内容。'],
      },
      {
        heading: '自动收集的信息',
        bullets: [
          '登录与安全信息：你的 IP 地址、浏览器和设备类型、登录时根据 IP 地址推断的大致城市、地区和国家，以及每次登录会话的开始时间和最近活动时间。你可以在“设置 → 安全”中查看。',
          'Cookie：必要的 Cookie 用于保持登录状态，并记住你的语言和时区。Pebble 不使用广告 Cookie 或第三方追踪 Cookie。',
        ],
      },
      {
        heading: '保存在你设备上的信息',
        bullets: [
          '语言、主题、文字大小和筛选条件等偏好会保存在你的浏览器中，并按在该设备上登录的每位用户分别保存。',
          '为了让 Pebble 在没有网络时也能打开，你的设备会保存你访问过的页面副本，其中包含你的余额和交易。设备还会记住你最常用的分类，以便在“添加交易”中为你推荐。',
          '你在离线时添加的交易会先保存在设备上，等你上传后才会同步。即使你退出登录，这些交易也会保留，以免丢失；除非你选择放弃它们。',
        ],
        paragraphs: ['退出登录时，设备上保存的页面副本会被删除。任何能解锁你设备的人都可以看到设备上保存的内容，请为设备设置锁屏密码。'],
      },
      {
        heading: '我们如何使用信息',
        bullets: [
          '提供 Pebble 服务：保存你的记录，并显示余额、报表和图表。',
          '保护账户安全：验证邮箱、重置密码，并显示你在哪些地点、哪些设备上登录。',
          '发送账户邮件，例如验证码和重置密码的验证码。',
          '发现并解决问题。',
        ],
        paragraphs: ['Pebble 不会出售你的信息，不展示广告，也不会把你的信息用于广告或用户画像。'],
      },
      {
        heading: '谁会协助处理你的信息',
        bullets: [
          'Neon：提供数据库托管和登录服务，包括发送验证码和重置密码邮件。',
          'Vercel：提供应用托管，同时提供与你的 IP 地址相关的大致位置。',
        ],
        paragraphs: [
          '这些服务商按照各自的条款和安全措施，代表 Pebble 处理信息，并可能将信息存储在美国或其他国家。',
          '如果法律要求，或为保护 Pebble 用户的权利和安全所必需，我们也可能披露相关信息。',
        ],
      },
      {
        heading: '你录入的信息由你自主决定',
        paragraphs: [
          '你在 Pebble 中录入的所有信息均出于你的自愿，录入哪些内容由你自己决定。没有任何要求你必须录入特定信息，你须自行对所录入内容的准确性、合法性和适当性负责。请不要录入任何你不希望保存在个人记账应用中的内容。',
          'Pebble 按“现状”提供，不作任何形式的保证。在法律允许的最大范围内，文文有限公司及 Pebble（包括其所有人、高级职员、员工、承包商和服务商）对因你录入的信息或你使用 Pebble 而产生的任何损失、损害或后果，在任何时候均不承担任何责任，包括数字不准确、数据丢失、延迟或无法使用，以及你基于 Pebble 所显示内容作出的决定。Pebble 不构成财务、税务或法律建议。',
          '本节内容不限制任何依法不能被限制的权利或责任。',
        ],
      },
      {
        heading: '使用条款',
        paragraphs: ['你使用 Pebble 还受我们的使用条款约束。创建账户时，你同意使用条款和本声明。使用条款涵盖你的责任、免责声明、我们的责任限制以及争议的解决方式。你可以通过本页底部的链接阅读。'],
      },
      {
        heading: '安全',
        paragraphs: ['你的信息通过加密连接传输，密码经过哈希处理，每个人只能访问自己的记录。没有任何系统是绝对安全的，我们无法保证你的信息绝不会被未经授权地访问、丢失或披露。在法律允许的最大范围内，文文有限公司不作此类保证，对超出法律要求范围的未经授权的访问、丢失或披露不承担责任。请使用强度高、且不与其他服务重复的密码，并及时在不再使用的设备上退出登录。'],
      },
      {
        heading: '保存多久',
        paragraphs: ['只要你的账户存在，我们就会保存你的信息。你在“设置”中删除 Pebble 账户后，你的账户及全部记录会立即从 Pebble 的数据库中删除。服务商可能会按其保留政策，在一段有限的时间内保留备份副本。已结束登录会话的位置信息会在你下次登录时删除。'],
      },
      {
        heading: '你的选择与权利',
        paragraphs: [
          '你可以随时在应用中查看、修改和删除自己的记录，也可以在“设置”中删除整个账户。',
          '根据你所在的地区（例如美国部分州、欧盟或英国），你可能还享有访问、更正、删除或获取个人信息副本的权利，以及反对或限制某些使用方式的权利。如需提出请求，请通过下方联系方式联系文文有限公司。',
        ],
      },
      {
        heading: '未成年人',
        paragraphs: ['Pebble 不面向 16 岁以下的人士，我们也不会在知情的情况下收集他们的信息。'],
      },
      {
        heading: '本声明的更新',
        paragraphs: ['如果本声明有变化，我们会更新上方的日期。若有重大变化，我们会在应用内通知你。'],
      },
      {
        heading: '联系方式',
        paragraphs: ['对你的信息有疑问或请求？请联系文文有限公司。如果你没有直接联系我们的方式，可以请邀请你使用 Pebble 的人代为转达。'],
      },
    ],
    back: '← 返回登录',
    backSignedIn: '← 返回 Pebble',
    termsLink: '查看使用条款',
  },
};
