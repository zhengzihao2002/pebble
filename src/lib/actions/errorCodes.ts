/**
 * Every error code a Server Action in pebble.ts can return, grown
 * incrementally as messages are converted (Phase 3d).
 *
 * A literal union, not `string`, so that:
 *  - fail() and every direct { code: ... } literal reject a typo at compile
 *    time in pebble.ts and withSessionUser.ts.
 *  - en.ts's serverErrors dictionary is typed against this exact set via
 *    `satisfies Record<ServerErrorCode, string>`, so a code added here
 *    without a matching translation is a compile error, not a silent
 *    English fallback discovered at runtime. zh.ts inherits the same
 *    requirement through `typeof en`.
 */
export type ServerErrorCode =
  | 'session.expired'
  | 'session.authUnavailable'
  | 'session.unknown'
  | 'action.databaseUnreachable'
  | 'action.unknownError'
  | 'loader.budgetModalFailed'
  | 'loader.allocationSummaryFailed'
  | 'loader.categoriesFailed'
  | 'loader.categoryUsageFailed'
  | 'loader.balanceModeFailed'
  // --- transactions & balance adjustments (sub-step 4a) ---
  | 'validation.dateFormat'
  | 'validation.paymentMethod'
  | 'validation.expenseAmountPositive'
  | 'validation.expenseCategoryRequired'
  | 'validation.incomeCategory'
  | 'validation.grossAmountNonNegative'
  | 'validation.netAmountNonNegative'
  | 'validation.netExceedsGross'
  | 'notFound.transaction'
  | 'validation.adjustmentAmountRequired'
  | 'notFound.adjustment'
  // --- goals, budgets, opening balances (sub-step 4b) ---
  | 'validation.goalNameRequired'
  | 'validation.goalTargetPositive'
  | 'validation.goalSavedNonNegative'
  | 'validation.goalDateInvalid'
  | 'notFound.goal'
  | 'validation.budgetCategoryNameRequired'
  | 'validation.budgetAmountNonNegative'
  | 'validation.checkingOpeningNumber'
  | 'validation.cashOpeningNumber'
  // --- categories (sub-step 4c) ---
  | 'validation.categoryNameRequired'
  | 'validation.categoryNameTooLong'
  | 'validation.categoryNameDuplicate'
  | 'notFound.category'
  | 'validation.categoryFallbackCannotRename'
  | 'validation.categoryFallbackCannotDelete'
  | 'validation.categoryDeleteChooseDestination'
  | 'notFound.categoryDestination'
  | 'validation.categoryDeleteAllNeedDestination'
  | 'validation.categoryRulesStillUse'
  // --- recurring rules (sub-step 4d) ---
  | 'validation.ruleDescriptionRequired'
  | 'validation.ruleKindRequired'
  | 'validation.rulePaymentMethod'
  | 'validation.ruleFrequency'
  | 'validation.ruleEndMode'
  | 'validation.ruleStartDateFormat'
  | 'validation.ruleAmountPositive'
  | 'validation.ruleEndCountInteger'
  | 'validation.ruleEndCountMax'
  | 'validation.ruleEndDateFormat'
  | 'validation.ruleEndDateBeforeStart'
  | 'validation.ruleIncomeCategory'
  | 'validation.ruleGrossAmountPositive'
  | 'validation.ruleNetExceedsGross'
  | 'validation.ruleCategoryInvalid'
  | 'notFound.recurringRule'
  | 'validation.ruleKindLocked'
  | 'validation.ruleStatusInvalid';
