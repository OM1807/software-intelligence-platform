export type Metric = {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
};

export const overviewMetrics: Metric[] = [
  { label: 'Total Files Analyzed', value: '4,812', sub: 'across 38 modules', trend: '+128 this week' },
  { label: 'Overall Health Score', value: '78', sub: 'out of 100', trend: 'Good' },
  { label: 'Open Risk Items', value: '14', sub: '6 high priority', trend: '-3 this week' },
  { label: 'Avg. Change Impact', value: '2.4', sub: 'files per commit', trend: 'Stable' },
];

export const aiSummary =
  'Repository health is good with a score of 78. The auth module shows elevated coupling with the API gateway and accounts for 3 of the 6 high-priority risk items. Consider reviewing the recent spike in churn within UserService before the next release.';

export type RiskModule = {
  module: string;
  score: number;
};

export const riskModules: RiskModule[] = [
  { module: 'UserService', score: 82 },
  { module: 'AuthAPI', score: 74 },
  { module: 'PaymentGateway', score: 68 },
  { module: 'NotificationService', score: 55 },
  { module: 'ReportingModule', score: 47 },
  { module: 'CoreUtils', score: 31 },
  { module: 'DataLayer', score: 24 },
];

export type ImpactFile = {
  file: string;
  commits: number;
  impact: number;
};

export const impactFiles: ImpactFile[] = [
  { file: 'src/auth/AuthAPI.ts', commits: 18, impact: 92 },
  { file: 'src/user/UserService.ts', commits: 15, impact: 81 },
  { file: 'src/payment/PaymentGateway.ts', commits: 12, impact: 70 },
  { file: 'src/api/gateway.ts', commits: 9, impact: 58 },
  { file: 'src/utils/CoreUtils.ts', commits: 7, impact: 44 },
  { file: 'src/reporting/ReportBuilder.ts', commits: 5, impact: 33 },
];

export type DriftViolation = {
  id: string;
  title: string;
  description: string;
  severity: 'High' | 'Medium' | 'Low';
  module: string;
};

export const driftViolations: DriftViolation[] = [
  {
    id: 'DRIFT-001',
    title: 'Auth module bypassing API gateway',
    description:
      'AuthAPI directly invokes DataLayer instead of routing through the API gateway, violating the layered architecture boundary.',
    severity: 'High',
    module: 'AuthAPI',
  },
  {
    id: 'DRIFT-002',
    title: 'Circular dependency: UserService <-> NotificationService',
    description:
      'UserService imports NotificationService which in turn imports UserService, creating a cycle that breaks the intended unidirectional dependency flow.',
    severity: 'High',
    module: 'UserService',
  },
  {
    id: 'DRIFT-003',
    title: 'Reporting module reaching into payment internals',
    description:
      'ReportingModule accesses private payment transaction records directly rather than through the PaymentGateway public interface.',
    severity: 'Medium',
    module: 'ReportingModule',
  },
  {
    id: 'DRIFT-004',
    title: 'CoreUtils importing domain-specific code',
    description:
      'CoreUtils, intended as a shared utility layer, now depends on UserService types, reducing its reusability across modules.',
    severity: 'Low',
    module: 'CoreUtils',
  },
];
