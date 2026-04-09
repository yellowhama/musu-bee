export const SITE_POSITIONING = {
  eyebrow: "MULTI-MACHINE AI CONTROL PLANE",
  title: "여러 기기의 AI 작업을 하나의 팀처럼 운영한다.",
  subtitle:
    "MUSU는 2-3대 이상의 머신을 쓰는 개발자와 운영자를 위한 AI control plane이다. 직접 오케스트레이션을 짜지 않고도 한 채팅에서 기기와 작업을 조율한다.",
  audience:
    "For builders running a desktop, laptop, or GPU box who want one place to coordinate AI work.",
};

export const PRIMARY_CTA = {
  label: "Join Waitlist",
  href: "/landing",
};

export const SECONDARY_CTA = {
  label: "See How It Works",
  href: "/#how-it-works",
};

export const HOME_PROOF_CARDS = [
  {
    title: "Chat Control Surface",
    description:
      "Agent channels and chat history provide one place to direct work instead of bouncing between machines.",
  },
  {
    title: "Visible Device Status",
    description:
      "CPU, GPU, and RAM surfaces show which machine is available, busy, or unreachable.",
  },
  {
    title: "Cross-Platform Install Flow",
    description:
      "Windows, Linux, and macOS onboarding commands already exist in the product flow.",
  },
  {
    title: "Access And Pricing Surface",
    description:
      "Waitlist capture, pricing routes, and checkout flow already exist and can be framed honestly as beta access.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your machines",
    description:
      "Install the MUSU port on Windows, Linux, or macOS so each machine can report status and receive work.",
  },
  {
    step: "02",
    title: "Delegate from one chat",
    description:
      "Use one control surface instead of manually hopping across terminals, notes, and machine-specific tools.",
  },
  {
    step: "03",
    title: "Track devices and outcomes",
    description:
      "See device state, route work, and collect the result in one place instead of stitching it back together yourself.",
  },
] as const;

export const DIFFERENTIATION = [
  {
    title: "Not just an AI IDE",
    description:
      "Cursor helps you code inside one editor. MUSU is about coordinating work across your machine topology.",
  },
  {
    title: "Not just a prompt-to-app builder",
    description:
      "Bolt, Lovable, v0, and Replit focus on generation. MUSU focuses on control, delegation, and operating your own setup.",
  },
  {
    title: "Not just workflow automation",
    description:
      "Relay is strong for business workflows. MUSU should frame itself as the builder-facing control plane for multi-machine AI work.",
  },
] as const;

export const TRUST_POINTS = [
  "Early-access beta status is stated explicitly.",
  "Public claims should stay tied to visible routes and working product behavior.",
  "Pricing and access are framed honestly around current availability.",
] as const;

export const EARLY_ACCESS_BENEFITS = [
  "Priority onboarding once access is ready",
  "Input into the product direction for multi-machine workflows",
  "Early visibility into pricing and plan changes",
] as const;

export const ICP_CHIPS = [
  "solo developer with 2-3 machines",
  "technical founder with a GPU box",
  "operator who is tired of DIY orchestration",
] as const;

export const PRICING_TIERS = [
  {
    name: "Pro",
    price: "₩29,000",
    period: "/월",
    audience: "personal workstation + laptop + GPU box",
    devices: "기기 최대 5대",
    bullets: [
      "single-user multi-machine control",
      "priority beta access",
      "pricing path ready for checkout once access is active",
    ],
  },
  {
    name: "Team",
    price: "₩49,000",
    period: "/월",
    audience: "small AI-native team sharing a machine fleet",
    devices: "기기 무제한",
    bullets: [
      "shared machine topology",
      "team-oriented access framing",
      "best fit once multi-user coordination matters",
    ],
  },
] as const;

export const INSTALL_COMMANDS = [
  {
    platform: "Windows",
    label: "Early-access onboarding",
    status: "guided setup",
    detail:
      "Installer delivery is handled during onboarding while the public bootstrap endpoint is still being hardened.",
  },
  {
    platform: "Linux",
    label: "Early-access onboarding",
    status: "guided setup",
    detail:
      "Linux install instructions are issued after access approval so the public site does not point to a bootstrap URL that is not live yet.",
  },
  {
    platform: "macOS",
    label: "Early-access onboarding",
    status: "guided setup",
    detail:
      "macOS follows the same beta flow: confirm access, receive the install package, then connect the machine.",
  },
] as const;

export const FAQ_ITEMS = [
  {
    question: "MUSU는 누구를 위한 제품인가?",
    answer:
      "지금의 primary ICP는 여러 대의 머신을 직접 운영하는 개발자와 기술 운영자다. 일반적인 단일 노트북 사용자보다, 이미 여러 기기를 굴리는 사람이 더 잘 맞는다.",
  },
  {
    question: "여러 대의 기기가 꼭 필요한가?",
    answer:
      "핵심 가치는 여러 머신을 하나의 control plane으로 보는 데 있다. 한 대만으로도 써볼 수 있지만, MUSU의 차별점은 다중 기기 운영에서 더 분명하다.",
  },
  {
    question: "Windows, Linux, macOS를 지원하나?",
    answer:
      "현재 제품의 설치 흐름과 온보딩 카피는 세 플랫폼을 모두 전제로 구성돼 있다.",
  },
  {
    question: "지금 바로 결제해서 쓸 수 있나?",
    answer:
      "현재 public site는 early-access와 waitlist를 중심으로 안내하는 것이 정직하다. pricing surface는 존재하지만 접근 상태와 billing readiness는 beta framing과 함께 설명되어야 한다.",
  },
  {
    question: "MUSU는 보안/프라이버시를 강하게 약속하나?",
    answer:
      "강한 security/privacy claim은 명시적 증빙이 더 생길 때까지 제한적으로 말해야 한다. 현재는 honest beta and product-truth framing이 우선이다.",
  },
] as const;
