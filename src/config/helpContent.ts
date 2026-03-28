/** i18n key paths — strings under `help.*` in locale `help` modules (en/my). */

export const HELP_GUIDE_SLUGS = [
  'auth',
  'reporting',
  'mapModes',
  'stationRegister',
  'stationClaim',
  'stationPayment',
  'b2bAccess',
  'earnReferral',
] as const

export type HelpGuideSlug = (typeof HELP_GUIDE_SLUGS)[number]

export function isHelpGuideSlug(s: string): s is HelpGuideSlug {
  return (HELP_GUIDE_SLUGS as readonly string[]).includes(s)
}

export const FAQ_SECTIONS: {
  sectionId: string
  titleKey: string
  items: { anchorId: string; qKey: string; aKey: string }[]
}[] = [
  {
    sectionId: 'account',
    titleKey: 'help.faqGroups.accountTitle',
    items: [
      { anchorId: 'faq-account-signup', qKey: 'help.faq.account.q1', aKey: 'help.faq.account.a1' },
      { anchorId: 'faq-account-signin', qKey: 'help.faq.account.q2', aKey: 'help.faq.account.a2' },
      { anchorId: 'faq-account-reset', qKey: 'help.faq.account.q3', aKey: 'help.faq.account.a3' },
      { anchorId: 'faq-account-confirm', qKey: 'help.faq.account.q4', aKey: 'help.faq.account.a4' },
    ],
  },
  {
    sectionId: 'modes',
    titleKey: 'help.faqGroups.modesTitle',
    items: [
      { anchorId: 'faq-modes-what', qKey: 'help.faq.modes.q1', aKey: 'help.faq.modes.a1' },
      { anchorId: 'faq-modes-switch', qKey: 'help.faq.modes.q2', aKey: 'help.faq.modes.a2' },
      { anchorId: 'faq-modes-wrong', qKey: 'help.faq.modes.q3', aKey: 'help.faq.modes.a3' },
    ],
  },
  {
    sectionId: 'reporting',
    titleKey: 'help.faqGroups.reportingTitle',
    items: [
      { anchorId: 'faq-report-who', qKey: 'help.faq.reporting.q1', aKey: 'help.faq.reporting.a1' },
      { anchorId: 'faq-report-howoften', qKey: 'help.faq.reporting.q2', aKey: 'help.faq.reporting.a2' },
      { anchorId: 'faq-report-missing', qKey: 'help.faq.reporting.q3', aKey: 'help.faq.reporting.a3' },
    ],
  },
  {
    sectionId: 'station',
    titleKey: 'help.faqGroups.stationTitle',
    items: [
      { anchorId: 'faq-station-owner', qKey: 'help.faq.station.q1', aKey: 'help.faq.station.a1' },
      { anchorId: 'faq-station-register', qKey: 'help.faq.station.q2', aKey: 'help.faq.station.a2' },
      { anchorId: 'faq-station-claim', qKey: 'help.faq.station.q3', aKey: 'help.faq.station.a3' },
      { anchorId: 'faq-station-pay', qKey: 'help.faq.station.q4', aKey: 'help.faq.station.a4' },
    ],
  },
  {
    sectionId: 'b2b',
    titleKey: 'help.faqGroups.b2bTitle',
    items: [
      { anchorId: 'faq-b2b-what', qKey: 'help.faq.b2b.q1', aKey: 'help.faq.b2b.a1' },
      { anchorId: 'faq-b2b-pending', qKey: 'help.faq.b2b.q2', aKey: 'help.faq.b2b.a2' },
      { anchorId: 'faq-b2b-national', qKey: 'help.faq.b2b.q3', aKey: 'help.faq.b2b.a3' },
    ],
  },
  {
    sectionId: 'earn',
    titleKey: 'help.faqGroups.earnTitle',
    items: [
      { anchorId: 'faq-earn-code', qKey: 'help.faq.earn.q1', aKey: 'help.faq.earn.a1' },
      { anchorId: 'faq-earn-station', qKey: 'help.faq.earn.q2', aKey: 'help.faq.earn.a2' },
    ],
  },
]

export type GuideConfig = {
  slug: HelpGuideSlug
  anchorId: string
  titleKey: string
  prereqKey: string
  stepKeys: string[]
  troubleshootKeys: string[]
  relatedBenefitsPath?: '/benefits/station-owners' | '/benefits/fleet-owners'
  relatedBenefitsLabelKey?: string
  dryReportHelp?: boolean
}

export const GUIDE_CONFIG: GuideConfig[] = [
  {
    slug: 'auth',
    anchorId: 'guide-auth',
    titleKey: 'help.guides.auth.title',
    prereqKey: 'help.guides.auth.prereq',
    stepKeys: [
      'help.guides.auth.s1',
      'help.guides.auth.s2',
      'help.guides.auth.s3',
      'help.guides.auth.s4',
      'help.guides.auth.s5',
    ],
    troubleshootKeys: ['help.guides.auth.t1', 'help.guides.auth.t2'],
  },
  {
    slug: 'reporting',
    anchorId: 'guide-reporting',
    titleKey: 'help.guides.reporting.title',
    prereqKey: 'help.guides.reporting.prereq',
    stepKeys: [],
    troubleshootKeys: ['help.guides.reporting.t1'],
    dryReportHelp: true,
  },
  {
    slug: 'mapModes',
    anchorId: 'guide-mapModes',
    titleKey: 'help.guides.mapModes.title',
    prereqKey: 'help.guides.mapModes.prereq',
    stepKeys: [
      'help.guides.mapModes.s1',
      'help.guides.mapModes.s2',
      'help.guides.mapModes.s3',
      'help.guides.mapModes.s4',
      'help.guides.mapModes.s5',
    ],
    troubleshootKeys: ['help.guides.mapModes.t1'],
    relatedBenefitsPath: '/benefits/fleet-owners',
    relatedBenefitsLabelKey: 'help.guides.mapModes.relatedFleet',
  },
  {
    slug: 'stationRegister',
    anchorId: 'guide-stationRegister',
    titleKey: 'help.guides.stationRegister.title',
    prereqKey: 'help.guides.stationRegister.prereq',
    stepKeys: [
      'help.guides.stationRegister.s1',
      'help.guides.stationRegister.s2',
      'help.guides.stationRegister.s3',
      'help.guides.stationRegister.s4',
      'help.guides.stationRegister.s5',
    ],
    troubleshootKeys: ['help.guides.stationRegister.t1'],
    relatedBenefitsPath: '/benefits/station-owners',
    relatedBenefitsLabelKey: 'help.guides.stationRegister.related',
  },
  {
    slug: 'stationClaim',
    anchorId: 'guide-stationClaim',
    titleKey: 'help.guides.stationClaim.title',
    prereqKey: 'help.guides.stationClaim.prereq',
    stepKeys: [
      'help.guides.stationClaim.s1',
      'help.guides.stationClaim.s2',
      'help.guides.stationClaim.s3',
      'help.guides.stationClaim.s4',
    ],
    troubleshootKeys: ['help.guides.stationClaim.t1'],
    relatedBenefitsPath: '/benefits/station-owners',
    relatedBenefitsLabelKey: 'help.guides.stationClaim.related',
  },
  {
    slug: 'stationPayment',
    anchorId: 'guide-stationPayment',
    titleKey: 'help.guides.stationPayment.title',
    prereqKey: 'help.guides.stationPayment.prereq',
    stepKeys: [
      'help.guides.stationPayment.s1',
      'help.guides.stationPayment.s2',
      'help.guides.stationPayment.s3',
      'help.guides.stationPayment.s4',
      'help.guides.stationPayment.s5',
    ],
    troubleshootKeys: ['help.guides.stationPayment.t1', 'help.guides.stationPayment.t2'],
    relatedBenefitsPath: '/benefits/station-owners',
    relatedBenefitsLabelKey: 'help.guides.stationPayment.related',
  },
  {
    slug: 'b2bAccess',
    anchorId: 'guide-b2bAccess',
    titleKey: 'help.guides.b2bAccess.title',
    prereqKey: 'help.guides.b2bAccess.prereq',
    stepKeys: [
      'help.guides.b2bAccess.s1',
      'help.guides.b2bAccess.s2',
      'help.guides.b2bAccess.s3',
      'help.guides.b2bAccess.s4',
    ],
    troubleshootKeys: ['help.guides.b2bAccess.t1'],
    relatedBenefitsPath: '/benefits/fleet-owners',
    relatedBenefitsLabelKey: 'help.guides.b2bAccess.related',
  },
  {
    slug: 'earnReferral',
    anchorId: 'guide-earnReferral',
    titleKey: 'help.guides.earnReferral.title',
    prereqKey: 'help.guides.earnReferral.prereq',
    stepKeys: [
      'help.guides.earnReferral.s1',
      'help.guides.earnReferral.s2',
      'help.guides.earnReferral.s3',
      'help.guides.earnReferral.s4',
    ],
    troubleshootKeys: ['help.guides.earnReferral.t1'],
  },
]
