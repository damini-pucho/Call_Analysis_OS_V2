// The product catalogue shared by the app, the seed and the tests: permission codes, the three default roles every
// new organisation gets, and the industry templates a company profile starts from. Plain ESM so node scripts import it too.

// ── permissions (V1's matrix, now stored per organisation in the database, plus the V2 modules) ─────────────────────
export const PERMISSION_GROUPS = [
  { category: 'Dashboard', items: [['dashboard.view', 'View overview']] },
  { category: 'Calls', items: [
    ['calls.view', 'View calls'], ['calls.export', 'Export calls (CSV)'], ['calls.edit', 'Edit call agent name'],
    ['upload.analyze', 'Upload & analyse calls'],
  ] },
  { category: 'Analytics', items: [
    ['analytics.view', 'View analytics'], ['classification.view', 'View call classification'],
    ['inbound_outbound.view', 'View inbound / outbound'], ['compliance.view', 'View compliance'],
  ] },
  { category: 'Coaching & tags', items: [
    ['coaching.view', 'View coaching notes'], ['coaching.create', 'Add coaching notes'],
    ['tags.view', 'View tags'], ['tags.create', 'Add & remove tags'],
  ] },
  { category: 'Agents & training', items: [
    ['agents.view', 'View agents'], ['agents.edit', 'Rename / edit agents'],
    ['training.view', 'View training'], ['training.assign', 'Assign training'], ['training.manage', 'Manage training modules'],
  ] },
  { category: 'Customers', items: [
    ['customer_analysis.view', 'View sentiment analysis'], ['customers.view', 'View customer profiles'], ['customers.edit', 'Edit customer profiles'],
  ] },
  { category: 'Company profile', items: [
    ['company.view', 'View company profile'], ['company.edit', 'Edit company profile & industry config'],
    ['documents.upload', 'Upload SOPs & policies'],
  ] },
  { category: 'CRM', items: [['crm.view', 'View CRM integration'], ['crm.manage', 'Manage CRM connections & imports']] },
  { category: 'Users', items: [
    ['users.view', 'View users'], ['users.create', 'Create users'], ['users.edit', 'Edit users'], ['users.delete', 'Deactivate users'],
  ] },
  { category: 'Groups', items: [
    ['groups.view', 'View groups'], ['groups.create', 'Create groups'], ['groups.edit', 'Edit groups'], ['groups.delete', 'Delete groups'],
  ] },
  { category: 'Campaigns', items: [
    ['campaigns.view', 'View campaigns'], ['campaigns.create', 'Create campaigns'], ['campaigns.edit', 'Edit campaigns'], ['campaigns.delete', 'Delete campaigns'],
  ] },
  { category: 'Roles', items: [
    ['roles.view', 'View roles'], ['roles.create', 'Create roles'], ['roles.edit', 'Edit roles'], ['roles.delete', 'Delete roles'],
    ['permissions.assign', 'Assign permissions'],
  ] },
  { category: 'Settings', items: [['settings.manage', 'Manage organisation settings']] },
];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([code]) => code));

const TL_PERMS = [
  'dashboard.view', 'calls.view', 'calls.export', 'calls.edit', 'analytics.view', 'classification.view', 'inbound_outbound.view',
  'compliance.view', 'coaching.view', 'coaching.create', 'tags.view', 'tags.create', 'agents.view', 'agents.edit',
  'training.view', 'training.assign', 'customer_analysis.view', 'customers.view', 'company.view', 'crm.view',
  'users.view', 'users.create', 'users.edit', 'users.delete', 'groups.view', 'campaigns.view',
];
const EXEC_PERMS = [
  'dashboard.view', 'calls.view', 'analytics.view', 'classification.view', 'inbound_outbound.view', 'compliance.view',
  'coaching.view', 'tags.view', 'agents.view', 'training.view', 'customer_analysis.view', 'customers.view', 'company.view',
];

// scope: all = the whole organisation · team = agents who report to the user (or whose group the user leads) · own = the user's agent code
export const DEFAULT_ROLES = [
  { key: 'admin', name: 'Admin', scope: 'all', description: 'Runs the organisation: users, roles, company profile, CRM and every call.', permissions: ALL_PERMISSIONS },
  { key: 'team_leader', name: 'Team Leader', scope: 'team', description: 'Coaches a team: sees their agents’ calls, assigns training, adds notes.', permissions: TL_PERMS },
  { key: 'executive', name: 'Executive / Agent', scope: 'own', description: 'Sees their own calls, scores, coaching notes and training.', permissions: EXEC_PERMS },
];

// ── the 15 KPIs and 7 SOPs the call flow scores (V1 definitions, generic to any contact centre) ──────────────────────
export const KPI_DEFS = [
  { id: 1, name: 'Call Resolution', key: 'kpi1_call_resolution', scale: 'Yes | No | Partial | NA', desc: 'Was the query fully resolved?' },
  { id: 2, name: 'First Call Resolution', key: 'kpi2_fcr', scale: 'Yes | No | Unknown | NA', desc: 'Resolved without follow-up or escalation.' },
  { id: 3, name: 'AHT Efficiency', key: 'kpi3_aht_efficiency', scale: 'Efficient | Acceptable | Inefficient', desc: 'Handled within the AHT target.' },
  { id: 4, name: 'Call Abandonment', key: 'kpi4_call_abandonment', scale: 'Yes | No', desc: 'Agent deliberately ended the call to avoid a query. Line drops are No.' },
  { id: 5, name: 'CSAT Indicator', key: 'kpi5_csat_indicator', scale: 'High | Medium | Low | NA', desc: 'Estimated from tone, language and outcome.' },
  { id: 6, name: 'Call Quality Score', key: 'kpi6_call_quality_score', scale: '1 – 5', desc: 'Applicable SOPs followed, resolution and professionalism.' },
  { id: 7, name: 'Hold Compliance', key: 'kpi7_hold_compliance', scale: 'Compliant | Non-Compliant | NA', desc: 'Hold permission and refresh done correctly.' },
  { id: 8, name: 'IVR Transfer', key: 'kpi8_transfer_to_ivr', scale: 'Yes | No | Customer Refused | NA', desc: 'Transferred to the feedback IVR.' },
  { id: 9, name: 'Process Adherence', key: 'kpi9_process_adherence', scale: 'Full | Partial | None', desc: 'All process steps followed.' },
  { id: 10, name: 'Escalation', key: 'kpi10_escalated', scale: 'Yes | No | NA', desc: 'Escalated to a senior or another department.' },
  { id: 11, name: 'Call Intent', key: 'kpi11_intent', scale: 'taxonomy label', desc: 'Exactly one label from the organisation’s intent taxonomy.' },
  { id: 12, name: 'Service Level', key: 'kpi12_service_level', scale: 'Requires telephony data', desc: 'Needs telephony data.' },
  { id: 13, name: 'Repeat Call Signal', key: 'kpi13_repeat_call', scale: 'computed from customer history', desc: 'Same caller called again within 7 days (computed by the app).' },
  { id: 14, name: 'Query Raised', key: 'kpi14_query_raised', scale: 'Yes | No | NA', desc: 'A support ticket was raised.' },
  { id: 15, name: 'Customer & Agent Sentiment', key: 'kpi15_sentiment', scale: 'Positive/Neutral/Negative · Professional/Neutral/Unprofessional', desc: 'Tone of both customer and agent.' },
];

export const SOP_DEFS = [
  { code: 'SOP1', title: 'Professional Greeting', description: 'Opening has a salutation, self-identification, brand reference or service offer. A bare "hello" is not a greeting.', na_rule: 'Never NA.' },
  { code: 'SOP2', title: 'Caller Identified', description: 'Inbound: identity established explicitly or by context. Outbound: agent confirms the right person.', na_rule: 'Partner / verified lines are marked Yes automatically.' },
  { code: 'SOP3', title: 'Hold Permission', description: 'Agent asks before a hold likely over one minute.', na_rule: 'NA when there was no hold.' },
  { code: 'SOP4', title: 'Hold Refresh', description: 'Agent updates the customer during a hold over one minute.', na_rule: 'NA when the hold was under a minute or there was none.' },
  { code: 'SOP5', title: 'Closing Script', description: 'Agent asks "anything else?" (or a natural equivalent) before ending.', na_rule: 'NA when the closing phase was unreachable.' },
  { code: 'SOP6', title: 'Feedback IVR', description: 'Agent offers the feedback IVR transfer.', na_rule: 'NA when SOP 5 is NA.' },
  { code: 'SOP7', title: 'No Behaviour Issue', description: 'Professional throughout: no rudeness, no deliberate disconnect.', na_rule: 'Never NA.' },
];

const ZTP_DEFAULT = [
  'Incorrect or misleading advice (false guarantees, misselling)',
  'Sharing customer personal data with a third party',
  'Abusive, threatening or discriminatory language',
  'Deliberately ending the call to avoid a query (line drops never count)',
  'Soliciting money outside the official channel',
];

// ── industry templates ───────────────────────────────────────────────────────────────────────────────────────────
export const INDUSTRIES = {
  bfsi: {
    label: 'Banking, financial services & insurance',
    campaigns: [
      { name: 'SUPPORT', full_name: 'Customer support line', direction: 'Inbound', core_topics: ['SIP', 'KYC', 'Redemption', 'Mandate', 'eMandate', 'Portfolio', 'Login/OTP', 'Account Management'] },
      { name: 'PARTNER', full_name: 'Partner / dealer desk', direction: 'Inbound', core_topics: ['ARN', 'Account Management', 'Portfolio'] },
      { name: 'BROKING', full_name: 'Stock broking desk', direction: 'Inbound', core_topics: ['Stock Broking', 'Account Management', 'Login/OTP'] },
      { name: 'RENEWALS', full_name: 'Renewals & follow-ups', direction: 'Outbound', core_topics: ['SIP Review', 'Mandate Follow-up', 'Missed Payment', 'KYC Completion'] },
      { name: 'ADVISORY', full_name: 'Advisory outreach', direction: 'Outbound', core_topics: ['Virtual RM Advisory', 'Upsell/Cross-sell', 'Lead Follow-up'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'SIP Start', 'SIP Stop', 'SIP Modify', 'Redemption', 'Purchase', 'KYC Initiation', 'KYC Update', 'eMandate Setup', 'eMandate Issue', 'Login/OTP Issue', 'ARN Transfer', 'Portfolio Review', 'Loan Query', 'Stock Broking Query', 'Account Management', 'General Information', 'Callback Request'],
    outbound_intents: ['SIP Review', 'Mandate Follow-up', 'Missed Payment', 'ARN Renewal', 'KYC Completion', 'Lapsed SIP', 'Campaign Outreach', 'Virtual RM Advisory', 'Lead Follow-up', 'Upsell/Cross-sell'],
    compliance: [
      { title: 'Guaranteed returns misselling', description: 'Promising guaranteed or assured returns on market-linked products is a ZTP event.', severity: 'critical' },
      { title: 'Investment risk disclaimer', description: 'When advising on market-linked products the agent states that investments are subject to market risk.', severity: 'high' },
      { title: 'Financial identity & PII privacy', description: 'PAN, Aadhaar, account numbers and OTPs are never read back in full or shared.', severity: 'high' },
      { title: 'SIP blackout advisory', description: 'Agent advises the 7-day processing window when a SIP is started or changed.', severity: 'normal' },
      { title: 'eMandate & bank registration', description: 'Agent explains mandate registration timelines and bank approval.', severity: 'normal' },
      { title: 'Redemption & NAV cut-off accuracy', description: 'Cut-off times and NAV applicability are stated correctly.', severity: 'high' },
    ],
    aht_target_min: 5,
  },
  healthcare: {
    label: 'Healthcare & clinics',
    campaigns: [
      { name: 'APPOINTMENTS', full_name: 'Appointment desk', direction: 'Inbound', core_topics: ['Appointment Booking', 'Reschedule', 'Doctor Availability'] },
      { name: 'REPORTS', full_name: 'Lab reports & billing', direction: 'Inbound', core_topics: ['Lab Report', 'Billing', 'Insurance Claim'] },
      { name: 'FOLLOWUP', full_name: 'Patient follow-up', direction: 'Outbound', core_topics: ['Post-visit Follow-up', 'Medication Reminder'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'Appointment Booking', 'Reschedule', 'Cancellation', 'Doctor Availability', 'Lab Report', 'Billing', 'Insurance Claim', 'Emergency Guidance', 'General Information', 'Callback Request'],
    outbound_intents: ['Post-visit Follow-up', 'Medication Reminder', 'Appointment Reminder', 'Health Package Outreach', 'Feedback Call'],
    compliance: [
      { title: 'Patient data confidentiality', description: 'Medical details are shared only after identity verification.', severity: 'critical' },
      { title: 'No clinical advice by phone', description: 'Agents do not diagnose or prescribe; they route to a clinician.', severity: 'high' },
    ],
    aht_target_min: 4,
  },
  ecommerce: {
    label: 'E-commerce & retail',
    campaigns: [
      { name: 'SUPPORT', full_name: 'Order support', direction: 'Inbound', core_topics: ['Order Status', 'Return', 'Refund', 'Delivery'] },
      { name: 'SALES', full_name: 'Sales & offers', direction: 'Outbound', core_topics: ['Cart Recovery', 'Upsell/Cross-sell'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'Order Status', 'Delivery Delay', 'Return Request', 'Refund Status', 'Exchange', 'Payment Issue', 'Product Information', 'Account Management', 'Callback Request'],
    outbound_intents: ['Cart Recovery', 'Order Confirmation', 'COD Verification', 'Upsell/Cross-sell', 'Feedback Call'],
    compliance: [
      { title: 'Payment data handling', description: 'Card numbers, CVV and OTPs are never asked for or repeated.', severity: 'critical' },
      { title: 'Refund timeline accuracy', description: 'Refund timelines are stated as per policy.', severity: 'normal' },
    ],
    aht_target_min: 4,
  },
  telecom: {
    label: 'Telecom & utilities',
    campaigns: [
      { name: 'CARE', full_name: 'Customer care', direction: 'Inbound', core_topics: ['Billing', 'Network Issue', 'Plan Change'] },
      { name: 'RETENTION', full_name: 'Retention desk', direction: 'Outbound', core_topics: ['Churn Save', 'Plan Upgrade'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'Billing Dispute', 'Network Issue', 'Plan Change', 'New Connection', 'Port Out', 'Recharge Issue', 'Account Management', 'Callback Request'],
    outbound_intents: ['Churn Save', 'Plan Upgrade', 'Payment Reminder', 'Feedback Call'],
    compliance: [{ title: 'Identity verification before changes', description: 'Account changes only after verifying the subscriber.', severity: 'high' }],
    aht_target_min: 5,
  },
  education: {
    label: 'Education & ed-tech',
    campaigns: [
      { name: 'ADMISSIONS', full_name: 'Admissions desk', direction: 'Inbound', core_topics: ['Course Information', 'Fees', 'Admission Process'] },
      { name: 'COUNSELLING', full_name: 'Counselling outreach', direction: 'Outbound', core_topics: ['Lead Follow-up', 'Demo Booking'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'Course Information', 'Fee Structure', 'Admission Process', 'Scholarship', 'Refund Request', 'Technical Issue', 'Callback Request'],
    outbound_intents: ['Lead Follow-up', 'Demo Booking', 'Fee Reminder', 'Re-enrolment', 'Feedback Call'],
    compliance: [{ title: 'No false placement promises', description: 'Placement or result guarantees are never made.', severity: 'critical' }],
    aht_target_min: 6,
  },
  generic: {
    label: 'Other / general contact centre',
    campaigns: [
      { name: 'INBOUND', full_name: 'Inbound support', direction: 'Inbound', core_topics: ['Query', 'Complaint', 'Account Management'] },
      { name: 'OUTBOUND', full_name: 'Outbound calling', direction: 'Outbound', core_topics: ['Follow-up', 'Upsell/Cross-sell'] },
    ],
    inbound_intents: ['Complaint', 'Query', 'Account Management', 'Technical Issue', 'Billing', 'General Information', 'Callback Request'],
    outbound_intents: ['Follow-up', 'Reminder', 'Campaign Outreach', 'Upsell/Cross-sell', 'Feedback Call'],
    compliance: [],
    aht_target_min: 5,
  },
};
export const INDUSTRY_KEYS = Object.keys(INDUSTRIES);

/** The rules a new organisation starts with: V1's 7 SOPs, the industry's compliance rules, the ZTP list and the intents. */
export function templateRules(industry) {
  const ind = INDUSTRIES[industry] || INDUSTRIES.generic;
  const rules = [];
  SOP_DEFS.forEach((s, i) => rules.push({ kind: 'sop', code: s.code, title: s.title, description: s.description, na_rule: s.na_rule, severity: 'normal', weight: 1, sort_order: i + 1 }));
  KPI_DEFS.forEach((k) => rules.push({ kind: 'kpi', code: `KPI${k.id}`, title: k.name, description: k.desc, pass_criteria: k.scale, severity: 'normal', weight: 1, sort_order: k.id }));
  ind.compliance.forEach((c, i) => rules.push({ kind: 'compliance', code: `C${i + 1}`, title: c.title, description: c.description, severity: c.severity, weight: 1, sort_order: i + 1 }));
  ZTP_DEFAULT.forEach((z, i) => rules.push({ kind: 'ztp', code: `ZTP${i + 1}`, title: z, description: null, severity: 'critical', weight: 1, sort_order: i + 1 }));
  ind.inbound_intents.forEach((t, i) => rules.push({ kind: 'topic', code: 'IN', title: t, description: 'Inbound intent', severity: 'normal', weight: 1, sort_order: i + 1 }));
  ind.outbound_intents.forEach((t, i) => rules.push({ kind: 'topic', code: 'OUT', title: t, description: 'Outbound intent', severity: 'normal', weight: 1, sort_order: 100 + i }));
  return rules;
}

/** Default industry configuration stored in organizations.config. */
export function defaultConfig(industry) {
  const ind = INDUSTRIES[industry] || INDUSTRIES.generic;
  return {
    filename_pattern: 'YYYYMMDD-LEADID_MOBILE_AGENTCODE_CAMPAIGN-FLAG',
    aht_target_min: ind.aht_target_min,
    languages: ['Hindi', 'English', 'Gujarati', 'Marathi'],
    pii_masking: true,
    qa_weights: { quality: 35, resolution: 25, compliance: 15, csat: 25 },
    notify_on: { red_coaching: true, ztp: true, high_compliance: true, training_assigned: true },
  };
}

export const NOTE_TYPES = ['Manager', 'Advice', 'Feedback', 'Critical'];
export const TRAINING_STATUSES = ['Assigned', 'In Progress', 'Completed'];
