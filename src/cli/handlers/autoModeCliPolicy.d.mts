export declare function filterAutoModeRulesByLabel(
  rules: { allow: string[]; soft_deny: string[]; hard_deny: string[]; environment: string[] },
  prefix: string,
): { allow: string[]; soft_deny: string[]; hard_deny: string[]; environment: string[] }
