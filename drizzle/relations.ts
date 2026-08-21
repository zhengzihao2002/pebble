import { relations } from "drizzle-orm/relations";
import { organizationInNeonAuth, invitationInNeonAuth, userInNeonAuth, sessionInNeonAuth, accountInNeonAuth, memberInNeonAuth, category, balanceAdjustment, expense, income, goal, userAccount, budget } from "./schema";

export const invitationInNeonAuthRelations = relations(invitationInNeonAuth, ({one}) => ({
	organizationInNeonAuth: one(organizationInNeonAuth, {
		fields: [invitationInNeonAuth.organizationId],
		references: [organizationInNeonAuth.id]
	}),
	userInNeonAuth: one(userInNeonAuth, {
		fields: [invitationInNeonAuth.inviterId],
		references: [userInNeonAuth.id]
	}),
}));

export const organizationInNeonAuthRelations = relations(organizationInNeonAuth, ({many}) => ({
	invitationInNeonAuths: many(invitationInNeonAuth),
	memberInNeonAuths: many(memberInNeonAuth),
}));

export const userInNeonAuthRelations = relations(userInNeonAuth, ({many}) => ({
	invitationInNeonAuths: many(invitationInNeonAuth),
	sessionInNeonAuths: many(sessionInNeonAuth),
	accountInNeonAuths: many(accountInNeonAuth),
	memberInNeonAuths: many(memberInNeonAuth),
	categories: many(category),
	balanceAdjustments: many(balanceAdjustment),
	expenses: many(expense),
	incomes: many(income),
	goals: many(goal),
	userAccounts: many(userAccount),
	budgets: many(budget),
}));

export const sessionInNeonAuthRelations = relations(sessionInNeonAuth, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [sessionInNeonAuth.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const accountInNeonAuthRelations = relations(accountInNeonAuth, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [accountInNeonAuth.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const memberInNeonAuthRelations = relations(memberInNeonAuth, ({one}) => ({
	organizationInNeonAuth: one(organizationInNeonAuth, {
		fields: [memberInNeonAuth.organizationId],
		references: [organizationInNeonAuth.id]
	}),
	userInNeonAuth: one(userInNeonAuth, {
		fields: [memberInNeonAuth.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const categoryRelations = relations(category, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [category.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const balanceAdjustmentRelations = relations(balanceAdjustment, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [balanceAdjustment.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const expenseRelations = relations(expense, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [expense.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const incomeRelations = relations(income, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [income.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const goalRelations = relations(goal, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [goal.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const userAccountRelations = relations(userAccount, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [userAccount.userId],
		references: [userInNeonAuth.id]
	}),
}));

export const budgetRelations = relations(budget, ({one}) => ({
	userInNeonAuth: one(userInNeonAuth, {
		fields: [budget.userId],
		references: [userInNeonAuth.id]
	}),
}));