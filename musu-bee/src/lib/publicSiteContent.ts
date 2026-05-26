export const SITE_POSITIONING = {
  eyebrow: "MULTI-MACHINE AI CONTROL PLANE",
  title: "Run AI work across your machines like one coordinated team.",
  subtitle:
    "MUSU is an AI control plane for developers and operators running two or more machines. Coordinate devices and work from one conversation instead of building your own orchestration layer.",
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
    period: "/mo",
    audience: "personal workstation + laptop + GPU box",
    devices: "up to 5 devices",
    bullets: [
      "single-user multi-machine control",
      "priority beta access",
      "pricing path ready for checkout once access is active",
    ],
  },
  {
    name: "Team",
    price: "₩49,000",
    period: "/mo",
    audience: "small AI-native team sharing a machine fleet",
    devices: "unlimited devices",
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
    label: "1-Liner (PowerShell)",
    status: "live",
    detail:
      "iwr https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.ps1 -useb | iex",
  },
  {
    platform: "Linux / macOS",
    label: "1-Liner (Bash)",
    status: "live",
    detail:
      "curl -sSf https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.sh | bash",
  },
] as const;

export const FAQ_ITEMS = [
  {
    question: "Who is MUSU for?",
    answer:
      "The current primary ICP is developers and technical operators who already run multiple machines. MUSU fits people managing a desktop, laptop, or GPU box better than a casual single-laptop user.",
  },
  {
    question: "Do I need multiple machines?",
    answer:
      "The core value comes from treating multiple machines as one control plane. You can try MUSU with a single machine, but the differentiation becomes much clearer once you are coordinating more than one.",
  },
  {
    question: "Does MUSU support Windows, Linux, and macOS?",
    answer:
      "The current install flow and onboarding shape are designed around all three platforms.",
  },
  {
    question: "Can I pay and use it right now?",
    answer:
      "The honest public path right now is early access and waitlist-first. Pricing exists, but access state and billing readiness still need beta framing.",
  },
  {
    question: "Does MUSU make strong security or privacy claims yet?",
    answer:
      "Strong security and privacy claims should stay limited until explicit proof exists. Honest beta framing and product-truth messaging come first.",
  },
] as const;
